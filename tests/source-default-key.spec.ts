import { expect, test, type Page } from '@playwright/test';
import { loginAs } from './fixtures';
import type { SongSearchResult } from '../src/lib/song-search';

test.use({ trace: 'off', screenshot: 'off' });
const makeSource = (value: Partial<SongSearchResult>): SongSearchResult => ({ id: 'source', title: 'Canção da fonte', artist: 'Equipe da fonte',
  source: 'Cifra Club', sourceUrl: 'https://www.cifraclub.com.br/equipe/cancao/', kind: 'chords', ...value });

async function mockSource(page: Page, source: SongSearchResult, previewGate?: Promise<void>, onPreview?: () => void) {
  await page.route('https://lrclib.net/**', route => route.fulfill({ contentType: 'application/json', body: '[]' }));
  await page.route('**/.netlify/functions/song-search?**', async route => {
    if (new URL(route.request().url()).searchParams.has('url')) {
      onPreview?.();
      if (previewGate) await previewGate;
      await route.fulfill({ contentType: 'application/json', body: JSON.stringify({ song: source }) });
    } else await route.fulfill({ contentType: 'application/json', body: JSON.stringify({ results: [source] }) });
  });
}

async function openEditor(page: Page, source: SongSearchResult) {
  await page.goto('/musicas');
  await page.getByRole('button', { name: 'Nova música', exact: true }).click();
  const dialog = page.getByRole('dialog');
  await dialog.getByLabel('Título', { exact: true }).fill(source.title);
  await dialog.getByLabel('Artista / compositor', { exact: true }).fill(source.artist);
  await dialog.getByRole('button', { name: 'Pesquisar cifra e letra', exact: true }).click();
  await dialog.getByRole('button', { name: `Ver prévia de ${source.title}`, exact: true }).click();
  return dialog;
}

test('Cifra Club preenche tom escrito G a partir de Bb/capo3 e limpa tabs de intro e solo', async ({ page }) => {
  const mock = await loginAs(page);
  const source = makeSource({ soundingKey: 'Bb', capo: 3,
    content: '[Tab Intro]\ne│––0––2––3––│\nB│––1––3––0––│\n[Intro][G][C][D]\n[Tab Solo]\ne|--0h2--3p2--|\n[G]Uma voz nos [D]guia',
    keyUnknownReason: 'A fonte informa capotraste, mas não o tom das posições.' });
  await mockSource(page, source);
  const dialog = await openEditor(page, source);
  await expect(dialog.getByLabel('Prévia do conteúdo para importar', { exact: true })).toBeVisible();
  await expect(dialog.getByLabel('Tom na igreja', { exact: true })).toHaveValue('G');
  await expect(dialog.getByLabel('Tom dos acordes recebidos', { exact: true })).toHaveCount(0);
  await expect(dialog).toContainText('Tom dos acordes sem capotraste: G');
  await dialog.getByRole('button', { name: 'Importar cifra e letra', exact: true }).click();
  const content = await dialog.getByRole('textbox', { name: /^Letra e cifra/ }).inputValue();
  expect(content).toContain('[Intro][G][C][D]');
  expect(content).not.toMatch(/Tab Intro|Tab Solo|0h2|│|e\|/);
  await dialog.getByRole('button', { name: 'Salvar música', exact: true }).click();
  await expect(dialog).toBeHidden();
  expect(mock.data.songs.find(song => song.title === source.title)).toMatchObject({ originalKey: 'G', churchKey: 'G', content });
});

test('sem tom na fonte sugere D para G A D Bm C e informa possível empréstimo de C', async ({ page }) => {
  const mock = await loginAs(page);
  const source = makeSource({ title: 'Canção com variação harmônica', content: '[Intro][G][A][D][Bm][C]\n[D]Verso original' });
  await mockSource(page, source);
  const dialog = await openEditor(page, source);
  await expect(dialog).toContainText('Tom provável: D');
  await expect(dialog).toContainText('Fora do campo harmônico sugerido: C');
  await expect(dialog.getByLabel('Tom na igreja', { exact: true })).toHaveValue('D');
  await expect(dialog.getByRole('button', { name: 'Importar cifra e letra', exact: true })).toBeEnabled();
  await dialog.getByRole('button', { name: 'Importar cifra e letra', exact: true }).click();
  await dialog.getByRole('button', { name: 'Salvar música', exact: true }).click();
  await expect(dialog).toBeHidden();
  expect(mock.data.songs.find(song => song.title === source.title)).toMatchObject({ originalKey: 'D', churchKey: 'D', content: source.content });
});

test('poucos acordes exigem confirmar o tom provável antes de importar', async ({ page }) => {
  const mock = await loginAs(page);
  const source = makeSource({ title: 'Canção com um acorde', content: '[G]Verso original' });
  await mockSource(page, source);
  const dialog = await openEditor(page, source);
  await expect(dialog).toContainText('Acordes insuficientes ou tonalidades próximas');
  const confirmation = dialog.getByLabel('Tom dos acordes recebidos', { exact: true });
  await expect(confirmation).toHaveValue('');
  const importButton = dialog.getByRole('button', { name: 'Importar cifra e letra', exact: true });
  await expect(importButton).toBeDisabled();
  expect(mock.calls.filter(call => call.path === '/rest/v1/rpc/save_song')).toHaveLength(0);
  await confirmation.selectOption('G');
  await expect(dialog.getByLabel('Tom na igreja', { exact: true })).toHaveValue('G');
  await expect(importButton).toBeEnabled();
  await importButton.click();
  await dialog.getByRole('button', { name: 'Salvar música', exact: true }).click();
  await expect(dialog).toBeHidden();
  expect(mock.data.songs.find(song => song.title === source.title)).toMatchObject({ originalKey: 'G', churchKey: 'G' });
});

test('escolher C durante uma consulta é preservado após resposta e reabertura do rascunho', async ({ page }) => {
  const mock = await loginAs(page);
  const source = makeSource({ originalKey: 'E', content: '[E]Verso da [B]fonte' });
  let release!: () => void; let entered!: () => void;
  const gate = new Promise<void>(resolve => { release = resolve; });
  const started = new Promise<void>(resolve => { entered = resolve; });
  await mockSource(page, source, gate, entered);
  const dialog = await openEditor(page, source);
  await started;
  await dialog.getByLabel('Tom na igreja', { exact: true }).selectOption('C');
  release();
  await expect(dialog.getByLabel('Prévia do conteúdo para importar', { exact: true })).toBeVisible();
  await expect(dialog.getByLabel('Tom na igreja', { exact: true })).toHaveValue('C');
  await dialog.getByRole('button', { name: 'Fechar', exact: true }).click();
  await page.getByRole('button', { name: 'Nova música', exact: true }).click();
  await expect(dialog.getByLabel('Tom na igreja', { exact: true })).toHaveValue('C');
  await dialog.getByRole('button', { name: 'Pesquisar cifra e letra', exact: true }).click();
  await dialog.getByRole('button', { name: `Ver prévia de ${source.title}`, exact: true }).click();
  await expect(dialog.getByLabel('Prévia do conteúdo para importar', { exact: true })).toBeVisible();
  await expect(dialog.getByLabel('Tom na igreja', { exact: true })).toHaveValue('C');
  await dialog.getByRole('button', { name: 'Importar cifra e letra', exact: true }).click();
  await expect(dialog.getByRole('textbox', { name: /^Letra e cifra/ })).toHaveValue('[C]Verso da [G]fonte');
  await dialog.getByRole('button', { name: 'Salvar música', exact: true }).click();
  await expect(dialog).toBeHidden();
  expect(mock.data.songs.find(song => song.title === source.title)).toMatchObject({ originalKey: 'C', churchKey: 'C' });
});
