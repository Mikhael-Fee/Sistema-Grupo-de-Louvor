/** Apply only the additive theme constraint migration; preserve records, RLS and accounts. */
import { execFile } from 'node:child_process';
import { readFile } from 'node:fs/promises';

const projectRef = process.env.SUPABASE_PROJECT_REF || 'fxebsycpbybhzkpnxzoo';
const token = process.env.SUPABASE_ACCESS_TOKEN;
const flags = process.argv.slice(2);
if (!/^[a-z]{20}$/.test(projectRef) || !token || /[\r\n]/.test(token) || flags.some(flag => flag !== '--apply')) {
  console.error('Configure SUPABASE_ACCESS_TOKEN com segurança; use somente --apply para aplicar a migração003.');
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
        if (error || status < 200 || status >= 300) { reject(new Error(`Falha ao configurar temáticas (HTTP ${status || 'indisponível'}). Nenhuma credencial foi exibida.`)); return; }
        try {
          const result = JSON.parse(stdout.slice(0, separator));
          const rows = Array.isArray(result) ? result : result?.result;
          if (!Array.isArray(rows)) throw new Error();
          resolve(rows);
        } catch { reject(new Error('Resposta de configuração inesperada.')); }
      });
    child.stdin.end(config);
  });
}
async function inspect() {
  return (await query(`select
    (select pg_get_constraintdef(oid) from pg_constraint where conrelid='public.services'::regclass and conname='services_type_check') as definition,
    (select count(*)::integer from pg_tables where schemaname='public' and rowsecurity and tablename in ('profiles','people','tags','songs','song_tags','services','assignments','repertoire')) as rls_tables,
    (select count(*)::integer from public.services where char_length(type)>100 or type !~ '[^[:space:]]') as invalid_rows`))[0];
}
try {
  let state = await inspect();
  if (state.rls_tables !== 8 || state.invalid_rows !== 0) throw new Error('O schema/RLS ou temáticas existentes precisam de revisão; nenhum registro foi alterado.');
  const installed = value => /char_length\(type\)/.test(value.definition || '') && !/ANY/.test(value.definition || '');
  let changed = false;
  if (flags.includes('--apply') && !installed(state)) {
    if (!/type\s*=\s*ANY/.test(state.definition || '')) throw new Error('A restrição atual não corresponde à migração inicial conhecida; aplicação interrompida.');
    await query(await readFile(new URL('../supabase/migrations/003_custom_service_types.sql', import.meta.url), 'utf8'));
    state = await inspect(); changed = true;
  }
  if (flags.includes('--apply') && !installed(state)) throw new Error('A verificação da migração003 precisa de diagnóstico.');
  if (installed(state)) {
    await query(`begin; insert into public.services(date,time,type) values(current_date,time '19:00','Santa Ceia — verificação temporária'); rollback;`);
  }
  console.log(JSON.stringify({ project: projectRef, custom_service_types: installed(state), schema_changed: changed,
    rls_tables: state.rls_tables, existing_records_modified: false, verification_insert_rolled_back: installed(state) }));
} catch (cause) { console.error(cause instanceof Error ? cause.message : 'Falha ao configurar temáticas.'); process.exitCode = 1; }
