import { chromium, expect, test, type BrowserContext, type Page } from '@playwright/test';
import { existsSync } from 'node:fs';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { extname, join, resolve, sep } from 'node:path';
import { setupMockMinistry } from './fixtures';

test.use({ trace: 'off', screenshot: 'off' });

// This tests an actual unpacked Chrome extension. Every website response is a
// fixture: it does not claim that the provider's live 403 has been resolved.
const SITE = 'https://louvor-grupo-fxebsy.netlify.app';
const CIFRA = 'https://www.cifraclub.com.br/equipe-de-teste/luz-da-equipe/';
const EXTENSION = resolve('browser-extension/candeia-cifraclub');
const DIST = resolve('dist');
const ORIGINAL = '[C]Conteúdo anterior que precisa de confirmação.';
const CIFRA_HTML = `<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><title>Cifra de teste</title></head><body>
  <nav aria-label="Menu principal"><h2>Menu principal</h2></nav>
  <h1>Luz da equipe</h1><h2><a href="/equipe-de-teste/">Equipe da fonte</a></h2>
  <div id="cifra_tom">Tom: <a>F</a></div>
  <pre data-original-key="C"><b>F</b>           <b>C/E</b>
Uma luz nos guia
<b>Dm7</b>         <b>Bb</b>
Seguimos em paz</pre>
</body></html>`;
const SOURCE = { id: CIFRA, title: 'Luz da equipe', artist: 'Equipe da fonte', source: 'Cifra Club', kind: 'chords', sourceUrl: CIFRA };
const MIME: Record<string, string> = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.svg': 'image/svg+xml', '.png': 'image/png', '.woff2': 'font/woff2', '.json': 'application/json', '.webmanifest': 'application/manifest+json' };

function extensionChromiumExecutable(): string {
  if (process.env.CANDEIA_EXTENSION_CHROMIUM_EXECUTABLE_PATH) return process.env.CANDEIA_EXTENSION_CHROMIUM_EXECUTABLE_PATH;
  // The managed cloud Chromium blocks every unpacked extension. Prefer the
  // official isolated Playwright browser for this suite only; derive its
  // revision and nested executable path from the installed Playwright version.
  // Install with PLAYWRIGHT_BROWSERS_PATH=/workspace/scratch/playwright-cifra-browsers
  // npx playwright install chromium --no-shell. No managed policy is changed.
  const defaultExecutable = chromium.executablePath();
  const parts = defaultExecutable.split(sep);
  const revision = parts.findIndex(part => /^chromium-\d+$/.test(part));
  const cloudExecutable = revision >= 0 ? join('/workspace/scratch/playwright-cifra-browsers', ...parts.slice(revision)) : '';
  if (cloudExecutable && existsSync(cloudExecutable)) return cloudExecutable;
  return process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH
    || (existsSync(defaultExecutable) ? defaultExecutable : existsSync('/usr/bin/chromium') ? '/usr/bin/chromium' : defaultExecutable);
}

interface BridgeReply {
  channel: string; version: number; type: string; requestId: string;
  result?: { sourceUrl: string; title: string; artist: string; text: string; displayedKey?: string; soundingKey?: string; capo?: number };
  error?: string;
}

async function exchange(page: Page, type: 'ping' | 'read', sourceUrl?: string, timeout = 30_000): Promise<BridgeReply> {
  return page.evaluate(({ type, sourceUrl, timeout }) => new Promise((resolve, reject) => {
    const requestId = crypto.randomUUID();
    const timer = setTimeout(() => { window.removeEventListener('message', receive); reject(new Error('A extensão não respondeu no prazo do teste.')); }, timeout);
    function receive(event: MessageEvent) {
      const reply = event.data;
      if (event.source !== window || event.origin !== location.origin || reply?.channel !== 'candeia-cifraclub'
        || reply.version !== 1 || reply.requestId !== requestId || !['ready', 'response'].includes(reply.type)) return;
      clearTimeout(timer); window.removeEventListener('message', receive); resolve(reply);
    }
    window.addEventListener('message', receive);
    window.postMessage({ channel: 'candeia-cifraclub', version: 1, type, requestId, ...(sourceUrl ? { sourceUrl } : {}) }, location.origin);
  }), { type, sourceUrl, timeout }) as Promise<BridgeReply>;
}

async function createHarness(cifraHtml = CIFRA_HTML): Promise<{ context: BrowserContext; page: Page; dispose(): Promise<void> }> {
  const profile = await mkdtemp('/tmp/candeia-cifra-extension-');
  const env = Object.fromEntries(Object.entries(process.env).filter(([name, value]) => value !== undefined
    && !/TOKEN|PASSWORD|SECRET|SERVICE_ROLE|DEBUG|PWDEBUG/i.test(name))) as Record<string, string>;
  let context: BrowserContext;
  try {
    context = await chromium.launchPersistentContext(profile, {
      executablePath: extensionChromiumExecutable(),
      headless: true, baseURL: SITE, env,
      ignoreDefaultArgs: ['--disable-extensions'],
      args: ['--no-sandbox', `--disable-extensions-except=${EXTENSION}`, `--load-extension=${EXTENSION}`],
    });
  } catch (error) { await rm(profile, { recursive: true, force: true }); throw error; }
  const outsideFixtureRequests: string[] = [];
  await context.route('**/*', async route => {
    const url = new URL(route.request().url());
    if (url.origin === 'https://www.cifraclub.com.br') {
      return route.fulfill({ status: 200, contentType: 'text/html', body: cifraHtml });
    }
    if (url.origin === 'https://lrclib.net') {
      return route.fulfill({ contentType: 'application/json', body: '[]', headers: { 'access-control-allow-origin': SITE } });
    }
    if (url.origin !== SITE) {
      outsideFixtureRequests.push(`${url.origin}${url.pathname}`);
      return route.abort('blockedbyclient');
    }
    if (url.pathname === '/.netlify/functions/song-search') {
      return route.fulfill({ status: url.searchParams.has('url') ? 502 : 200,
        contentType: 'application/json', body: JSON.stringify(url.searchParams.has('url')
          ? { error: 'O Cifra Club bloqueou a consulta automática no servidor.' } : { results: [SOURCE] }) });
    }
    // Disable only the site's PWA worker, so fixtures cannot cache responses.
    // The extension's own service worker is still loaded by Chromium normally.
    if (url.pathname === '/sw.js') return route.fulfill({ status: 404, body: '' });
    const file = resolve(DIST, `.${decodeURIComponent(url.pathname)}`);
    if (file !== DIST && !file.startsWith(`${DIST}${sep}`)) return route.abort('blockedbyclient');
    try {
      const body = await readFile(file);
      return route.fulfill({ contentType: MIME[extname(file)] || 'application/octet-stream', body });
    } catch {
      if (extname(url.pathname)) return route.fulfill({ status: 404, body: '' });
      return route.fulfill({ contentType: 'text/html', body: await readFile(join(DIST, 'index.html')) });
    }
  });
  const page = context.pages()[0] || await context.newPage();
  page.setDefaultTimeout(15_000);
  return { context, page, async dispose() {
    try {
      await context.close();
      expect(outsideFixtureRequests, 'Nenhuma chamada externa à rede de fixtures foi iniciada.').toEqual([]);
    } finally { await rm(profile, { recursive: true, force: true }); }
  } };
}

test.describe('importador Cifra Club: extensão real, websites simulados', () => {
  test.describe.configure({ mode: 'serial' });
  test.setTimeout(45_000);
  test.skip(!existsSync(join(EXTENSION, 'manifest.json')) || !existsSync(join(DIST, 'index.html')),
    'Requer extensão do repositório e npm run build para servir a interface na URL permitida.');

  test('protocolo descobre extensão, lê DOM visível e encerra a aba temporária', async () => {
    const harness = await createHarness();
    try {
      await harness.page.goto(SITE);
      const ready = await exchange(harness.page, 'ping', undefined, 5_000);
      expect(ready.type).toBe('ready');
      const ordinary = await harness.context.newPage();
      await ordinary.goto(CIFRA);
      await harness.page.bringToFront();
      const pagesBefore = harness.context.pages().length;
      const created: Page[] = [];
      harness.context.on('page', page => created.push(page));
      const reply = await exchange(harness.page, 'read', CIFRA);
      expect(reply.type).toBe('response');
      expect(reply.error).toBeUndefined();
      expect(reply.result).toMatchObject({ sourceUrl: CIFRA, title: SOURCE.title, artist: SOURCE.artist, displayedKey: 'F' });
      expect(reply.result!.text).toContain('Uma luz nos guia');
      expect(reply.result!.text).toContain('C/E');
      await expect.poll(() => harness.context.pages().length).toBe(pagesBefore);
      expect(created.length).toBe(1);
      expect(created[0].isClosed()).toBe(true);
      expect(ordinary.isClosed()).toBe(false);
      await expect(ordinary.locator('pre')).toContainText('Uma luz nos guia');
      // Cifra Club also writes major seventh chords as F7M / Am7M. A chart
      // containing only these must still be recognized as a chord sheet.
      const majorSevenths = CIFRA_HTML.replace(/<pre[^>]*>[\s\S]*?<\/pre>/,
        '<pre data-original-key="C"><b>F7M</b>         <strong>Am7M</strong>\nUma luz nos guia</pre>');
      await harness.context.route(CIFRA, route => route.fulfill({ status: 200, contentType: 'text/html', body: majorSevenths }));
      const seventhReply = await exchange(harness.page, 'read', CIFRA);
      expect(seventhReply.error).toBeUndefined();
      expect(seventhReply.result).toMatchObject({ displayedKey: 'F' });
      expect(seventhReply.result!.text).toBe('F7M         Am7M\nUma luz nos guia');
      await expect.poll(() => harness.context.pages().length).toBe(pagesBefore);
      expect(ordinary.isClosed()).toBe(false);
    } finally { await harness.dispose(); }
  });

  test('ignora destinos fora do Cifra Club sem abrir abas', async () => {
    const harness = await createHarness();
    try {
      await harness.page.goto(SITE);
      const pagesBefore = harness.context.pages().length;
      const reply = await exchange(harness.page, 'read', 'https://example.invalid/musica/', 5_000);
      expect(reply.type).toBe('response');
      expect(reply.error).toBeTruthy();
      expect(reply.result).toBeUndefined();
      expect(harness.context.pages().length).toBe(pagesBefore);
    } finally { await harness.dispose(); }
  });

  test('página bloqueada retorna erro explícito e fecha a consulta sem inventar cifra', async () => {
    const harness = await createHarness('<!doctype html><title>Access Denied</title><h1>Access Denied</h1><p>You do not have permission to access this page.</p>');
    try {
      await harness.page.goto(SITE);
      const pagesBefore = harness.context.pages().length;
      const reply = await exchange(harness.page, 'read', CIFRA);
      expect(reply.type).toBe('response');
      expect(reply.error).toBeTruthy();
      expect(reply.result).toBeUndefined();
      await expect.poll(() => harness.context.pages().length).toBe(pagesBefore);
    } finally { await harness.dispose(); }
  });

  test('texto grande demais é rejeitado no leitor antes da importação', async () => {
    const html = CIFRA_HTML.replace('Seguimos em paz', 'x'.repeat(100_001));
    const harness = await createHarness(html);
    try {
      await harness.page.goto(SITE);
      const pagesBefore = harness.context.pages().length;
      const reply = await exchange(harness.page, 'read', CIFRA);
      expect(reply.error).toMatch(/limite|100\.000/i);
      expect(reply.result).toBeUndefined();
      await expect.poll(() => harness.context.pages().length).toBe(pagesBefore);
    } finally { await harness.dispose(); }
  });

  test('cancelamento fecha a aba de leitura e não importa uma resposta tardia', async () => {
    const harness = await createHarness('<!doctype html><title>Página ainda carregando</title><p>Conteúdo sem cifra.</p>');
    try {
      await harness.page.goto(SITE);
      const pagesBefore = harness.context.pages().length;
      const requestId = await harness.page.evaluate(() => {
        const requestId = crypto.randomUUID();
        (window as unknown as { bridgeReplies: unknown[] }).bridgeReplies = [];
        window.addEventListener('message', event => {
          if (event.source === window && event.origin === location.origin && event.data?.channel === 'candeia-cifraclub'
            && event.data.requestId === requestId && event.data.type === 'response') {
            (window as unknown as { bridgeReplies: unknown[] }).bridgeReplies.push(event.data);
          }
        });
        window.postMessage({ channel: 'candeia-cifraclub', version: 1, type: 'read', requestId,
          sourceUrl: 'https://www.cifraclub.com.br/equipe-de-teste/aguardando/' }, location.origin);
        return requestId;
      });
      await expect.poll(() => harness.context.pages().length).toBe(pagesBefore + 1);
      const duplicate = await exchange(harness.page, 'read', CIFRA, 5_000);
      expect(duplicate.error).toMatch(/já|aguarde|consulta/i);
      expect(duplicate.result).toBeUndefined();
      expect(harness.context.pages().length).toBe(pagesBefore + 1);
      const temporary = harness.context.pages().find(page => page !== harness.page)!;
      await harness.page.evaluate(requestId => window.postMessage({ channel: 'candeia-cifraclub', version: 1, type: 'cancel', requestId }, location.origin), requestId);
      await expect.poll(() => harness.context.pages().length).toBe(pagesBefore);
      expect(temporary.isClosed()).toBe(true);
      const replies = await harness.page.evaluate(() => (window as unknown as { bridgeReplies: BridgeReply[] }).bridgeReplies);
      expect(replies.every(reply => !reply.result)).toBe(true);
    } finally { await harness.dispose(); }
  });

  test('site recebe prévia da extensão e exige confirmar troca, preservando tom e fonte', async () => {
    const harness = await createHarness();
    try {
      const { page, context } = harness;
      const mock = await setupMockMinistry(page);
      await mock.login();
      await page.goto('/musicas');
      await page.getByRole('button', { name: 'Nova música', exact: true }).click();
      const dialog = page.getByRole('dialog');
      await dialog.getByLabel('Título', { exact: true }).fill('Título mantido no rascunho');
      await dialog.getByLabel('Artista / compositor', { exact: true }).fill('Minha equipe');
      await dialog.getByRole('combobox', { name: 'Tom na igreja', exact: true }).selectOption('D');
      await dialog.getByRole('textbox', { name: /^Letra e cifra/ }).fill(ORIGINAL);
      await expect(dialog).toContainText('Importador conectado');
      await dialog.getByRole('button', { name: 'Pesquisar cifra e letra', exact: true }).click();
      const result = dialog.locator('.songs-source-results > li').filter({ hasText: SOURCE.title });
      await result.getByRole('button', { name: `Ver prévia de ${SOURCE.title}`, exact: true }).click();
      const preview = dialog.getByLabel('Prévia do conteúdo para importar', { exact: true });
      await expect(preview).toHaveText('[F]Uma luz nos [C/E]guia\n[Dm7]Seguimos em [Bb]paz');
      await dialog.getByRole('checkbox', { name: 'Ver somente letra na prévia', exact: true }).check();
      await expect(preview).toHaveText('Uma luz nos guia\nSeguimos em paz');
      await dialog.getByRole('checkbox', { name: 'Ver somente letra na prévia', exact: true }).uncheck();
      await expect(dialog.getByRole('textbox', { name: /^Letra e cifra/ })).toHaveValue(ORIGINAL);
      await expect.poll(() => context.pages().length).toBe(1);
      await dialog.getByRole('button', { name: 'Importar cifra e letra', exact: true }).click();
      await expect(dialog.getByRole('textbox', { name: /^Letra e cifra/ })).toHaveValue(ORIGINAL);
      expect(mock.calls.filter(call => call.path === '/rest/v1/rpc/save_song')).toHaveLength(0);
      await dialog.getByRole('button', { name: 'Substituir letra e cifra', exact: true }).click();
      await expect(dialog.getByRole('textbox', { name: /^Letra e cifra/ })).toHaveValue('[D]Uma luz nos [A/C#]guia\n[Bm7]Seguimos em [G]paz');
      await expect(dialog.getByRole('combobox', { name: 'Tom original', exact: true })).toHaveCount(0);
      await expect(dialog.getByRole('combobox', { name: 'Tom na igreja', exact: true })).toHaveValue('D');
      await expect(dialog.getByLabel('Título', { exact: true })).toHaveValue('Título mantido no rascunho');
      await expect(dialog.getByLabel('Artista / compositor', { exact: true })).toHaveValue('Minha equipe');
      await expect(dialog.getByLabel('Observações gerais')).toHaveValue(`Fonte da cifra: Cifra Club — ${CIFRA}`);
      await dialog.getByRole('button', { name: 'Salvar música', exact: true }).click();
      await expect(dialog).toBeHidden();
      const saved = mock.data.songs.find(song => song.title === 'Título mantido no rascunho')!;
      expect(saved.originalKey).toBe('D');
      expect(saved.churchKey).toBe('D');
      expect(saved.notes).toContain(CIFRA);
      expect(mock.calls.filter(call => call.path === '/rest/v1/rpc/save_song')).toHaveLength(1);
    } finally { await harness.dispose(); }
  });

  test('capotraste e tabs da página real do navegador resultam em teclado Bb e visualização C', async () => {
    const html = CIFRA_HTML.replace('Tom: <a>F</a>', 'Tom: <a>Bb</a> (forma dos acordes no tom de G)')
      .replace('<pre data-original-key="C">', '<div class="cifra_capo">Capotraste: 3</div><pre data-original-key="C">')
      .replace('<b>F</b>', '<b>G</b>').replace('<b>C/E</b>', '<b>D/F#</b>')
      .replace('<b>Dm7</b>', '<b>Em7</b>').replace('<b>Bb</b>', '<b>C</b>')
      .replace('</pre>', '\ne|--0--2--3--|\nB|--1--3--0--|</pre>');
    const harness = await createHarness(html);
    try {
      const mock = await setupMockMinistry(harness.page);
      await mock.login();
      await harness.page.goto('/musicas');
      await harness.page.getByRole('button', { name: 'Nova música', exact: true }).click();
      const dialog = harness.page.getByRole('dialog');
      await dialog.getByLabel('Título', { exact: true }).fill('Luz');
      await dialog.getByRole('combobox', { name: 'Tom na igreja', exact: true }).selectOption('Bb');
      await dialog.getByRole('button', { name: 'Pesquisar cifra e letra', exact: true }).click();
      await dialog.getByRole('button', { name: `Ver prévia de ${SOURCE.title}`, exact: true }).click();
      await expect(dialog.getByLabel('Prévia do conteúdo para importar', { exact: true })).toHaveText('[G]Uma luz nos [D/F#]guia\n[Em7]Seguimos em [C]paz');
      await expect(dialog).toContainText('Capotraste na fonte: 3ª casa');
      await dialog.getByRole('checkbox', { name: 'Atualizar título e artista com os dados da fonte', exact: true }).check();
      await dialog.getByRole('button', { name: 'Salvar música', exact: true }).click();
      await expect(dialog).toBeHidden();
      const saved = mock.data.songs.find(song => song.title === SOURCE.title)!;
      expect(saved.originalKey).toBe('Bb');
      expect(saved.churchKey).toBe('Bb');
      expect(saved.content).toBe('[Bb]Uma luz nos [F/A]guia\n[Gm7]Seguimos em [Eb]paz');
      await harness.page.goto(`/musicas/${saved.id}`);
      await harness.page.getByLabel('Tom da visualização').selectOption('C');
      await expect(harness.page.locator('.song-chord').filter({ hasText: /^C$/ })).toHaveCount(1);
      await expect(harness.page.locator('.song-chord').filter({ hasText: /^G\/B$/ })).toHaveCount(1);
      expect(mock.calls.filter(call => call.path === '/rest/v1/rpc/save_song')).toHaveLength(1);
    } finally { await harness.dispose(); }
  });
});
