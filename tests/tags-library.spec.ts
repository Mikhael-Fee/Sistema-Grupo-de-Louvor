import { expect, test } from '@playwright/test';
import { setupMockMinistry } from './fixtures';

for (const width of [1280, 320]) {
  test(`etiqueta abre suas músicas e permite limpar o filtro (${width}px)`, async ({ page }) => {
    await page.setViewportSize({ width, height: 900 });
    const mock = await setupMockMinistry(page, 'musician');
    const tag = mock.data.tags.find(item => item.name === 'Adoração')!;
    const expectedSongs = mock.data.songs.filter(song => song.tagIds.includes(tag.id));
    const emptyTag = { id: '30000000-0000-4000-8000-000000000001', name: 'Etiqueta sem músicas', color: '#628368' };
    mock.data.tags.push(emptyTag);
    await mock.login();
    await page.goto('/etiquetas');

    const tagLink = page.getByRole('link', { name: `Ver músicas com a etiqueta ${tag.name}`, exact: true });
    await expect(tagLink).toHaveAttribute('href', `/musicas?etiqueta=${tag.id}`);
    await expect(tagLink).toContainText(`${expectedSongs.length} músicas`);
    await expect(page.getByRole('button', { name: `Editar etiqueta ${tag.name}`, exact: true })).toHaveCount(0);
    await expect(page.getByRole('button', { name: `Excluir etiqueta ${tag.name}`, exact: true })).toHaveCount(0);
    if (width === 1280) {
      await tagLink.focus();
      await expect(tagLink).toBeFocused();
      await page.keyboard.press('Enter');
    } else await tagLink.click();

    await expect(page).toHaveURL(`/musicas?etiqueta=${tag.id}`);
    await expect(page.getByRole('button', { name: tag.name, exact: true })).toHaveAttribute('aria-pressed', 'true');
    await expect(page.locator('.songs-row')).toHaveCount(expectedSongs.length);
    for (const song of expectedSongs) await expect(page.locator('.songs-name strong').filter({ hasText: song.title })).toBeVisible();
    for (const song of mock.data.songs.filter(song => !song.tagIds.includes(tag.id))) {
      await expect(page.locator('.songs-name strong').filter({ hasText: song.title })).toHaveCount(0);
    }
    await page.reload();
    await expect(page.locator('.songs-row')).toHaveCount(expectedSongs.length);
    await expect(page.getByRole('button', { name: tag.name, exact: true })).toHaveAttribute('aria-pressed', 'true');
    await page.getByRole('button', { name: 'Limpar filtros', exact: true }).click();
    await expect(page.locator('.songs-row')).toHaveCount(mock.data.songs.length);
    await expect(page).toHaveURL('/musicas');

    await page.goto('/etiquetas');
    const emptyLink = page.getByRole('link', { name: `Ver músicas com a etiqueta ${emptyTag.name}`, exact: true });
    await expect(emptyLink).toContainText('0 músicas');
    await emptyLink.click();
    await expect(page).toHaveURL(`/musicas?etiqueta=${emptyTag.id}`);
    await expect(page.getByRole('heading', { name: 'Nenhuma música com esses filtros', exact: true })).toBeVisible();
    await expect(page.locator('.songs-row')).toHaveCount(0);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    expect(mock.calls.filter(call => !['GET', 'HEAD', 'OPTIONS'].includes(call.method) && call.path.startsWith('/rest/v1/'))).toHaveLength(0);
  });

  test(`editar e excluir etiqueta preserva músicas e não abre a biblioteca (${width}px)`, async ({ page }) => {
    await page.setViewportSize({ width, height: 900 });
    const mock = await setupMockMinistry(page);
    const tag = mock.data.tags.find(item => item.name === 'Adoração')!;
    const originalSongs = structuredClone(mock.data.songs);
    await mock.login();
    await page.goto('/etiquetas');

    await page.getByRole('button', { name: `Editar etiqueta ${tag.name}`, exact: true }).click();
    let dialog = page.getByRole('dialog');
    await expect(dialog.getByRole('heading', { name: 'Editar etiqueta', exact: true })).toBeVisible();
    await expect(page).toHaveURL('/etiquetas');
    await dialog.getByLabel('Nome', { exact: true }).fill('Adoração e oração');
    await dialog.getByRole('button', { name: 'Salvar etiqueta', exact: true }).click();
    await expect(dialog).toBeHidden();
    await expect(page).toHaveURL('/etiquetas');
    await expect(page.getByRole('link', { name: 'Ver músicas com a etiqueta Adoração e oração', exact: true })).toBeVisible();
    expect(mock.data.tags.find(item => item.id === tag.id)?.name).toBe('Adoração e oração');
    expect(mock.data.songs).toEqual(originalSongs);

    await page.getByRole('button', { name: 'Excluir etiqueta Adoração e oração', exact: true }).click();
    dialog = page.getByRole('dialog');
    await expect(dialog.getByRole('heading', { name: 'Excluir etiqueta', exact: true })).toBeVisible();
    await expect(page).toHaveURL('/etiquetas');
    await expect(dialog).toContainText('As músicas serão preservadas.');
    await dialog.getByRole('button', { name: 'Cancelar', exact: true }).click();
    await expect(dialog).toBeHidden();
    expect(mock.data.tags.some(item => item.id === tag.id)).toBe(true);
    await page.getByRole('button', { name: 'Excluir etiqueta Adoração e oração', exact: true }).click();
    await page.getByRole('dialog').getByRole('button', { name: 'Excluir etiqueta', exact: true }).click();
    await expect(page.getByRole('dialog')).toBeHidden();
    await expect(page).toHaveURL('/etiquetas');
    await expect(page.getByRole('link', { name: 'Ver músicas com a etiqueta Adoração e oração', exact: true })).toHaveCount(0);
    expect(mock.data.tags.some(item => item.id === tag.id)).toBe(false);
    expect(mock.data.songs).toEqual(originalSongs.map(song => ({ ...song, tagIds: song.tagIds.filter(id => id !== tag.id) })));
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    expect(mock.calls.filter(call => call.path === '/rest/v1/tags' && call.method === 'POST')).toHaveLength(1);
    expect(mock.calls.filter(call => call.path === '/rest/v1/tags' && call.method === 'DELETE')).toHaveLength(1);
  });
}
