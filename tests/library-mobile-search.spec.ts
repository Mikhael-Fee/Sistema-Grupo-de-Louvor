import { expect, test } from '@playwright/test';
import { loginAs } from './fixtures';

for (const width of [320, 390]) test(`biblioteca permite ler a busca e combinar filtros no celular (${width}px)`, async ({ page }, testInfo) => {
  await page.setViewportSize({ width, height: 850 });
  const mock = await loginAs(page);
  await page.goto('/musicas');
  const search = page.getByRole('searchbox', { name: 'Buscar por título ou artista', exact: true });
  const rows = page.locator('.songs-row');
  await expect(rows).toHaveCount(mock.data.songs.length);

  await search.pressSequentially('Casa de paz');
  await expect(search).toHaveValue('Casa de paz');
  await expect(rows).toHaveCount(1);
  await expect(rows.getByRole('link', { name: /^Casa de paz/ })).toBeVisible();
  await expect(search).toHaveCSS('font-size', '16px');
  const field = await search.evaluate(element => {
    const style = getComputedStyle(element);
    return {
      textWidth: element.clientWidth - parseFloat(style.paddingLeft) - parseFloat(style.paddingRight),
      color: style.color, background: style.backgroundColor,
      inViewport: element.getBoundingClientRect().right <= innerWidth,
    };
  });
  // Before this fix the input was 51px wide, leaving only 2px after padding.
  expect(field.textWidth).toBeGreaterThanOrEqual(180);
  expect(field.color).not.toBe(field.background);
  expect(field.inViewport).toBe(true);
  const layout = await rows.first().evaluate(element => {
    const rectangle = (selector: string) => {
      const box = element.querySelector(selector)!.getBoundingClientRect();
      return { left: box.left, top: box.top, right: box.right, bottom: box.bottom, width: box.width, height: box.height };
    };
    return {
      parts: ['.songs-name', '.songs-key', '.songs-row-tags', '.songs-row-actions'].map(rectangle),
      title: rectangle('.songs-name strong'),
      buttons: [...element.querySelectorAll('.songs-row-actions .icon-button')].map(button => {
        const box = button.getBoundingClientRect();
        return { width: box.width, height: box.height };
      }),
    };
  });
  expect(layout.title.width).toBeGreaterThanOrEqual(130);
  for (const [index, first] of layout.parts.entries()) for (const second of layout.parts.slice(index + 1)) {
    const overlapWidth = Math.max(0, Math.min(first.right, second.right) - Math.max(first.left, second.left));
    const overlapHeight = Math.max(0, Math.min(first.bottom, second.bottom) - Math.max(first.top, second.top));
    expect(overlapWidth * overlapHeight).toBe(0);
  }
  for (const button of layout.buttons) {
    expect(button.width).toBeGreaterThanOrEqual(44);
    expect(button.height).toBeGreaterThanOrEqual(44);
  }
  await testInfo.attach(`biblioteca-busca-${width}`, {
    body: await page.screenshot({ path: `/workspace/scratch/library-search-after-${width}.png`, fullPage: true }),
    contentType: 'image/png',
  });

  await search.fill('composicao');
  await expect(rows).toHaveCount(mock.data.songs.length);
  await page.getByRole('combobox', { name: 'Filtrar pelo tom na igreja', exact: true }).selectOption('G');
  await expect(rows).toHaveCount(2);
  const tags = page.getByRole('group', { name: 'Filtrar por etiquetas', exact: true });
  await tags.getByRole('button', { name: 'Comunhão', exact: true }).click();
  await expect(rows).toHaveCount(1);
  await expect(rows.getByRole('link', { name: /^Casa de paz/ })).toBeVisible();
  await page.getByRole('button', { name: 'Limpar filtros', exact: true }).click();
  await expect(search).toHaveValue('');
  await expect(rows).toHaveCount(mock.data.songs.length);
  await expect(tags.getByRole('button', { name: 'Comunhão', exact: true })).toHaveAttribute('aria-pressed', 'false');
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  expect(mock.calls.filter(call => call.path.startsWith('/rest/v1/') && call.method !== 'GET')).toHaveLength(0);
});
