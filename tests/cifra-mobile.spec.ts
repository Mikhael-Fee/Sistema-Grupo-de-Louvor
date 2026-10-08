import { chromium, devices, expect, test, type Browser, type BrowserContext, type Page } from '@playwright/test';
import { existsSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import { extname, join, resolve, sep } from 'node:path';
import { setupMockMinistry, type MockMinistry } from './fixtures';
import type { Role } from '../src/types';

test.use({ trace: 'off', screenshot: 'off' });

const SITE = 'https://louvor-grupo-fxebsy.netlify.app';
const CIFRA = 'https://www.cifraclub.com.br/equipe-de-teste/chama-da-equipe/';
const DIST = resolve('dist');
const PREFIX = '#candeia-cifra=';
const TITLE = 'Canção da equipe';
const ARTIST = 'Equipe da fonte';
const WRITTEN = '[G]Uma luz nos [D/F#]guia\n[Em7]Seguimos em [C]paz';
const CONVERTED = '[Bb]Uma luz nos [F/A]guia\n[Gm7]Seguimos em [Eb]paz';
const RAW = `G           D/F#\nUma luz nos guia\nEm7         C\nSeguimos em paz\ne|--0--2--3--|\nB|--1--3--0--|`;
const SOURCE = { sourceUrl: CIFRA, title: TITLE, artist: ARTIST, text: RAW, displayedKey: 'G', capo: 3, soundingKey: 'Bb' };
const HTML = `<!doctype html><html lang="pt-BR"><head><meta charset="utf-8">
  <meta property="og:title" content="${TITLE} - ${ARTIST} - Cifra Club"><title>${TITLE} - ${ARTIST} - Cifra Club</title>
  </head><body><nav><h2>Menu principal</h2><a href="/equipe-de-teste/">Navegação</a></nav><h1 class="t1">${TITLE}</h1>
  <div id="cifra_tom">Tom: Bb (forma dos acordes no tom de G)</div><div class="cifra_capo">Capotraste: 3</div>
  <pre data-original-key="C"><b>G</b>           <b>D/F#</b>\nUma luz nos guia\n<b>Em7</b>         <b>C</b>\nSeguimos em paz\n<span class="tablatura">e|--0--2--3--|\nB|--1--3--0--|</span></pre>
  </body></html>`;
const MIME: Record<string, string> = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.svg': 'image/svg+xml', '.png': 'image/png', '.woff2': 'font/woff2', '.json': 'application/json', '.webmanifest': 'application/manifest+json', '.txt': 'text/plain' };

function chromiumForMobileFixtures(): string {
  if (process.env.CANDEIA_EXTENSION_CHROMIUM_EXECUTABLE_PATH) return process.env.CANDEIA_EXTENSION_CHROMIUM_EXECUTABLE_PATH;
  const executable = chromium.executablePath();
  const parts = executable.split(sep);
  const revision = parts.findIndex(part => /^chromium-\d+$/.test(part));
  const cached = revision < 0 ? '' : join('/workspace/scratch/playwright-cifra-browsers', ...parts.slice(revision));
  return cached && existsSync(cached) ? cached : process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH
    || (existsSync(executable) ? executable : '/usr/bin/chromium');
}

function transfer(result: unknown = SOURCE): string {
  return `${SITE}/importar-cifra${PREFIX}${Buffer.from(JSON.stringify({ version: 1, result }), 'utf8').toString('base64url')}`;
}

interface Harness { browser: Browser; context: BrowserContext; page: Page; mock: MockMinistry; dispose(): Promise<void> }

async function harness(role: Role = 'admin'): Promise<Harness> {
  // This is desktop Chromium with mobile viewport/touch emulation. It does
  // not assert that physical Android favorites or native Apple Shortcuts ran.
  const env = Object.fromEntries(Object.entries(process.env).filter(([name, value]) => value !== undefined
    && !/TOKEN|PASSWORD|SECRET|SERVICE_ROLE|DEBUG|PWDEBUG/i.test(name))) as Record<string, string>;
  const browser = await chromium.launch({ executablePath: chromiumForMobileFixtures(), headless: true, env, args: ['--no-sandbox'] });
  const context = await browser.newContext({ ...devices['Pixel 7'], baseURL: SITE });
  const outside: string[] = [];
  await context.route('**/*', async route => {
    const url = new URL(route.request().url());
    if (url.origin === 'https://www.cifraclub.com.br') return route.fulfill({ status: 200, contentType: 'text/html', body: HTML,
      headers: { 'content-security-policy': "default-src 'none'; script-src 'none'", 'cross-origin-opener-policy': 'same-origin' } });
    if (url.origin !== SITE) { outside.push(`${url.origin}${url.pathname}`); return route.abort('blockedbyclient'); }
    if (url.pathname === '/sw.js') return route.fulfill({ status: 404, body: '' });
    const path = resolve(DIST, `.${decodeURIComponent(url.pathname)}`);
    if (path !== DIST && !path.startsWith(`${DIST}${sep}`)) return route.abort('blockedbyclient');
    try { return route.fulfill({ contentType: MIME[extname(path)] || 'application/octet-stream', body: await readFile(path) }); }
    catch {
      if (extname(url.pathname)) return route.fulfill({ status: 404, body: '' });
      return route.fulfill({ contentType: 'text/html', body: await readFile(join(DIST, 'index.html')) });
    }
  });
  const page = await context.newPage();
  page.setDefaultTimeout(15_000);
  await page.addInitScript(() => {
    const snapshots: string[] = [];
    Object.defineProperty(window, '__mobileAuthHashSnapshots', { value: snapshots });
    const fetch = window.fetch.bind(window);
    window.fetch = (input, init) => {
      const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;
      if (url.includes('/auth/v1/')) snapshots.push(location.hash);
      return fetch(input, init);
    };
  });
  const mock = await setupMockMinistry(page, role);
  return { browser, context, page, mock, async dispose() {
    try { await browser.close(); expect(outside, 'Nenhuma chamada fora das fixtures foi iniciada.').toEqual([]); }
    finally { /* Playwright owns and removes the temporary browser profile. */ }
  } };
}

const writes = (mock: MockMinistry) => mock.calls.filter(call => !['GET', 'HEAD', 'OPTIONS'].includes(call.method)
  && call.path.startsWith('/rest/v1/') && !/\/rpc\/(get_public_access|read_public_ministry)$/.test(call.path));

async function signInOnCurrentPage(page: Page) {
  await page.getByLabel('E-mail', { exact: true }).fill('fixture@example.invalid');
  await page.getByLabel('Senha', { exact: true }).fill('local-fixture-password');
  await page.getByRole('button', { name: 'Entrar no ministério', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Cifra recebida do navegador', exact: true })).toBeVisible();
}

async function pending(page: Page) {
  await expect(page).toHaveURL(`${SITE}/importar-cifra`);
  await expect(page.getByRole('heading', { name: 'Cifra recebida do navegador', exact: true })).toBeVisible();
  await expect(page.getByRole('heading', { name: TITLE, exact: true })).toBeVisible();
  await expect(page.getByLabel('Prévia da cifra recebida', { exact: true })).toHaveText(WRITTEN);
  await expect(page.getByRole('link', { name: 'Conferir versão no Cifra Club', exact: true })).toHaveAttribute('href', CIFRA);
}

test.describe('importação móvel: Chromium com toque, rede totalmente simulada', () => {
  test.setTimeout(45_000);
  test.skip(!existsSync(join(DIST, 'index.html')), 'Execute npm run build para servir a aplicação na URL HTTPS permitida.');

  test('remove fragmento antes do Auth, preserva transferência no login/reload e salva uma única vez em Bb', async () => {
    const h = await harness();
    try {
      await h.page.goto(transfer());
      await expect(h.page.getByRole('button', { name: 'Entrar no ministério', exact: true })).toBeVisible();
      await expect(h.page).toHaveURL(`${SITE}/importar-cifra`);
      expect(writes(h.mock)).toHaveLength(0);
      await signInOnCurrentPage(h.page);
      await pending(h.page);
      const authSnapshots = await h.page.evaluate(() => (window as unknown as { __mobileAuthHashSnapshots: string[] }).__mobileAuthHashSnapshots);
      expect(authSnapshots.length).toBeGreaterThan(0);
      expect(authSnapshots.every(hash => hash === '')).toBe(true);
      await h.page.reload();
      await pending(h.page);
      expect(writes(h.mock)).toHaveLength(0);
      await h.page.getByRole('button', { name: 'Revisar e salvar na biblioteca', exact: true }).click();
      const dialog = h.page.getByRole('dialog');
      await expect(dialog.getByLabel('Título', { exact: true })).toHaveValue(TITLE);
      await expect(dialog.getByLabel('Artista / compositor', { exact: true })).toHaveValue(ARTIST);
      await expect(dialog.getByLabel('Tom na igreja', { exact: true })).toHaveValue('G');
      await dialog.getByLabel('Tom na igreja', { exact: true }).selectOption('Bb');
      await expect(dialog.getByRole('textbox', { name: /^Letra e cifra/ })).toHaveValue('');
      await expect(dialog).toContainText('Capotraste na fonte: 3ª casa');
      await expect(dialog.getByLabel('Prévia do conteúdo para importar', { exact: true })).toHaveText(WRITTEN);
      expect(writes(h.mock)).toHaveLength(0);
      await dialog.getByRole('button', { name: 'Salvar música', exact: true }).click();
      await expect(dialog).toBeHidden();
      await expect(h.page).toHaveURL(`${SITE}/musicas`);
      const saved = h.mock.data.songs.find(song => song.title === TITLE)!;
      expect(saved.artist).toBe(ARTIST);
      expect(saved.content).toBe(CONVERTED);
      expect(saved.originalKey).toBe('Bb'); expect(saved.churchKey).toBe('Bb');
      expect(saved.notes).toContain(CIFRA);
      expect(writes(h.mock)).toEqual([{ method: 'POST', path: '/rest/v1/rpc/save_song' }]);
      expect(await h.page.evaluate(() => sessionStorage.getItem('candeia.mobile-cifra.v1'))).toBeNull();
    } finally { await h.dispose(); }
  });

  test('rascunho da importação fica isolado e preserva a nova música comum', async () => {
    const h = await harness();
    try {
      await h.mock.login();
      await h.page.goto('/musicas');
      await h.page.getByRole('button', { name: 'Nova música', exact: true }).click();
      let dialog = h.page.getByRole('dialog');
      await dialog.getByLabel('Título', { exact: true }).fill('Rascunho comum preservado');
      await dialog.getByLabel('Artista / compositor', { exact: true }).fill('Equipe local');
      await dialog.getByRole('textbox', { name: /^Letra e cifra/ }).fill('[C]Texto do rascunho comum');
      await dialog.getByRole('button', { name: 'Fechar', exact: true }).click();
      await h.page.goto(transfer());
      await pending(h.page);
      await h.page.getByRole('button', { name: 'Revisar e salvar na biblioteca', exact: true }).click();
      dialog = h.page.getByRole('dialog');
      await dialog.getByLabel('Título', { exact: true }).fill('Rascunho móvel revisado');
      await dialog.getByRole('button', { name: 'Fechar', exact: true }).click();
      await h.page.reload();
      await pending(h.page);
      await h.page.getByRole('button', { name: 'Revisar e salvar na biblioteca', exact: true }).click();
      await expect(h.page.getByRole('dialog').getByLabel('Título', { exact: true })).toHaveValue('Rascunho móvel revisado');
      await h.page.getByRole('dialog').getByRole('button', { name: 'Fechar', exact: true }).click();
      await h.page.getByRole('button', { name: 'Descartar importação', exact: true }).click();
      await h.page.getByRole('button', { name: 'Nova música', exact: true }).click();
      dialog = h.page.getByRole('dialog');
      await expect(dialog.getByLabel('Título', { exact: true })).toHaveValue('Rascunho comum preservado');
      await expect(dialog.getByLabel('Artista / compositor', { exact: true })).toHaveValue('Equipe local');
      await expect(dialog.getByRole('textbox', { name: /^Letra e cifra/ })).toHaveValue('[C]Texto do rascunho comum');
      expect(writes(h.mock)).toHaveLength(0);
    } finally { await h.dispose(); }
  });

  test('sem metadados de tom e com harmonia ambígua exige confirmação antes de importar ou salvar', async () => {
    const h = await harness();
    try {
      await h.mock.login();
      await h.page.goto(transfer({ ...SOURCE, displayedKey: undefined, soundingKey: undefined, keyUnknownReason: 'Confirme o tom dos acordes escritos.' }));
      await pending(h.page);
      await h.page.getByRole('button', { name: 'Revisar e salvar na biblioteca', exact: true }).click();
      const dialog = h.page.getByRole('dialog');
      await expect(dialog.getByRole('button', { name: 'Importar cifra e letra', exact: true })).toBeDisabled();
      await dialog.getByRole('button', { name: 'Salvar música', exact: true }).click();
      await expect(dialog.getByRole('alert')).toContainText('Confirme o tom');
      expect(writes(h.mock)).toHaveLength(0);
      await dialog.getByLabel('Tom dos acordes recebidos', { exact: true }).selectOption('G');
      await dialog.getByLabel('Tom na igreja', { exact: true }).selectOption('Bb');
      await dialog.getByRole('button', { name: 'Salvar música', exact: true }).click();
      await expect(dialog).toBeHidden();
      expect(h.mock.data.songs.find(song => song.title === TITLE)!.content).toBe(CONVERTED);
      expect(writes(h.mock)).toHaveLength(1);
    } finally { await h.dispose(); }
  });

  for (const kind of ['fonte externa', 'payload grande'] as const) test(`rejeita ${kind}, remove hash e não envia gravações`, async () => {
    const h = await harness();
    try {
      await h.mock.login();
      const url = kind === 'fonte externa' ? transfer({ ...SOURCE, sourceUrl: 'https://example.invalid/artista/cifra/' })
        : `${SITE}/importar-cifra${PREFIX}${'a'.repeat(100_001)}`;
      await h.page.goto(url);
      await expect(h.page).toHaveURL(`${SITE}/importar-cifra`);
      await expect(h.page.getByRole('alert')).toContainText(kind === 'fonte externa' ? 'Cifra Club' : 'grande');
      await expect(h.page.getByRole('button', { name: 'Revisar e salvar na biblioteca', exact: true })).toHaveCount(0);
      expect(await h.page.evaluate(() => sessionStorage.getItem('candeia.mobile-cifra.v1'))).toBeNull();
      expect(writes(h.mock)).toHaveLength(0);
    } finally { await h.dispose(); }
  });

  for (const role of ['guest', 'musician'] as const) test(`${role} pode consultar transferência sem conseguir salvar`, async () => {
    const h = await harness(role === 'guest' ? 'admin' : role);
    try {
      if (role === 'musician') await h.mock.login();
      await h.page.goto(transfer());
      if (role === 'guest') await h.page.getByRole('button', { name: 'Entrar sem cadastro', exact: true }).click();
      await pending(h.page);
      await expect(h.page.getByRole('button', { name: 'Revisar e salvar na biblioteca', exact: true })).toHaveCount(0);
      await expect(h.page.getByRole('button', { name: 'Salvar música', exact: true })).toHaveCount(0);
      await expect(h.page.getByText('Uma conta administradora pode salvar esta cifra na biblioteca.', { exact: false })).toBeVisible();
      expect(writes(h.mock)).toHaveLength(0);
    } finally { await h.dispose(); }
  });

  test('favorito empacotado navega por javascript: com CSP/COOP e entrega cifra/metadados sem clipboard', async () => {
    const h = await harness();
    try {
      await h.mock.login();
      await h.page.goto(CIFRA);
      const alerts: string[] = [];
      h.page.on('dialog', async dialog => { alerts.push(dialog.message()); await dialog.dismiss(); });
      const favorite = (await readFile(resolve('public/downloads/candeia-cifra-celular.txt'), 'utf8')).trim();
      expect(favorite).toMatch(/^javascript:/);
      const cdp = await h.context.newCDPSession(h.page);
      // Browser-initiated URL navigation exercises a bookmarklet rather than
      // evaluating the reader directly. The physical favorites UI is untested.
      await cdp.send('Page.navigate', { url: favorite });
      await pending(h.page);
      expect(alerts).toEqual([]);
      await expect(h.page.getByText(ARTIST, { exact: true })).toBeVisible();
      expect(writes(h.mock)).toHaveLength(0);
      await h.page.getByRole('button', { name: 'Revisar e salvar na biblioteca', exact: true }).click();
      const dialog = h.page.getByRole('dialog');
      await expect(dialog.getByLabel('Tom na igreja', { exact: true })).toHaveValue('G');
      await expect(dialog.getByLabel('Artista / compositor', { exact: true })).toHaveValue(ARTIST);
      await expect(dialog).toContainText('Capotraste na fonte: 3ª casa');
    } finally { await h.dispose(); }
  });

  test('script empacotado do AtalhoApple chama completion uma vez e transfere a mesma cifra', async () => {
    const h = await harness();
    try {
      await h.mock.login();
      await h.page.goto(CIFRA);
      const shortcut = await readFile(resolve('public/downloads/candeia-cifra-iphone.js'), 'utf8');
      const cdp = await h.context.newCDPSession(h.page);
      // completion is an Apple Shortcuts host function. Stub only that native
      // host boundary; execute the exact assembled script against a real DOM.
      const execution = await cdp.send('Runtime.evaluate', { expression: `window.__shortcutOutputs = []; window.completion = value => window.__shortcutOutputs.push(value);\n${shortcut}` });
      expect(execution.exceptionDetails).toBeUndefined();
      const outputs = await h.page.evaluate(() => (window as unknown as { __shortcutOutputs: unknown[] }).__shortcutOutputs);
      expect(outputs).toHaveLength(1);
      expect(outputs[0]).toEqual(expect.stringContaining(`${SITE}/importar-cifra${PREFIX}`));
      const raw = JSON.parse(Buffer.from((outputs[0] as string).split(PREFIX)[1], 'base64url').toString('utf8'));
      expect(raw.result).toMatchObject({ sourceUrl: CIFRA, title: TITLE, artist: ARTIST, displayedKey: 'G', capo: 3, soundingKey: 'Bb' });
      await h.page.goto(outputs[0] as string);
      await pending(h.page);
      expect(writes(h.mock)).toHaveLength(0);
    } finally { await h.dispose(); }
  });

  test('AtalhoApple sem cifra lança erro legível sem alert, completion ou gravação', async () => {
    const h = await harness();
    try {
      await h.mock.login();
      await h.context.route(CIFRA, route => route.fulfill({ status: 200, contentType: 'text/html',
        body: `<!doctype html><title>${TITLE} - ${ARTIST} - Cifra Club</title><h1>${TITLE}</h1><p>A cifra ainda não apareceu.</p>`,
        headers: { 'content-security-policy': "default-src 'none'; script-src 'none'", 'cross-origin-opener-policy': 'same-origin' } }));
      await h.page.goto(CIFRA);
      const alerts: string[] = [];
      h.page.on('dialog', async dialog => { alerts.push(dialog.message()); await dialog.dismiss(); });
      const shortcut = await readFile(resolve('public/downloads/candeia-cifra-iphone.js'), 'utf8');
      const cdp = await h.context.newCDPSession(h.page);
      const execution = await cdp.send('Runtime.evaluate', {
        expression: `window.__shortcutOutputs = []; window.completion = value => window.__shortcutOutputs.push(value);\n${shortcut}`,
      });
      expect(execution.exceptionDetails).toBeDefined();
      expect(execution.exceptionDetails?.exception?.description).toMatch(/cifra|acordes|página/i);
      expect(await h.page.evaluate(() => (window as unknown as { __shortcutOutputs: unknown[] }).__shortcutOutputs)).toEqual([]);
      expect(alerts).toEqual([]);
      await expect(h.page).toHaveURL(CIFRA);
      expect(writes(h.mock)).toHaveLength(0);
    } finally { await h.dispose(); }
  });
});
