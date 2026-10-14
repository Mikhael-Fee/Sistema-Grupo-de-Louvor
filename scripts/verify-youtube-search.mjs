/** Test published suggestions with one disposable account, removed in finally.
 * No ministry songs/services, owner account or authentication settings change.
 * Credentials only reach fixed authorized HTTPS destinations through curl stdin.
 */
import { execFile } from 'node:child_process';
import { randomBytes, randomUUID } from 'node:crypto';
import { readFile } from 'node:fs/promises';

const draft = process.argv.length === 3 && process.argv[2] === '--draft';
if (process.argv.length > 2 && !draft) throw new Error('Use somente --draft.');
const token = process.env.SUPABASE_ACCESS_TOKEN;
if (!token || /[\r\n]/.test(token)) throw new Error('Configure o acesso Supabase com segurança.');
const state = JSON.parse(await readFile(`/workspace/scratch/${draft ? 'candeia-netlify-draft-state' : 'louvor-netlify-state'}.json`, 'utf8'));
const site = new URL(state.url);
if (state.state !== 'ready' || state.site_id !== '93f0134d-7c6f-414a-b86a-1c4c9bdcb477' || site.protocol !== 'https:'
  || !site.hostname.endsWith('.netlify.app') || site.username || site.password || site.search || site.hash || site.pathname !== '/') throw new Error('Confirme o deploy ready observado antes de testar.');
const management = 'https://api.supabase.com/v1/projects/fxebsycpbybhzkpnxzoo';
const database = 'https://fxebsycpbybhzkpnxzoo.supabase.co';
const env = { ...process.env }; delete env.SUPABASE_ACCESS_TOKEN; delete env.NETLIFY_AUTH_TOKEN;
async function request(origin, path, { method = 'GET', bearer, apikey, body } = {}) {
  if (![management, database, site.origin].includes(origin) || !path.startsWith('/')) throw new Error('Destino de teste inválido.');
  const config = [`url = ${JSON.stringify(origin + path)}`, `request = ${JSON.stringify(method)}`, 'header = "Content-Type: application/json"',
    ...(bearer ? [`header = ${JSON.stringify('Authorization: Bearer ' + bearer)}`] : []),
    ...(apikey ? [`header = ${JSON.stringify('apikey: ' + apikey)}`] : []),
    ...(body ? [`data = ${JSON.stringify(JSON.stringify(body))}`] : [])].join('\n');
  return new Promise((resolve, reject) => {
    const child = execFile('curl', ['--silent', '--show-error', '--max-time', '30', '--write-out', '\n%{http_code}', '--config', '-'],
      { env, maxBuffer: 2_097_152 }, (error, stdout) => {
        if (error) return reject(new Error('Falha de transporte no teste YouTube.'));
        const separator = stdout.lastIndexOf('\n'), status = Number(stdout.slice(separator + 1));
        try { resolve({ status, data: JSON.parse(stdout.slice(0, separator) || 'null') }); }
        catch { reject(new Error(`Resposta inválida no teste YouTube (HTTP ${status}).`)); }
      }); child.stdin.end(config);
  });
}
let uid, serviceKey, anonymousKey, checks = 0, failed, cleaned = false, videos = 0, sourceStatus;
const expect = (condition, message) => { if (!condition) throw new Error(message); checks++; };
const queryPath = '/.netlify/functions/youtube-search?' + new URLSearchParams({ title: 'Me Atraiu', artist: 'Gabriela Rocha' });
try {
  const keys = await request(management, '/api-keys', { bearer: token });
  expect(keys.status === 200 && Array.isArray(keys.data), 'A leitura de chaves de teste foi recusada.');
  serviceKey = keys.data.find(key => key.name === 'service_role')?.api_key;
  anonymousKey = keys.data.find(key => key.name === 'anon')?.api_key;
  expect(Boolean(serviceKey && anonymousKey), 'Chaves de integração de teste indisponíveis.');
  const email = `codex-youtube-${randomUUID()}@example.invalid`, password = randomBytes(32).toString('base64url');
  const account = await request(database, '/auth/v1/admin/users', { method: 'POST', bearer: serviceKey, apikey: serviceKey,
    body: { email, password, email_confirm: true, user_metadata: { name: 'Teste YouTube temporário' } } });
  uid = account.data?.id;
  expect((account.status === 200 || account.status === 201) && /^[0-9a-f-]{36}$/i.test(uid || ''), 'Criação da conta descartável falhou.');
  const session = await request(database, '/auth/v1/token?grant_type=password', { method: 'POST', apikey: anonymousKey, body: { email, password } });
  expect(session.status === 200 && session.data?.access_token, 'Login da conta descartável falhou.');
  const access = session.data.access_token;
  expect((await request(site.origin, queryPath)).status === 401, 'A busca de vídeo aceitou consulta sem conta.');
  expect((await request(site.origin, queryPath, { bearer: access })).status === 403, 'A busca de vídeo aceitou conta pendente.');
  const approved = await request(management, '/database/query', { method: 'POST', bearer: token,
    body: { query: `update public.profiles set approved=true where id='${uid}'::uuid and name='Teste YouTube temporário' and role='musician' returning approved;` } });
  expect(approved.status >= 200 && approved.status < 300 && approved.data?.[0]?.approved === true, 'Aprovação da conta descartável falhou.');
  const result = await request(site.origin, queryPath, { bearer: access }); sourceStatus = result.status;
  expect(result.status === 200 && Array.isArray(result.data?.results) && result.data.results.length > 0, `Sugestões reais do YouTube indisponíveis (HTTP ${result.status}).`);
  expect(result.data.results.some(video => typeof video.title === 'string'
    && video.title.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLocaleLowerCase('pt-BR').includes('me atraiu')),
  'As sugestões recebidas não correspondem ao título pesquisado.');
  for (const video of result.data.results) {
    expect(/^[A-Za-z0-9_-]{11}$/.test(video.id) && typeof video.title === 'string' && video.title.trim()
      && video.url === `https://www.youtube.com/watch?v=${video.id}` && video.thumbnailUrl === `https://i.ytimg.com/vi/${video.id}/hqdefault.jpg`, 'Metadados de vídeo inválidos.');
  }
  videos = result.data.results.length;
} catch (error) { failed = error instanceof Error ? error.message : 'Falha no teste YouTube.'; }
finally {
  if (uid && serviceKey && /^[0-9a-f-]{36}$/i.test(uid)) {
    try {
      const removal = await request(database, `/auth/v1/admin/users/${uid}`, { method: 'DELETE', bearer: serviceKey, apikey: serviceKey });
      expect(removal.status === 200 || removal.status === 204, 'Não foi possível limpar a conta descartável.');
      const remaining = await request(management, '/database/query', { method: 'POST', bearer: token,
        body: { query: `select not exists(select 1 from auth.users where id='${uid}'::uuid) and not exists(select 1 from public.profiles where id='${uid}'::uuid) as cleaned;` } });
      cleaned = remaining.status >= 200 && remaining.status < 300 && remaining.data?.[0]?.cleaned === true;
      expect(cleaned, 'A limpeza da conta descartável não foi confirmada.');
    } catch (error) { failed = error instanceof Error ? error.message : 'Falha ao limpar a conta descartável.'; }
  }
}
console.log(JSON.stringify({ passed: checks, real_youtube_suggestions: videos, source_http: sourceStatus,
  disposable_account_removed: cleaned, owner_and_ministry_data_untouched: true }));
if (failed) { console.error(failed); process.exitCode = 1; }
