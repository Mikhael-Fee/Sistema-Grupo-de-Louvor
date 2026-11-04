import { expect, test, type Page, type TestInfo } from '@playwright/test';
import { setupMockMinistry } from './fixtures';

const TITLE = 'Sequência sintética da equipe';
const SOURCE_URL = 'https://www.cifraclub.com.br/equipe-ficticia/sequencia-sintetica/';
const SOURCE = { id: SOURCE_URL, sourceUrl: SOURCE_URL, source: 'Cifra Club', kind: 'chords', title: TITLE, artist: 'Equipe fictícia' };
const CONTENT_C = '[C]Voz [F]em [G/B]luz [Am]aqui';
const CHORDS_C = ['C', 'F', 'G/B', 'Am'];
const CHORDS_D = ['D', 'G', 'A/C#', 'Bm'];
const DRAFT = '[C]Rascunho da equipe [F]preservado';

/** Contract simulation: no extension, Cifra Club, Supabase or email service is contacted. */
async function simulateImporter(page: Page) {
  await page.addInitScript(({ sourceUrl, title, content }) => {
    window.addEventListener('message', event => {
      const request = event.data;
      if (sessionStorage.getItem('fixture.importer') === 'off' || event.source !== window || event.origin !== location.origin
        || request?.channel !== 'candeia-cifraclub' || !['ping', 'read'].includes(request.type)) return;
      const reply = { channel: request.channel, version: 1, requestId: request.requestId, capabilities: ['written-key-capo', 'same-tab-return'] };
      if (request.type === 'ping') return window.postMessage({ ...reply, type: 'ready' }, location.origin);
      sessionStorage.setItem('fixture.importer.reads', String(Number(sessionStorage.getItem('fixture.importer.reads') || 0) + 1));
      window.postMessage({ ...reply, type: 'response', ...(sessionStorage.getItem('fixture.importer') === 'fail-read'
        ? { error: 'A conexão com o importador foi interrompida. Tente novamente.' }
        : { result: { sourceUrl, title, artist: 'Equipe fictícia', displayedKey: 'C', text: content } }) }, location.origin);
    });
  }, { sourceUrl: SOURCE_URL, title: TITLE, content: CONTENT_C });
  await page.route('**/.netlify/functions/song-search?**', route => route.fulfill({ contentType: 'application/json', body: JSON.stringify({ results: [SOURCE] }) }));
  await page.route('https://lrclib.net/**', route => route.fulfill({ contentType: 'application/json', body: '[]', headers: { 'access-control-allow-origin': '*' } }));
  await page.route('**/.netlify/functions/youtube-search?**', route => route.fulfill({ contentType: 'application/json', body: '{"results":[]}' }));
  await page.route('https://www.cifraclub.com.br/**', route => route.abort('blockedbyclient'));
  await page.route('https://i.ytimg.com/**', route => route.abort('blockedbyclient'));
}

async function capture(page: Page, testInfo: TestInfo, name: string) {
  const path = testInfo.outputPath(`${name}.png`);
  await page.screenshot({ path, fullPage: true });
  await testInfo.attach(name, { path, contentType: 'image/png' });
}

async function noHorizontalOverflow(page: Page) {
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  const dialog = page.getByRole('dialog');
  if (await dialog.isVisible()) {
    const dimensions = await dialog.evaluate(element => {
      const box = element.getBoundingClientRect();
      return { left: box.left, right: box.right, width: innerWidth, scroll: element.scrollWidth, client: element.clientWidth };
    });
    expect(dimensions.left).toBeGreaterThanOrEqual(0);
    expect(dimensions.right).toBeLessThanOrEqual(dimensions.width);
    expect(dimensions.scroll).toBeLessThanOrEqual(dimensions.client);
  }
}

for (const width of [1280, 360, 390, 320]) test.describe(`ciclo isolado de cifra (${width}px)`, () => {
  test.setTimeout(75_000);
  test.use({ viewport: { width, height: 900 }, ...(width < 600 ? {
    isMobile: true, hasTouch: true,
    userAgent: 'Mozilla/5.0 (Linux; Android 15) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/145.0.0.0 Mobile Safari/537.36',
  } : {}) });

  test('admin importa; líder define Ré no culto; músico lê sem extensão e Biblioteca continua em Dó', async ({ page }, testInfo) => {
    await simulateImporter(page);
    const mock = await setupMockMinistry(page);
    mock.data.songs = [];
    mock.data.services.forEach(service => { service.repertoire = []; });
    expect(mock.data.songs.some(song => ['Castelo Forte', 'Grandioso És Tu'].includes(song.title))).toBe(false);
    let rpcOrigin = '';
    page.on('request', request => {
      if (new URL(request.url()).pathname.startsWith('/rest/v1/')) rpcOrigin = new URL(request.url()).origin;
    });
    await mock.login('admin');
    await page.goto('/musicas');
    await page.getByRole('button', { name: 'Nova música', exact: true }).click();
    let dialog = page.getByRole('dialog');
    await dialog.getByLabel('Título', { exact: true }).fill(TITLE);
    await dialog.getByLabel('Artista / compositor', { exact: true }).fill('Equipe fictícia');
    await dialog.getByRole('combobox', { name: 'Tom na igreja', exact: true }).selectOption('C');
    await expect(dialog).toContainText('Importador conectado');
    await noHorizontalOverflow(page);
    await capture(page, testInfo, '01-cadastro-admin');
    await dialog.getByRole('button', { name: 'Buscar cifra no Cifra Club', exact: true }).click();
    await dialog.getByRole('button', { name: `Ver prévia de ${TITLE}`, exact: true }).click();
    await expect(dialog.getByLabel('Prévia do conteúdo para importar', { exact: true })).toHaveText(CONTENT_C);
    await noHorizontalOverflow(page);
    await capture(page, testInfo, '02-previa-admin');
    await dialog.getByRole('button', { name: 'Importar cifra e letra', exact: true }).click();
    await expect(dialog.getByRole('textbox', { name: /^Letra e cifra/ })).toHaveValue(CONTENT_C);
    await dialog.getByRole('button', { name: 'Salvar música', exact: true }).click();
    await expect(dialog).toBeHidden();
    const saved = mock.data.songs.find(song => song.title === TITLE)!;
    expect(saved).toMatchObject({ content: CONTENT_C, churchKey: 'C', originalKey: 'C' });
    await page.reload();
    await page.getByRole('link', { name: new RegExp(`^${TITLE}`) }).click();
    await expect(page.getByRole('heading', { name: TITLE, exact: true })).toBeVisible();
    await expect(page.locator('.song-chord').filter({ hasText: /\S/ })).toHaveText(CHORDS_C);
    const readsAfterImport = await page.evaluate(() => sessionStorage.getItem('fixture.importer.reads'));
    expect(readsAfterImport).toBe('1');

    // The following actors use the saved content with no responding importer.
    await page.evaluate(() => sessionStorage.setItem('fixture.importer', 'off'));
    await mock.login('leader');
    const service = mock.data.services[0];
    await page.goto(`/cultos/${service.id}`);
    await page.getByRole('button', { name: 'Selecionar músicas', exact: true }).click();
    dialog = page.getByRole('dialog');
    await dialog.getByRole('checkbox', { name: `Selecionar ${TITLE}`, exact: true }).check();
    await dialog.getByRole('button', { name: 'Adicionar selecionadas (1)', exact: true }).click();
    await expect(dialog).toBeHidden();
    await page.getByRole('button', { name: `Editar tom e observação de ${TITLE}`, exact: true }).click();
    dialog = page.getByRole('dialog');
    await dialog.getByRole('combobox', { name: 'Tom neste culto', exact: true }).selectOption('D');
    await dialog.getByRole('button', { name: 'Salvar ajustes', exact: true }).click();
    await expect(dialog).toBeHidden();
    const item = mock.data.services.find(entry => entry.id === service.id)!.repertoire[0];
    expect(item.key).toBe('D');
    const serviceSongUrl = `/musicas/${saved.id}?service=${service.id}&item=${item.id}`;

    for (const role of ['leader', 'musician'] as const) {
      if (role === 'musician') await mock.login(role);
      await page.goto(`/cultos/${service.id}`);
      await page.getByRole('link', { name: new RegExp(TITLE) }).click();
      await expect(page).toHaveURL(serviceSongUrl);
      await expect(page.getByLabel('Tom da visualização', { exact: true })).toHaveValue('D');
      await expect(page.locator('.song-chord').filter({ hasText: /\S/ })).toHaveText(CHORDS_D);
      await expect(page.getByRole('button', { name: 'Editar música', exact: true })).toHaveCount(0);
      await expect(page.getByRole('link', { name: /guia|conectar importador|instalar extensão/i })).toHaveCount(0);
      await noHorizontalOverflow(page);
      if (role === 'musician') await capture(page, testInfo, '03-leitura-musico-sem-extensao');
      await page.goto(`/musicas/${saved.id}`);
      await expect(page.getByLabel('Tom da visualização', { exact: true })).toHaveValue('C');
      await expect(page.locator('.song-chord').filter({ hasText: /\S/ })).toHaveText(CHORDS_C);
      await page.goto('/musicas');
      await expect(page.getByRole('button', { name: 'Nova música', exact: true })).toHaveCount(0);
      // Exercise the mock's server boundary as well as the hidden UI action.
      const denied = await page.evaluate(async ({ origin, song }) => {
        const response = await fetch(`${origin}/rest/v1/rpc/save_song`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ p_song: { ...song, title: 'Tentativa sem permissão' } }) });
        return { status: response.status, body: await response.json() };
      }, { origin: rpcOrigin, song: saved });
      expect(denied).toMatchObject({ status: 403, body: { code: '42501' } });
      expect(mock.data.songs).toHaveLength(1);
      expect(mock.data.songs[0]).toMatchObject({ title: TITLE, content: CONTENT_C, churchKey: 'C', originalKey: 'C' });
      const transfer = Buffer.from(JSON.stringify({ version: 1, result: { sourceUrl: SOURCE_URL, title: TITLE, artist: 'Equipe fictícia', displayedKey: 'C', text: CONTENT_C } })).toString('base64url');
      for (const path of ['/conectar-cifra-club', `/importar-cifra#candeia-cifra=${transfer}`]) {
        await page.goto(path);
        await expect(page).toHaveURL('/musicas');
        await expect(page.getByRole('button', { name: 'Revisar e salvar na biblioteca', exact: true })).toHaveCount(0);
        await expect(page.getByRole('heading', { name: 'Importar pelo Firefox no Android', exact: true })).toHaveCount(0);
        await expect(page.getByRole('link', { name: /Baixar extensão|Ver guia de importação/i })).toHaveCount(0);
      }
    }
    expect(await page.evaluate(() => sessionStorage.getItem('fixture.importer.reads'))).toBe(readsAfterImport);
  });

  test('requisito é explicado sem conexão; falha durante leitura preserva o rascunho', async ({ page }, testInfo) => {
    await simulateImporter(page);
    const mock = await setupMockMinistry(page);
    await mock.login('admin');
    await page.evaluate(() => sessionStorage.setItem('fixture.importer', 'off'));
    await page.goto('/musicas');
    await page.getByRole('button', { name: 'Nova música', exact: true }).click();
    let dialog = page.getByRole('dialog');
    await dialog.getByLabel('Título', { exact: true }).fill(TITLE);
    await dialog.getByRole('textbox', { name: /^Letra e cifra/ }).fill(DRAFT);
    await dialog.getByLabel('Observações gerais').fill('Orientação fictícia preservada');
    await expect(dialog.getByRole('link', { name: /Firefox|importador/i }).first()).toBeVisible();
    await expect(dialog.getByRole('button', { name: 'Colar cifra', exact: true })).toBeVisible();
    await expect(dialog.getByRole('button', { name: 'Buscar somente letra', exact: true })).toBeVisible();
    await expect(dialog).toContainText('Para importar cifras do Cifra Club, conecte o importador.');
    await dialog.getByRole('button', { name: 'Buscar cifra no Cifra Club', exact: true }).click();
    await expect(dialog.getByRole('button', { name: `Ver prévia de ${TITLE}`, exact: true })).toBeDisabled();
    await expect(dialog.getByRole('textbox', { name: /^Letra e cifra/ })).toHaveValue(DRAFT);
    expect(await page.evaluate(() => sessionStorage.getItem('fixture.importer.reads'))).toBeNull();
    await capture(page, testInfo, '04-sem-importador');
    await noHorizontalOverflow(page);
    // Reload keeps the actual application draft. Restore a connected bridge,
    // then make its read reply fail after the connection check succeeds.
    await page.evaluate(() => sessionStorage.setItem('fixture.importer', 'fail-read'));
    await page.reload();
    await page.getByRole('button', { name: 'Nova música', exact: true }).click();
    dialog = page.getByRole('dialog');
    await expect(dialog.getByRole('textbox', { name: /^Letra e cifra/ })).toHaveValue(DRAFT);
    await expect(dialog).toContainText('Importador conectado');
    await dialog.getByRole('button', { name: 'Buscar cifra no Cifra Club', exact: true }).click();
    await dialog.getByRole('button', { name: `Ver prévia de ${TITLE}`, exact: true }).click();
    await expect(dialog.getByRole('alert')).toContainText('conexão com o importador foi interrompida');
    await expect(dialog.getByLabel('Título', { exact: true })).toHaveValue(TITLE);
    await expect(dialog.getByRole('textbox', { name: /^Letra e cifra/ })).toHaveValue(DRAFT);
    await expect(dialog.getByLabel('Observações gerais')).toHaveValue('Orientação fictícia preservada');
    await capture(page, testInfo, '05-falha-conexao-rascunho');
    await noHorizontalOverflow(page);
    expect(mock.calls.filter(call => call.path === '/rest/v1/rpc/save_song')).toHaveLength(0);
  });
});
