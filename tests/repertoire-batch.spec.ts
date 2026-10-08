import { expect, test } from '@playwright/test';
import { setupMockMinistry, type MockMinistry } from './fixtures';

const saves = (mock: MockMinistry) => mock.calls.filter(call => call.path === '/rest/v1/rpc/save_service');

test('seleciona várias músicas, mantém a busca e grava uma vez sem duplicar o repertório', async ({ page }) => {
  const mock = await setupMockMinistry(page, 'leader');
  const initial = mock.data.services[0];
  initial.repertoire[0].key = 'Bb';
  initial.repertoire[0].notes = 'Preservar a introdução e o tom do culto';
  const previous = structuredClone(initial.repertoire);
  const first = mock.data.songs[3];
  const second = mock.data.songs[2];
  await mock.login();
  await page.goto(`/cultos/${initial.id}`);
  await expect(page.getByRole('button', { name: 'Adicionar música', exact: true })).toHaveCount(0);
  await page.getByRole('button', { name: 'Selecionar músicas', exact: true }).click();
  let dialog = page.getByRole('dialog');
  const existingSong = mock.data.songs.find(song => song.id === previous[0].songId)!;
  await expect(dialog.getByRole('checkbox', { name: `Selecionar ${existingSong.title}`, exact: true })).toBeChecked();
  await expect(dialog.getByRole('checkbox', { name: `Selecionar ${existingSong.title}`, exact: true })).toBeDisabled();
  await expect(dialog.getByRole('button', { name: 'Adicionar selecionadas (0)', exact: true })).toBeDisabled();
  await dialog.getByRole('checkbox', { name: `Selecionar ${first.title}`, exact: true }).check();
  await dialog.getByLabel('Buscar músicas', { exact: true }).fill('coracao');
  await expect(dialog.getByRole('checkbox', { name: `Selecionar ${first.title}`, exact: true })).toHaveCount(0);
  await dialog.getByRole('checkbox', { name: `Selecionar ${second.title}`, exact: true }).check();
  await expect(dialog.getByRole('status')).toHaveText('2 músicas selecionadas');
  await dialog.getByLabel('Buscar músicas', { exact: true }).fill('nenhuma música com este nome');
  await expect(dialog.getByRole('button', { name: 'Adicionar selecionadas (2)', exact: true })).toBeEnabled();
  expect(saves(mock)).toHaveLength(0);
  expect(mock.data.services[0].repertoire).toEqual(previous);
  await dialog.getByRole('button', { name: 'Fechar', exact: true }).click();
  await page.reload();
  await page.getByRole('button', { name: 'Selecionar músicas', exact: true }).click();
  dialog = page.getByRole('dialog');
  await expect(dialog.getByRole('status')).toHaveText('2 músicas selecionadas');
  await dialog.getByLabel('Buscar músicas', { exact: true }).fill('');
  await expect(dialog.getByRole('checkbox', { name: `Selecionar ${first.title}`, exact: true })).toBeChecked();
  await expect(dialog.getByRole('checkbox', { name: `Selecionar ${second.title}`, exact: true })).toBeChecked();
  expect(saves(mock)).toHaveLength(0);
  await dialog.getByRole('button', { name: 'Adicionar selecionadas (2)', exact: true }).click();
  await expect(dialog).toBeHidden();
  expect(saves(mock)).toHaveLength(1);
  const repertoire = mock.data.services.find(service => service.id === initial.id)!.repertoire;
  expect(repertoire.slice(0, previous.length)).toEqual(previous);
  expect(repertoire.slice(previous.length).map(item => ({ songId: item.songId, key: item.key, notes: item.notes }))).toEqual([
    { songId: first.id, key: first.churchKey, notes: '' },
    { songId: second.id, key: second.churchKey, notes: '' },
  ]);
  expect(new Set(repertoire.map(item => item.songId)).size).toBe(repertoire.length);
  const rows = page.locator('.service-setlist > li');
  await expect(rows.nth(previous.length)).toContainText(first.title);
  await expect(rows.last()).toContainText(second.title);
  await page.getByRole('button', { name: 'Selecionar músicas', exact: true }).click();
  await expect(page.getByRole('dialog').getByRole('checkbox', { name: `Selecionar ${first.title}`, exact: true })).toBeDisabled();
  await expect(page.getByRole('dialog').getByRole('button', { name: 'Adicionar selecionadas (0)', exact: true })).toBeDisabled();
});

test('monta o repertório em lote junto com um culto novo e só persiste ao salvar o culto', async ({ page }) => {
  const mock = await setupMockMinistry(page);
  const songs = [mock.data.songs[1], mock.data.songs[0]];
  await mock.login();
  await page.goto('/cultos');
  await page.getByRole('button', { name: 'Novo culto', exact: true }).click();
  const dialog = page.getByRole('dialog');
  await dialog.getByLabel('Data', { exact: true }).fill('2099-11-10');
  await dialog.getByLabel('Horário', { exact: true }).fill('19:30');
  await dialog.getByRole('combobox', { name: 'Tipo de culto', exact: true }).selectOption('Especial');
  await dialog.getByRole('button', { name: 'Selecionar músicas', exact: true }).click();
  for (const song of songs) await dialog.getByRole('checkbox', { name: `Selecionar ${song.title}`, exact: true }).check();
  await dialog.getByRole('button', { name: 'Aplicar músicas (2)', exact: true }).click();
  await expect(dialog.locator('.service-editor-song-list > li')).toHaveCount(2);
  await expect(dialog.locator('.service-editor-song-list > li').first()).toContainText(songs[0].title);
  expect(saves(mock)).toHaveLength(0);
  await dialog.getByRole('button', { name: 'Selecionar músicas', exact: true }).click();
  await expect(dialog.getByRole('checkbox', { name: `Selecionar ${songs[0].title}`, exact: true })).toBeDisabled();
  await dialog.getByRole('checkbox', { name: `Selecionar ${mock.data.songs[2].title}`, exact: true }).check();
  expect(saves(mock)).toHaveLength(0);
  await dialog.getByRole('button', { name: 'Salvar culto', exact: true }).click();
  await expect(dialog).toBeHidden();
  expect(saves(mock)).toHaveLength(1);
  const service = mock.data.services.find(item => item.date === '2099-11-10')!;
  expect(service.repertoire.map(item => ({ songId: item.songId, key: item.key }))).toEqual([
    ...songs.map(song => ({ songId: song.id, key: song.churchKey })),
    { songId: mock.data.songs[2].id, key: mock.data.songs[2].churchKey },
  ]);
});

test('no celular seleciona e limpa músicas visíveis sem perder outras seleções nem sair da tela', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  const mock = await setupMockMinistry(page);
  const initial = mock.data.services[0];
  await mock.login();
  await page.goto(`/cultos/${initial.id}`);
  await page.getByRole('button', { name: 'Selecionar músicas', exact: true }).click();
  const dialog = page.getByRole('dialog');
  const search = dialog.getByLabel('Buscar músicas', { exact: true });
  await search.fill('Manha');
  await dialog.getByRole('button', { name: 'Selecionar visíveis', exact: true }).click();
  await search.fill('coracao');
  await dialog.getByRole('button', { name: 'Selecionar visíveis', exact: true }).click();
  await expect(dialog.getByRole('status')).toHaveText('2 músicas selecionadas');
  await dialog.getByRole('button', { name: 'Desmarcar visíveis', exact: true }).click();
  await expect(dialog.getByRole('status')).toHaveText('1 música selecionada');
  await search.fill('');
  await expect(dialog.getByRole('checkbox', { name: 'Selecionar Manhã de esperança', exact: true })).toBeChecked();
  const touchTargets = await dialog.locator('.service-song-option').evaluateAll(rows => rows.map(row => row.getBoundingClientRect().height));
  expect(touchTargets.every(height => height >= 44)).toBe(true);
  expect(await dialog.evaluate(element => element.scrollWidth <= element.clientWidth + 1)).toBe(true);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1)).toBe(true);
  await dialog.getByRole('button', { name: 'Limpar seleção', exact: true }).click();
  await expect(dialog.getByRole('button', { name: 'Adicionar selecionadas (0)', exact: true })).toBeDisabled();
  expect(saves(mock)).toHaveLength(0);
  await dialog.getByRole('button', { name: 'Cancelar', exact: true }).click();
  await page.getByRole('button', { name: 'Selecionar músicas', exact: true }).click();
  await expect(page.getByRole('dialog').getByRole('status')).toHaveText('0 músicas selecionadas');
});
