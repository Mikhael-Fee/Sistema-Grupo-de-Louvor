import { expect, test, type Page } from '@playwright/test';
import { setupMockMinistry, type MockMinistry } from './fixtures';

test.use({ trace: 'off', screenshot: 'off' });
const SHOTS = process.env.SONG_HISTORY_SHOTS;

/** Eight past services and one upcoming, each with a few songs in different keys. */
function historyData(mock: MockMinistry) {
  const songs = mock.data.songs;
  const plan: [string, string, string, [number, string][]][] = [
    [
      '2026-08-02',
      '19:00',
      'Culto de Domingo',
      [
        [0, 'G'],
        [1, 'D'],
        [2, 'E'],
      ],
    ],
    [
      '2026-08-16',
      '19:00',
      'Culto de Domingo',
      [
        [0, 'A'],
        [3, 'D'],
        [4, 'C'],
      ],
    ],
    [
      '2026-08-30',
      '19:00',
      'Ceia',
      [
        [0, 'G'],
        [5, 'D'],
      ],
    ],
    [
      '2026-09-13',
      '19:00',
      'Culto de Domingo',
      [
        [1, 'D'],
        [2, 'E'],
        [0, ''],
      ],
    ],
    [
      '2026-09-24',
      '20:00',
      'Culto de Quinta',
      [
        [3, 'D'],
        [4, 'C'],
      ],
    ],
    [
      '2026-10-04',
      '19:00',
      'Culto de Domingo',
      [
        [0, 'G'],
        [5, 'Bb'],
      ],
    ],
    [
      '2026-10-18',
      '19:00',
      'Jovens',
      [
        [2, 'E'],
        [1, 'G'],
      ],
    ],
    [
      '2026-11-01',
      '19:00',
      'Culto de Domingo',
      [
        [0, 'A'],
        [3, 'D'],
        [4, 'F'],
      ],
    ],
    [
      '2026-11-29',
      '19:00',
      'Culto de Domingo',
      [
        [0, 'G'],
        [1, 'D'],
      ],
    ],
  ];
  mock.data.services = plan.map(([date, time, type, items], index) => ({
    id: `91000000-0000-4000-8000-${String(index + 1).padStart(12, '0')}`,
    date,
    time,
    type,
    notes: '',
    assignments: [],
    repertoire: items.map(([song, key], item) => ({ id: `h-${index}-${item}`, songId: songs[song].id, key, notes: '' })),
  }));
}

async function open(page: Page, role: 'admin' | 'musician' = 'admin') {
  await page.clock.setFixedTime(new Date('2026-11-25T15:00:00Z'));
  const mock = await setupMockMinistry(page, role);
  historyData(mock);
  await mock.login();
  return mock;
}

test('página da música mostra quantas vezes foi tocada, a última vez e os cultos com link', async ({ page }) => {
  const mock = await open(page);
  const song = mock.data.songs[0];
  await page.goto(`/musicas/${song.id}`);
  const card = page.getByRole('region', { name: 'Histórico nos cultos', exact: true });
  await expect(card.locator('dd').nth(0)).toHaveText('6');
  await expect(card.locator('dd').nth(1)).toHaveText('há 3 semanas');
  await expect(card.locator('dd').nth(2)).toHaveText('G');
  await expect(card.getByRole('heading', { name: 'Próximos cultos' })).toBeVisible();
  const played = card.locator('.song-history-group').last().getByRole('link');
  await expect(played).toHaveCount(5);
  await card.getByRole('button', { name: 'Ver todos os 6 cultos' }).click();
  await expect(played).toHaveCount(6);
  await expect(played.first()).toContainText('A');
  // The September service had no key saved, so the church key is shown in grey.
  await expect(card.locator('.song-history-key-default')).toHaveText(song.churchKey);
  if (SHOTS) {
    await card.scrollIntoViewIfNeeded();
    await page.screenshot({ path: `${SHOTS}/pc-historico.png`, fullPage: false });
  }
  await played.first().click();
  await expect(page).toHaveURL(/\/cultos\/91000000-0000-4000-8000-000000000008$/);
});

test('gráficos mostram os tons mais tocados usando o tom do culto', async ({ page }) => {
  await open(page);
  await page.goto('/graficos');
  await page.getByRole('tab', { name: 'Músicas', exact: true }).click();
  const card = page.getByRole('region', { name: 'Tons mais tocados', exact: true });
  await expect(card.getByText(/Tom mais tocado:/)).toContainText('D');
  await expect(card.getByRole('listitem', { name: 'D: 7 vezes' })).toBeVisible();
  await expect(card.getByRole('listitem', { name: 'Db: 0 vezes' })).toBeVisible();
  if (SHOTS) {
    await card.scrollIntoViewIfNeeded();
    await page.screenshot({ path: `${SHOTS}/pc-tons.png` });
  }
});

test('histórico e tons cabem no celular, também no modo escuro', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  const mock = await open(page, 'musician');
  for (const theme of ['light', 'dark']) {
    if (theme === 'dark') await page.evaluate(() => localStorage.setItem('candeia.theme', 'dark'));
    await page.goto(`/musicas/${mock.data.songs[0].id}`);
    const card = page.getByRole('region', { name: 'Histórico nos cultos', exact: true });
    await card.scrollIntoViewIfNeeded();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    if (SHOTS) await card.screenshot({ path: `${SHOTS}/celular-historico-${theme}.png` });
    await page.goto('/graficos');
    await page.getByRole('tab', { name: 'Músicas', exact: true }).click();
    const keys = page.getByRole('region', { name: 'Tons mais tocados', exact: true });
    await keys.scrollIntoViewIfNeeded();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    if (SHOTS) await keys.screenshot({ path: `${SHOTS}/celular-tons-${theme}.png` });
  }
});
