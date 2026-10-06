/**
 * Requires NETLIFY_AUTH_TOKEN injected securely into the environment.
 * node scripts/deploy-netlify.mjs --check
 * node scripts/deploy-netlify.mjs --deploy /workspace/scratch/louvor-site.zip
 * NETLIFY_SITE_ID optionally selects an existing accessible site.
 * Only --deploy creates/uploads. No site is deleted, and the same release is
 * reused when already published or processing. Pending uploads can be resumed
 * by running the same command; polling lasts at most 120 seconds overall.
 * State is nonsecret: /workspace/scratch/louvor-netlify-state.json.
 * Tokens and binary-upload configuration are passed through curl's stdin.
 * Official contract: https://docs.netlify.com/api-and-cli-guides/api-guides/get-started-with-api/
 * OpenAPI: https://open-api.netlify.com/swagger.json
 */
import { execFile } from 'node:child_process';
import { createReadStream } from 'node:fs';
import { mkdir, open, readFile, realpath, rename, stat, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { dirname } from 'node:path';

const args = process.argv.slice(2);
const check = args.length === 1 && args[0] === '--check';
const deploy = args.length === 2 && args[0] === '--deploy';
const token = process.env.NETLIFY_AUTH_TOKEN;
const explicitSiteId = process.env.NETLIFY_SITE_ID;
const apiBase = 'https://api.netlify.com/api/v1';
const siteName = 'louvor-grupo-fxebsy';
const statePath = '/workspace/scratch/louvor-netlify-state.json';
const deadline = Date.now() + 120_000;
const curlEnvironment = { ...process.env };
delete curlEnvironment.NETLIFY_AUTH_TOKEN;
const safeId = value => typeof value === 'string' && /^[a-z0-9-]{1,128}$/i.test(value);
let snapshot;

if (!check && !deploy) {
  console.error('Use --check ou --deploy CAMINHO_DO_ZIP. Nenhuma alteração foi feita.');
  process.exit(1);
}
if (!token || /[\r\n]/.test(token)) {
  console.error('Configure NETLIFY_AUTH_TOKEN nas configurações seguras. Nenhuma alteração foi feita.');
  process.exit(1);
}
if (explicitSiteId && !safeId(explicitSiteId)) {
  console.error('NETLIFY_SITE_ID inválido. Nenhuma alteração foi feita.');
  process.exit(1);
}

async function api(path, { method = 'GET', body, binaryFile } = {}) {
  const remaining = deadline - Date.now();
  if (remaining <= 0) throw new Error('O prazo desta execução terminou. Reexecute para retomar o estado salvo.');
  const config = [
    `url = ${JSON.stringify(apiBase + path)}`,
    `request = ${JSON.stringify(method)}`,
    `header = ${JSON.stringify(`Authorization: Bearer ${token}`)}`,
    'header = "Accept: application/json"',
    `header = ${JSON.stringify(`Content-Type: ${binaryFile ? 'application/zip' : 'application/json'}`)}`,
    ...(binaryFile ? [`data-binary = ${JSON.stringify('@' + binaryFile)}`]
      : body === undefined ? [] : [`data = ${JSON.stringify(JSON.stringify(body))}`]),
  ].join('\n');
  return await new Promise((resolve, reject) => {
    const child = execFile('curl', [
      '--silent', '--show-error', '--max-time', String(Math.max(1, Math.min(55, Math.ceil(remaining / 1000)))),
      '--write-out', '\n%{http_code}', '--config', '-',
    ], { env: curlEnvironment, maxBuffer: 8 * 1024 * 1024 }, (error, stdout) => {
      if (error) { reject(new Error(`Falha de transporte Netlify em ${method}. O estado existente foi preservado.`)); return; }
      const separator = stdout.lastIndexOf('\n');
      const status = Number(stdout.slice(separator + 1));
      const payload = stdout.slice(0, separator).trim();
      let data = null;
      try { data = payload ? JSON.parse(payload) : null; } catch { /* Report status, never raw body. */ }
      if (!(status >= 200 && status < 300)) {
        reject(new Error(`A API Netlify não aceitou ${method} (HTTP ${status}). Nenhuma resposta sensível foi exibida.`)); return;
      }
      if (payload && data === null) { reject(new Error(`Resposta Netlify inesperada (HTTP ${status}).`)); return; }
      resolve(data);
    });
    child.stdin.end(config);
  });
}

function observedHttps(...values) {
  for (const value of values) {
    try {
      const url = new URL(value);
      if (url.protocol === 'https:' && !url.username && !url.password) return value;
    } catch { /* URLs are used only when actually returned by Netlify. */ }
  }
  return null;
}

function metadata(site, deployment, state = 'created') {
  const observedState = deployment?.state ?? state;
  return {
    site_id: site.id,
    url: observedHttps(site.ssl_url, deployment?.ssl_url, site.url, deployment?.url, deployment?.deploy_ssl_url),
    deploy_id: deployment?.id ?? null,
    state: typeof observedState === 'string' && /^[a-z_-]{1,40}$/i.test(observedState) ? observedState : 'unknown',
  };
}

async function saveState(value) {
  await mkdir(dirname(statePath), { recursive: true });
  const temporary = `${statePath}.${process.pid}.tmp`;
  await writeFile(temporary, JSON.stringify(value, null, 2) + '\n', { flag: 'wx', mode: 0o600 });
  await rename(temporary, statePath);
  snapshot = value;
}

async function savedState() {
  let content;
  try { content = await readFile(statePath, 'utf8'); }
  catch (error) { if (error.code === 'ENOENT') return null; throw new Error('Não foi possível ler o estado existente. Nenhum site foi criado.'); }
  try {
    const value = JSON.parse(content);
    if (!safeId(value.site_id) || (value.deploy_id !== null && value.deploy_id !== undefined && !safeId(value.deploy_id))) throw new Error();
    return value;
  } catch { throw new Error('O estado existente é inválido. Revise-o antes de publicar; nenhum site foi criado.'); }
}

async function listSites() {
  const sites = [];
  for (let page = 1; page <= 100; page++) {
    const batch = await api(`/sites?per_page=100&page=${page}`);
    if (!Array.isArray(batch)) throw new Error('A listagem de sites retornou um formato inesperado.');
    sites.push(...batch);
    if (batch.length < 100) return sites;
  }
  throw new Error('A lista de sites excedeu o limite de consulta. Nenhum site foi criado.');
}

async function release(path) {
  let file;
  try {
    file = await realpath(path);
    const information = await stat(file);
    if (!information.isFile() || !/\.zip$/i.test(file) || information.size < 4) throw new Error();
    const handle = await open(file, 'r');
    try {
      const signature = Buffer.alloc(4);
      await handle.read(signature, 0, 4, 0);
      if (signature.readUInt32LE(0) !== 0x04034b50) throw new Error();
    } finally { await handle.close(); }
  } catch { throw new Error('Informe um ZIP local válido contendo o build revisado. Nenhuma publicação foi feita.'); }
  const digest = createHash('sha256');
  for await (const chunk of createReadStream(file)) digest.update(chunk);
  return { file, title: `Louvor release ${digest.digest('hex')}` };
}

try {
  const archive = deploy ? await release(args[1]) : null;
  const saved = await savedState();
  const user = await api('/user');
  if (!user?.id && !user?.uid) throw new Error('A autenticação Netlify não retornou uma conta válida.');
  const sites = await listSites();
  const requestedId = explicitSiteId || saved?.site_id;
  let site = requestedId ? sites.find(candidate => candidate.id === requestedId) : sites.find(candidate => candidate.name === siteName);
  if (requestedId && !site) throw new Error('O site selecionado não está acessível nesta conta. Nenhum site foi criado.');
  if (check) {
    const existing = site?.published_deploy;
    console.log(JSON.stringify(site ? metadata(site, existing, 'existing') : { site_id: null, url: null, deploy_id: null, state: 'not_found' }));
  } else {
    if (!site) {
      site = await api('/sites', { method: 'POST', body: { name: siteName, force_ssl: true } });
      if (!safeId(site?.id)) throw new Error('A criação não retornou um ID válido. Confira os sites antes de repetir.');
      await saveState(metadata(site));
    }
    const recent = await api(`/sites/${site.id}/deploys?per_page=100`);
    if (!Array.isArray(recent)) throw new Error('A listagem de deploys retornou um formato inesperado.');
    let deployment = recent.find(candidate => candidate.title === archive.title && candidate.state !== 'error'
      && (candidate.state !== 'ready' || candidate.id === site.published_deploy?.id || candidate.id === recent[0]?.id));
    if (!deployment && saved?.site_id === site.id && saved.deploy_id && !['ready', 'error'].includes(saved.state)) {
      const pending = await api(`/deploys/${saved.deploy_id}`);
      if (pending?.site_id === site.id && pending.title === archive.title && pending.state !== 'error') deployment = pending;
    }
    if (!deployment) {
      deployment = await api(`/sites/${site.id}/deploys?title=${encodeURIComponent(archive.title)}`, { method: 'POST', binaryFile: archive.file });
    }
    if (!safeId(deployment?.id) || deployment.site_id !== site.id) throw new Error('O deploy não retornou IDs válidos para o site selecionado.');
    await saveState(metadata(site, deployment));
    while (!['ready', 'error'].includes(deployment.state) && Date.now() < deadline) {
      const delay = Math.min(3000, Math.max(0, deadline - Date.now()));
      if (delay) await new Promise(resolve => setTimeout(resolve, delay));
      if (Date.now() >= deadline) break;
      try { deployment = await api(`/deploys/${deployment.id}`); }
      catch (error) { if (Date.now() >= deadline) break; throw error; }
      if (!safeId(deployment?.id) || deployment.site_id !== site.id) throw new Error('A consulta de deploy retornou IDs inesperados.');
      await saveState(metadata(site, deployment));
    }
    console.log(JSON.stringify(snapshot));
    if (deployment.state === 'error') process.exitCode = 1;
  }
} catch (error) {
  if (snapshot) console.log(JSON.stringify(snapshot));
  console.error(error instanceof Error ? error.message : 'Falha ao preparar a publicação Netlify.');
  process.exitCode = 1;
}
