import { expect, test } from '@playwright/test';
import { setupMockMinistry } from './fixtures';

test.use({ trace: 'off', screenshot: 'off' });

test('partes da música aparecem como títulos, também no modo só letra', async ({ page }) => {
  const mock = await setupMockMinistry(page, 'musician');
  const song = mock.data.songs[0];
  song.content = '[Primeira Parte]\n[G]Tua luz nos [D]guia\n\nRefrão:\n[Em]Santo, [C]santo';
  await mock.login();
  await page.goto(`/musicas/${song.id}`);
  await expect(page.locator('.song-section-label')).toHaveText(['Primeira Parte', 'Refrão']);
  await page.getByRole('button', { name: 'Somente letra' }).click();
  await expect(page.locator('.song-lyrics-only .song-section-label')).toHaveText(['Primeira Parte', 'Refrão']);
  await expect(page.locator('.song-lyrics-only')).toContainText('Tua luz nos guia');
});

test('início mostra minhas próximas escalas e o tema escuro fica salvo no aparelho', async ({ page }) => {
  const mock = await setupMockMinistry(page, 'musician');
  const me = mock.data.people[0];
  const service = mock.data.services[0];
  if (!service.assignments.some(item => item.personId === me.id)) service.assignments.push({ id: crypto.randomUUID(), personId: me.id, function: me.functions[0] });
  await mock.login();
  const mine = page.getByRole('region', { name: 'Minhas próximas escalas' });
  await expect(mine.getByRole('link').first()).toContainText(service.type);
  await expect(mine.getByRole('link').first()).toContainText(service.assignments.find(item => item.personId === me.id)!.function);
  await expect(page.locator('.dashboard-stats')).toHaveCount(0);
  await page.goto('/perfil');
  await page.getByRole('radio', { name: 'Escuro' }).click();
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
  const background = await page.evaluate(() => getComputedStyle(document.documentElement).backgroundColor);
  await page.reload();
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
  await expect(page.getByRole('radio', { name: 'Escuro' })).toHaveAttribute('aria-checked', 'true');
  await page.getByRole('radio', { name: 'Claro' }).click();
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'light');
  expect(await page.evaluate(() => getComputedStyle(document.documentElement).backgroundColor)).not.toBe(background);
});

test('editor de música em três passos com a ajuda escondida num ícone', async ({ page }) => {
  await page.setViewportSize({ width: 1200, height: 900 });
  const mock = await setupMockMinistry(page, 'admin');
  await mock.login();
  await page.goto('/musicas');
  await page.getByRole('button', { name: /Nova música/ }).first().click();
  const dialog = page.getByRole('dialog');
  await expect(dialog.locator('.songs-step')).toHaveText(['1Música', '2Letra e cifra', '3Vídeo, observações e etiquetas']);
  await expect(dialog.getByText(/Para escrever à mão, use colchetes/)).toHaveCount(0);
  await dialog.getByRole('button', { name: 'Ajuda: letra e cifra' }).click();
  await expect(dialog.getByText(/Para escrever à mão, use colchetes/)).toBeVisible();
  await expect(dialog.getByRole('textbox', { name: 'Letra e cifra', exact: true })).toBeVisible();
});
