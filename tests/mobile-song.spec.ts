import { expect, test, type Page } from '@playwright/test';
import { loginAs, setupMockMinistry } from './fixtures';

const longVerse = 'Uma frase comprida para acompanhar a música no celular e manter cada acorde junto da sua letra. ';

async function openPublicSong(page: Page) {
  const mock = await setupMockMinistry(page);
  const song = mock.data.songs[0];
  song.originalKey = 'G';
  song.churchKey = 'Bb';
  song.content = `[G]${longVerse.repeat(3)}[D/F#]Seguimos em paz\n[C]${'Esperança'.repeat(35)}\n\ne|--0--2--3--|\nB|--1--3--0--|\nG|--0--2--0--|\nD|--2--0--0--|\nA|--3--0--2--|\nE|--0--0--3--|\n\n[G]Uma nova canção`;
  const storedContent = song.content;
  await page.goto('/consulta');
  await expect(page.getByRole('heading', { name: 'Cultos', exact: true })).toBeVisible();
  await page.goto(`/musicas/${song.id}`);
  await expect(page.getByRole('heading', { name: song.title, exact: true })).toBeVisible();
  return { mock, song, storedContent };
}

async function expectNoHorizontalOverflow(page: Page) {
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  expect(await page.locator('.song-sheet').evaluate(element => element.scrollWidth <= element.clientWidth)).toBe(true);
}

for (const width of [320, 350, 390]) {
  test(`leitor público em ${width}px mantém acordes corretos e versos dentro da tela`, async ({ page }) => {
    await page.setViewportSize({ width, height: 740 });
    const { mock, song, storedContent } = await openPublicSong(page);
    await expect(page.getByLabel('Tom da visualização')).toHaveValue('Bb');
    await expect(page.locator('.song-chord').filter({ hasText: /^Bb$/ })).toHaveCount(2);
    await expect(page.locator('.song-chord').filter({ hasText: /^F\/A$/ })).toHaveCount(1);
    await expect(page.locator('.song-sheet')).not.toContainText('e|--');
    await expect(page.locator('.song-meta')).not.toContainText('Tom original');
    await expectNoHorizontalOverflow(page);

    // The select and semitone steps must use the real base of a legacy chart.
    await page.getByLabel('Tom da visualização').selectOption('C');
    await expect(page.locator('.song-chord').filter({ hasText: /^C$/ })).toHaveCount(2);
    await expect(page.locator('.song-chord').filter({ hasText: /^G\/B$/ })).toHaveCount(1);
    await page.getByRole('button', { name: 'Aumentar um semitom', exact: true }).click();
    await expect(page.getByLabel('Tom da visualização')).toHaveValue('Db');
    await expect(page.locator('.song-chord').filter({ hasText: /^Db$/ })).toHaveCount(2);
    await page.getByRole('button', { name: 'Restaurar tom Bb', exact: true }).click();
    await expect(page.getByLabel('Tom da visualização')).toHaveValue('Bb');

    await page.getByRole('button', { name: 'Somente letra', exact: true }).click();
    await expect(page.locator('.song-lyrics-only')).not.toContainText('e|--');
    await expect(page.locator('.song-lyrics-only')).not.toContainText('[G]');
    await expect(page.locator('.song-lyrics-only')).toContainText(longVerse.trim());
    await expectNoHorizontalOverflow(page);
    expect(mock.data.songs.find(item => item.id === song.id)?.content).toBe(storedContent);
    expect(mock.calls.some(call => /rpc\/save_(song|service)$/.test(call.path))).toBe(false);
  });
}

test('modo leitura no celular ocupa a tela e preserva tom e fonte ao sair', async ({ page }) => {
  await page.setViewportSize({ width: 350, height: 740 });
  await openPublicSong(page);
  for (const control of await page.locator('.song-reader-toolbar button, .song-reader-toolbar select').all()) {
    const box = await control.boundingBox();
    expect(box?.width).toBeGreaterThanOrEqual(44);
    expect(box?.height).toBeGreaterThanOrEqual(44);
  }
  await page.getByLabel('Tom da visualização').selectOption('C');
  await page.getByRole('button', { name: 'Aumentar tamanho da letra', exact: true }).click();
  await expect(page.locator('.song-sheet')).toHaveCSS('font-size', '20px');
  await page.getByRole('button', { name: 'Entrar no modo leitura', exact: true }).click();
  const reader = page.locator('.song-reading');
  await expect(page.getByRole('dialog', { name: 'Leitura de Casa de paz', exact: true })).toBeVisible();
  await expect(reader).toHaveCSS('position', 'fixed');
  expect(await page.evaluate(() => document.body.style.overflow)).toBe('hidden');
  expect(await reader.evaluate(element => element.scrollWidth <= element.clientWidth)).toBe(true);
  await page.keyboard.press('Tab');
  expect(await page.evaluate(() => Boolean(document.activeElement?.closest('.song-reading')))).toBe(true);
  await expect(reader.getByRole('button', { name: 'Letra e cifra', exact: true })).toBeFocused();
  await page.keyboard.press('Shift+Tab');
  await expect(reader.getByRole('button', { name: 'Sair do modo leitura', exact: true })).toBeFocused();
  expect(await page.locator('.topbar').evaluate(element => (element as HTMLElement).inert)).toBe(true);
  await reader.evaluate(element => { element.scrollTop = 300; });
  const toolbar = await page.locator('.song-reader-toolbar').boundingBox();
  expect(toolbar?.y).toBeGreaterThanOrEqual(0);
  expect(toolbar?.y).toBeLessThanOrEqual(1);
  await page.getByRole('button', { name: 'Sair do modo leitura', exact: true }).click();
  await expect(reader).toHaveCount(0);
  await expect(page.getByLabel('Tom da visualização')).toHaveValue('C');
  await expect(page.locator('.song-sheet')).toHaveCSS('font-size', '20px');
  expect(await page.evaluate(() => document.body.style.overflow)).toBe('');
  expect(await page.locator('.topbar').evaluate(element => (element as HTMLElement).inert)).toBe(false);
  await expect(page.getByRole('button', { name: 'Entrar no modo leitura', exact: true })).toBeFocused();
  await page.getByRole('button', { name: 'Entrar no modo leitura', exact: true }).click();
  await page.keyboard.press('Escape');
  await expect(reader).toHaveCount(0);
  await expectNoHorizontalOverflow(page);
});

test('editor móvel usa um campo de cifra e salva os metadados da busca com artista vazio', async ({ page }) => {
  await page.setViewportSize({ width: 350, height: 740 });
  const fixture = await loginAs(page);
  const source = {
    id: 'https://www.cifraclub.com.br/equipe/cancao-mobile/',
    title: 'Canção no celular', artist: 'Equipe de teste', source: 'Cifra Club', kind: 'chords',
    sourceUrl: 'https://www.cifraclub.com.br/equipe/cancao-mobile/', originalKey: 'G',
    content: '[G]Uma [D/F#]voz nos guia\n[Em7]Seguimos em [C]paz\ne|--0--2--3--|',
  };
  await page.route('https://lrclib.net/api/search**', route => route.fulfill({ contentType: 'application/json', body: '[]' }));
  await page.route('**/.netlify/functions/song-search**', route => {
    const preview = new URL(route.request().url()).searchParams.has('url');
    return route.fulfill({ contentType: 'application/json', body: JSON.stringify(preview ? { song: source } : { results: [source] }) });
  });
  await page.goto('/musicas');
  await page.getByRole('button', { name: 'Nova música', exact: true }).click();
  const dialog = page.getByRole('dialog');
  await dialog.getByLabel('Título', { exact: true }).fill('Canção');
  await dialog.getByLabel('Tom na igreja', { exact: true }).selectOption('Bb');
  await expect(dialog.getByLabel('Artista / compositor', { exact: true })).toHaveValue('');
  await expect(dialog.getByRole('textbox', { name: /^Letra e cifra/ })).toHaveCount(1);
  await expect(dialog.getByRole('textbox', { name: /^Texto copiado do Cifra Club/ })).toHaveCount(0);
  await expect(dialog.getByLabel('Tom original', { exact: true })).toHaveCount(0);
  for (const field of await dialog.locator('.field input, .field select, .field textarea').all()) {
    await expect(field).toHaveCSS('font-size', '16px');
  }
  await dialog.getByRole('button', { name: 'Pesquisar cifra e letra', exact: true }).click();
  await dialog.getByRole('button', { name: 'Ver prévia de Canção no celular', exact: true }).click();
  const preview = dialog.locator('.songs-source-preview');
  await expect(preview).toBeVisible();
  await preview.getByRole('checkbox', { name: 'Atualizar título e artista com os dados da fonte', exact: true }).check();
  await expect(dialog.getByLabel('Título', { exact: true })).toHaveValue(source.title);
  await expect(dialog.getByLabel('Artista / compositor', { exact: true })).toHaveValue(source.artist);
  await expect(dialog.getByLabel('Tom na igreja', { exact: true })).toHaveValue('Bb');
  expect(await dialog.evaluate(element => element.scrollWidth <= element.clientWidth)).toBe(true);
  await dialog.getByRole('button', { name: 'Salvar música', exact: true }).click();
  await expect(dialog).toBeHidden();
  expect(fixture.data.songs.find(song => song.title === source.title)).toMatchObject({
    artist: source.artist, originalKey: 'Bb', churchKey: 'Bb',
    content: '[Bb]Uma [F/A]voz nos guia\n[Gm7]Seguimos em [Eb]paz',
  });
  expect(fixture.calls.filter(call => call.path === '/rest/v1/rpc/save_song')).toHaveLength(1);
});
