import { expect, test, type Page } from '@playwright/test';
import { setupMockMinistry } from './fixtures';

async function swipe(page: Page, selector: string, dx: number) {
  await page.locator(selector).evaluate((element, distance) => {
    const box = element.getBoundingClientRect();
    const x = box.left + box.width / 2;
    const y = box.top + Math.min(box.height / 2, 120);
    const touch = (clientX: number) => new Touch({ identifier: 1, target: element, clientX, clientY: y });
    element.dispatchEvent(new TouchEvent('touchstart', { bubbles: true, touches: [touch(x)], changedTouches: [touch(x)] }));
    element.dispatchEvent(new TouchEvent('touchend', { bubbles: true, touches: [], changedTouches: [touch(x + distance)] }));
  }, dx);
}

test.describe('trocar de música no repertório do culto', () => {
  test.use({ hasTouch: true });

  test('botões no topo, deslizar no celular e setas no computador', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 800 });
    const mock = await setupMockMinistry(page, 'musician');
    const service = mock.data.services[0];
    const songs = service.repertoire.map(item => mock.data.songs.find(song => song.id === item.songId)!);
    await mock.login();
    await page.goto(`/cultos/${service.id}`);
    await page.locator('.service-setlist-item').first().getByRole('link', { name: songs[0].title, exact: true }).click();

    const nav = page.getByRole('navigation', { name: 'Músicas deste culto' });
    await expect(nav).toBeVisible();
    await expect(nav).toBeInViewport();
    await expect(nav).toContainText('Primeira música');
    await expect(nav).toContainText(`1 de ${songs.length}`);
    await nav.getByRole('link', { name: `Próxima: ${songs[1].title}`, exact: true }).click();
    await expect(page.getByRole('heading', { name: songs[1].title, exact: true })).toBeVisible();
    await expect(page).toHaveURL(new RegExp(`item=${service.repertoire[1].id}`));
    await expect(nav.getByRole('link', { name: `Anterior: ${songs[0].title}`, exact: true })).toBeVisible();

    // Slide the song to the left: next song. To the right: back.
    await swipe(page, '.song-sheet', -160);
    await expect(page.getByRole('heading', { name: songs[2].title, exact: true })).toBeVisible();
    await swipe(page, '.song-sheet', 160);
    await expect(page.getByRole('heading', { name: songs[1].title, exact: true })).toBeVisible();
    // A short or mostly vertical touch does nothing.
    await swipe(page, '.song-sheet', -30);
    await expect(page.getByRole('heading', { name: songs[1].title, exact: true })).toBeVisible();

    // Arrow keys on a computer, but never while choosing a key in the select.
    await page.setViewportSize({ width: 1280, height: 900 });
    await page.locator('body').press('ArrowRight');
    await expect(page.getByRole('heading', { name: songs[2].title, exact: true })).toBeVisible();
    await page.getByLabel('Tom da visualização').focus();
    await page.keyboard.press('ArrowLeft');
    await expect(page.getByRole('heading', { name: songs[2].title, exact: true })).toBeVisible();
    await expect(page.getByRole('navigation', { name: 'Músicas deste culto' })).toBeInViewport();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1)).toBe(true);
  });

  test('a música aberta pela biblioteca não mostra a navegação do culto', async ({ page }) => {
    const mock = await setupMockMinistry(page, 'musician');
    await mock.login();
    await page.goto(`/musicas/${mock.data.songs[0].id}`);
    await expect(page.getByRole('heading', { name: mock.data.songs[0].title, exact: true })).toBeVisible();
    await expect(page.getByRole('navigation', { name: 'Músicas deste culto' })).toHaveCount(0);
  });
});
