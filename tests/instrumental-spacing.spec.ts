import { expect, test, type Page } from '@playwright/test';
import { setupMockMinistry } from './fixtures';

const chart = '[Intro] [G][A][D]\n[Cmaj7][G/B][Am7][F#7(b9)/C#][Dmaj7][G/B][Am7][F#7(b9)/C#]\n[G]Uma luz [A]nos guia [D]em paz';

async function openInstrumentalChart(page: Page, width: number) {
  await page.setViewportSize({ width, height: 800 });
  const mock = await setupMockMinistry(page);
  const song = mock.data.songs[0];
  song.originalKey = 'D';
  song.churchKey = 'D';
  song.content = chart;
  await page.goto('/consulta');
  await expect(page.getByRole('heading', { name: 'Cultos', exact: true })).toBeVisible();
  await page.goto(`/musicas/${song.id}`);
  await expect(page.getByRole('heading', { name: song.title, exact: true })).toBeVisible();
  return { mock, song };
}

async function expectReadableInstrumentalChords(page: Page) {
  for (const row of await page.locator('.song-line').all()) {
    const chords = row.locator('.song-segment-instrumental .song-chord');
    const bounds = await chords.evaluateAll(elements => elements.map(element => {
      const box = element.getBoundingClientRect();
      return { left: box.left, right: box.right, top: box.top, bottom: box.bottom };
    }));
    for (let index = 1; index < bounds.length; index++) {
      const previous = bounds[index - 1];
      const current = bounds[index];
      if (Math.abs(current.top - previous.top) < 1) {
        expect(current.left - previous.right).toBeGreaterThanOrEqual(8);
      } else {
        expect(current.top).toBeGreaterThanOrEqual(previous.bottom);
      }
    }
  }
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  expect(await page.locator('.song-sheet').evaluate(element => element.scrollWidth <= element.clientWidth)).toBe(true);
}

for (const width of [320, 1200]) {
  test(`introdução e acordes instrumentais ficam separados em ${width}px sem alterar a letra`, async ({ page }) => {
    const { mock, song } = await openInstrumentalChart(page, width);
    await expect(page.locator('.song-line').first()).toContainText('[Intro]');
    await expect(page.locator('.song-line').first().locator('.song-chord').filter({ hasText: /^(G|A|D)$/ })).toHaveText(['G', 'A', 'D']);
    await expect(page.locator('.song-line').nth(1).locator('.song-chord')).toHaveText(['Cmaj7', 'G/B', 'Am7', 'F#7(b9)/C#', 'Dmaj7', 'G/B', 'Am7', 'F#7(b9)/C#']);
    await expectReadableInstrumentalChords(page);
    if (width === 320) {
      const tops = await page.locator('.song-line').nth(1).locator('.song-chord').evaluateAll(elements => elements.map(element => Math.round(element.getBoundingClientRect().top)));
      expect(new Set(tops).size).toBeGreaterThan(1);
    }

    // A chord stays directly above the beginning of its sung text, without
    // instrumental padding moving the next syllable or chord to the right.
    const sungSegments = page.locator('.song-line').nth(2).locator('.song-segment');
    await expect(sungSegments).toHaveCount(3);
    for (const segment of await sungSegments.all()) {
      await expect(segment).not.toHaveClass(/song-segment-instrumental/);
      const alignment = await segment.evaluate(element => {
        const chord = element.querySelector('.song-chord')!.getBoundingClientRect();
        const lyric = element.querySelector('.song-lyric')!.getBoundingClientRect();
        return { offset: Math.abs(chord.left - lyric.left), padding: getComputedStyle(element).paddingInlineEnd };
      });
      expect(alignment.offset).toBeLessThan(1);
      expect(alignment.padding).toBe('0px');
    }

    await page.getByLabel('Tom da visualização').selectOption('E');
    await expect(page.locator('.song-line').first().locator('.song-chord').filter({ hasText: /^(A|B|E)$/ })).toHaveText(['A', 'B', 'E']);
    await expect(page.locator('.song-line').nth(1).locator('.song-chord')).toHaveText(['Dmaj7', 'A/C#', 'Bm7', 'G#7(b9)/D#', 'Emaj7', 'A/C#', 'Bm7', 'G#7(b9)/D#']);
    await expectReadableInstrumentalChords(page);
    await page.getByRole('button', { name: 'Restaurar tom D', exact: true }).click();
    await page.getByLabel('Tom da visualização').selectOption('E');
    await expect(page.locator('.song-line').first().locator('.song-chord').filter({ hasText: /^(A|B|E)$/ })).toHaveText(['A', 'B', 'E']);

    await page.getByRole('button', { name: 'Somente letra', exact: true }).click();
    await expect(page.locator('.song-lyrics-only')).toContainText('[Intro]');
    await expect(page.locator('.song-lyrics-only')).toContainText('Uma luz nos guia em paz');
    await expect(page.locator('.song-lyrics-only')).not.toContainText('[Cmaj7]');
    await expect(page.locator('.song-lyrics-only')).not.toContainText('[G]');
    expect(mock.data.songs.find(item => item.id === song.id)?.content).toBe(chart);
    expect(mock.calls.some(call => /rpc\/save_(song|service)$/.test(call.path))).toBe(false);
  });
}
