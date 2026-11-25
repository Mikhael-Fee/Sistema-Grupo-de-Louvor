import { expect, test } from '@playwright/test';
import { setupMockMinistry, type MockMinistry } from './fixtures';

const LIBRARY_ID = 'dQw4w9WgXcQ';
const LIVE_ID = '9bZkp7q19f0';
const ACOUSTIC_ID = 'kJQP7kiw5Fk';
const libraryUrl = `https://www.youtube.com/watch?v=${LIBRARY_ID}`;
const liveUrl = `https://www.youtube.com/watch?v=${LIVE_ID}`;
const saves = (mock: MockMinistry) => mock.calls.filter(call => call.path === '/rest/v1/rpc/save_service');
const thumbnail = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/l8sAAAAASUVORK5CYII=', 'base64');

for (const width of [1200, 360]) {
  test(`busca e escolhe uma versão do YouTube só para o culto em ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 900 });
    await page.route('https://i.ytimg.com/**', route => route.fulfill({ contentType: 'image/png', body: thumbnail }));
    const queries: string[] = [];
    await page.route('**/.netlify/functions/youtube-search?**', async route => {
      const url = new URL(route.request().url());
      queries.push(url.searchParams.get('title') || '');
      expect(route.request().headers().authorization).toMatch(/^Bearer /);
      await route.fulfill({
        contentType: 'application/json',
        body: JSON.stringify({
          results: [
            { id: LIBRARY_ID, title: 'Versão original', channel: 'Canal oficial', url: libraryUrl },
            { id: LIVE_ID, title: 'Ao vivo no congresso', channel: 'Ministério', url: liveUrl },
            { id: ACOUSTIC_ID, title: 'Acústico', channel: 'Outro canal', url: `https://youtu.be/${ACOUSTIC_ID}` },
          ],
        }),
      });
    });
    const mock = await setupMockMinistry(page, 'leader');
    const service = mock.data.services[0];
    const item = service.repertoire[0];
    item.youtubeUrl = '';
    const song = mock.data.songs.find(candidate => candidate.id === item.songId)!;
    song.youtubeUrl = libraryUrl;
    const originalSong = structuredClone(song);
    await mock.login();
    await page.goto(`/cultos/${service.id}`);
    const row = page.locator('.service-setlist-item').filter({ hasText: song.title });
    await row.getByRole('button', { name: 'Escolher outra versão para este culto', exact: true }).click();

    const dialog = page.getByRole('dialog');
    // The library video is the starting point and the search box starts with title + artist.
    await expect(dialog.getByRole('link', { name: `Assistir ${song.title} no YouTube`, exact: true })).toHaveAttribute('href', libraryUrl);
    await expect(dialog.getByText('Vídeo da biblioteca (em uso)')).toBeVisible();
    const query = dialog.getByLabel('Buscar outra versão', { exact: true });
    await expect(query).toHaveValue(`${song.title} ${song.artist}`.trim());
    expect(queries).toHaveLength(0);

    await dialog.getByRole('button', { name: 'Ao vivo', exact: true }).click();
    await expect(query).toHaveValue(`${song.title} ${song.artist} ao vivo`.trim());
    await expect.poll(() => queries.at(-1)).toBe(`${song.title} ${song.artist} ao vivo`.trim());
    const results = dialog.getByRole('list', { name: 'Versões encontradas' });
    // Library first (already chosen), the duplicate from the search is not repeated.
    await expect(results.getByRole('listitem')).toHaveCount(3);
    await expect(results.getByRole('button', { name: 'Usar o vídeo da biblioteca neste culto' })).toHaveAttribute('aria-pressed', 'true');

    await results.getByRole('button', { name: 'Usar Ao vivo no congresso neste culto', exact: true }).click();
    await expect(results.getByRole('button', { name: 'Usar Ao vivo no congresso neste culto', exact: true })).toHaveAttribute(
      'aria-pressed',
      'true',
    );
    await expect(dialog.getByLabel('Link do vídeo do YouTube neste culto', { exact: true })).toHaveValue(liveUrl);
    await expect(dialog.getByText('Versão deste culto')).toBeVisible();
    expect(await dialog.evaluate(element => element.scrollWidth <= element.clientWidth + 1)).toBe(true);

    // Enter in the search box searches again and does not save the form.
    await query.fill('Outra busca');
    await query.press('Enter');
    await expect.poll(() => queries.at(-1)).toBe('Outra busca');
    expect(saves(mock)).toHaveLength(0);

    await dialog.getByRole('button', { name: 'Salvar ajustes', exact: true }).click();
    await expect(dialog).toBeHidden();
    const card = row.getByRole('link', { name: `Assistir ${song.title} no YouTube`, exact: true });
    await expect(card).toHaveAttribute('href', liveUrl);
    await expect(card).toContainText('Versão deste culto');
    const saved = () => mock.data.services.find(candidate => candidate.id === service.id)!;
    expect(saved().repertoire[0].youtubeUrl).toBe(liveUrl);
    expect(mock.data.songs.find(candidate => candidate.id === song.id)).toEqual(originalSong);

    // Going back to the library video is one tap.
    await row.getByRole('button', { name: 'Trocar a versão deste culto', exact: true }).click();
    await page.getByRole('dialog').getByRole('button', { name: 'Voltar para o vídeo da biblioteca', exact: true }).click();
    await page.getByRole('dialog').getByRole('button', { name: 'Salvar ajustes', exact: true }).click();
    await expect(card).toHaveAttribute('href', libraryUrl);
    expect(saved().repertoire[0].youtubeUrl).toBe('');
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1)).toBe(true);
  });
}
