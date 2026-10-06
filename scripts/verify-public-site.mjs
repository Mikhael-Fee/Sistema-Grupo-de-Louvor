import { readFile } from 'node:fs/promises';
import { chromium } from 'playwright';

const state = JSON.parse(await readFile('/workspace/scratch/louvor-netlify-state.json', 'utf8'));
const origin = new URL(state.url).origin;
if (state.state !== 'ready' || !origin.startsWith('https://')) throw new Error('Deploy não está pronto.');
const env = { ...process.env };
for (const name of ['SUPABASE_ACCESS_TOKEN', 'NETLIFY_AUTH_TOKEN', 'DEBUG', 'PWDEBUG']) delete env[name];
const proxyValue = process.env.HTTPS_PROXY || process.env.https_proxy || process.env.HTTP_PROXY;
const proxyUrl = proxyValue ? new URL(proxyValue) : null;
const proxy = proxyUrl ? { server: proxyUrl.origin,
  ...(proxyUrl.username ? { username: decodeURIComponent(proxyUrl.username) } : {}),
  ...(proxyUrl.password ? { password: decodeURIComponent(proxyUrl.password) } : {}),
} : undefined;
const browser = await chromium.launch({ executablePath: '/usr/bin/chromium', args: ['--no-sandbox'], env, ...(proxy ? { proxy } : {}) });
let checks = 0;
const expect = (condition, label) => { if (!condition) throw new Error(label); checks++; };
let stage = 'login';
try {
  const context = await browser.newContext({ viewport: { width: 390, height: 844 } });
  const page = await context.newPage();
  page.setDefaultTimeout(20000);
  await page.goto(origin);
  expect(await page.getByRole('button', { name: 'Entrar no ministério', exact: true }).isVisible(), 'Login real disponível');
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth), 'Login cabe no celular');
  await page.getByRole('button', { name: 'Entrar na demonstração', exact: true }).click();
  await page.getByRole('heading', { name: /^Olá,/ }).waitFor();
  expect(await page.locator('.demo-banner').count() === 1, 'Demonstração identificada');
  stage = 'biblioteca';
  await page.goto(`${origin}/musicas`);
  await page.locator('.songs-row').first().waitFor();
  expect(await page.locator('.songs-row').count() === 6, 'Biblioteca da demonstração carregada');
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth), 'Biblioteca cabe no celular');
  stage = 'manifest e service worker';
  const manifest = await page.evaluate(async () => {
    const response = await fetch('/manifest.webmanifest');
    const data = await response.json();
    return { type: response.headers.get('content-type'), name: data.name, display: data.display, icons: data.icons.length };
  });
  expect(manifest.type.includes('application/manifest+json') && manifest.display === 'standalone' && manifest.icons === 2, 'Manifest válido');
  await page.evaluate(async () => { await navigator.serviceWorker.ready; });
  await page.reload();
  await page.locator('.songs-row').first().waitFor();
  await page.waitForFunction(() => Boolean(navigator.serviceWorker.controller));
  const cache = await page.evaluate(async () => {
    const keys = await caches.keys();
    const requests = (await Promise.all(keys.map(async key => (await caches.open(key)).keys()))).flat();
    return { files: requests.length, api: requests.some(request => new URL(request.url).origin !== location.origin || /\/auth\/v1|\/rest\/v1/.test(new URL(request.url).pathname)) };
  });
  expect(cache.files > 10 && !cache.api, 'Cache estático sem respostas autenticadas');
  stage = 'demonstração offline';
  await context.setOffline(true);
  await page.goto(origin);
  await page.getByRole('heading', { name: /^Olá,/ }).waitFor();
  expect(await page.locator('.demo-banner').count() === 1, 'Demonstração abre offline');
  await context.setOffline(false);
  await context.close();
  console.log(JSON.stringify({ public_url: origin, passed: checks, mobile: true, static_pwa: true, demo_offline: true }));
} catch (error) {
  console.error(`Verificação pública falhou: ${stage}. ${error instanceof Error && error.message.length < 80 ? error.message : 'Revise essa etapa.'}`);
  process.exitCode = 1;
} finally {
  await browser.close();
}
