/** Real service-worker rollouts on loopback only; all Auth/REST calls are fixtures. */
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { readFile, writeFile, mkdir, access, readdir } from 'node:fs/promises';
import { resolve, dirname, extname, join, relative } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { once } from 'node:events';
import { build, loadConfigFromFile } from 'vite';
import ts from 'typescript';
import { chromium, expect } from '@playwright/test';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const output = resolve('/workspace/scratch/candeia-pwa-update-check');
let legacyDir = null;
let reuseBuilds = false;
for (let index = 2; index < process.argv.length; index++) {
  if (process.argv[index] === '--legacy-dir' && process.argv[index + 1]) legacyDir = resolve(process.argv[++index]);
  else if (process.argv[index] === '--reuse-builds') reuseBuilds = true;
  else throw new Error('Use --legacy-dir DIRETORIO e/ou --reuse-builds.');
}
// A real historical build uses the project's Auth storage namespace. Keep that
// public URL for a faithful migration; network guards still intercept/deny all
// remote requests, and the key and every account here remain local fixtures.
let fixtureUrl = 'https://supabase.candeia.test';
if (legacyDir) {
  for (const file of await readdir(join(legacyDir, 'assets'))) {
    if (!/^index-.*\.js$/.test(file)) continue;
    const source = await readFile(join(legacyDir, 'assets', file), 'utf8');
    const match = source.match(/https:\/\/[a-z0-9-]+\.supabase\.co/);
    if (match) { fixtureUrl = match[0]; break; }
  }
}
const fixtureKey = [Buffer.from(JSON.stringify({ alg: 'HS256', typ: 'JWT' })).toString('base64url'),
  Buffer.from(JSON.stringify({ role: 'anon', iss: 'supabase', exp: 4_102_444_800 })).toString('base64url'), 'fixture-only-signature'].join('.');
await mkdir(output, { recursive: true });
for (const version of ['a', 'b']) {
  if (reuseBuilds) { await access(join(output, version, 'sw.js')); continue; }
  // New plugin instances for each independent, real generateSW build.
  const loaded = await loadConfigFromFile({ command: 'build', mode: 'pwa-check' }, join(root, 'vite.config.ts'));
  assert(loaded);
  await build({ ...loaded.config, configFile: false, root, envFile: false, mode: 'pwa-check',
    define: { ...loaded.config.define, 'import.meta.env.VITE_SUPABASE_URL': JSON.stringify(fixtureUrl),
      'import.meta.env.VITE_SUPABASE_ANON_KEY': JSON.stringify(fixtureKey) },
    plugins: [...(loaded.config.plugins || []), { name: 'pwa-check-build-marker', enforce: 'pre',
      transform(source, id) {
        if (id === join(root, 'src/main.tsx')) return `${source}\nglobalThis.__pwaCheckBuild = ${JSON.stringify(version)};\nglobalThis.__pwaCheckLoadOldChunk = () => import('./pages/AnalyticsPage');\n`;
        if (id === join(root, 'src/pages/AnalyticsPage.tsx')) return `${source}\nglobalThis.__pwaCheckLazyBuild = ${JSON.stringify(version)};\n`;
      },
      transformIndexHtml: html => html.replace('</head>', `<meta name="candeia-pwa-check-build" content="${version}"></head>`) }],
    build: { ...loaded.config.build, outDir: join(output, version), emptyOutDir: true } });
}
for (const name of ['seed', 'fixtures']) {
  const source = await readFile(join(root, 'tests', `${name}.ts`), 'utf8');
  const compiled = ts.transpileModule(source, { compilerOptions: { target: ts.ScriptTarget.ES2022,
    module: ts.ModuleKind.ESNext, isolatedModules: true } }).outputText.replace("from './seed'", "from './seed.mjs'");
  // Keep imports resolvable without copying dependency trees outside the repo.
  const modulePath = join(root, '.netlify', 'pwa-check', `${name}.mjs`);
  await mkdir(dirname(modulePath), { recursive: true });
  await writeFile(modulePath, compiled);
}
const { setupMockMinistry } = await import(pathToFileURL(join(root, '.netlify/pwa-check/fixtures.mjs')).href);
let current = 'a';
const missingAssets = [];
const mime = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css',
  '.json': 'application/json', '.webmanifest': 'application/manifest+json', '.svg': 'image/svg+xml', '.png': 'image/png', '.woff2': 'font/woff2' };
const server = createServer(async (request, response) => {
  try {
    const directory = current === 'legacy' ? legacyDir : join(output, current);
    assert(directory);
    const path = decodeURIComponent(new URL(request.url || '/', 'http://127.0.0.1').pathname);
    let file = resolve(directory, `.${path}`);
    if (relative(directory, file).startsWith('..')) { response.writeHead(400); response.end(); return; }
    try { await access(file); if (!extname(path)) file = join(directory, 'index.html'); }
    catch { if (!extname(path)) file = join(directory, 'index.html'); else { missingAssets.push(path); response.writeHead(404); response.end(); return; } }
    const content = await readFile(file);
    response.writeHead(200, { 'content-type': mime[extname(file)] || 'application/octet-stream',
      'cache-control': /(?:index\.html|\/sw\.js|\.webmanifest)$/.test(file) ? 'no-store' : 'public, max-age=31536000, immutable' });
    response.end(content);
  } catch { response.writeHead(500); response.end(); }
});
server.listen(0, '127.0.0.1');
await once(server, 'listening');
const origin = `http://127.0.0.1:${server.address().port}`;
const browser = await chromium.launch({ executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH || '/usr/bin/chromium', args: ['--no-sandbox'] });
const report = { checks: [], builds: ['a', 'b'], reusedBuilds: reuseBuilds, legacy: Boolean(legacyDir), realWrites: 0 };
const check = (condition, message) => { assert(condition, message); report.checks.push(message); console.log(`OK ${message}`); };
const entry = async version => (await readFile(join(output, version, 'index.html'), 'utf8')).match(/src="(\/assets\/index-[^"]+\.js)"/)?.[1];
const lazyFile = async version => (await readdir(join(output, version, 'assets'))).find(file => /^AnalyticsPage-.*\.js$/.test(file));
check(await entry('a') !== await entry('b'), 'Builds A e B possuem hashes reais diferentes no JavaScript principal');
check(await lazyFile('a') !== await lazyFile('b'), 'Builds A e B possuem hashes reais diferentes no chunk de Gráficos');
const serviceId = '10000000-0000-4000-8000-000000000401';
const deepPath = `/cultos/${serviceId}`;
async function contextFixture() {
  const context = await browser.newContext({ baseURL: origin });
  // Requests issued by SWs only fetch same-origin precached static files. Page
  // Auth/REST mocks are registered later and take precedence over this guard.
  await context.route('**/*', route => new URL(route.request().url()).origin === origin ? route.continue() : route.abort('blockedbyclient'));
  return context;
}
const marker = page => page.locator('meta[name="candeia-pwa-check-build"]').getAttribute('content');
async function controlled(page) {
  await page.evaluate(async () => { await navigator.serviceWorker.ready; });
  // The historical worker did not claim its first uncontrolled navigation.
  if (!await page.evaluate(() => Boolean(navigator.serviceWorker.controller))) await page.reload();
  await page.waitForFunction(() => Boolean(navigator.serviceWorker.controller));
}
async function switchVersion(page, version) {
  await page.evaluate(() => { window.__pwaCheckController = navigator.serviceWorker.controller; });
  current = version;
  await page.evaluate(async () => { const registration = await navigator.serviceWorker.getRegistration('/'); if (!registration) throw new Error('Registro ausente.'); await registration.update(); });
  await page.waitForFunction(() => navigator.serviceWorker.controller !== window.__pwaCheckController && Boolean(navigator.serviceWorker.controller));
}
async function authStorage(page) {
  return page.evaluate(() => Object.fromEntries(Object.entries(localStorage).filter(([key]) => key.startsWith('sb-'))));
}
try {
  if (legacyDir) {
    console.log('PWA: verificando a migração da versão legada.');
    current = 'legacy';
    const legacyContext = await contextFixture();
    const page = await legacyContext.newPage();
    const mock = await setupMockMinistry(page);
    await mock.login();
    await page.goto(deepPath);
    await expect(page.getByRole('button', { name: 'Editar culto', exact: true })).toBeVisible();
    await controlled(page);
    await page.getByRole('button', { name: 'Editar culto', exact: true }).click();
    await page.getByRole('dialog').getByLabel('Observações').fill('Rascunho da primeira atualização, sem gravar no ministério.');
    const auth = await authStorage(page);
    await switchVersion(page, 'a');
    check(await page.evaluate(() => Boolean(navigator.serviceWorker.controller)), 'Worker novo assume o controle da URL profunda legada');
    // Old JS has no safe reload coordinator. A deliberate navigation is the
    // supported one-time migration, never a blind worker-driven navigation.
    await page.reload();
    await expect.poll(() => marker(page)).toBe('a');
    await page.getByRole('button', { name: 'Editar culto', exact: true }).click();
    await expect(page.getByRole('dialog').getByLabel('Observações')).toHaveValue('Rascunho da primeira atualização, sem gravar no ministério.');
    check(JSON.stringify(await authStorage(page)) === JSON.stringify(auth), 'Migração legada mantém sessão autenticada e rascunho');
    check(new URL(page.url()).pathname === deepPath, 'Migração mantém o endereço profundo original');
    check(!mock.calls.some(call => call.path.startsWith('/rest/v1/') && !['GET', 'OPTIONS'].includes(call.method)), 'Migração não grava dados compartilhados');
    await legacyContext.close();
  }
  current = 'a';
  console.log('PWA: verificando três abas e a atualização A → B.');
  const context = await contextFixture();
  const deep = await context.newPage();
  const deepMock = await setupMockMinistry(deep);
  await deepMock.login();
  await deep.goto(deepPath);
  await expect(deep.getByRole('button', { name: 'Editar culto', exact: true })).toBeVisible();
  await controlled(deep);
  const rootPage = await context.newPage();
  const rootMock = await setupMockMinistry(rootPage, 'admin', true);
  await rootPage.goto('/');
  await expect(rootPage.getByRole('heading', { name: /^Olá,/ })).toBeVisible();
  await controlled(rootPage);
  const photo = await context.newPage();
  const photoMock = await setupMockMinistry(photo, 'admin', true);
  await photo.goto('/perfil');
  const image = await photo.evaluate(() => { const canvas = document.createElement('canvas'); canvas.width = 80; canvas.height = 80;
    const graphics = canvas.getContext('2d'); graphics.fillStyle = '#f0a340'; graphics.fillRect(0, 0, 80, 80); return canvas.toDataURL('image/png').split(',')[1]; });
  await photo.getByLabel('Escolher foto', { exact: true }).setInputFiles({ name: 'fixture-photo.png', mimeType: 'image/png', buffer: Buffer.from(image, 'base64') });
  await expect(photo.locator('.photo-picker-status')).toHaveText('Foto pronta. Salve para confirmar a alteração.');
  const photoSource = await photo.locator('.photo-picker img').getAttribute('src');
  check(photoSource?.startsWith('blob:'), 'Foto de teste está preparada em memória, sem upload');
  const stale = await context.newPage();
  const staleMock = await setupMockMinistry(stale, 'admin', true);
  const staleErrors = [];
  stale.on('pageerror', error => staleErrors.push(error.message));
  await stale.goto('/');
  await expect(stale.getByRole('heading', { name: /^Olá,/ })).toBeVisible();
  await controlled(stale);
  await stale.evaluate(() => { const hold = document.createElement('div'); hold.id = 'pwa-check-operation'; hold.dataset.appUpdateBlocked = 'true'; document.body.append(hold); });
  await deep.bringToFront();
  await deep.getByRole('button', { name: 'Editar culto', exact: true }).click();
  await deep.getByRole('dialog').getByLabel('Observações').fill('Rascunho preservado entre versões reais A e B.');
  const auth = await authStorage(deep);
  const draftBefore = await deep.evaluate(() => Object.fromEntries(Object.entries(sessionStorage).filter(([key]) => key.startsWith('candeia.draft.v1:'))));
  await rootPage.bringToFront();
  await switchVersion(rootPage, 'b');
  await expect.poll(() => marker(rootPage), { timeout: 15_000 }).toBe('b');
  check(new URL(rootPage.url()).pathname === '/', 'Aba da página inicial aplica a nova versão automaticamente');
  await deep.bringToFront();
  await expect(deep.getByRole('dialog').getByRole('status', { name: 'Atualização disponível' })).toBeVisible();
  await expect(deep.getByRole('dialog').getByLabel('Observações')).toHaveValue('Rascunho preservado entre versões reais A e B.');
  check(await marker(deep) === 'a', 'URL profunda aguarda a conclusão do editor antes de recarregar');
  const failedImport = await deep.evaluate(async () => {
    let observed;
    const listener = event => { observed = { prevented: event.defaultPrevented, message: event.payload?.message || String(event.payload) }; };
    window.addEventListener('vite:preloadError', listener);
    try { const imported = await window.__pwaCheckLoadOldChunk(); return { observed, returned: typeof imported }; }
    catch (error) { return { observed, rejected: error.message }; }
    finally { window.removeEventListener('vite:preloadError', listener); }
  });
  report.preloadError = failedImport;
  check(failedImport.observed?.prevented === true && !failedImport.rejected, 'Falha real do chunk antigo dispara preloadError cancelado pelo coordenador pendente');
  check(missingAssets.includes(`/assets/${await lazyFile('a')}`), 'Servidor recebeu a tentativa real do hash antigo e respondeu 404');
  await expect(deep.getByRole('dialog').getByLabel('Observações')).toHaveValue('Rascunho preservado entre versões reais A e B.');
  check(await marker(deep) === 'a', 'Falha de preload preserva editor e conteúdo enquanto a atualização aguarda');
  await photo.bringToFront();
  await expect(photo.getByRole('status', { name: 'Atualização disponível' })).toContainText('Salve ou desfaça');
  check(await marker(photo) === 'a', 'Foto pendente impede recarga automática na página de perfil');
  check(await photo.locator('.photo-picker img').getAttribute('src') === photoSource, 'Imagem em memória permanece intacta após ativação do worker novo');
  await photo.getByRole('button', { name: 'Desfazer alteração', exact: true }).click();
  await expect.poll(() => marker(photo), { timeout: 15_000 }).toBe('b');
  check(new URL(photo.url()).pathname === '/perfil', 'Perfil atualiza automaticamente após resolver a foto, mantendo a rota');
  await deep.bringToFront();
  await deep.getByRole('dialog').getByRole('button', { name: 'Fechar', exact: true }).click();
  await expect.poll(() => marker(deep), { timeout: 15_000 }).toBe('b');
  check(new URL(deep.url()).pathname === deepPath, 'Atualização automática mantém /cultos/{id} sem redirecionar à raiz');
  check(JSON.stringify(await authStorage(deep)) === JSON.stringify(auth), 'Atualização mantém todos os valores da sessão autenticada');
  const draftAfter = await deep.evaluate(() => Object.fromEntries(Object.entries(sessionStorage).filter(([key]) => key.startsWith('candeia.draft.v1:'))));
  check(JSON.stringify(draftAfter) === JSON.stringify(draftBefore), 'Atualização mantém integralmente os rascunhos da aba');
  await deep.getByRole('button', { name: 'Editar culto', exact: true }).click();
  await expect(deep.getByRole('dialog').getByLabel('Observações')).toHaveValue('Rascunho preservado entre versões reais A e B.');
  check(true, 'Editor reabre o rascunho anterior na nova versão');
  await deep.getByRole('dialog').getByRole('button', { name: 'Fechar', exact: true }).click();
  let navigations = 0;
  deep.on('framenavigated', frame => { if (frame === deep.mainFrame()) navigations++; });
  for (let index = 0; index < 5; index++) await deep.evaluate(() => { window.dispatchEvent(new Event('focus')); document.dispatchEvent(new Event('visibilitychange')); });
  await deep.waitForTimeout(3_000);
  check(navigations === 0, 'Alternar foco não recarrega a versão atual nem inicia um ciclo de reload');
  await deep.evaluate(async () => { await (await navigator.serviceWorker.getRegistration('/')).update(); });
  await deep.waitForTimeout(3_000);
  check(navigations === 0, 'Checar o mesmo worker não produz nova recarga');
  await context.setOffline(true);
  await deep.reload();
  await expect.poll(() => marker(deep)).toBe('b');
  await expect(deep.getByRole('button', { name: 'Editar culto', exact: true })).toBeVisible();
  check(new URL(deep.url()).pathname === deepPath, 'Shell offline abre diretamente na URL profunda com a versão atual');
  await context.setOffline(false);
  const writes = [deepMock, rootMock, photoMock, staleMock].flatMap(mock => mock.calls)
    .filter(call => call.path.startsWith('/rest/v1/') && !['GET', 'OPTIONS'].includes(call.method));
  check(writes.length === 0, 'Todo o teste permanece sem gravações compartilhadas e sem upload de foto');
  const registrations = await deep.evaluate(async () => (await navigator.serviceWorker.getRegistrations()).map(registration => ({ scope: registration.scope, script: registration.active?.scriptURL })));
  check(registrations.length === 1 && registrations[0].scope === `${origin}/` && registrations[0].script === `${origin}/sw.js`, 'Todas as rotas e abas compartilham somente o worker absoluto da raiz');
  console.log('PWA: verificando navegação React real para chunk obsoleto durante atualização pendente.');
  await stale.bringToFront();
  await expect(stale.getByRole('status', { name: 'Atualização disponível' })).toBeVisible();
  await stale.getByRole('navigation', { name: 'Navegação principal', exact: true }).getByRole('link', { name: 'Gráficos', exact: true }).click();
  await stale.waitForTimeout(3_000);
  report.staleNavigation = await stale.evaluate(() => ({ route: location.pathname,
    rootChildren: document.getElementById('root')?.childElementCount,
    rootText: document.getElementById('root')?.textContent,
    version: document.querySelector('meta[name="candeia-pwa-check-build"]')?.getAttribute('content') }));
  report.staleNavigation.errors = staleErrors;
  await stale.screenshot({ path: join(output, 'stale-chunk-navigation.png') });
  check(report.staleNavigation.rootChildren > 0 && report.staleNavigation.rootText?.includes('Nova versão do Candeia'), 'Navegação React para chunk antigo mantém a interface e o aviso de atualização');
  check(report.staleNavigation.version === 'a' && report.staleNavigation.rootText?.includes('Não foi possível abrir esta tela'), 'Boundary mantém recuperação visível sem interromper a operação pendente');
  check(staleErrors.length === 0, 'Falha do chunk fica contida e não produz erro React não tratado');
  await stale.evaluate(() => document.getElementById('pwa-check-operation')?.remove());
  await expect.poll(() => marker(stale), { timeout: 15_000 }).toBe('b');
  await expect(stale.getByRole('heading', { name: 'Gráficos', exact: true })).toBeVisible();
  check(true, 'Navegação com chunk antigo recupera a nova versão automaticamente quando a operação termina');
  await context.close();
  await writeFile(join(output, 'result.json'), JSON.stringify(report, null, 2));
  console.log(`PWA: ${report.checks.length} verificações passaram em dois builds reais${legacyDir ? ', incluindo migração legada' : ''}.`);
} catch (error) {
  await writeFile(join(output, 'failure.txt'), error.stack || String(error));
  await writeFile(join(output, 'failed-result.json'), JSON.stringify(report, null, 2));
  throw error;
} finally {
  await browser.close();
  await new Promise(resolveClose => server.close(resolveClose));
}
