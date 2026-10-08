/** Management credential stays in the environment and curl's stdin, never argv or logs. */
import { execFile } from 'node:child_process';
import { readFile, access, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';

const root = new URL('../', import.meta.url);
const projectRef = process.env.SUPABASE_PROJECT_REF || 'fxebsycpbybhzkpnxzoo';
const token = process.env.SUPABASE_ACCESS_TOKEN;
const apply = process.argv.includes('--apply');
const expected = ['people', 'profiles', 'tags', 'songs', 'song_tags', 'services', 'assignments', 'repertoire'];
if (!/^[a-z]{20}$/.test(projectRef)) throw new Error('SUPABASE_PROJECT_REF deve ser o ID público de 20 letras do projeto.');
if (!token || /[\r\n]/.test(token)) {
  console.error('Configure SUPABASE_ACCESS_TOKEN nas configurações seguras do ambiente. Nenhuma alteração foi feita no projeto.');
  process.exit(1);
}

async function api(path, method = 'GET', body) {
  const config = [
    `url = ${JSON.stringify(`https://api.supabase.com/v1/projects/${projectRef}${path}`)}`,
    `request = ${JSON.stringify(method)}`,
    `header = ${JSON.stringify(`Authorization: Bearer ${token}`)}`,
    'header = "Content-Type: application/json"',
    'header = "Accept: application/json"',
    ...(body === undefined ? [] : [`data = ${JSON.stringify(JSON.stringify(body))}`]),
  ].join('\n');
  return await new Promise((resolve, reject) => {
    const child = execFile('curl', ['--silent', '--show-error', '--fail-with-body', '--max-time', '55', '--config', '-'], { maxBuffer: 2 * 1024 * 1024 }, (error, stdout) => {
      if (error) { reject(new Error(`A API de gerenciamento não aceitou ${method} ${path || '/'}. Verifique acesso do token, rede e status do projeto (curl ${error.code}).`)); return; }
      try { resolve(stdout.trim() ? JSON.parse(stdout) : null); }
      catch { reject(new Error('A API retornou uma resposta inesperada. Nenhuma credencial foi exibida.')); }
    });
    child.stdin.end(config);
  });
}
const query = sql => api('/database/query', 'POST', { query: sql });
const rows = value => Array.isArray(value) ? value : Array.isArray(value?.result) ? value.result : (() => { throw new Error('Formato de resposta SQL não reconhecido.'); })();

try {
  const project = await api('');
  console.log(`Projeto: ${projectRef}; status: ${project.status || 'consultado'}.`);
  const tables = rows(await query("select tablename, rowsecurity from pg_tables where schemaname = 'public' order by tablename"));
  const ours = tables.filter(t => expected.includes(t.tablename));
  console.log(`Tabelas do aplicativo: ${ours.length}/${expected.length}; RLS ativo: ${ours.filter(t => t.rowsecurity).length}/${ours.length}.`);
  if (!apply) {
    console.log('Consulta concluída, sem alterações. Use --apply para preparar um projeto vazio.');
    process.exit(0);
  }
  if (tables.length) throw new Error('O schema public já contém tabelas. A aplicação automática foi interrompida para preservar os dados existentes; revise o projeto antes de aplicar migrações.');
  const migration = await readFile(new URL('supabase/migrations/001_initial.sql', root), 'utf8');
  await query(migration);
  await query(await readFile(new URL('supabase/migrations/003_custom_service_types.sql', root), 'utf8'));
  const ready = rows(await query("select tablename, rowsecurity from pg_tables where schemaname = 'public' order by tablename"));
  if (!expected.every(name => ready.some(t => t.tablename === name && t.rowsecurity))) throw new Error('Migração executada; a verificação de tabelas/RLS exige diagnóstico.');
  console.log('Migração aplicada: 8 tabelas com RLS ativo. Nenhum usuário foi promovido.');
  const keys = await api('/api-keys');
  const anonymousKey = Array.isArray(keys) ? keys.find(k => k.name === 'anon')?.api_key : undefined;
  if (!anonymousKey) throw new Error('Banco preparado. Obtenha a chave pública anon/publishable no painel para configurar o frontend.');
  const localEnv = new URL('.env.local', root);
  let exists = false;
  try { await access(localEnv); exists = true; } catch { /* New public configuration only. */ }
  if (exists) console.log('.env.local já existe e foi preservado. Confira as duas variáveis públicas e reinicie o Vite.');
  else {
    await writeFile(localEnv, `VITE_SUPABASE_URL=https://${projectRef}.supabase.co\nVITE_SUPABASE_ANON_KEY=${anonymousKey}\n`, { flag: 'wx', mode: 0o600 });
    console.log(`Configuração pública gravada em ${fileURLToPath(localEnv)} (ignorada pelo Git). Reinicie o Vite.`);
  }
  console.log('Próximo passo: configure as URLs de Auth, cadastre/confirme sua conta e aprove o primeiro administrador conforme docs/SUPABASE.md.');
} catch (error) {
  console.error(error instanceof Error ? error.message : 'Falha ao configurar Supabase.');
  process.exitCode = 1;
}
