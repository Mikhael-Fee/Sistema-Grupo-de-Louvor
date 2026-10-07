/**
 * Requires NETLIFY_AUTH_TOKEN injected securely into the environment.
 * node scripts/deploy-netlify.mjs --check
 * node scripts/deploy-netlify.mjs --deploy /workspace/scratch/louvor-site.zip
 * node scripts/deploy-netlify.mjs --deploy-dir dist --functions-dir netlify/functions
 * NETLIFY_SITE_ID optionally selects an existing accessible site.
 * Only --deploy/--deploy-dir create/upload. No site is deleted, and the same release is
 * reused when already published or processing. Pending uploads can be resumed
 * by running the same command; polling lasts at most 120 seconds overall.
 * State is nonsecret: /workspace/scratch/louvor-netlify-state.json.
 * Tokens and binary-upload configuration are passed through curl's stdin.
 * Official contract: https://docs.netlify.com/api-and-cli-guides/api-guides/get-started-with-api/
 * OpenAPI: https://open-api.netlify.com/swagger.json
 * Directory mode uses SHA1 for files and SHA256 for zipped standalone .mjs
 * functions. API v1's entry point is <function-name>.handler, so each ZIP has
 * <function-name>.mjs at its root. No dependency bundling is performed.
 * Entry contract: https://github.com/netlify/zip-it-and-ship-it/blob/main/src/runtimes/node/utils/entry_file.ts
 */
import { execFile } from 'node:child_process';
import { createReadStream } from 'node:fs';
import { lstat, mkdir, mkdtemp, open, readFile, readdir, realpath, rename, rm, stat, utimes, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { basename, dirname, join } from 'node:path';
import { promisify } from 'node:util';

const args = process.argv.slice(2);
const check = args.length === 1 && args[0] === '--check';
const deploy = args.length === 2 && args[0] === '--deploy';
const deployDirectory = (args.length === 2 || (args.length === 4 && args[2] === '--functions-dir')) && args[0] === '--deploy-dir';
const runFile = promisify(execFile);
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
let bundleDirectory;

if (!check && !deploy && !deployDirectory) {
  console.error('Use --check, --deploy CAMINHO_DO_ZIP ou --deploy-dir DIST [--functions-dir FUNÇÕES]. Nenhuma alteração foi feita.');
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

async function api(path, { method = 'GET', body, binaryFile, contentType } = {}) {
  const remaining = deadline - Date.now();
  if (remaining <= 0) throw new Error('O prazo desta execução terminou. Reexecute para retomar o estado salvo.');
  const config = [
    `url = ${JSON.stringify(apiBase + path)}`,
    `request = ${JSON.stringify(method)}`,
    `header = ${JSON.stringify(`Authorization: Bearer ${token}`)}`,
    'header = "Accept: application/json"',
    `header = ${JSON.stringify(`Content-Type: ${contentType || (binaryFile ? 'application/zip' : 'application/json')}`)}`,
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

async function hashFile(file, algorithm) {
  const digest = createHash(algorithm);
  for await (const chunk of createReadStream(file)) digest.update(chunk);
  return digest.digest('hex');
}

async function directoryRelease(path, functionsPath) {
  const root = await realpath(path);
  if (!(await stat(root)).isDirectory()) throw new Error('Informe um diretório local contendo o build revisado.');
  const files = {};
  const fileAssets = new Map();
  const functions = {};
  const functionAssets = new Map();
  const functionsConfig = {};
  async function visit(directory, prefix = '') {
    const entries = await readdir(directory, { withFileTypes: true });
    entries.sort((a, b) => a.name < b.name ? -1 : a.name > b.name ? 1 : 0);
    for (const entry of entries) {
      if (/[\\\r\n]/.test(entry.name)) throw new Error('O build contém um nome de arquivo não suportado.');
      const file = join(directory, entry.name);
      const relative = `${prefix}${entry.name}`;
      if (entry.isDirectory()) await visit(file, `${relative}/`);
      else if (entry.isFile()) {
        const sha = await hashFile(file, 'sha1');
        const asset = { file, path: `/${relative}`, sha };
        files[asset.path] = sha;
        if (!fileAssets.has(sha)) fileAssets.set(sha, asset);
      } else throw new Error('O build contém um link simbólico ou arquivo especial; revise o diretório antes de publicar.');
    }
  }
  await visit(root);
  if (!Object.hasOwn(files, '/index.html')) throw new Error('O diretório do build deve conter index.html. Nenhuma publicação foi feita.');
  if (functionsPath) {
    const sourceRoot = await realpath(functionsPath);
    if (!(await stat(sourceRoot)).isDirectory()) throw new Error('Informe um diretório de funções válido.');
    const entries = await readdir(sourceRoot, { withFileTypes: true });
    entries.sort((a, b) => a.name < b.name ? -1 : a.name > b.name ? 1 : 0);
    bundleDirectory = await mkdtemp('/tmp/louvor-netlify-functions-');
    for (const entry of entries) {
      const name = basename(entry.name, '.mjs');
      if (!entry.isFile() || !entry.name.endsWith('.mjs') || !safeId(name)) throw new Error('Este helper aceita somente funções .mjs independentes, sem dependências, no diretório informado.');
      const source = await readFile(join(sourceRoot, entry.name));
      // API v1 expects <function-name>.handler, not index.handler.
      const staging = join(bundleDirectory, name);
      await mkdir(staging);
      const mainFile = join(staging, entry.name);
      await writeFile(mainFile, source, { mode: 0o600, flag: 'wx' });
      await utimes(mainFile, new Date('1980-01-01T00:00:00Z'), new Date('1980-01-01T00:00:00Z'));
      await runFile(process.execPath, ['--check', mainFile], { env: curlEnvironment });
      const file = join(bundleDirectory, `${name}.zip`);
      await runFile('zip', ['-X', '-q', file, entry.name], { cwd: staging, env: { ...curlEnvironment, TZ: 'UTC' } });
      const sha = await hashFile(file, 'sha256');
      const size = (await stat(file)).size;
      functions[name] = sha;
      functionsConfig[name] = { build_data: { runtimeAPIVersion: 1 } };
      if (!functionAssets.has(sha)) functionAssets.set(sha, { file, name, sha, size });
    }
  }
  const body = { files, functions, functions_config: functionsConfig };
  const digest = createHash('sha256').update(JSON.stringify(body)).digest('hex');
  return { body, fileAssets, functionAssets, title: `Louvor directory release ${digest}` };
}

async function uploadRequired(deployment, archive) {
  if (!archive.body || ['ready', 'error'].includes(deployment.state)) return;
  for (const [key, assets, algorithm] of [
    ['required', archive.fileAssets, 'sha1'],
    ['required_functions', archive.functionAssets, 'sha256'],
  ]) {
    const required = deployment[key] ?? [];
    if (!Array.isArray(required)) throw new Error('A API retornou uma lista de uploads inválida. O estado foi preservado.');
    for (const sha of new Set(required)) {
      const asset = assets.get(sha);
      if (!asset) throw new Error('O deploy solicita um arquivo ausente deste build. O estado foi preservado.');
      if (!(await lstat(asset.file)).isFile() || await hashFile(asset.file, algorithm) !== sha) throw new Error('Um arquivo do build mudou durante a preparação. Reexecute com o build final.');
      const path = key === 'required'
        ? `/deploys/${deployment.id}/files/${asset.path.slice(1).split('/').map(encodeURIComponent).join('/')}`
        : `/deploys/${deployment.id}/functions/${encodeURIComponent(asset.name)}?runtime=js&size=${asset.size}`;
      await api(path, { method: 'PUT', binaryFile: asset.file, contentType: 'application/octet-stream' });
    }
  }
}

try {
  const archive = deploy ? await release(args[1]) : deployDirectory ? await directoryRelease(args[1], args[3]) : null;
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
      deployment = await api(`/sites/${site.id}/deploys?title=${encodeURIComponent(archive.title)}`, {
        method: 'POST', ...(archive.body ? { body: archive.body } : { binaryFile: archive.file }),
      });
    }
    if (!safeId(deployment?.id) || deployment.site_id !== site.id) throw new Error('O deploy não retornou IDs válidos para o site selecionado.');
    await saveState(metadata(site, deployment));
    await uploadRequired(deployment, archive);
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
} finally {
  if (bundleDirectory) await rm(bundleDirectory, { recursive: true, force: true });
}
