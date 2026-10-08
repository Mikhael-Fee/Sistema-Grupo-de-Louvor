import { expect, test } from '@playwright/test';
import { setupMockMinistry } from './fixtures';

test.use({ trace: 'off', screenshot: 'off' });

for (const scenario of [{ width: 1200, guest: false }, { width: 320, guest: true }]) {
  test(`painel resume observação específica do repertório em uma linha (${scenario.width}px, ${scenario.guest ? 'visitante' : 'administrador'})`, async ({ page }) => {
    await page.setViewportSize({ width: scenario.width, height: 900 });
    const mock = await setupMockMinistry(page);
    const service = mock.data.services[0];
    const firstLine = 'Ensaio às 16h30; começar com piano e voz.';
    const secondLine = 'SEGUNDA LINHA DE TESTE QUE NÃO DEVE APARECER NO PAINEL';
    const songNotes = 'OBSERVAÇÃO GERAL DA BIBLIOTECA, DIFERENTE DA DESTE CULTO';
    const longLine = 'Crescer lentamente no refrão e seguir a condução da voz principal. '.repeat(12).trim();
    service.repertoire[0].notes = ` \r\n\r\n  ${firstLine}  \r\n${secondLine}`;
    service.repertoire[1].notes = ' \r\n\t\r\n  ';
    service.repertoire[2].notes = `${longLine}\n${secondLine}`;
    for (const item of service.repertoire) mock.data.songs.find(song => song.id === item.songId)!.notes = songNotes;
    if (scenario.guest) {
      await page.goto('/');
      await page.getByRole('button', { name: 'Entrar sem cadastro', exact: true }).click();
    } else await mock.login();

    await expect(page.getByRole('link', { name: 'Abrir culto', exact: true })).toHaveAttribute('href', `/cultos/${service.id}`);
    const rows = page.locator('.home-song-list li');
    await expect(rows).toHaveCount(3);
    const firstNote = rows.nth(0).locator('.home-song-note');
    await expect(firstNote).toHaveText(`Obs.: ${firstLine}`);
    await expect(firstNote).toHaveAttribute('title', firstLine);
    await expect(rows.nth(1).locator('.home-song-note')).toHaveCount(0);
    const longNote = rows.nth(2).locator('.home-song-note');
    await expect(longNote).toHaveText(`Obs.: ${longLine}`);
    await expect(longNote).toHaveAttribute('title', longLine);
    await expect(page.getByText(secondLine, { exact: false })).toHaveCount(0);
    await expect(page.getByText(songNotes, { exact: false })).toHaveCount(0);

    for (let index = 0; index < service.repertoire.length; index++) {
      const item = service.repertoire[index];
      const song = mock.data.songs.find(candidate => candidate.id === item.songId)!;
      const row = rows.nth(index);
      await expect(row.locator('.song-list-copy strong')).toHaveText(song.title);
      await expect(row.locator('.song-list-copy > span').first()).toHaveText(song.artist);
      await expect(row.locator('.key-badge')).toHaveText(item.key);
      await expect(row.getByRole('link')).toHaveAttribute('href', `/musicas/${song.id}?service=${service.id}&item=${item.id}`);
    }
    const geometry = await longNote.evaluate(element => {
      const style = getComputedStyle(element);
      return { whiteSpace: style.whiteSpace, textOverflow: style.textOverflow, overflow: style.overflowX,
        width: element.clientWidth, fullWidth: element.scrollWidth, height: element.clientHeight,
        lineHeight: Number.parseFloat(style.lineHeight) };
    });
    expect(geometry.whiteSpace).toBe('nowrap');
    expect(geometry.textOverflow).toBe('ellipsis');
    expect(geometry.overflow).toBe('hidden');
    expect(geometry.fullWidth).toBeGreaterThan(geometry.width);
    if (Number.isFinite(geometry.lineHeight)) expect(geometry.height).toBeLessThanOrEqual(geometry.lineHeight + 1);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    expect(mock.calls.filter(call => !['GET', 'HEAD', 'OPTIONS'].includes(call.method)
      && /\/(?:rest|storage)\/v1\//.test(call.path)
      && !/\/rpc\/(?:get_public_access|read_public_ministry)$/.test(call.path))).toHaveLength(0);
  });
}
