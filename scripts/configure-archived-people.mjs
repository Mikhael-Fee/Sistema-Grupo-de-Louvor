/**
 * Default is read-only inspection. --apply installs only migration007 in one
 * transaction and compares all pre-existing ministry/profile column values.
 * Never reapply001–006, seed records, reset passwords or delete account/photo data.
 * The management token reaches curl through stdin, never arguments or output.
 */
import { execFile } from 'node:child_process';
import { readFile } from 'node:fs/promises';

const projectRef = process.env.SUPABASE_PROJECT_REF || 'fxebsycpbybhzkpnxzoo';
const token = process.env.SUPABASE_ACCESS_TOKEN;
const flags = process.argv.slice(2);
const apply = flags.includes('--apply');
if (flags.some(flag => flag !== '--apply') || !/^[a-z]{20}$/.test(projectRef) || !token || /[\r\n]/.test(token)) {
  console.error('Configure SUPABASE_ACCESS_TOKEN com segurança; use somente --apply para instalar007. Nenhum dado foi alterado.');
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
          reject(new Error(`Falha na configuração007 (HTTP ${status || 'indisponível'}). Nenhuma resposta sensível foi exibida.`)); return;
        }
        try {
          const result = JSON.parse(stdout.slice(0, separator));
          const rows = Array.isArray(result) ? result : result?.result;
          if (!Array.isArray(rows)) throw new Error();
          resolve(rows);
        } catch { reject(new Error('Resposta inesperada da configuração007. Nenhuma resposta sensível foi exibida.')); }
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
      and table_name='services' and column_name='is_event') as event_column,
    (select count(*)::integer from information_schema.columns where table_schema='public'
      and table_name='repertoire' and column_name='youtube_url') as video_column,
    not exists(select 1 from public.public_access where public_enabled) as public_disabled,
    not exists(select 1 from unnest(array['people','profiles','tags','songs','song_tags','services','assignments','repertoire']) t
      where has_table_privilege('anon','public.'||t,'SELECT')) as no_anonymous_table_read,
    not has_table_privilege('authenticated','public.profiles','UPDATE') as no_direct_profile_write,
    (select count(*)::integer from information_schema.columns where table_schema='public'
      and table_name='people' and column_name='active' and data_type='boolean' and is_nullable='NO'
      and column_default='true') as active_column,
    (select prosecdef and proconfig @> array['search_path=""']::text[]
      and strpos(pg_get_functiondef(oid),'approved and role = ''admin''')>0
      and strpos(pg_get_functiondef(oid),'set active = p_active')>0
      from pg_proc where oid=to_regprocedure('public.set_person_active(uuid,boolean)')) as status_rpc_guarded,
    (select prosecdef and proconfig @> array['search_path=""']::text[]
      and strpos(pg_get_functiondef(oid),'approved and role = ''admin''')>0
      and strpos(pg_get_functiondef(oid),'photo_url = case')>0
      and strpos(pg_get_functiondef(oid),'active =')=0
      from pg_proc where oid=to_regprocedure('public.save_person(jsonb)')) as person_rpc_guarded,
    (select prosecdef and proconfig @> array['search_path=""']::text[]
      and strpos(pg_get_functiondef(oid),'person_active')>0
      and strpos(pg_get_functiondef(oid),'new.service_id is distinct from old.service_id')>0
      and strpos(pg_get_functiondef(oid),'new.function is distinct from old.function')>0
      from pg_proc where oid=to_regprocedure('public.check_assignment_function()')) as inactive_assignment_guarded,
    (select prosecdef and proconfig @> array['search_path=""']::text[]
      and strpos(pg_get_functiondef(oid),'v_position_offset')>0
      and strpos(pg_get_functiondef(oid),'v_previous_videos')>0
      and strpos(pg_get_functiondef(oid),'approved and role in')>0
      from pg_proc where oid=to_regprocedure('public.save_service(jsonb)')) as save_service_preserves_history,
    coalesce((select bool_and(has_function_privilege('authenticated',p.oid,'EXECUTE')
      and not has_function_privilege('anon',p.oid,'EXECUTE')) from pg_proc p
      where p.oid in (to_regprocedure('public.save_person(jsonb)'),to_regprocedure('public.set_person_active(uuid,boolean)'))
      having count(*)=2),false) as status_rpc_grants,
    (select prosecdef and proconfig @> array['search_path=""']::text[]
      and strpos(pg_get_functiondef(oid),'current_ministry_role() is null')>0
      and strpos(pg_get_functiondef(oid),'p.approved')>0
      from pg_proc where oid=to_regprocedure('public.read_team_profile_photos()')) as linked_photos_guarded,
    (select strpos(pg_get_functiondef(oid),'raise exception')>0
      and strpos(pg_get_functiondef(oid),'jsonb_build_object')=0
      from pg_proc where oid=to_regprocedure('public.read_public_ministry()')) as public_data_closed`);
  if (!state) throw new Error('A inspeção007 não retornou o formato esperado.');
  return state;
}

function installed(state) {
  return state.active_column === 1 && state.status_rpc_guarded === true && state.person_rpc_guarded === true
    && state.inactive_assignment_guarded === true && state.save_service_preserves_history === true && state.status_rpc_grants === true;
}

// Only hashes are retained in temporary tables. Cover every previously stored
// column, including event/video values, IDs, notes, order, photos and contacts.
const oldColumnSnapshot = ['profiles', 'people', 'tags', 'songs', 'song_tags', 'services', 'assignments', 'repertoire', 'public_access'].map(table => {
  const previousColumns = table === 'people' ? "to_jsonb(t) - 'active'" : 'to_jsonb(t)';
  return `
  select '${table}'::text as table_name, count(*)::bigint as row_count,
    md5(coalesce(string_agg((${previousColumns})::text, ''
      order by (${previousColumns})::text),'')) as fingerprint
  from public.${table} t`;
}).join('\nunion all\n');

try {
  let state = await inspect();
  if (state.rls_tables !== 9 || state.photo_columns !== 2 || !state.linked_photo_rpc || !state.own_photo_rpc
    || !state.linked_photos_guarded || !state.no_anonymous_table_read || !state.no_direct_profile_write
    || state.event_column !== 1 || state.video_column !== 1 || !state.public_disabled || !state.public_data_closed) {
    throw new Error('O schema001–006 ou RLS precisa de revisão.007 nunca reaplica migrações anteriores. Nenhum dado foi alterado.');
  }
  let schemaChanged = false;
  if (apply && !installed(state)) {
    const migration = (await readFile(new URL('../supabase/migrations/007_archive_team_people.sql', import.meta.url), 'utf8'))
      .replace(/^begin;$/m, '').replace(/^commit;$/m, '');
    await query(`begin;
      set local lock_timeout = '5s';
      lock table public.profiles, public.people, public.tags, public.songs, public.song_tags,
        public.services, public.assignments, public.repertoire, public.public_access in share row exclusive mode;
      create temporary table candeia007_before on commit drop as ${oldColumnSnapshot};
      ${migration}
      create temporary table candeia007_after on commit drop as ${oldColumnSnapshot};
      do $$ begin
        if exists(select * from candeia007_before except select * from candeia007_after)
          or exists(select * from candeia007_after except select * from candeia007_before) then
          raise exception 'As colunas existentes não foram preservadas;007 foi revertida.';
        end if;
      end; $$;
      commit;`);
    schemaChanged = true;
    state = await inspect();
  }
  if (apply && !installed(state)) throw new Error('A verificação final007 precisa de diagnóstico.');
  console.log(JSON.stringify({ archive_team_migration_applied: installed(state), schema_changed: schemaChanged,
    public_consultation_disabled: state.public_disabled === true,
    anonymous_table_access: !state.no_anonymous_table_read, approved_photo_read_preserved: state.linked_photos_guarded === true,
    existing_ministry_and_profile_columns_preserved: schemaChanged ? true : null,
    existing_records_modified: false, auth_and_storage_untouched: true }));
} catch (cause) {
  console.error(cause instanceof Error ? cause.message : 'Falha ao configurar007.');
  process.exitCode = 1;
}
