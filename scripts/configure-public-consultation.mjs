/**
 * Inject SUPABASE_ACCESS_TOKEN securely; curl receives it through stdin only.
 * Default: read-only schema, owner-readiness, RLS and feature-state checks.
 * --apply: install 002 only if public.public_access does not already exist.
 * --enable: enable consultation only for the confirmed, approved owner admin.
 * Flags may be combined. Without --enable, an existing on/off choice is kept.
 * No account, ministry record, privileged profile or password is created/changed.
 */
import { execFile } from 'node:child_process';
import { readFile } from 'node:fs/promises';

const projectRef = process.env.SUPABASE_PROJECT_REF || 'fxebsycpbybhzkpnxzoo';
const token = process.env.SUPABASE_ACCESS_TOKEN;
const flags = process.argv.slice(2);
const apply = flags.includes('--apply');
const enable = flags.includes('--enable');
const base = `https://api.supabase.com/v1/projects/${projectRef}`;
const curlEnvironment = { ...process.env };
delete curlEnvironment.SUPABASE_ACCESS_TOKEN;
const ownerEmail = 'mikhaelfernandes8@gmail.com';
let schemaChanged = false;
let accessChanged = false;

if (flags.some(flag => !['--apply', '--enable'].includes(flag))) {
  console.error('Use somente --apply e/ou --enable. Nenhuma alteração foi feita.');
  process.exit(1);
}
if (!/^[a-z]{20}$/.test(projectRef) || !token || /[\r\n]/.test(token)) {
  console.error('Configure o projeto e SUPABASE_ACCESS_TOKEN de forma segura. Nenhuma alteração foi feita.');
  process.exit(1);
}

async function query(sql) {
  const config = [
    `url = ${JSON.stringify(base + '/database/query')}`,
    'request = "POST"',
    `header = ${JSON.stringify(`Authorization: Bearer ${token}`)}`,
    'header = "Accept: application/json"',
    'header = "Content-Type: application/json"',
    `data = ${JSON.stringify(JSON.stringify({ query: sql }))}`,
  ].join('\n');
  return await new Promise((resolve, reject) => {
    const child = execFile('curl', [
      '--silent', '--show-error', '--max-time', '55', '--write-out', '\n%{http_code}', '--config', '-',
    ], { env: curlEnvironment, maxBuffer: 2 * 1024 * 1024 }, (error, stdout) => {
      if (error) { reject(new Error('Falha de transporte na configuração pública. Nenhuma credencial foi exibida.')); return; }
      const separator = stdout.lastIndexOf('\n');
      const status = Number(stdout.slice(separator + 1));
      if (!(status >= 200 && status < 300)) {
        reject(new Error(`A API não aceitou a consulta/configuração (HTTP ${status}). Nenhuma resposta sensível foi exibida.`)); return;
      }
      try {
        const data = JSON.parse(stdout.slice(0, separator));
        const rows = Array.isArray(data) ? data : data?.result;
        if (!Array.isArray(rows)) throw new Error();
        resolve(rows);
      } catch { reject(new Error('A API retornou um formato inesperado. Nenhuma resposta sensível foi exibida.')); }
    });
    child.stdin.end(config);
  });
}

async function inspect() {
  const rows = await query(`select
    (select count(*)::integer from pg_tables where schemaname = 'public'
      and tablename in ('profiles','people','tags','songs','song_tags','services','assignments','repertoire')) as ministry_tables,
    (select count(*)::integer from pg_tables where schemaname = 'public' and rowsecurity
      and tablename in ('profiles','people','tags','songs','song_tags','services','assignments','repertoire')) as ministry_rls,
    to_regclass('public.public_access') is not null as public_table,
    coalesce((select rowsecurity from pg_tables where schemaname = 'public' and tablename = 'public_access'), false) as public_rls,
    to_regprocedure('public.get_public_access()') is not null as get_rpc,
    to_regprocedure('public.read_public_ministry()') is not null as read_rpc,
    to_regprocedure('public.save_public_access(boolean)') is not null as save_rpc,
    case when to_regclass('public.songs') is not null
      then has_table_privilege('anon', to_regclass('public.songs'), 'SELECT') else false end as anon_direct_song_select`);
  if (rows.length !== 1) throw new Error('A verificação de schema não retornou o formato esperado.');
  return rows[0];
}

const initialized = state => Number(state.ministry_tables) === 8 && Number(state.ministry_rls) === 8;
const installed = state => Boolean(state.public_table && state.public_rls && state.get_rpc && state.read_rpc && state.save_rpc);

try {
  let state = await inspect();
  if (!initialized(state)) throw new Error('O schema inicial precisa das oito tabelas com RLS. A migração001 não será reaplicada por este helper.');
  if (state.anon_direct_song_select) throw new Error('A leitura direta de músicas por anon precisa ser revogada antes de habilitar a consulta pública.');
  if (apply && !state.public_table) {
    const migration = await readFile(new URL('../supabase/migrations/002_public_consultation.sql', import.meta.url), 'utf8');
    await query(migration);
    schemaChanged = true;
    state = await inspect();
  }
  if (state.public_table && !installed(state)) {
    throw new Error('A tabela pública já existe, mas RLS ou algum dos três RPCs está ausente. A migração não foi reaplicada; revise o schema.');
  }
  const ownerRows = await query(`select exists (
    select 1 from auth.users u join public.profiles p on p.id = u.id
    where lower(u.email) = lower('${ownerEmail}') and u.email_confirmed_at is not null
      and p.role = 'admin' and p.approved
  ) as owner_ready`);
  if (ownerRows.length !== 1) throw new Error('A verificação mínima do proprietário não retornou o formato esperado.');
  const ownerReady = ownerRows[0].owner_ready === true;
  let publicEnabled = installed(state)
    ? (await query('select public.get_public_access() as enabled'))[0]?.enabled === true
    : false;
  if (enable) {
    if (!installed(state)) throw new Error('Aplique a migração002 antes de habilitar o acesso público.');
    if (!ownerReady) throw new Error('Para habilitar, o proprietário precisa de conta confirmada e perfil administrador aprovado. Nenhum perfil foi alterado.');
    if (!publicEnabled) {
      await query(`insert into public.public_access(id, public_enabled) values(true, true)
        on conflict(id) do update set public_enabled = excluded.public_enabled`);
      accessChanged = true;
    }
    publicEnabled = (await query('select public.get_public_access() as enabled'))[0]?.enabled === true;
    if (!publicEnabled) throw new Error('A consulta após a configuração não confirmou o acesso público.');
  }
  const verified = await inspect();
  if (!initialized(verified) || verified.anon_direct_song_select || (state.public_table && !installed(verified))) {
    throw new Error('A verificação final das proteções não passou. Revise o schema; nenhum dado do ministério foi enumerado.');
  }
  console.log(JSON.stringify({
    schema_initialized: initialized(verified), public_migration_applied: installed(verified),
    public_enabled: publicEnabled, owner_ready: ownerReady, anon_direct_song_select: false,
    schema_changed: schemaChanged, access_changed: accessChanged,
  }));
} catch (error) {
  console.error(error instanceof Error ? error.message : 'Falha ao configurar consulta pública.');
  process.exitCode = 1;
}
