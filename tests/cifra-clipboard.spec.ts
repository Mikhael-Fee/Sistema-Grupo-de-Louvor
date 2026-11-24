import { expect, test } from '@playwright/test';
import { loginAs } from './fixtures';

test.use({ trace: 'off', screenshot: 'off' });
const SOURCE = 'https://www.cifraclub.com.br/equipe-de-teste/cancao-copiada/';
const writes = (calls: { method: string; path: string }[]) => calls.filter(call => !['GET', 'HEAD', 'OPTIONS'].includes(call.method)
  && /\/(?:rest|storage)\/v1\//.test(call.path) && !/\/rpc\/(?:get_public_access|read_public_ministry)$/.test(call.path));

// Original text shaped like "Selecionar tudo" + "Copiar" on a phone page.
const COPIED_PAGE = ['Menu principal', 'Cifra Club', 'Canção copiada', 'Equipe de teste', 'Favoritar Cifra', 'Tom: G', 'Auto rolagem', '',
  '[Primeira Parte]', 'G           D/F#', 'Uma luz nos guia', 'Em7         C', 'Seguimos em paz', '',
  'Composição de Equipe de teste', 'Comentários', 'Outra música', SOURCE].join('\n');

test('Colar cifra copiada descarta a página, mostra a prévia e salva só ao confirmar', async ({ page, context }) => {
  await context.grantPermissions(['clipboard-read', 'clipboard-write']);
  const mock = await loginAs(page);
  await page.goto('/musicas');
  await page.getByRole('button', { name: 'Nova música', exact: true }).click();
  const dialog = page.getByRole('dialog');
  await dialog.getByLabel('Título', { exact: true }).fill('Canção copiada');
  await dialog.getByLabel('Artista / compositor', { exact: true }).fill('Equipe de teste');
  await page.evaluate(text => navigator.clipboard.writeText(text), COPIED_PAGE);
  await dialog.getByRole('button', { name: 'Colar cifra copiada', exact: true }).click();
  await expect(dialog.getByLabel('Prévia do conteúdo para importar', { exact: true })).toHaveText('[Primeira Parte]\n[G]Uma luz nos [D/F#]guia\n[Em7]Seguimos em [C]paz');
  expect(writes(mock.calls)).toHaveLength(0);
  await dialog.getByLabel('Tom na igreja', { exact: true }).selectOption('A');
  await dialog.getByRole('button', { name: 'Salvar música', exact: true }).click();
  await expect(dialog).toBeHidden();
  const saved = mock.data.songs.find(song => song.title === 'Canção copiada')!;
  expect(saved.artist).toBe('Equipe de teste');
  expect(saved.content).toBe('[Primeira Parte]\n[A]Uma luz nos [E/G#]guia\n[F#m7]Seguimos em [D]paz');
  expect(saved.notes).toContain(SOURCE);
  expect(writes(mock.calls)).toEqual([{ method: 'POST', path: '/rest/v1/rpc/save_song' }]);
});

test('Colar cifra copiada explica quando o texto não tem acordes', async ({ page, context }) => {
  await context.grantPermissions(['clipboard-read', 'clipboard-write']);
  await loginAs(page);
  await page.goto('/musicas');
  await page.getByRole('button', { name: 'Nova música', exact: true }).click();
  const dialog = page.getByRole('dialog');
  await page.evaluate(() => navigator.clipboard.writeText('Somente a letra\nSem acordes'));
  await dialog.getByRole('button', { name: 'Colar cifra copiada', exact: true }).click();
  await expect(dialog).toContainText('Não encontrei acordes no texto copiado');
});
