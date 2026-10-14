import { expect, test } from '@playwright/test';
import { loginAs } from './fixtures';

const VIDEO_ID = 'AbCdEfG_123';
const OTHER_ID = 'BcDeFgH_456';
const source = { id: 'fixture-song', title: 'Canção da fonte', artist: 'Equipe da fonte', source: 'LRCLIB', sourceUrl: 'https://lrclib.net/api/get/123', kind: 'lyrics', content: 'A luz nos guia\nSeguimos em paz' };
const suggestion = { id: VIDEO_ID, title: 'Canção da fonte — versão ao vivo', channel: 'Equipe da fonte', url: `https://www.youtube.com/watch?v=${VIDEO_ID}`, thumbnailUrl: `https://i.ytimg.com/vi/${VIDEO_ID}/hqdefault.jpg` };

for (const width of [1200, 320]) test(`importação fecha prévias e sugere vídeo escolhível, sem escrita prévia (${width}px)`, async ({ page }) => {
  await page.setViewportSize({ width, height: 850 });
  const mock = await loginAs(page);
  let searches = 0;
  await page.route('https://lrclib.net/**', route => route.fulfill({ contentType: 'application/json', body: JSON.stringify([{ id: 123, trackName: source.title, artistName: source.artist, plainLyrics: source.content }]) }));
  await page.route('**/.netlify/functions/song-search?**', route => route.fulfill({ contentType: 'application/json', body: JSON.stringify({ results: [] }) }));
  await page.route('**/.netlify/functions/youtube-search?**', async route => {
    searches++;
    const url = new URL(route.request().url());
    expect(url.searchParams.get('title')).toBe(source.title); expect(url.searchParams.get('artist')).toBe(source.artist);
    expect(route.request().headers().authorization).toMatch(/^Bearer /); expect(url.searchParams.has('token')).toBe(false);
    await route.fulfill({ contentType: 'application/json', body: JSON.stringify({ results: [suggestion] }) });
  });
  await page.route('https://i.ytimg.com/**', route => route.fulfill({ contentType: 'image/png', body: Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/GXkAAAAASUVORK5CYII=', 'base64') }));
  await page.goto('/musicas'); await page.getByRole('button', { name: 'Nova música', exact: true }).click();
  const dialog = page.getByRole('dialog');
  await dialog.getByLabel('Título', { exact: true }).fill(source.title); await dialog.getByLabel('Artista / compositor', { exact: true }).fill(source.artist);
  expect(searches).toBe(0);
  await dialog.getByRole('button', { name: 'Pesquisar cifra e letra', exact: true }).click();
  await dialog.getByRole('button', { name: `Ver prévia de ${source.title}`, exact: true }).click();
  await expect(dialog.getByLabel('Prévia do conteúdo para importar', { exact: true })).toHaveText(source.content);
  await dialog.getByRole('button', { name: 'Importar letra sem acordes', exact: true }).click();
  await expect(dialog.getByLabel('Prévia do conteúdo para importar', { exact: true })).toHaveCount(0);
  await expect(dialog.locator('.songs-source-results')).toHaveCount(0); await expect(dialog.getByRole('button', { name: 'Fechar busca', exact: true })).toHaveCount(0);
  await expect(dialog.getByRole('textbox', { name: /^Letra e cifra/ })).toHaveValue(source.content);
  await expect(dialog.getByRole('list', { name: 'Sugestões de vídeos' })).toBeVisible(); expect(searches).toBe(1);
  expect(mock.calls.filter(call => call.path === '/rest/v1/rpc/save_song')).toHaveLength(0);
  await dialog.getByRole('button', { name: `Selecionar vídeo ${suggestion.title}`, exact: true }).click();
  await expect(dialog.getByLabel(/^Vídeo no YouTube/)).toHaveValue(suggestion.url); await expect(dialog.getByRole('list', { name: 'Sugestões de vídeos' })).toHaveCount(0);
  await dialog.getByRole('textbox', { name: /^Letra e cifra/ }).fill(`${source.content}\nTexto revisado`);
  await expect(dialog.getByRole('link', { name: 'Vídeo selecionado Assistir à versão no YouTube', exact: true })).toHaveAttribute('href', suggestion.url);
  expect(await dialog.evaluate(element => element.scrollWidth <= element.clientWidth)).toBe(true);
  await dialog.getByRole('button', { name: 'Salvar música', exact: true }).click(); await expect(dialog).toBeHidden();
  expect(mock.data.songs.find(song => song.title === source.title)).toMatchObject({ youtubeUrl: suggestion.url, content: `${source.content}\nTexto revisado` });
});

test('buscar e cancelar vídeos mantém link manual, descarta resposta antiga e oferece fallback', async ({ page }) => {
  const mock = await loginAs(page);
  let searches = 0; let release!: () => void;
  const gate = new Promise<void>(resolve => { release = resolve; });
  await page.route('**/.netlify/functions/youtube-search?**', async route => {
    searches++;
    if (searches === 1) { await gate; await route.fulfill({ contentType: 'application/json', body: JSON.stringify({ results: [suggestion] }) }).catch(() => {}); }
    else await route.fulfill({ status: 502, contentType: 'application/json', body: JSON.stringify({ error: 'O YouTube não liberou as sugestões neste momento. Abra a busca no YouTube e cole o link da versão escolhida.' }) });
  });
  await page.goto('/musicas'); await page.getByRole('button', { name: 'Nova música', exact: true }).click();
  const dialog = page.getByRole('dialog');
  await dialog.getByLabel('Título', { exact: true }).fill('Versão original'); await dialog.getByLabel('Artista / compositor', { exact: true }).fill('Artista local');
  const manual = `https://youtu.be/${OTHER_ID}`;
  await dialog.getByLabel(/^Vídeo no YouTube/).fill(manual);
  await dialog.getByRole('button', { name: 'Sugerir vídeos', exact: true }).click(); await expect(dialog.getByRole('button', { name: 'Cancelar busca de vídeos', exact: true })).toBeVisible();
  await expect.poll(() => searches).toBe(1);
  await dialog.getByRole('button', { name: 'Cancelar busca de vídeos', exact: true }).click(); release();
  await dialog.getByLabel('Título', { exact: true }).fill('Novo título');
  await expect(dialog.getByRole('list', { name: 'Sugestões de vídeos' })).toHaveCount(0); await expect(dialog.getByLabel(/^Vídeo no YouTube/)).toHaveValue(manual); expect(searches).toBe(1);
  await dialog.getByRole('button', { name: 'Sugerir vídeos', exact: true }).click();
  await expect(dialog.getByRole('alert')).toContainText('O YouTube não liberou');
  const external = dialog.getByRole('link', { name: 'Abrir busca no YouTube', exact: true });
  const url = new URL((await external.getAttribute('href'))!); expect(url.searchParams.get('search_query')).toBe('Novo título Artista local');
  await expect(dialog.getByLabel(/^Vídeo no YouTube/)).toHaveValue(manual);
  await dialog.getByRole('button', { name: 'Fechar', exact: true }).click(); await page.getByRole('button', { name: 'Nova música', exact: true }).click();
  await expect(dialog.getByLabel(/^Vídeo no YouTube/)).toHaveValue(manual); expect(searches).toBe(2); expect(mock.calls.filter(call => call.path === '/rest/v1/rpc/save_song')).toHaveLength(0);
});
