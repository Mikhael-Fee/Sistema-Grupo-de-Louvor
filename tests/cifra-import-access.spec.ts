import { expect, test } from '@playwright/test';
import { setupMockMinistry } from './fixtures';

test('Firefox sem extensão não é tratado como conectado e mantém as alternativas', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.addInitScript(() => Object.defineProperty(navigator, 'userAgent', {
    value: 'Mozilla/5.0 (Android 15; Mobile; rv:145.0) Gecko/145.0 Firefox/145.0',
  }));
  const mock = await setupMockMinistry(page);
  let cifraSearches = 0;
  await page.route('**/.netlify/functions/song-search?**', route => { cifraSearches++; return route.abort(); });
  await page.route('https://lrclib.net/**', route => route.fulfill({ contentType: 'application/json', headers: { 'access-control-allow-origin': '*' }, body: JSON.stringify([
    { id: 1, trackName: 'Letra fictícia', artistName: 'Equipe fictícia', plainLyrics: 'Voz em luz aqui', instrumental: false },
  ]) }));
  await mock.login();
  await page.goto('/musicas');
  await page.getByRole('button', { name: 'Nova música', exact: true }).click();
  const dialog = page.getByRole('dialog');
  await expect(dialog).toContainText('Para importar cifras do Cifra Club, conecte o importador.');
  await expect(dialog).not.toContainText('Importador conectado');
  await expect(dialog.getByRole('button', { name: 'Buscar cifra no Cifra Club', exact: true })).toHaveClass(/button-secondary/);
  await expect(dialog.getByRole('link', { name: 'Guia do Firefox e do computador', exact: true })).toHaveAttribute('href', '/conectar-cifra-club');
  await expect(dialog.getByRole('button', { name: 'Escolher PDF da cifra', exact: true })).toBeVisible();
  await dialog.getByRole('button', { name: 'Colar cifra', exact: true }).click();
  await expect(dialog.getByRole('textbox', { name: /^Letra e cifra/ })).toBeFocused();
  await dialog.getByLabel('Título', { exact: true }).fill('Letra fictícia');
  await dialog.getByRole('button', { name: 'Buscar somente letra', exact: true }).click();
  await dialog.getByRole('button', { name: 'Ver prévia de Letra fictícia', exact: true }).click();
  await expect(dialog.getByLabel('Prévia do conteúdo para importar', { exact: true })).toHaveText('Voz em luz aqui');
  expect(cifraSearches).toBe(0);
  expect(mock.calls.filter(call => call.path === '/rest/v1/rpc/save_song')).toHaveLength(0);
});

test('administrador não aprovado não abre guia nem importação por URL direta', async ({ page }) => {
  const mock = await setupMockMinistry(page);
  await mock.login();
  mock.profiles[0].approved = false;
  for (const path of ['/conectar-cifra-club', '/importar-cifra']) {
    await page.goto(path);
    await expect(page.getByRole('heading', { name: 'Seu cadastro está em análise', exact: true })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Verificar conexão', exact: true })).toHaveCount(0);
    await expect(page.getByRole('button', { name: 'Salvar música', exact: true })).toHaveCount(0);
    await expect(page.getByRole('link', { name: /Baixar extensão|Ver guia/i })).toHaveCount(0);
  }
  expect(mock.calls.filter(call => call.path === '/rest/v1/rpc/save_song')).toHaveLength(0);
});
