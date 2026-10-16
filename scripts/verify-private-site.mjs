/**
 * Read-only production checks for account-only access, branding and the PWA.
 * Usage: node scripts/verify-private-site.mjs [https://your-ready-deploy.netlify.app]
 * Only public VITE Supabase configuration is used; no accounts are created,
 * submitted or modified. API writes are blocked even if the UI regresses.
 * Chromium uses the environment proxy and its normal trusted NSS certificate
 * store. TLS verification is never disabled.
 */
import { readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';

// Prevent browser diagnostics from exposing arguments or environment secrets.
delete process.env.DEBUG;
delete process.env.PWDEBUG;
const { chromium } = await import('playwright');
let originUrl;
try {
  originUrl = new URL(process.argv[2] || 'https://louvor-grupo-fxebsy.netlify.app');
  if (originUrl.protocol !== 'https:' || originUrl.username || originUrl.password || originUrl.search || originUrl.hash
    || originUrl.pathname !== '/' || process.argv.length > 3) throw new Error();
} catch { throw new Error('Informe somente a origem HTTPS do site publicado.'); }
const origin = originUrl.origin;
let localPublicConfig = '';
try { localPublicConfig = await readFile(new URL('../.env.local', import.meta.url), 'utf8'); }
catch { /* Public configuration may be supplied entirely through environment variables. */ }
function publicConfig(name) {
  const configured = process.env[name]?.trim();
  if (configured) return configured;
  const line = localPublicConfig.split(/\r?\n/).find(value => value.trimStart().startsWith(`${name}=`));
  const value = line?.trim().slice(name.length + 1).trim() || '';
  return value.replace(/^(['"])(.*)\1$/, '$2');
}
const supabaseUrl = publicConfig('VITE_SUPABASE_URL');
const anonymousKey = publicConfig('VITE_SUPABASE_ANON_KEY');
let apiOrigin;
try {
  const url = new URL(supabaseUrl);
  if (url.protocol !== 'https:' || !/^[a-z]{20}\.supabase\.co$/.test(url.hostname) || url.username || url.password
    || url.port || url.search || url.hash || url.pathname !== '/') throw new Error();
  apiOrigin = url.origin;
  const publishable = /^sb_publishable_[A-Za-z0-9_-]+$/.test(anonymousKey);
  const claims = publishable ? null : JSON.parse(Buffer.from(anonymousKey.split('.')[1] || '', 'base64url').toString('utf8'));
  if (!publishable && claims?.role !== 'anon') throw new Error();
  if (!anonymousKey || /[\r\n]/.test(anonymousKey)) throw new Error();
} catch { throw new Error('Configure a URL pública do Supabase e uma chave pública anon/publishable. Nenhuma chamada foi feita.'); }
localPublicConfig = '';

const browserEnvironment = Object.fromEntries(Object.entries(process.env)
  .filter(([name]) => !/TOKEN|PASSWORD|SECRET|SERVICE_ROLE|DEBUG|PWDEBUG/i.test(name)));
const proxyValue = process.env.HTTPS_PROXY || process.env.https_proxy || process.env.HTTP_PROXY || process.env.http_proxy;
let proxyUrl;
try {
  proxyUrl = proxyValue ? new URL(proxyValue) : null;
  if (proxyUrl && !['http:', 'https:'].includes(proxyUrl.protocol)) throw new Error();
} catch { throw new Error('Proxy incompatível.'); }
const proxy = proxyUrl ? { server: proxyUrl.origin,
  ...(proxyUrl.username ? { username: decodeURIComponent(proxyUrl.username) } : {}),
  ...(proxyUrl.password ? { password: decodeURIComponent(proxyUrl.password) } : {}),
} : undefined;
const browser = await chromium.launch({ executablePath: '/usr/bin/chromium', args: ['--no-sandbox'],
  env: browserEnvironment, ...(proxy ? { proxy } : {}) });
let checks = 0;
let protectedRoutes = 0;
let blockedWrites = 0;
let uiApiRequests = 0;
let probeActive = false;
let stage = 'inicialização';
let diagnosticPage;
const expect = (condition, label) => { if (!condition) { const error = new Error(label); error.verificationLabel = label; throw error; } checks++; };
const isApiPath = path => /\/(?:rest|auth|storage)\/v1(?:\/|$)|\/\.netlify\/functions(?:\/|$)/.test(path);
const digest = bytes => createHash('sha256').update(bytes).digest('hex');
const routes = ['/', '/consulta', '/cultos', '/cultos/00000000-0000-4000-8000-000000000099', '/musicas',
  '/musicas/00000000-0000-4000-8000-000000000099', '/pessoas', '/etiquetas', '/graficos', '/conectar-cifra-club', '/importar-cifra'];

async function observeContext(context) {
  context.on('request', request => {
    if (isApiPath(new URL(request.url()).pathname) && !probeActive) uiApiRequests++;
  });
  await context.route('**/*', route => {
    const request = route.request();
    if (isApiPath(new URL(request.url()).pathname) && !['GET', 'HEAD', 'OPTIONS'].includes(request.method())) {
      blockedWrites++;
      return route.abort('blockedbyclient');
    }
    return route.continue();
  });
}

async function loginOnly(page) {
  await page.getByRole('button', { name: 'Entrar no ministério', exact: true }).waitFor();
  expect(await page.getByRole('button', { name: 'Criar conta', exact: true }).isVisible(), 'Cadastro continua disponível');
  expect(await page.getByRole('button', { name: /Entrar sem cadastro|demonstração/i }).count() === 0,
    'Consulta visitante e demonstração não são oferecidas');
  expect(await page.locator('.public-banner').count() === 0
    && await page.getByRole('navigation', { name: 'Navegação principal', exact: true }).count() === 0,
  'Nenhuma tela do ministério é exibida sem conta');
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), 'Login cabe na largura da tela');
  await page.waitForFunction(() => sessionStorage.getItem('candeia.public.session') === null, null, { timeout: 5000 });
  expect(await page.evaluate(() => sessionStorage.getItem('candeia.public.session')) === null, 'Sessão visitante antiga é descartada');
  protectedRoutes++;
}

try {
  for (const width of [1200, 320]) {
    stage = `rotas privadas em ${width}px`;
    const context = await browser.newContext({ viewport: { width, height: 800 } });
    await observeContext(context);
    await context.addInitScript(() => {
      if (window.top !== window) return;
      sessionStorage.setItem('candeia.public.session', '1');
      sessionStorage.setItem('louvor.demo.session', '1');
      localStorage.setItem('louvor.demo.v1', '{}');
    });
    const page = await context.newPage();
    diagnosticPage = page;
    page.setDefaultTimeout(25000);
    for (const path of routes) {
      stage = `rota privada ${path} em ${width}px`;
      await page.goto(`${origin}${path}`);
      await loginOnly(page);
      expect(uiApiRequests === 0 && blockedWrites === 0, 'Rotas anônimas não solicitam nem alteram dados');
    }
    stage = `cadastro sem envio em ${width}px`;
    await page.getByRole('button', { name: 'Criar conta', exact: true }).click();
    expect(await page.getByLabel('Seu nome', { exact: true }).isVisible()
      && await page.getByRole('button', { name: 'Criar minha conta', exact: true }).isVisible(), 'Formulário de criação de conta abre');
    expect(await page.getByText('Após confirmar seu e-mail, aguarde a aprovação do administrador.', { exact: true }).isVisible(),
      'Cadastro informa a aprovação do administrador');
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), 'Cadastro cabe na tela');
    await page.getByRole('button', { name: 'Entrar', exact: true }).click();
    expect(await page.locator('.login-approval-note').count() === 0, 'Login não exibe instruções de cadastro');
    expect(uiApiRequests === 0 && blockedWrites === 0, 'Abrir o cadastro não envia dados ou chama Auth');
    if (width === 1200) { await context.close(); continue; }

    stage = 'manifest e marca publicados';
    const manifestResult = await page.evaluate(async () => {
      const response = await fetch('/manifest.webmanifest', { cache: 'no-store' });
      const bytes = await response.arrayBuffer();
      const hash = [...new Uint8Array(await crypto.subtle.digest('SHA-256', bytes))].map(value => value.toString(16).padStart(2, '0')).join('');
      return { status: response.status, type: response.headers.get('content-type'), hash,
        manifest: JSON.parse(new TextDecoder().decode(bytes)) };
    });
    const manifest = manifestResult.manifest;
    expect(await page.locator('link[rel="manifest"]').getAttribute('href') === '/manifest.webmanifest', 'Documento aponta para o manifest de instalação');
    expect(manifestResult.status === 200 && manifestResult.type?.includes('application/manifest+json')
      && manifest.name.includes('Candeia') && manifest.short_name === 'Candeia'
      && manifest.theme_color === '#171717' && manifest.display === 'standalone'
      && manifest.start_url === '/' && manifest.scope === '/', 'Manifest Candeia válido');
    expect(manifestResult.hash === digest(await readFile(new URL('../dist/manifest.webmanifest', import.meta.url))),
      'Manifest publicado corresponde ao build');
    const expectedIcons = [
      { src: '/pwa-192.png', sizes: '192x192', purpose: 'any', width: 192 },
      { src: '/pwa-512.png', sizes: '512x512', purpose: 'any', width: 512 },
      { src: '/pwa-maskable-512.png', sizes: '512x512', purpose: 'maskable', width: 512 },
    ];
    expect(Array.isArray(manifest.icons) && manifest.icons.length === expectedIcons.length,
      'Manifest inclui ícones normais e maskable');
    for (const icon of expectedIcons) {
      expect(manifest.icons.some(candidate => candidate.src === icon.src && candidate.sizes === icon.sizes
        && candidate.type === 'image/png' && (candidate.purpose || 'any') === icon.purpose),
      'Caminho, tamanho e finalidade de instalação consistentes');
    }
    expect(await page.locator('link[rel="icon"]').getAttribute('href') === '/icon.svg'
      && await page.locator('link[rel="apple-touch-icon"]').getAttribute('href') === '/apple-touch-icon.png',
    'Guia do navegador e instalação Apple usam a marca');
    for (const asset of [...expectedIcons, { src: '/apple-touch-icon.png', width: 180 }, { src: '/icon.svg' }]) {
      stage = `ícone publicado ${asset.src}`;
      const remote = await page.evaluate(async ({ path, raster }) => {
        const response = await fetch(path, { cache: 'no-store' });
        const bytes = await response.arrayBuffer();
        const hash = [...new Uint8Array(await crypto.subtle.digest('SHA-256', bytes))].map(value => value.toString(16).padStart(2, '0')).join('');
        let dimensions;
        if (raster) {
          const image = new Image();
          image.src = path;
          await image.decode();
          dimensions = { width: image.naturalWidth, height: image.naturalHeight };
        }
        return { status: response.status, type: response.headers.get('content-type'), hash, dimensions };
      }, { path: asset.src, raster: Boolean(asset.width) });
      const built = await readFile(new URL(`../dist${asset.src}`, import.meta.url));
      const source = await readFile(new URL(`../public${asset.src}`, import.meta.url));
      expect(remote.status === 200 && remote.type?.includes(asset.width ? 'image/png' : 'image/svg+xml'), 'Ícone publicado tem tipo correto');
      expect(remote.hash === digest(built) && remote.hash === digest(source), 'Ícone publicado corresponde ao build e à fonte');
      if (asset.width) {
        expect(remote.dimensions?.width === asset.width && remote.dimensions?.height === asset.width,
          'Dimensões reais do ícone coincidem com sua finalidade');
        expect(built.length > 24 && built.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))
          && built.readUInt32BE(16) === asset.width && built.readUInt32BE(20) === asset.width, 'PNG local tem cabeçalho e dimensões válidos');
      } else {
        const markPath = await page.locator('.candeia-brand-mark path').first().getAttribute('d');
        expect(Boolean(markPath) && source.toString('utf8').includes(`d="${markPath}"`)
          && source.toString('utf8').includes('stroke="#f0a340"') && source.toString('utf8').includes('fill="#2e251b"'),
        'Favicon usa a mesma chama e cores da marca interna');
      }
    }

    stage = 'bloqueio da consulta pública no servidor';
    probeActive = true;
    let publicProbe;
    let youtubeProbe;
    try {
      publicProbe = await page.evaluate(async ({ api, key }) => {
        const response = await fetch(`${api}/rest/v1/rpc/read_public_ministry`, { method: 'GET', credentials: 'omit', cache: 'no-store',
          headers: { apikey: key, Authorization: `Bearer ${key}`, Accept: 'application/json' }, signal: AbortSignal.timeout(20000) });
        // Read only the machine-readable error code, never ministry data.
        const code = response.status >= 400 ? (await response.json().catch(() => null))?.code : undefined;
        if (response.status < 400) await response.body?.cancel();
        return { status: response.status, code };
      }, { api: apiOrigin, key: anonymousKey });
      youtubeProbe = await page.evaluate(async () => {
        const response = await fetch('/.netlify/functions/youtube-search?title=Verificacao&artist=Equipe',
          { method: 'GET', credentials: 'omit', cache: 'no-store', signal: AbortSignal.timeout(20000) });
        await response.body?.cancel();
        return { status: response.status };
      });
    } finally { probeActive = false; }
    expect([401, 403].includes(publicProbe.status) && publicProbe.code === '42501', 'RPC público rejeita a chave anônima');
    expect(youtubeProbe.status === 401, 'Busca do YouTube rejeita uma chamada sem sessão');
    expect(blockedWrites === 0, 'Verificação remota não envia nenhuma gravação');

    stage = 'ativação do service worker';
    await page.evaluate(async () => {
      let timeout;
      try {
        await Promise.race([
          navigator.serviceWorker.ready.then(registration => new Promise(resolve => {
            const worker = registration.active;
            if (worker?.state === 'activated') resolve(true);
            else worker?.addEventListener('statechange', () => { if (worker.state === 'activated') resolve(true); });
          })),
          new Promise((_, reject) => { timeout = setTimeout(() => reject(new Error('Prazo de ativação do service worker.')), 25000); }),
        ]);
      } finally { clearTimeout(timeout); }
    });
    await page.reload();
    await loginOnly(page);
    await page.waitForFunction(() => Boolean(navigator.serviceWorker.controller));
    const cache = await page.evaluate(async () => {
      const keys = await caches.keys();
      const requests = (await Promise.all(keys.map(async key => (await caches.open(key)).keys()))).flat();
      return { files: requests.length, dynamic: requests.some(request => new URL(request.url).origin !== location.origin
        || /\/auth\/v1|\/rest\/v1|\/storage\/v1|\/\.netlify\/functions\//.test(new URL(request.url).pathname)) };
    });
    expect(cache.files > 10 && !cache.dynamic, 'PWA mantém somente recursos estáticos no cache');
    expect(uiApiRequests === 0 && blockedWrites === 0, 'Ativar a PWA não solicita dados privados');
    stage = 'login offline';
    await context.setOffline(true);
    await page.goto(origin);
    await loginOnly(page);
    expect(await page.getByRole('button', { name: 'Criar conta', exact: true }).isVisible(), 'Shell de login abre offline');
    expect(uiApiRequests === 0 && blockedWrites === 0, 'Shell offline não tenta carregar dados do ministério');
    await context.setOffline(false);
    await context.close();
  }
  console.log(JSON.stringify({ public_url: origin, passed: checks, protected_route_checks: protectedRoutes,
    desktop: true, mobile_320: true, account_required: true, anonymous_ui_api_requests: uiApiRequests,
    blocked_writes: blockedWrites, anonymous_public_rpc_denied: true, unauthenticated_youtube_denied: true,
    published_icons_match_build: true, static_pwa: true, offline_login_shell: true,
    limitations: ['Este helper não efetua login, cadastro, aprovação ou edição; os fluxos autenticados são verificados separadamente.',
      'Instalação nativa em Android/iOS não é exercitada por este navegador.'] }));
} catch (error) {
  console.error(`Verificação privada falhou: ${stage}. Nenhuma resposta, credencial ou dado do ministério foi exibido.`);
  if (typeof error?.verificationLabel === 'string') console.error(JSON.stringify({ failed_check: error.verificationLabel }));
  if (stage.includes('service worker') && diagnosticPage) {
    try {
      console.error(JSON.stringify(await diagnosticPage.evaluate(async () => ({
        controlled: Boolean(navigator.serviceWorker.controller),
        registrations: (await navigator.serviceWorker.getRegistrations()).map(registration => ({
          installing: registration.installing?.state, waiting: registration.waiting?.state, active: registration.active?.state,
        })),
      }))));
    } catch { /* Preserve the original failure and do not log page content. */ }
  }
  process.exitCode = 1;
} finally { await browser.close(); }
