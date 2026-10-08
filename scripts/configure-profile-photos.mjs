/**
 * SUPABASE_ACCESS_TOKEN is transient and sent to curl through stdin only.
 * Default is read-only. --apply installs only 004 into an initialized ministry.
 * Existing photographs, accounts, permissions and public-access choice are kept.
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
      if (error) { reject(new Error('Falha de transporte na configuração de fotos. Nenhuma credencial foi exibida.')); return; }
      const separator = stdout.lastIndexOf('\n');
      const status = Number(stdout.slice(separator + 1));
      if (!(status >= 200 && status < 300)) {
        reject(new Error(`A API recusou a configuração de fotos (HTTP ${status}). Nenhuma resposta sensível foi exibida.`)); return;
      }
      try {
        const data = JSON.parse(stdout.slice(0, separator));
        const rows = Array.isArray(data) ? data : data?.result;
        if (!Array.isArray(rows)) throw new Error();
        resolve(rows);
      } catch { reject(new Error('Formato inesperado na configuração de fotos. Nenhuma resposta sensível foi exibida.')); }
    });
    child.stdin.end(config);
  });
}

async function inspect() {
  const rows = await query(`select
    (select count(*)::integer from pg_tables where schemaname='public' and rowsecurity
      and tablename in ('profiles','people','tags','songs','song_tags','services','assignments','repertoire','public_access')) as base_rls,
    to_regprocedure('public.read_public_ministry()') is not null as public_rpc,
    to_regclass('storage.buckets') is not null and to_regclass('storage.objects') is not null as storage_exists,
    coalesce((select rowsecurity from pg_tables where schemaname='storage' and tablename='objects'),false) as storage_rls,
    (select count(*)::integer from information_schema.columns where table_schema='public'
      and table_name in ('profiles','people') and column_name='photo_url' and data_type='text' and is_nullable='NO') as photo_columns,
    (select count(*)::integer from pg_constraint where connamespace='public'::regnamespace
      and conname in ('profiles_photo_url_check','people_photo_url_check')) as photo_constraints,
    (select count(*)::integer from pg_proc where pronamespace='public'::regnamespace and proname in
      ('valid_ministry_avatar_url','ministry_avatar_object_name','can_delete_ministry_avatar','check_person_avatar','update_my_profile_photo')) as photo_functions,
    exists(select 1 from pg_trigger where tgrelid='public.people'::regclass
      and tgname='person_avatar_check' and not tgisinternal and tgenabled='O') as photo_trigger,
    (select count(*)::integer from pg_policies where schemaname='storage' and tablename='objects'
      and policyname in ('ministry_avatars_insert','ministry_avatars_select','ministry_avatars_delete')) as photo_policies,
    (select count(*)::integer from pg_policies where schemaname='storage' and tablename='objects'
      and policyname not in ('ministry_avatars_insert','ministry_avatars_select','ministry_avatars_delete')) as other_storage_policies,
    has_table_privilege('anon','public.people','SELECT') as anon_direct_people_select,
    has_table_privilege('authenticated','public.profiles','UPDATE') as direct_profile_update`);
  if (rows.length !== 1) throw new Error('A verificação do schema de fotos não retornou o formato esperado.');
  const state = rows[0];
  if (state.storage_exists) {
    const bucket = await query(`select exists(select 1 from storage.buckets where id='avatars') as bucket_exists,
      exists(select 1 from storage.buckets where id='avatars' and name='avatars' and public=true
        and file_size_limit=2097152 and cardinality(allowed_mime_types)=3
        and allowed_mime_types @> array['image/jpeg','image/png','image/webp']::text[]) as bucket_safe`);
    Object.assign(state, bucket[0]);
  }
  if (Number(state.photo_functions) === 5) {
    const security = await query(`select
      to_regprocedure('public.update_my_profile_photo(text)') is not null as self_rpc,
      coalesce((select prosecdef and proconfig @> array['search_path=""']::text[] from pg_proc
        where oid=to_regprocedure('public.update_my_profile_photo(text)')),false) as self_rpc_guarded,
      coalesce((select strpos(pg_get_functiondef(oid), '${projectRef}') > 0 from pg_proc
        where oid=to_regprocedure('public.valid_ministry_avatar_url(text)')),false) as origin_matches,
      case when to_regprocedure('public.update_my_profile_photo(text)') is not null
        then has_function_privilege('anon','public.update_my_profile_photo(text)','EXECUTE') else true end as anon_self_rpc,
      case when to_regprocedure('public.can_delete_ministry_avatar(text)') is not null
        then has_function_privilege('anon','public.can_delete_ministry_avatar(text)','EXECUTE') else true end as anon_delete_rpc`);
    Object.assign(state, security[0]);
  }
  return state;
}

function installed(state) {
  return Number(state.photo_columns) === 2 && Number(state.photo_constraints) === 2
    && Number(state.photo_functions) === 5 && Number(state.photo_policies) === 3
    && state.photo_trigger === true && state.bucket_safe === true && state.self_rpc === true
    && state.self_rpc_guarded === true && state.origin_matches === true
    && state.anon_self_rpc === false && state.anon_delete_rpc === false;
}
const untouched = state => ['photo_columns','photo_constraints','photo_functions','photo_policies'].every(key => Number(state[key]) === 0);

try {
  let state = await inspect();
  if (Number(state.base_rls) !== 9 || !state.public_rpc || !state.storage_exists || !state.storage_rls) {
    throw new Error('Inicialize as migrações001/002 e o Supabase Storage com RLS. Este helper nunca reaplica001/002.');
  }
  if (state.anon_direct_people_select || state.direct_profile_update || Number(state.other_storage_policies) !== 0) {
    throw new Error('Há permissões adicionais incompatíveis com a proteção de fotos. Revise-as sem alterar as contas ou dados existentes.');
  }
  if (!untouched(state) && !installed(state)) {
    throw new Error('A migração de fotos está parcial ou usa outra origem/configuração. Não foi reaplicada; revise o schema.');
  }
  if (state.bucket_exists && !state.bucket_safe) {
    throw new Error('O bucket avatars existente tem outra configuração. Nenhum bucket ou arquivo foi alterado.');
  }
  if (apply && untouched(state)) {
    const migration = (await readFile(new URL('../supabase/migrations/004_profile_photos.sql', import.meta.url), 'utf8'))
      .replaceAll('fxebsycpbybhzkpnxzoo', projectRef);
    await query(migration);
    schemaChanged = true;
    state = await inspect();
  }
  if (apply && !installed(state)) throw new Error('A verificação final da migração de fotos não passou. Revise o schema.');
  console.log(JSON.stringify({
    photos_migration_applied: installed(state), schema_changed: schemaChanged,
    avatars_public: Boolean(state.bucket_safe), max_bytes: state.bucket_safe ? 2097152 : null,
    storage_rls: state.storage_rls === true, anonymous_profile_write: false,
    direct_profile_update: false, anonymous_people_select: false,
  }));
} catch (error) {
  console.error(error instanceof Error ? error.message : 'Falha ao configurar as fotos.');
  process.exitCode = 1;
}
