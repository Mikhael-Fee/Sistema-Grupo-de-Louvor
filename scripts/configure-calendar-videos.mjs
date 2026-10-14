/**
 * Default is read-only inspection. --apply installs only migration006 in one
 * transaction and compares all pre-existing ministry/profile column values.
 * Never reapply001, seed records, reset passwords or delete account/photo data.
 * The management token reaches curl through stdin, never arguments or output.
 */
import { execFile } from 'node:child_process';
import { readFile } from 'node:fs/promises';

const projectRef = process.env.SUPABASE_PROJECT_REF || 'fxebsycpbybhzkpnxzoo';
const token = process.env.SUPABASE_ACCESS_TOKEN;
const flags = process.argv.slice(2);
const apply = flags.includes('--apply');
if (flags.some(flag => flag !== '--apply') || !/^[a-z]{20}$/.test(projectRef) || !token || /[\r\n]/.test(token)) {
  console.error('Configure SUPABASE_ACCESS_TOKEN com segurança; use somente --apply para instalar006. Nenhum dado foi alterado.');
  process.exit(1);
}
const curlEnvironment = { ...process.env };
delete curlEnvironment.SUPABASE_ACCESS_TOKEN;

async function query(sql) {
  const config = [
    `url = ${JSON.stringify(`https://api.supabase.com/v1/projects/${projectRef}/database/query`)}`,
    'request = "POST"', `header = ${JSON.stringify(`Authorization: Bearer ${token}`)}`,
    'header = "Content-Type: application/json"', `data = ${JSON.stringify(JSON.stringify({ query: sql }))}`,
  ].join('\n');
  return new Promise((resolve, reject) => {
    const child = execFile('curl', ['--silent', '--show-error', '--max-time', '55', '--write-out', '\n%{http_code}', '--config', '-'],
      { env: curlEnvironment, maxBuffer: 1_048_576 }, (error, stdout) => {
        const separator = stdout.lastIndexOf('\n');
        const status = Number(stdout.slice(separator + 1));
        if (error || status < 200 || status >= 300) {
          reject(new Error(`Falha na configuração006 (HTTP ${status || 'indisponível'}). Nenhuma resposta sensível foi exibida.`)); return;
        }
        try {
          const result = JSON.parse(stdout.slice(0, separator));
          const rows = Array.isArray(result) ? result : result?.result;
          if (!Array.isArray(rows)) throw new Error();
          resolve(rows);
        } catch { reject(new Error('Resposta inesperada da configuração006. Nenhuma resposta sensível foi exibida.')); }
      });
    child.stdin.end(config);
  });
}

async function inspect() {
  const [state] = await query(`select
    (select count(*)::integer from pg_tables where schemaname='public' and rowsecurity
      and tablename in ('profiles','people','tags','songs','song_tags','services','assignments','repertoire','public_access')) as rls_tables,
    (select count(*)::integer from information_schema.columns where table_schema='public'
      and table_name in ('profiles','people') and column_name='photo_url' and is_nullable='NO') as photo_columns,
    to_regprocedure('public.read_team_profile_photos()') is not null as linked_photo_rpc,
    to_regprocedure('public.update_my_profile_photo(text)') is not null as own_photo_rpc,
    (select count(*)::integer from information_schema.columns where table_schema='public'
      and table_name='services' and column_name='is_event' and data_type='boolean' and is_nullable='NO'
      and column_default='false') as event_column,
    (select count(*)::integer from information_schema.columns where table_schema='public'
      and table_name='repertoire' and column_name='youtube_url' and data_type='text' and is_nullable='NO'
      and column_default=(chr(39)||chr(39)||'::text')) as video_column,
    (select count(*)::integer from pg_constraint where conrelid='public.repertoire'::regclass
      and conname='repertoire_youtube_url_check' and contype='c' and convalidated
      and strpos(pg_get_constraintdef(oid),'valid_youtube_url')>0
      and strpos(pg_get_constraintdef(oid),'2000')>0) as video_constraint,
    (select count(*)::integer from pg_constraint where conrelid='public.public_access'::regclass
      and conname='public_access_disabled_check' and contype='c' and convalidated
      and strpos(pg_get_constraintdef(oid),'NOT public_enabled')>0) as closed_constraint,
    not exists(select 1 from public.public_access where public_enabled) as public_disabled,
    not exists(select 1 from unnest(array['people','profiles','tags','songs','song_tags','services','assignments','repertoire']) t
      where has_table_privilege('anon','public.'||t,'SELECT')) as no_anonymous_table_read,
    not has_table_privilege('authenticated','public.profiles','UPDATE') as no_direct_profile_write,
    not exists(select 1 from unnest(array['public.get_public_access()','public.read_public_ministry()','public.save_public_access(boolean)']) f
      where has_function_privilege('anon',f,'EXECUTE') or has_function_privilege('authenticated',f,'EXECUTE')) as no_public_rpc_grants,
    (select prosecdef and proconfig @> array['search_path=""']::text[]
      and strpos(pg_get_functiondef(oid),'v_previous_videos')>0
      and strpos(pg_get_functiondef(oid),'is_event')>0 and strpos(pg_get_functiondef(oid),'youtube_url')>0
      and strpos(pg_get_functiondef(oid),'approved and role in')>0
      from pg_proc where oid=to_regprocedure('public.save_service(jsonb)')) as save_service_guarded,
    has_function_privilege('authenticated','public.save_service(jsonb)','EXECUTE')
      and not has_function_privilege('anon','public.save_service(jsonb)','EXECUTE') as save_service_grants,
    (select prosecdef and proconfig @> array['search_path=""']::text[]
      and strpos(pg_get_functiondef(oid),'current_ministry_role() is null')>0
      and strpos(pg_get_functiondef(oid),'p.approved')>0
      from pg_proc where oid=to_regprocedure('public.read_team_profile_photos()')) as linked_photos_guarded,
    (select strpos(pg_get_functiondef(oid),'raise exception')>0
      and strpos(pg_get_functiondef(oid),'jsonb_build_object')=0
      from pg_proc where oid=to_regprocedure('public.read_public_ministry()')) as public_data_closed`);
  if (!state) throw new Error('A inspeção006 não retornou o formato esperado.');
  return state;
}

function installed(state) {
  return state.event_column === 1 && state.video_column === 1 && state.video_constraint === 1
    && state.closed_constraint === 1 && state.public_disabled === true && state.no_public_rpc_grants === true
    && state.save_service_guarded === true && state.save_service_grants === true
    && state.public_data_closed === true && state.no_anonymous_table_read === true
    && state.no_direct_profile_write === true && state.linked_photos_guarded === true;
}

// Only hashes are retained in a temporary table. Exclude the two new columns;
// every existing ID, note, order, photo, permission, link and contact is covered.
const oldColumnSnapshot = ['profiles', 'people', 'tags', 'songs', 'song_tags', 'services', 'assignments', 'repertoire'].map(table => {
  const previousColumns = table === 'services' ? "to_jsonb(t) - 'is_event'"
    : table === 'repertoire' ? "to_jsonb(t) - 'youtube_url'" : 'to_jsonb(t)';
  return `
  select '${table}'::text as table_name, count(*)::bigint as row_count,
    md5(coalesce(string_agg((${previousColumns})::text, ''
      order by (${previousColumns})::text),'')) as fingerprint
  from public.${table} t`;
}).join('\nunion all\n');

try {
  let state = await inspect();
  if (state.rls_tables !== 9 || state.photo_columns !== 2 || !state.linked_photo_rpc || !state.own_photo_rpc
    || !state.linked_photos_guarded || !state.no_anonymous_table_read || !state.no_direct_profile_write) {
    throw new Error('O schema001–005 ou RLS precisa de revisão.006 nunca reaplica migrações anteriores. Nenhum dado foi alterado.');
  }
  let schemaChanged = false;
  if (apply && !installed(state)) {
    const migration = (await readFile(new URL('../supabase/migrations/006_calendar_videos_private_access.sql', import.meta.url), 'utf8'))
      .replace(/^begin;$/m, '').replace(/^commit;$/m, '');
    await query(`begin;
      set local lock_timeout = '5s';
      lock table public.profiles, public.people, public.tags, public.songs, public.song_tags,
        public.services, public.assignments, public.repertoire in share row exclusive mode;
      create temporary table candeia006_before on commit drop as ${oldColumnSnapshot};
      ${migration}
      create temporary table candeia006_after on commit drop as ${oldColumnSnapshot};
      do $$ begin
        if exists(select * from candeia006_before except select * from candeia006_after)
          or exists(select * from candeia006_after except select * from candeia006_before) then
          raise exception 'As colunas existentes não foram preservadas;006 foi revertida.';
        end if;
      end; $$;
      commit;`);
    schemaChanged = true;
    state = await inspect();
  }
  if (apply && !installed(state)) throw new Error('A verificação final006 precisa de diagnóstico.');
  console.log(JSON.stringify({ calendar_videos_migration_applied: installed(state), schema_changed: schemaChanged,
    public_consultation_disabled: state.public_disabled === true && state.no_public_rpc_grants === true,
    anonymous_table_access: false, approved_photo_read_preserved: state.linked_photos_guarded === true,
    existing_ministry_and_profile_columns_preserved: schemaChanged ? true : null,
    existing_records_modified: false, auth_and_storage_untouched: true }));
} catch (cause) {
  console.error(cause instanceof Error ? cause.message : 'Falha ao configurar006.');
  process.exitCode = 1;
}
