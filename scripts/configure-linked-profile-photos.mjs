/**
 * Default: read-only verification. --apply installs only display RPCs from005.
 * SUPABASE_ACCESS_TOKEN is transient and reaches curl through stdin only.
 * No photo, account, team-person link, permission or public choice is changed.
 */
import { execFile } from 'node:child_process';
import { readFile } from 'node:fs/promises';

const projectRef = process.env.SUPABASE_PROJECT_REF || 'fxebsycpbybhzkpnxzoo';
const token = process.env.SUPABASE_ACCESS_TOKEN;
const flags = process.argv.slice(2);
const apply = flags.includes('--apply');
const endpoint = `https://api.supabase.com/v1/projects/${projectRef}/database/query`;
const curlEnvironment = { ...process.env };
delete curlEnvironment.SUPABASE_ACCESS_TOKEN;
let schemaChanged = false;
if (flags.some(flag => flag !== '--apply') || !/^[a-z]{20}$/.test(projectRef) || !token || /[\r\n]/.test(token)) {
  console.error('Use somente --apply e configure SUPABASE_ACCESS_TOKEN de forma segura. Nenhuma alteração foi feita.');
  process.exit(1);
}
async function query(sql) {
  const config = [
    `url = ${JSON.stringify(endpoint)}`, 'request = "POST"',
    `header = ${JSON.stringify(`Authorization: Bearer ${token}`)}`,
    'header = "Accept: application/json"', 'header = "Content-Type: application/json"',
    `data = ${JSON.stringify(JSON.stringify({ query: sql }))}`,
  ].join('\n');
  return new Promise((resolve, reject) => {
    const child = execFile('curl', [
      '--silent', '--show-error', '--max-time', '55', '--write-out', '\n%{http_code}', '--config', '-',
    ], { env: curlEnvironment, maxBuffer: 1024 * 1024 }, (error, stdout) => {
      if (error) { reject(new Error('Falha de transporte na configuração de fotos vinculadas. Nenhuma credencial foi exibida.')); return; }
      const separator = stdout.lastIndexOf('\n');
      const status = Number(stdout.slice(separator + 1));
      if (!(status >= 200 && status < 300)) {
        reject(new Error(`A API recusou a configuração de fotos vinculadas (HTTP ${status}). Nenhuma resposta sensível foi exibida.`)); return;
      }
      try {
        const data = JSON.parse(stdout.slice(0, separator));
        const rows = Array.isArray(data) ? data : data?.result;
        if (!Array.isArray(rows)) throw new Error();
        resolve(rows);
      } catch { reject(new Error('Formato inesperado da configuração de fotos vinculadas. Nenhuma resposta sensível foi exibida.')); }
    });
    child.stdin.end(config);
  });
}
async function inspect() {
  const rows = await query(`select
    (select count(*)::integer from pg_tables where schemaname='public' and rowsecurity
      and tablename in ('profiles','people','tags','songs','song_tags','services','assignments','repertoire','public_access')) as base_rls,
    (select count(*)::integer from information_schema.columns where table_schema='public'
      and table_name in ('profiles','people') and column_name='photo_url' and is_nullable='NO') as photo_columns,
    to_regprocedure('public.update_my_profile_photo(text)') is not null as own_photo_rpc,
    to_regprocedure('public.read_public_ministry()') is not null as public_rpc,
    to_regprocedure('public.read_team_profile_photos()') is not null as linked_rpc,
    has_table_privilege('anon','public.people','SELECT') as anon_people_select,
    has_table_privilege('authenticated','public.profiles','UPDATE') as direct_profile_update,
    coalesce((select strpos(pg_get_functiondef(oid),'accountPhotoUrl')>0 from pg_proc
      where oid=to_regprocedure('public.read_public_ministry()')),false) as public_whitelist_updated`);
  if (rows.length !== 1) throw new Error('A verificação de fotos vinculadas não retornou o formato esperado.');
  const state = rows[0];
  if (state.linked_rpc) {
    const security = await query(`select
      has_function_privilege('anon','public.read_team_profile_photos()','EXECUTE') as anonymous_linked_rpc,
      has_function_privilege('authenticated','public.read_team_profile_photos()','EXECUTE') as authenticated_linked_rpc,
      coalesce((select prosecdef and proconfig @> array['search_path=""']::text[] from pg_proc
        where oid=to_regprocedure('public.read_team_profile_photos()')),false) as guarded_linked_rpc,
      coalesce((select strpos(pg_get_functiondef(oid),'current_ministry_role() is null')>0
        and strpos(pg_get_functiondef(oid),'p.approved')>0 from pg_proc
        where oid=to_regprocedure('public.read_team_profile_photos()')),false) as approved_linked_only,
      coalesce((select prosecdef and proconfig @> array['search_path=""']::text[]
        and strpos(pg_get_functiondef(oid),'public_enabled')>0
        and strpos(pg_get_functiondef(oid),'pr.approved')>0 from pg_proc
        where oid=to_regprocedure('public.read_public_ministry()')),false) as guarded_public_rpc,
      has_function_privilege('anon','public.read_public_ministry()','EXECUTE') as anonymous_public_rpc,
      has_function_privilege('authenticated','public.read_public_ministry()','EXECUTE') as authenticated_public_rpc`);
    Object.assign(state, security[0]);
  }
  return state;
}
const installed = state => state.linked_rpc === true && state.public_whitelist_updated === true
  && state.anonymous_linked_rpc === false && state.authenticated_linked_rpc === true && state.guarded_linked_rpc === true
  && state.approved_linked_only === true && state.guarded_public_rpc === true
  && state.anonymous_public_rpc === true && state.authenticated_public_rpc === true;
try {
  let state = await inspect();
  if (Number(state.base_rls) !== 9 || Number(state.photo_columns) !== 2 || !state.own_photo_rpc || !state.public_rpc) {
    throw new Error('Instale001/002/004 com RLS antes das fotos vinculadas. Este helper nunca reaplica essas migrações.');
  }
  if (state.anon_people_select || state.direct_profile_update) throw new Error('Revise as permissões diretas de pessoas/perfis antes da configuração. Nenhum dado foi alterado.');
  if (apply && !installed(state)) {
    await query(await readFile(new URL('../supabase/migrations/005_linked_profile_photos.sql', import.meta.url), 'utf8'));
    schemaChanged = true;
    state = await inspect();
  }
  if (apply && !installed(state)) throw new Error('A verificação final de fotos vinculadas não passou. Revise os RPCs.');
  console.log(JSON.stringify({ linked_photos_migration_applied: installed(state), schema_changed: schemaChanged,
    linked_photos_authenticated_only: Boolean(state.linked_rpc && !state.anonymous_linked_rpc),
    public_whitelist_updated: state.public_whitelist_updated === true,
    anonymous_people_select: false, direct_profile_update: false }));
} catch (error) {
  console.error(error instanceof Error ? error.message : 'Falha ao configurar fotos vinculadas.');
  process.exitCode = 1;
}
