/** Read-only production guest/PWA/mobile checks. No accounts or demo records. */
import { readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { chromium } from 'playwright';

const state = JSON.parse(await readFile('/workspace/scratch/louvor-netlify-state.json', 'utf8'));
const origin = new URL(state.url).origin;
if (state.state !== 'ready' || !origin.startsWith('https://')) throw new Error('Deploy não está pronto.');
const env = Object.fromEntries(Object.entries(process.env)
  .filter(([name]) => !/TOKEN|PASSWORD|SECRET|SERVICE_ROLE|DEBUG|PWDEBUG/i.test(name)));
const proxyValue = process.env.HTTPS_PROXY || process.env.https_proxy || process.env.HTTP_PROXY;
const proxyUrl = proxyValue ? new URL(proxyValue) : null;
const proxy = proxyUrl ? { server: proxyUrl.origin,
  ...(proxyUrl.username ? { username: decodeURIComponent(proxyUrl.username) } : {}),
  ...(proxyUrl.password ? { password: decodeURIComponent(proxyUrl.password) } : {}),
} : undefined;
const browser = await chromium.launch({ executablePath: '/usr/bin/chromium', args: ['--no-sandbox'], env, ...(proxy ? { proxy } : {}) });
let checks = 0;
let transpositionChecked = false;
let diagnosticPage;
const expect = (condition, label) => { if (!condition) throw new Error(label); checks++; };
let stage = 'login';
try {
  const context = await browser.newContext({ viewport: { width: 390, height: 844 } });
  const page = await context.newPage();
  diagnosticPage = page;
  const writes = [];
  page.on('request', request => {
    const path = new URL(request.url()).pathname;
    if (!['GET', 'HEAD', 'OPTIONS'].includes(request.method())
      && /\/rest\/v1\//.test(path) && !/\/rpc\/(read_public_ministry|get_public_access)$/.test(path)) writes.push(path);
  });
  page.setDefaultTimeout(25000);
  await page.goto(origin);
  expect(await page.getByRole('button', { name: 'Entrar no ministério', exact: true }).isVisible(), 'Login real disponível');
  expect(await page.getByRole('button', { name: /demonstração/i }).count() === 0, 'Demonstração removida');
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth), 'Login cabe no celular');
  await page.getByRole('button', { name: 'Entrar sem cadastro', exact: true }).click();
  await page.locator('.public-banner').waitFor();
  expect(await page.getByRole('heading', { name: /^Olá,/ }).isVisible(), 'Consulta sem cadastro abre dados reais');
  stage = 'cultos públicos';
  await page.goto(`${origin}/cultos`);
  await page.getByRole('heading', { name: 'Cultos', exact: true }).waitFor();
  expect(await page.getByRole('button', { name: 'Novo culto', exact: true }).count() === 0, 'Consulta não cria cultos');
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth), 'Cultos cabem no celular');
  stage = 'equipe pública';
  await page.goto(`${origin}/pessoas`);
  await page.getByRole('heading', { name: 'Nossa equipe', exact: true }).waitFor();
  expect(await page.locator('a[href^="mailto:"]').count() === 0 && await page.locator('.people-contact').count() === 0,
    'Contatos privados não aparecem na consulta');
  expect(await page.getByRole('button', { name: 'Nova pessoa', exact: true }).count() === 0, 'Consulta não cria pessoas');
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth), 'Equipe cabe no celular');
  stage = 'biblioteca pública';
  await page.goto(`${origin}/musicas`);
  await page.getByRole('heading', { name: 'Biblioteca de músicas', exact: true }).waitFor();
  expect(await page.getByRole('button', { name: 'Nova música', exact: true }).count() === 0
    && await page.locator('.songs-row-actions button').count() === 0, 'Consulta não edita o catálogo');
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth), 'Biblioteca cabe no celular');
  const firstSong = page.locator('.songs-name').first();
  if (await firstSong.count()) {
    stage = 'cifra e transposição públicas';
    await firstSong.click();
    const key = page.getByLabel('Tom da visualização', { exact: true });
    await key.waitFor();
    const previousKey = await key.inputValue();
    await key.selectOption(previousKey === 'C' ? 'D' : 'C');
    expect(await key.inputValue() !== previousKey
      && await page.getByRole('button', { name: 'Editar música', exact: true }).count() === 0
      && await page.getByRole('button', { name: 'Salvar tom no culto', exact: true }).count() === 0,
    'Consulta pode trocar o tom local sem editar o cadastro');
    const sourceLink = await page.getByRole('link', { name: 'Abrir Cifra Club', exact: true }).getAttribute('href');
    expect(/^https:\/\/(?:www\.)?cifraclub\.com\.br\//.test(sourceLink || ''), 'Cifra Club disponível na leitura');
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth), 'Leitura cabe no celular');
    expect(!/Tom original/.test(await page.locator('.song-meta').innerText()), 'Tom interno não aparece como opção pública');
    await page.getByRole('button', { name: 'Entrar no modo leitura', exact: true }).click();
    expect(await page.getByRole('dialog', { name: /^Leitura de/ }).isVisible(), 'Modo leitura móvel disponível');
    expect(await page.evaluate(() => document.querySelector('.topbar')?.inert === true), 'Navegação de fundo não recebe foco durante leitura');
    await page.getByRole('button', { name: 'Sair do modo leitura', exact: true }).click();
    expect(await key.inputValue() !== previousKey, 'Modo leitura preserva o tom escolhido');
    transpositionChecked = true;
  }
  expect(writes.length === 0, 'Consulta não envia gravações ao banco');
  stage = 'manifest e service worker';
  const manifest = await page.evaluate(async () => {
    const response = await fetch('/manifest.webmanifest');
    const data = await response.json();
    return { type: response.headers.get('content-type'), name: data.name, shortName: data.short_name,
      theme: data.theme_color, display: data.display, icons: data.icons.length };
  });
  expect(manifest.type?.includes('application/manifest+json') && manifest.name.includes('Candeia')
    && manifest.shortName === 'Candeia' && manifest.theme === '#171717'
    && manifest.display === 'standalone' && manifest.icons === 2, 'Manifest Candeia válido');
  stage = 'ativação do service worker';
  // waitForFunction treats a returned Promise as truthy in Playwright. Await
  // readiness inside evaluate, with a bounded deadline, before reloading.
  await page.evaluate(async () => {
    let timeout;
    try {
      await Promise.race([
        navigator.serviceWorker.ready.then(registration => new Promise(resolve => {
          const worker = registration.active;
          if (worker?.state === 'activated') resolve(true);
          else worker?.addEventListener('statechange', () => { if (worker.state === 'activated') resolve(true); });
        })),
        new Promise((_, reject) => { timeout = setTimeout(() => reject(new Error('Service worker não ativou dentro do prazo.')), 25000); }),
      ]);
    } finally { clearTimeout(timeout); }
  });
  await page.reload();
  await page.locator('.public-banner').waitFor();
  stage = 'controle do service worker';
  await page.waitForFunction(() => Boolean(navigator.serviceWorker.controller));
  const cache = await page.evaluate(async () => {
    const keys = await caches.keys();
    const requests = (await Promise.all(keys.map(async key => (await caches.open(key)).keys()))).flat();
    return { files: requests.length, api: requests.some(request => new URL(request.url).origin !== location.origin
      || /\/auth\/v1|\/rest\/v1|\/\.netlify\/functions\//.test(new URL(request.url).pathname)) };
  });
  expect(cache.files > 10 && !cache.api, 'Cache estático sem dados da API');
  stage = 'guia e importador atualizado';
  await page.goto(`${origin}/conectar-cifra-club`);
  await page.getByRole('heading', { name: 'Importar do Cifra Club sem copiar e colar', exact: true }).waitFor();
  expect(await page.getByRole('heading', { name: 'Importar do Cifra Club sem copiar e colar', exact: true }).isVisible(), 'Guia publicado');
  expect(await page.getByText('Atualização 1.1:', { exact: true }).isVisible(), 'Guia orienta atualização do importador');
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth), 'Guia cabe no celular');
  const downloading = page.waitForEvent('download');
  await page.getByRole('link', { name: 'Baixar importador', exact: true }).click();
  const download = await downloading;
  expect(download.suggestedFilename() === 'candeia-cifraclub.zip', 'Download recebe o nome esperado');
  const downloaded = await readFile(await download.path());
  const built = await readFile(new URL('../dist/downloads/candeia-cifraclub.zip', import.meta.url));
  expect(createHash('sha256').update(downloaded).digest('hex') === createHash('sha256').update(built).digest('hex'), 'Download publicado corresponde ao pacote 1.1 do build');
  stage = 'shell offline';
  // Shared ministry data remains online-only. Test the cached login shell.
  await page.evaluate(() => sessionStorage.removeItem('candeia.public.session'));
  await context.setOffline(true);
  await page.goto(origin);
  await page.getByRole('button', { name: 'Entrar no ministério', exact: true }).waitFor();
  expect(await page.getByRole('button', { name: 'Entrar sem cadastro', exact: true }).isVisible(), 'Shell Candeia abre offline');
  await context.setOffline(false);
  await context.close();
  console.log(JSON.stringify({ public_url: origin, passed: checks, mobile: true, readonly_public: true,
    transposition_checked: transpositionChecked, static_pwa: true, offline_login_shell: true }));
} catch (error) {
  console.error(`Verificação pública falhou: ${stage}. ${error instanceof Error && error.message.length < 80 ? error.message : 'Revise essa etapa.'}`);
  if (stage.includes('service worker') && diagnosticPage) {
    try {
      console.error(JSON.stringify(await diagnosticPage.evaluate(async () => ({
        controlled: Boolean(navigator.serviceWorker.controller),
        registrations: (await navigator.serviceWorker.getRegistrations()).map(registration => ({
          installing: registration.installing?.state, waiting: registration.waiting?.state, active: registration.active?.state,
        })),
        cacheEntries: (await Promise.all((await caches.keys()).map(async key => (await (await caches.open(key)).keys()).length)))
          .reduce((total, count) => total + count, 0),
      }))));
    } catch { /* Preserve the original stage failure without logging page data. */ }
  }
  process.exitCode = 1;
} finally {
  await browser.close();
}
