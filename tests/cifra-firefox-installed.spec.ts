import { expect, test, type Page } from '@playwright/test';
import { setupMockMinistry } from './fixtures';

const SOURCE_URL = 'https://www.cifraclub.com.br/equipe/luz-da-equipe/';
const SOURCE = { id: SOURCE_URL, sourceUrl: SOURCE_URL, source: 'Cifra Club', kind: 'chords', title: 'Luz da equipe', artist: 'Artista da fonte' };
const PREVIEW = '[F]Nossa luz nos [C]guia\n[Dm]Seguimos em [Bb]paz';
const ORIGINAL = '[D]Conteúdo do rascunho [G]preservado.';
const ACCOUNT = '20000000-0000-4000-8000-000000000001';

test.use({ userAgent: 'Mozilla/5.0 (Android 15; Mobile; rv:145.0) Gecko/145.0 Firefox/145.0', viewport: { width: 390, height: 844 } });
test.setTimeout(75_000);
test.beforeEach(({ page }) => {
  page.on('pageerror', error => console.error(`Fixture page error: ${error.message}`));
});
test.afterEach(async ({ page }, info) => {
  if (info.status !== info.expectedStatus && !page.isClosed()) console.error('Fixture return state:', await page.evaluate(() => ({
    pathname: `${location.pathname}${location.search}`, pending: sessionStorage.getItem('candeia.cifra-current-tab.v1'),
    requests: sessionStorage.getItem('fixture-bridge-requests'), dialogs: document.querySelectorAll('dialog[open]').length,
    alerts: [...document.querySelectorAll('[role="alert"]')].map(node => node.textContent),
  })));
});

/** Contract fixture only: exercises full-document return and real draft storage.
 * It does not claim to emulate Firefox Android activities or a live provider. */
async function bridge(page: Page, options: { installed?: boolean; outdated?: boolean; interrupted?: boolean; restored?: boolean; returnToDetail?: boolean } = {}) {
  let returnUrl = '';
  await page.exposeFunction('fixtureCaptureCifraReturn', (value: string) => { returnUrl = value; });
  await page.route('https://www.cifraclub.com.br/**', route => route.fulfill({ contentType: 'text/html',
    body: `<!doctype html><title>Cifra de teste</title><h1>Fonte simulada</h1><script>location.replace(${JSON.stringify(returnUrl)})</script>` }));
  await page.addInitScript(({ sourceUrl, installed, outdated, interrupted, restored, returnToDetail }) => {
    const nativeMatchMedia = window.matchMedia.bind(window);
    window.matchMedia = query => query.startsWith('(display-mode:')
      ? { ...nativeMatchMedia(query), matches: installed && query === '(display-mode: standalone)' } as MediaQueryList
      : nativeMatchMedia(query);
    const capabilities = outdated ? ['written-key-capo'] : ['written-key-capo', 'same-tab-return'];
    window.addEventListener('message', event => {
      const request = event.data;
      if (event.source !== window || event.origin !== location.origin || request?.channel !== 'candeia-cifraclub'
        || !['ping', 'read', 'resume'].includes(request.type)) return;
      if (request.type !== 'ping') {
        const previous = JSON.parse(sessionStorage.getItem('fixture-bridge-requests') || '[]');
        sessionStorage.setItem('fixture-bridge-requests', JSON.stringify([...previous, request]));
      }
      const reply = { channel: request.channel, version: 1, requestId: request.requestId, capabilities };
      if (request.type === 'ping') return window.postMessage({ ...reply, type: 'ready' }, location.origin);
      if (request.type === 'read' && request.mode === 'same-tab') {
        window.postMessage({ ...reply, type: 'response', navigationStarted: true }, location.origin);
        if (restored) {
          setTimeout(() => window.dispatchEvent(new PageTransitionEvent('pageshow', { persisted: true })), 20);
          return;
        }
        const saveReturn = (window as unknown as { fixtureCaptureCifraReturn(value: string): Promise<void> }).fixtureCaptureCifraReturn;
        void saveReturn(interrupted ? `${location.origin}${returnToDetail ? location.pathname : '/musicas'}` : request.returnUrl).then(() => {
          setTimeout(() => location.assign(sourceUrl), 20);
        });
        return;
      }
      window.postMessage({ ...reply, type: 'response', ...(interrupted ? { error: 'A consulta foi interrompida. Pesquise a versão novamente.' } : {
        result: { sourceUrl, title: 'Luz da equipe', artist: 'Artista da fonte', displayedKey: 'F',
          text: 'F             C\nNossa luz nos guia\nDm          Bb\nSeguimos em paz' },
      }) }, location.origin);
    });
  }, { sourceUrl: SOURCE_URL, installed: options.installed ?? true, outdated: options.outdated ?? false, interrupted: options.interrupted ?? false, restored: options.restored ?? false, returnToDetail: options.returnToDetail ?? false });
  await page.route('**/.netlify/functions/song-search?**', route => route.fulfill({ contentType: 'application/json', body: JSON.stringify({ results: [SOURCE] }) }));
  await page.route('https://lrclib.net/**', route => route.fulfill({ contentType: 'application/json', body: '[]', headers: { 'access-control-allow-origin': '*' } }));
  await page.route('https://i.ytimg.com/**', route => route.abort());
}

for (const target of ['new', 'existing'] as const) {
  test(`aplicativo Firefox retoma ${target} com prévia separada e todos os campos intactos`, async ({ page }) => {
    await bridge(page);
    const mock = await setupMockMinistry(page);
    await mock.login();
    await page.goto('/musicas');
    const existing = mock.data.songs[0];
    if (target === 'new') await page.getByRole('button', { name: 'Nova música', exact: true }).click();
    else await page.getByRole('button', { name: `Editar ${existing.title}`, exact: true }).click();
    let dialog = page.getByRole('dialog');
    await dialog.getByLabel('Título', { exact: true }).fill('Título em edição');
    await dialog.getByLabel('Artista / compositor', { exact: true }).fill('Autor mantido');
    await dialog.getByRole('combobox', { name: 'Tom na igreja', exact: true }).selectOption('D');
    await dialog.getByRole('textbox', { name: /^Letra e cifra/ }).fill(ORIGINAL);
    await dialog.getByLabel('Observações gerais').fill('Observação antes da consulta');
    await dialog.getByLabel(/^Vídeo no YouTube/).fill('https://www.youtube.com/watch?v=dQw4w9WgXcQ');
    const selectedTag = mock.data.tags[0];
    const tagButton = dialog.getByRole('group', { name: 'Etiquetas', exact: true }).getByRole('button', { name: selectedTag.name, exact: true });
    if (await tagButton.getAttribute('aria-pressed') !== 'true') await tagButton.click();
    const key = `candeia.draft.v1:supabase:${ACCOUNT}:song:${target === 'new' ? 'new' : existing.id}`;
    const before = await page.evaluate(key => JSON.parse(sessionStorage.getItem(key)!).value, key);
    await dialog.getByRole('button', { name: 'Pesquisar cifra e letra', exact: true }).click();
    await dialog.getByRole('button', { name: `Ver prévia de ${SOURCE.title}`, exact: true }).click();
    dialog = page.getByRole('dialog');
    await expect(dialog.getByLabel('Prévia do conteúdo para importar', { exact: true })).toHaveText(PREVIEW, { timeout: 20_000 });
    await expect(page).toHaveURL('/musicas');
    await expect(dialog.getByLabel('Título', { exact: true })).toHaveValue(before.title);
    await expect(dialog.getByLabel('Artista / compositor', { exact: true })).toHaveValue(before.artist);
    await expect(dialog.getByRole('textbox', { name: /^Letra e cifra/ })).toHaveValue(before.content);
    await expect(dialog.getByRole('combobox', { name: 'Tom na igreja', exact: true })).toHaveValue('D');
    await expect(dialog.getByLabel('Observações gerais')).toHaveValue(before.notes);
    await expect(dialog.getByLabel(/^Vídeo no YouTube/)).toHaveValue(before.youtubeUrl);
    await expect(dialog.getByRole('checkbox', { name: 'Atualizar título e artista com os dados da fonte', exact: true })).not.toBeChecked();
    expect(await page.evaluate(key => JSON.parse(sessionStorage.getItem(key)!).value, key)).toEqual(before);
    expect(await page.evaluate(() => sessionStorage.getItem('candeia.cifra-current-tab.v1'))).toBeNull();
    const requests = await page.evaluate(() => JSON.parse(sessionStorage.getItem('fixture-bridge-requests') || '[]'));
    expect(requests.map((item: { type: string }) => item.type)).toEqual(['read', 'resume']);
    expect(requests[0]).toMatchObject({ mode: 'same-tab', sourceUrl: SOURCE_URL });
    expect(new URL(requests[0].returnUrl).searchParams.size).toBe(1);
    expect(mock.calls.filter(call => call.method !== 'GET' && call.path.startsWith('/rest/'))).toHaveLength(0);
    if (target === 'new') {
      // A second choice must keep the user's metadata checkbox across navigation.
      await dialog.getByRole('checkbox', { name: 'Atualizar título e artista com os dados da fonte', exact: true }).check();
      await dialog.getByRole('button', { name: 'Pesquisar cifra e letra', exact: true }).click();
      await dialog.getByRole('button', { name: `Ver prévia de ${SOURCE.title}`, exact: true }).click();
      dialog = page.getByRole('dialog');
      await expect(dialog.getByLabel('Prévia do conteúdo para importar', { exact: true })).toHaveText(PREVIEW, { timeout: 20_000 });
      await expect(dialog.getByRole('checkbox', { name: 'Atualizar título e artista com os dados da fonte', exact: true })).toBeChecked();
      await expect(dialog.getByRole('textbox', { name: /^Letra e cifra/ })).toHaveValue(ORIGINAL);
      await expect(dialog.getByRole('combobox', { name: 'Tom na igreja', exact: true })).toHaveValue('D');
    }
    await dialog.getByRole('button', { name: 'Importar cifra e letra', exact: true }).click();
    await dialog.getByRole('button', { name: 'Substituir letra e cifra', exact: true }).click();
    await expect(dialog.getByRole('textbox', { name: /^Letra e cifra/ })).toHaveValue('[D]Nossa luz nos [A]guia\n[Bm]Seguimos em [G]paz');
    expect(mock.calls.filter(call => call.path === '/rest/v1/rpc/save_song')).toHaveLength(0);
  });
}

test('extensão anterior pede atualização antes de iniciar consulta pelo aplicativo', async ({ page }) => {
  await bridge(page, { outdated: true });
  const mock = await setupMockMinistry(page);
  await mock.login();
  await page.goto('/musicas');
  await page.getByRole('button', { name: 'Nova música', exact: true }).click();
  const dialog = page.getByRole('dialog');
  await dialog.getByLabel('Título', { exact: true }).fill('Luz da equipe');
  await dialog.getByRole('button', { name: 'Pesquisar cifra e letra', exact: true }).click();
  await dialog.getByRole('button', { name: `Ver prévia de ${SOURCE.title}`, exact: true }).click();
  await expect(dialog.getByRole('alert')).toContainText('1.1.2');
  expect(await page.evaluate(() => sessionStorage.getItem('fixture-bridge-requests'))).toBeNull();
});

for (const returnMode of ['library-reload', 'detail-bfcache', 'detail-reload']) test(`Voltar ${returnMode} mantém o editor e mostra o erro sem perder o rascunho`, async ({ page }) => {
  const restored = returnMode === 'detail-bfcache';
  const detail = returnMode !== 'library-reload';
  await bridge(page, { interrupted: true, restored, returnToDetail: detail });
  const mock = await setupMockMinistry(page);
  await mock.login();
  const destination = detail ? `/musicas/${mock.data.songs[0].id}` : '/musicas';
  await page.goto(destination);
  await page.getByRole('button', { name: detail ? 'Editar música' : 'Nova música', exact: true }).click();
  let dialog = page.getByRole('dialog');
  await dialog.getByLabel('Título', { exact: true }).fill('Rascunho após voltar');
  await dialog.getByRole('textbox', { name: /^Letra e cifra/ }).fill(ORIGINAL);
  await dialog.getByRole('button', { name: 'Pesquisar cifra e letra', exact: true }).click();
  await dialog.getByRole('button', { name: `Ver prévia de ${SOURCE.title}`, exact: true }).click();
  dialog = page.getByRole('dialog');
  await expect(dialog.getByRole('alert')).toContainText('interrompida', { timeout: 20_000 });
  await expect(dialog.getByLabel('Título', { exact: true })).toHaveValue('Rascunho após voltar');
  await expect(dialog.getByRole('textbox', { name: /^Letra e cifra/ })).toHaveValue(ORIGINAL);
  await expect(page).toHaveURL(returnMode === 'detail-reload' ? '/musicas' : destination);
  if (detail) await expect(dialog.getByRole('heading', { name: 'Editar música', exact: true })).toBeVisible();
  expect(await page.evaluate(() => JSON.parse(sessionStorage.getItem('fixture-bridge-requests') || '[]').map((item: { type: string }) => item.type))).toEqual(['read', 'resume']);
  expect(mock.calls.filter(call => call.path === '/rest/v1/rpc/save_song')).toHaveLength(0);
});

test('Firefox Android em aba normal conserva leitura sem navegar a janela', async ({ page }) => {
  await bridge(page, { installed: false });
  const mock = await setupMockMinistry(page);
  await mock.login();
  await page.goto('/musicas');
  await page.getByRole('button', { name: 'Nova música', exact: true }).click();
  const dialog = page.getByRole('dialog');
  await dialog.getByLabel('Título', { exact: true }).fill('Luz da equipe');
  await dialog.getByRole('button', { name: 'Pesquisar cifra e letra', exact: true }).click();
  await dialog.getByRole('button', { name: `Ver prévia de ${SOURCE.title}`, exact: true }).click();
  await expect(dialog.getByLabel('Prévia do conteúdo para importar', { exact: true })).toHaveText(PREVIEW);
  const requests = await page.evaluate(() => JSON.parse(sessionStorage.getItem('fixture-bridge-requests') || '[]'));
  expect(requests).toHaveLength(1);
  expect(requests[0].type).toBe('read');
  expect(requests[0]).not.toHaveProperty('mode');
  expect(requests[0]).not.toHaveProperty('returnUrl');
});

test('quota de rascunho com valores antigos bloqueia navegação e conserva os campos atuais', async ({ page }) => {
  await bridge(page);
  const mock = await setupMockMinistry(page);
  await mock.login();
  await page.goto('/musicas');
  await page.getByRole('button', { name: 'Nova música', exact: true }).click();
  const dialog = page.getByRole('dialog');
  await dialog.getByLabel('Título', { exact: true }).fill('Título antes da quota');
  await dialog.getByRole('combobox', { name: 'Tom na igreja', exact: true }).selectOption('D');
  await dialog.getByRole('textbox', { name: /^Letra e cifra/ }).fill(ORIGINAL);
  await dialog.getByLabel('Artista / compositor', { exact: true }).fill('Autor mantido');
  const draftKey = `candeia.draft.v1:supabase:${ACCOUNT}:song:new`;
  const before = await page.evaluate(key => {
    const prefix = key.slice(0, key.indexOf('song:new'));
    const keys = ['song:new', 'song-key-preference:new', 'song-pasted-source:new'].map(suffix => `${prefix}${suffix}`);
    const saved = keys.map(name => sessionStorage.getItem(name));
    const original = Storage.prototype.setItem;
    Storage.prototype.setItem = function (name, value) {
      if (this === sessionStorage && name.startsWith('candeia.draft.v1:')) throw new DOMException('Fixture quota exceeded', 'QuotaExceededError');
      original.call(this, name, value);
    };
    return saved;
  }, draftKey);
  expect(before.every(value => value !== null)).toBe(true);
  await dialog.getByLabel('Título', { exact: true }).fill('Título novo somente na memória');
  await dialog.getByRole('textbox', { name: /^Letra e cifra/ }).fill('[D]Texto atual preservado após quota.');
  await dialog.getByRole('button', { name: 'Pesquisar cifra e letra', exact: true }).click();
  await dialog.getByRole('button', { name: `Ver prévia de ${SOURCE.title}`, exact: true }).click();
  await expect(dialog.getByRole('alert')).toContainText('armazenamento');
  await expect(dialog.getByLabel('Título', { exact: true })).toHaveValue('Título novo somente na memória');
  await expect(dialog.getByRole('textbox', { name: /^Letra e cifra/ })).toHaveValue('[D]Texto atual preservado após quota.');
  await expect(page).toHaveURL('/musicas');
  expect(await page.evaluate(key => sessionStorage.getItem(key), draftKey)).toBe(before[0]);
  expect(await page.evaluate(() => sessionStorage.getItem('candeia.cifra-current-tab.v1'))).toBeNull();
  expect(await page.evaluate(() => sessionStorage.getItem('fixture-bridge-requests'))).toBeNull();
  expect(mock.calls.filter(call => call.path === '/rest/v1/rpc/save_song')).toHaveLength(0);
});
