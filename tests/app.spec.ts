import { expect, test, type Page } from '@playwright/test';
import { loginAs, setupMockMinistry } from './fixtures';

async function createSong(page: Page, title = 'Canção de teste') {
  await page.goto('/musicas');
  await page.getByRole('button', { name: 'Nova música', exact: true }).click();
  const dialog = page.getByRole('dialog');
  await dialog.getByLabel('Título', { exact: true }).fill(title);
  await dialog.getByLabel('Artista / compositor', { exact: true }).fill('Equipe de teste');
  await dialog.getByRole('combobox', { name: 'Tom original', exact: true }).selectOption('C');
  await dialog.getByRole('combobox', { name: 'Tom na igreja', exact: true }).selectOption('D');
  await dialog.getByRole('textbox', { name: /^Letra e cifra/ }).fill('[C]Tua luz nos [G/B]guia\n[Am7]Seguimos em [F]paz');
  await dialog.getByRole('button', { name: 'Adoração', exact: true }).click();
  await dialog.getByRole('button', { name: 'Gratidão', exact: true }).click();
  return dialog;
}

async function navigate(page: Page, name: 'Cultos' | 'Biblioteca') {
  await page.getByRole('navigation', { name: 'Navegação principal', exact: true })
    .getByRole('link', { name, exact: true }).click();
}

async function clickBackdrop(page: Page) {
  const dialog = page.getByRole('dialog');
  const bounds = await dialog.boundingBox();
  expect(bounds).not.toBeNull();
  expect(bounds!.x).toBeGreaterThan(5);
  await page.mouse.click(bounds!.x - 5, bounds!.y + 10);
  await expect(dialog).toBeVisible();
}

test('cadastra uma música, valida o vídeo, transpõe sem alterar o cadastro e persiste', async ({ page }) => {
  await loginAs(page);
  const dialog = await createSong(page);
  await dialog.getByLabel('Vídeo no YouTube').fill('https://example.com/video');
  await dialog.getByRole('button', { name: 'Salvar música', exact: true }).click();
  await expect(dialog.getByRole('alert')).toHaveText(/URL HTTPS de vídeo do YouTube/);
  await dialog.getByLabel('Vídeo no YouTube').fill('https://youtu.be/dQw4w9WgXcQ');
  await dialog.getByRole('button', { name: 'Salvar música', exact: true }).click();
  await expect(dialog).toBeHidden();
  await page.getByRole('searchbox', { name: 'Buscar por título ou artista' }).fill('Equipe de teste');
  const row = page.getByRole('article').filter({ hasText: 'Canção de teste' });
  await expect(row).toHaveCount(1);
  await expect(row).toContainText('Original: C');
  await row.getByRole('link', { name: 'Canção de teste Equipe de teste', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Canção de teste', exact: true })).toBeVisible();
  await expect(page.getByLabel('Tom da visualização')).toHaveValue('D');
  await page.getByLabel('Tom da visualização').selectOption('E');
  await expect(page.locator('.song-chord').filter({ hasText: /^B\/D#$/ })).toHaveCount(1);
  await page.getByRole('button', { name: 'Somente letra', exact: true }).click();
  await expect(page.locator('.song-lyrics-only')).toHaveText('Tua luz nos guia\nSeguimos em paz');
  await expect(page.getByRole('link', { name: 'Abrir YouTube' })).toHaveAttribute('href', 'https://youtu.be/dQw4w9WgXcQ');
  await page.reload();
  await expect(page.getByRole('heading', { name: 'Canção de teste', exact: true })).toBeVisible();
  await expect(page.getByLabel('Tom da visualização')).toHaveValue('D');
  await page.getByRole('button', { name: 'Editar música', exact: true }).click();
  await expect(page.getByRole('dialog').getByRole('combobox', { name: 'Tom original', exact: true })).toHaveValue('C');
  await expect(page.getByRole('dialog').getByRole('combobox', { name: 'Tom na igreja', exact: true })).toHaveValue('D');
  await expect(page.getByRole('dialog').getByRole('textbox', { name: /^Letra e cifra/ })).toHaveValue('[C]Tua luz nos [G/B]guia\n[Am7]Seguimos em [F]paz');
});

test('combina todas as etiquetas selecionadas e os filtros de tom e pesquisa', async ({ page }) => {
  await loginAs(page);
  const dialog = await createSong(page);
  await dialog.getByRole('button', { name: 'Salvar música', exact: true }).click();
  await expect(dialog).toBeHidden();
  const filters = page.getByRole('region', { name: 'Filtros de músicas' });
  await filters.getByRole('button', { name: 'Adoração', exact: true }).click();
  await expect(page.getByRole('article')).toHaveCount(3);
  await filters.getByRole('button', { name: 'Gratidão', exact: true }).click();
  await expect(page.getByRole('article')).toHaveCount(1);
  await expect(page.getByRole('article')).toContainText('Canção de teste');
  await page.getByLabel('Filtrar pelo tom na igreja').selectOption('G');
  await expect(page.getByRole('heading', { name: 'Nenhuma música com esses filtros' })).toBeVisible();
  await page.getByRole('button', { name: 'Limpar filtros', exact: true }).first().click();
  await expect(page.getByRole('article')).toHaveCount(7);
  await page.getByRole('searchbox', { name: 'Buscar por título ou artista' }).fill('cancao de teste');
  await expect(page.getByRole('article')).toHaveCount(1);
  await expect(page.getByRole('article')).toContainText('Canção de teste');
});

test('cadastra pessoas com várias funções e etiquetas e recupera após recarregar', async ({ page }) => {
  await loginAs(page);
  await page.goto('/pessoas');
  await page.getByRole('button', { name: 'Nova pessoa', exact: true }).click();
  let dialog = page.getByRole('dialog');
  await dialog.getByLabel('Nome', { exact: true }).fill('Pessoa de teste');
  await dialog.getByLabel('E-mail').fill('pessoa@example.com');
  await dialog.getByRole('button', { name: 'Salvar pessoa', exact: true }).click();
  await expect(dialog.getByRole('alert')).toHaveText('Selecione pelo menos uma função válida.');
  await dialog.getByRole('checkbox', { name: 'Voz', exact: true }).check();
  await dialog.getByRole('checkbox', { name: 'Teclado', exact: true }).check();
  await dialog.getByRole('button', { name: 'Salvar pessoa', exact: true }).click();
  await expect(dialog).toBeHidden();
  await page.reload();
  const person = page.getByRole('article').filter({ hasText: 'Pessoa de teste' });
  await expect(person).toContainText('Voz');
  await expect(person).toContainText('Teclado');
  await expect(person.getByRole('link', { name: 'pessoa@example.com' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Excluir Mikhael', exact: true })).toBeDisabled();
  await page.goto('/etiquetas');
  await page.getByRole('button', { name: 'Nova etiqueta', exact: true }).click();
  dialog = page.getByRole('dialog');
  await dialog.getByLabel('Nome', { exact: true }).fill('Ensaio de teste');
  await dialog.getByRole('radio', { name: 'Azul', exact: true }).check();
  await dialog.getByRole('button', { name: 'Salvar etiqueta', exact: true }).click();
  await expect(dialog).toBeHidden();
  await page.reload();
  await expect(page.getByRole('heading', { name: 'Ensaio de teste', exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Editar etiqueta Ensaio de teste', exact: true }).click();
  await expect(page.getByRole('dialog').getByRole('radio', { name: 'Azul', exact: true })).toBeChecked();
});

test('planeja culto, escala e repertório ordenado com um tom independente da biblioteca', async ({ page }) => {
  await loginAs(page);
  await page.goto('/cultos');
  await page.getByRole('button', { name: 'Novo culto', exact: true }).click();
  let dialog = page.getByRole('dialog');
  await dialog.getByLabel('Data', { exact: true }).fill('2099-11-10');
  await dialog.getByLabel('Horário', { exact: true }).fill('19:30');
  await dialog.getByRole('combobox', { name: 'Tipo de culto', exact: true }).selectOption('Especial');
  await dialog.getByLabel('Observações').fill('Planejamento de teste');
  await dialog.getByRole('button', { name: 'Salvar culto', exact: true }).click();
  await expect(dialog).toBeHidden();
  await page.getByRole('article').filter({ hasText: 'Planejamento de teste' }).getByRole('link', { name: 'Ver culto' }).click();
  const serviceUrl = page.url();
  await page.getByRole('button', { name: 'Adicionar pessoa à escala', exact: true }).click();
  dialog = page.getByRole('dialog');
  await dialog.getByRole('combobox', { name: 'Pessoa', exact: true }).selectOption({ label: 'Ana Clara' });
  await dialog.getByRole('combobox', { name: 'Função neste culto', exact: true }).selectOption('Teclado');
  await dialog.getByRole('button', { name: 'Adicionar à escala', exact: true }).click();
  await expect(dialog).toBeHidden();
  await expect(page.locator('.service-team-list')).toContainText('Ana Clara');
  await expect(page.locator('.service-team-list')).toContainText('Teclado');

  for (const title of ['Casa de paz', 'Teu amor nos guia']) {
    await page.getByRole('button', { name: 'Adicionar música', exact: true }).click();
    dialog = page.getByRole('dialog');
    await dialog.getByRole('radio', { name: new RegExp(`^${title} `) }).check();
    await dialog.getByRole('button', { name: 'Adicionar música', exact: true }).click();
    await expect(dialog).toBeHidden();
  }
  await page.getByRole('button', { name: 'Mover Teu amor nos guia para cima', exact: true }).click();
  const repertoire = page.locator('.service-setlist > li');
  await expect(repertoire).toHaveCount(2);
  await expect(repertoire.first()).toContainText('Teu amor nos guia');
  await expect(repertoire.last()).toContainText('Casa de paz');
  await page.getByRole('button', { name: 'Editar tom e observação de Casa de paz', exact: true }).click();
  dialog = page.getByRole('dialog');
  await dialog.getByRole('combobox', { name: 'Tom neste culto', exact: true }).selectOption('A');
  await dialog.getByLabel('Observação').fill('Introdução com teclado');
  await dialog.getByRole('button', { name: 'Salvar ajustes', exact: true }).click();
  await expect(dialog).toBeHidden();
  await expect(repertoire.last()).toContainText('Tom A');
  await expect(repertoire.last()).toContainText('Introdução com teclado');
  await page.reload();
  await expect(repertoire.first()).toContainText('Teu amor nos guia');
  await expect(repertoire.last()).toContainText('Tom A');
  await expect(page.locator('.service-team-list')).toContainText('Ana Clara');

  await repertoire.last().getByRole('link', { name: 'Casa de paz', exact: true }).click();
  await expect(page.getByLabel('Tom da visualização')).toHaveValue('A');
  await expect(page.getByText('Introdução com teclado', { exact: true })).toBeVisible();
  await page.getByLabel('Tom da visualização').selectOption('B');
  await page.getByRole('button', { name: 'Salvar tom no culto', exact: true }).click();
  await expect(page.getByRole('status')).toHaveText('Tom salvo no repertório.');
  await page.goto(serviceUrl);
  await expect(repertoire.last()).toContainText('Tom B');
  await page.goto('/musicas');
  await page.getByRole('button', { name: 'Editar Casa de paz', exact: true }).click();
  dialog = page.getByRole('dialog');
  await expect(dialog.getByRole('combobox', { name: 'Tom original', exact: true })).toHaveValue('G');
  await expect(dialog.getByRole('combobox', { name: 'Tom na igreja', exact: true })).toHaveValue('G');
  await dialog.getByRole('button', { name: 'Cancelar', exact: true }).click();
  await page.getByRole('button', { name: 'Excluir Casa de paz', exact: true }).click();
  await expect(page.getByRole('dialog').getByRole('button', { name: 'Excluir música', exact: true })).toBeDisabled();
});

test('músico consulta e transpõe sem ações de edição', async ({ page }) => {
  await loginAs(page, 'musician');
  await page.goto('/musicas');
  await expect(page.getByRole('heading', { name: 'Biblioteca de músicas', exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Nova música', exact: true })).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Editar Casa de paz', exact: true })).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Excluir Casa de paz', exact: true })).toHaveCount(0);
  await page.goto('/cultos');
  await expect(page.getByRole('button', { name: 'Novo culto', exact: true })).toHaveCount(0);
  await page.getByRole('link', { name: 'Ver culto' }).first().click();
  await expect(page.getByRole('button', { name: 'Editar culto', exact: true })).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Adicionar música', exact: true })).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Adicionar pessoa à escala', exact: true })).toHaveCount(0);
  await page.getByRole('link', { name: 'Casa de paz', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Editar música', exact: true })).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Salvar tom no culto', exact: true })).toHaveCount(0);
  await page.getByLabel('Tom da visualização').selectOption('A');
  await expect(page.getByLabel('Tom da visualização')).toHaveValue('A');
  await page.goto('/pessoas');
  await expect(page.getByRole('button', { name: 'Nova pessoa', exact: true })).toHaveCount(0);
  await page.goto('/etiquetas');
  await expect(page.getByRole('button', { name: 'Nova etiqueta', exact: true })).toHaveCount(0);
  await page.goto('/administracao');
  await expect(page).toHaveURL(/\/$/);
  await expect(page.getByRole('link', { name: 'Administração', exact: true })).toHaveCount(0);
});

test('líder planeja cultos e escala sem editar a biblioteca', async ({ page }) => {
  await loginAs(page, 'leader');
  await page.goto('/musicas');
  await expect(page.getByRole('button', { name: 'Nova música', exact: true })).toHaveCount(0);
  await page.goto('/cultos');
  await expect(page.getByRole('button', { name: 'Novo culto', exact: true })).toBeVisible();
  await page.getByRole('link', { name: 'Ver culto' }).first().click();
  await expect(page.getByRole('button', { name: 'Editar culto', exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Adicionar música', exact: true })).toBeVisible();
});

test('funciona em 390 px sem rolagem horizontal, inclusive música e formulário', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await loginAs(page);
  for (const path of ['/', '/cultos', '/musicas', '/pessoas', '/etiquetas', '/administracao']) {
    await page.goto(path);
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth), `largura de ${path}`).toBeLessThanOrEqual(390);
  }
  await page.goto('/cultos');
  await page.getByRole('link', { name: 'Ver culto' }).first().click();
  await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(390);
  await page.getByRole('link', { name: 'Casa de paz', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Casa de paz', exact: true })).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(390);
  await page.getByRole('button', { name: 'Editar música', exact: true }).click();
  const dialog = page.getByRole('dialog');
  await expect(dialog.getByLabel('Título', { exact: true })).toBeVisible();
  const bounds = await dialog.boundingBox();
  expect(bounds).not.toBeNull();
  expect(bounds!.x).toBeGreaterThanOrEqual(0);
  expect(bounds!.x + bounds!.width).toBeLessThanOrEqual(390);
});

test('preserva rascunho de nova música ao fechar e navegar, e Cancelar descarta', async ({ page }) => {
  await loginAs(page);
  let dialog = await createSong(page, 'Canção ainda em preparação');
  await dialog.getByLabel('Observações gerais').fill('Introdução que ainda será revisada');
  await dialog.getByRole('button', { name: 'Fechar', exact: true }).click();
  await expect(dialog).toBeHidden();
  await navigate(page, 'Cultos');
  await navigate(page, 'Biblioteca');
  await page.getByRole('button', { name: 'Nova música', exact: true }).click();
  dialog = page.getByRole('dialog');
  await expect(dialog.getByLabel('Título', { exact: true })).toHaveValue('Canção ainda em preparação');
  await expect(dialog.getByLabel('Artista / compositor', { exact: true })).toHaveValue('Equipe de teste');
  await expect(dialog.getByRole('combobox', { name: 'Tom na igreja', exact: true })).toHaveValue('D');
  await expect(dialog.getByRole('textbox', { name: /^Letra e cifra/ })).toHaveValue('[C]Tua luz nos [G/B]guia\n[Am7]Seguimos em [F]paz');
  await expect(dialog.getByLabel('Observações gerais')).toHaveValue('Introdução que ainda será revisada');
  await expect(dialog.getByRole('button', { name: 'Adoração', exact: true })).toHaveAttribute('aria-pressed', 'true');
  await clickBackdrop(page);
  await expect(dialog.getByLabel('Título', { exact: true })).toHaveValue('Canção ainda em preparação');
  await dialog.getByRole('button', { name: 'Fechar', exact: true }).click();
  await page.getByRole('button', { name: 'Nova música', exact: true }).click();
  await expect(page.getByRole('dialog').getByLabel('Título', { exact: true })).toHaveValue('Canção ainda em preparação');
  await page.getByRole('dialog').getByRole('button', { name: 'Cancelar', exact: true }).click();
  await page.getByRole('button', { name: 'Nova música', exact: true }).click();
  dialog = page.getByRole('dialog');
  await expect(dialog.getByLabel('Título', { exact: true })).toHaveValue('');
  await expect(dialog.getByLabel('Artista / compositor', { exact: true })).toHaveValue('');
  await expect(dialog.getByRole('textbox', { name: /^Letra e cifra/ })).toHaveValue('');
  await expect(dialog.getByLabel('Observações gerais')).toHaveValue('');
  await expect(dialog.getByRole('button', { name: 'Adoração', exact: true })).toHaveAttribute('aria-pressed', 'false');
  await expect(dialog.getByRole('combobox', { name: 'Tom na igreja', exact: true })).toHaveValue('C');
});

test('preserva rascunho de novo culto ao fechar e navegar, e Cancelar descarta', async ({ page }) => {
  await loginAs(page);
  await page.goto('/cultos');
  await page.getByRole('button', { name: 'Novo culto', exact: true }).click();
  let dialog = page.getByRole('dialog');
  await dialog.getByLabel('Data', { exact: true }).fill('2099-10-20');
  await dialog.getByLabel('Horário', { exact: true }).fill('20:30');
  await dialog.getByRole('combobox', { name: 'Tipo de culto', exact: true }).selectOption('Especial');
  await dialog.getByLabel('Observações').fill('Culto ainda em preparação');
  await dialog.getByRole('button', { name: 'Fechar', exact: true }).click();
  await navigate(page, 'Biblioteca');
  await navigate(page, 'Cultos');
  await page.getByRole('button', { name: 'Novo culto', exact: true }).click();
  dialog = page.getByRole('dialog');
  await expect(dialog.getByLabel('Data', { exact: true })).toHaveValue('2099-10-20');
  await expect(dialog.getByLabel('Horário', { exact: true })).toHaveValue('20:30');
  await expect(dialog.getByRole('combobox', { name: 'Tipo de culto', exact: true })).toHaveValue('Especial');
  await expect(dialog.getByLabel('Observações')).toHaveValue('Culto ainda em preparação');
  await clickBackdrop(page);
  await expect(dialog.getByLabel('Observações')).toHaveValue('Culto ainda em preparação');
  await dialog.getByRole('button', { name: 'Fechar', exact: true }).click();
  await page.getByRole('button', { name: 'Novo culto', exact: true }).click();
  await expect(page.getByRole('dialog').getByLabel('Observações')).toHaveValue('Culto ainda em preparação');
  await page.getByRole('dialog').getByRole('button', { name: 'Cancelar', exact: true }).click();
  await page.getByRole('button', { name: 'Novo culto', exact: true }).click();
  dialog = page.getByRole('dialog');
  await expect(dialog.getByLabel('Horário', { exact: true })).toHaveValue('19:00');
  await expect(dialog.getByRole('combobox', { name: 'Tipo de culto', exact: true })).toHaveValue('Culto de Domingo');
  await expect(dialog.getByLabel('Observações')).toHaveValue('');
});

test('rascunho de edição permanece entre biblioteca e detalhes sem alterar a música salva', async ({ page }) => {
  await loginAs(page);
  await page.goto('/musicas');
  await page.getByRole('button', { name: 'Editar Casa de paz', exact: true }).click();
  let dialog = page.getByRole('dialog');
  await dialog.getByLabel('Título', { exact: true }).fill('Casa de paz — rascunho');
  await dialog.getByRole('combobox', { name: 'Tom na igreja', exact: true }).selectOption('A');
  await dialog.getByRole('button', { name: 'Fechar', exact: true }).click();
  await navigate(page, 'Cultos');
  await navigate(page, 'Biblioteca');
  const saved = page.getByRole('article').filter({ hasText: 'Casa de paz' });
  await expect(saved).not.toContainText('rascunho');
  await saved.getByRole('link', { name: 'Casa de paz Composição de demonstração', exact: true }).click();
  await page.getByRole('button', { name: 'Editar música', exact: true }).click();
  dialog = page.getByRole('dialog');
  await expect(dialog.getByLabel('Título', { exact: true })).toHaveValue('Casa de paz — rascunho');
  await expect(dialog.getByRole('combobox', { name: 'Tom na igreja', exact: true })).toHaveValue('A');
  await dialog.getByRole('button', { name: 'Cancelar', exact: true }).click();
  await page.getByRole('button', { name: 'Editar música', exact: true }).click();
  await expect(page.getByRole('dialog').getByLabel('Título', { exact: true })).toHaveValue('Casa de paz');
  await expect(page.getByRole('dialog').getByRole('combobox', { name: 'Tom na igreja', exact: true })).toHaveValue('G');
});

test('monta escala de três pessoas em lote antes de salvar o novo culto', async ({ page }) => {
  await loginAs(page);
  await page.goto('/cultos');
  await page.getByRole('button', { name: 'Novo culto', exact: true }).click();
  const dialog = page.getByRole('dialog');
  await dialog.getByLabel('Data', { exact: true }).fill('2099-11-20');
  await dialog.getByLabel('Observações').fill('Culto com escala em lote');
  await dialog.getByRole('button', { name: 'Montar escala em lote', exact: true }).click();
  for (const [name, role] of [['Ana Clara', 'Teclado'], ['Mikhael', 'Violão'], ['Lucas', 'Baixo']]) {
    await dialog.getByRole('checkbox', { name: `Selecionar ${name}`, exact: true }).check();
    await dialog.getByRole('combobox', { name: `Função de ${name}`, exact: true }).selectOption(role);
  }
  await dialog.getByRole('button', { name: 'Adicionar selecionados (3)', exact: true }).click();
  await dialog.getByRole('button', { name: 'Salvar culto', exact: true }).click();
  await expect(dialog).toBeHidden();
  await page.getByRole('article').filter({ hasText: 'Culto com escala em lote' }).getByRole('link', { name: 'Ver culto' }).click();
  const assignments = page.locator('.service-team-list > li');
  await expect(assignments).toHaveCount(3);
  for (const [name, role] of [['Ana Clara', 'Teclado'], ['Mikhael', 'Violão'], ['Lucas', 'Baixo']]) {
    await expect(assignments.filter({ hasText: name })).toContainText(role);
  }
  await page.reload();
  await expect(assignments).toHaveCount(3);
});

test('adiciona três pessoas à escala existente em uma ação e impede pares repetidos', async ({ page }) => {
  await loginAs(page);
  await page.goto('/cultos');
  await page.getByRole('button', { name: 'Novo culto', exact: true }).click();
  let dialog = page.getByRole('dialog');
  await dialog.getByLabel('Data', { exact: true }).fill('2099-11-21');
  await dialog.getByLabel('Observações').fill('Escala em lote no detalhe');
  await dialog.getByRole('button', { name: 'Salvar culto', exact: true }).click();
  await expect(dialog).toBeHidden();
  await page.getByRole('article').filter({ hasText: 'Escala em lote no detalhe' }).getByRole('link', { name: 'Ver culto' }).click();
  await page.getByRole('button', { name: 'Montar escala em lote', exact: true }).click();
  dialog = page.getByRole('dialog');
  for (const [name, role] of [['Ana Clara', 'Teclado'], ['Mikhael', 'Violão'], ['Lucas', 'Baixo']]) {
    await dialog.getByRole('checkbox', { name: `Selecionar ${name}`, exact: true }).check();
    await dialog.getByRole('combobox', { name: `Função de ${name}`, exact: true }).selectOption(role);
  }
  await dialog.getByRole('button', { name: 'Adicionar selecionados (3)', exact: true }).click();
  await expect(dialog).toBeHidden();
  const assignments = page.locator('.service-team-list > li');
  await expect(assignments).toHaveCount(3);
  for (const [name, role] of [['Ana Clara', 'Teclado'], ['Mikhael', 'Violão'], ['Lucas', 'Baixo']]) {
    await expect(assignments.filter({ hasText: name })).toContainText(role);
  }
  await page.getByRole('button', { name: 'Montar escala em lote', exact: true }).click();
  dialog = page.getByRole('dialog');
  await expect(dialog.getByRole('checkbox', { name: 'Selecionar Lucas', exact: true })).toBeDisabled();
  await expect(dialog.getByRole('combobox', { name: 'Função de Ana Clara', exact: true }).getByRole('option', { name: 'Teclado', exact: true })).toHaveCount(0);
  await expect(dialog.getByRole('combobox', { name: 'Função de Mikhael', exact: true }).getByRole('option', { name: 'Violão', exact: true })).toHaveCount(0);
  await expect(dialog.getByRole('button', { name: 'Adicionar selecionados (0)', exact: true })).toBeDisabled();
  await dialog.getByRole('button', { name: 'Cancelar', exact: true }).click();
  await page.reload();
  await expect(assignments).toHaveCount(3);
});

test('mostra a marca Candeia no login e no cabeçalho mobile com menu fechado', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  const fixture = await setupMockMinistry(page);
  await page.goto('/');
  await expect(page.getByRole('link', { name: /Candeia/ }).first()).toBeInViewport({ ratio: 1 });
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(390);
  await expect(page.getByRole('button', { name: 'Entrar na demonstração', exact: true })).toHaveCount(0);
  await fixture.login();
  const headerBrand = page.getByRole('banner').getByText('Candeia', { exact: true });
  await expect(headerBrand).toBeInViewport({ ratio: 1 });
  await expect(page.getByLabel('Simular perfil')).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Abrir menu', exact: true })).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(390);
  await page.getByRole('navigation', { name: 'Navegação no celular', exact: true })
    .getByRole('link', { name: 'Cultos', exact: true }).click();
  await expect(headerBrand).toBeInViewport({ ratio: 1 });
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(390);
});

test('entra sem cadastro e consulta culto, equipe e cifra com transposição temporária', async ({ page }) => {
  const fixture = await setupMockMinistry(page);
  await page.goto('/cultos');
  await page.getByRole('button', { name: 'Entrar sem cadastro', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Cultos', exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Novo culto', exact: true })).toHaveCount(0);
  await expect(page.getByRole('link', { name: 'Administração', exact: true })).toHaveCount(0);
  await page.getByRole('link', { name: 'Ver culto' }).first().click();
  await expect(page.locator('.service-team-list')).toContainText('Ana Clara');
  await expect(page.locator('.service-team-list')).toContainText('Teclado');
  await expect(page.locator('.service-setlist > li')).toHaveCount(3);
  await expect(page.getByRole('button', { name: 'Editar culto', exact: true })).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Montar escala em lote', exact: true })).toHaveCount(0);
  await page.getByRole('link', { name: 'Casa de paz', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Casa de paz', exact: true })).toBeVisible();
  await expect(page.getByLabel('Tom da visualização')).toHaveValue('G');
  await page.getByLabel('Tom da visualização').selectOption('A');
  await expect(page.getByLabel('Tom da visualização')).toHaveValue('A');
  await expect(page.getByRole('button', { name: 'Editar música', exact: true })).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Salvar tom no culto', exact: true })).toHaveCount(0);
  await page.reload();
  await expect(page.getByRole('heading', { name: 'Casa de paz', exact: true })).toBeVisible();
  await expect(page.getByLabel('Tom da visualização')).toHaveValue('G');
  await page.goto('/pessoas');
  await expect(page.getByRole('heading', { name: 'Nossa equipe', exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Nova pessoa', exact: true })).toHaveCount(0);
  await expect(page.locator('a[href^="mailto:"]')).toHaveCount(0);
  expect(fixture.calls.filter(call => call.path.includes('/auth/v1/token'))).toHaveLength(0);
  expect(fixture.calls.filter(call => call.path.startsWith('/rest/v1/rpc/save_'))).toHaveLength(0);
  expect(fixture.calls.some(call => call.path === '/rest/v1/rpc/read_public_ministry')).toBe(true);
});

test('prévia online de letra só substitui o rascunho após importar e salvar', async ({ page }) => {
  const fixture = await loginAs(page);
  const importedLyrics = 'Uma letra original criada para testar\nCada palavra permanece no seu lugar';
  await page.route('https://lrclib.net/api/search**', route => route.fulfill({
    status: 200, contentType: 'application/json',
    body: JSON.stringify([{ id: 12345, trackName: 'Título da fonte', artistName: 'Artista da fonte', plainLyrics: importedLyrics, instrumental: false }]),
  }));
  const dialog = await createSong(page, 'Minha canção em edição');
  const originalContent = await dialog.getByRole('textbox', { name: /^Letra e cifra/ }).inputValue();
  await dialog.getByRole('button', { name: /^Buscar letra e cifra/ }).click();
  const source = dialog.getByRole('region', { name: 'Busca online de letra e cifra', exact: true });
  await source.getByRole('button', { name: 'Somente letra', exact: true }).click();
  await source.getByRole('button', { name: 'Buscar na fonte', exact: true }).click();
  await source.getByRole('button', { name: 'Ver prévia de Título da fonte', exact: true }).click();
  await expect(source.getByLabel('Prévia do conteúdo para importar', { exact: true })).toHaveText(importedLyrics);
  await expect(dialog.getByRole('textbox', { name: /^Letra e cifra/ })).toHaveValue(originalContent);
  await expect(source.getByRole('checkbox', { name: 'Atualizar título e artista com os dados da fonte', exact: true })).not.toBeChecked();
  expect(fixture.calls.filter(call => call.path === '/rest/v1/rpc/save_song')).toHaveLength(0);
  await source.getByRole('button', { name: 'Substituir conteúdo pela prévia', exact: true }).click();
  await expect(dialog.getByRole('textbox', { name: /^Letra e cifra/ })).toHaveValue(importedLyrics);
  await expect(dialog.getByLabel('Título', { exact: true })).toHaveValue('Minha canção em edição');
  await expect(dialog.getByLabel('Artista / compositor', { exact: true })).toHaveValue('Equipe de teste');
  await expect(dialog.getByRole('combobox', { name: 'Tom na igreja', exact: true })).toHaveValue('D');
  await expect(dialog.getByLabel('Observações gerais')).toHaveValue(/Fonte da letra: LRCLIB/);
  await dialog.getByRole('button', { name: 'Salvar música', exact: true }).click();
  await expect(dialog).toBeHidden();
  await page.reload();
  await page.getByRole('button', { name: 'Editar Minha canção em edição', exact: true }).click();
  await expect(page.getByRole('dialog').getByRole('textbox', { name: /^Letra e cifra/ })).toHaveValue(importedLyrics);
  expect(fixture.calls.filter(call => call.path === '/rest/v1/rpc/save_song')).toHaveLength(1);
});

test('importa cifra com tom original da fonte, preserva tom na igreja e registra referência', async ({ page }) => {
  const fixture = await loginAs(page);
  const sourceSong = {
    id: 'fixture-chords', title: 'Cifra original de teste', artist: 'Equipe da fonte',
    source: 'Worship Together', kind: 'chords',
    sourceUrl: 'https://www.worshiptogether.com/pt/cancoes/fixture-original/',
    originalKey: 'F', content: '[F]Uma canção criada para o teste\n[Bb]Seguimos juntos em paz',
  };
  await page.route('**/.netlify/functions/song-search**', route => {
    const preview = new URL(route.request().url()).searchParams.has('url');
    return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(preview ? { song: sourceSong } : { results: [{ ...sourceSong, content: undefined }] }) });
  });
  await page.goto('/musicas');
  await page.getByRole('button', { name: 'Nova música', exact: true }).click();
  const dialog = page.getByRole('dialog');
  await dialog.getByLabel('Título', { exact: true }).fill('Busca de cifra');
  await dialog.getByLabel('Artista / compositor', { exact: true }).fill('Minha equipe');
  await dialog.getByRole('combobox', { name: 'Tom na igreja', exact: true }).selectOption('D');
  await dialog.getByRole('button', { name: /^Buscar letra e cifra/ }).click();
  const source = dialog.getByRole('region', { name: 'Busca online de letra e cifra', exact: true });
  await source.getByRole('button', { name: 'Buscar na fonte', exact: true }).click();
  await source.getByRole('button', { name: 'Ver prévia de Cifra original de teste', exact: true }).click();
  await expect(source.getByLabel('Prévia do conteúdo para importar', { exact: true })).toHaveText(sourceSong.content);
  await expect(dialog.getByRole('textbox', { name: /^Letra e cifra/ })).toHaveValue('');
  await source.getByRole('checkbox', { name: 'Atualizar título e artista com os dados da fonte', exact: true }).check();
  await source.getByRole('button', { name: 'Importar prévia', exact: true }).click();
  await expect(dialog.getByLabel('Título', { exact: true })).toHaveValue(sourceSong.title);
  await expect(dialog.getByLabel('Artista / compositor', { exact: true })).toHaveValue(sourceSong.artist);
  await expect(dialog.getByRole('combobox', { name: 'Tom original', exact: true })).toHaveValue('F');
  await expect(dialog.getByRole('combobox', { name: 'Tom na igreja', exact: true })).toHaveValue('D');
  await expect(dialog.getByLabel('Observações gerais')).toHaveValue(`Fonte da letra e cifra: Worship Together — ${sourceSong.sourceUrl}`);
  await dialog.getByRole('button', { name: 'Salvar música', exact: true }).click();
  await expect(dialog).toBeHidden();
  await page.reload();
  await page.getByRole('button', { name: `Editar ${sourceSong.title}`, exact: true }).click();
  const restored = page.getByRole('dialog');
  await expect(restored.getByRole('textbox', { name: /^Letra e cifra/ })).toHaveValue(sourceSong.content);
  await expect(restored.getByRole('combobox', { name: 'Tom original', exact: true })).toHaveValue('F');
  await expect(restored.getByRole('combobox', { name: 'Tom na igreja', exact: true })).toHaveValue('D');
  expect(fixture.calls.filter(call => call.path === '/rest/v1/rpc/save_song')).toHaveLength(1);
});

test('renovação da sessão e retorno de outra aba preservam o editor aberto', async ({ page }) => {
  const fixture = await loginAs(page);
  const dialog = await createSong(page, 'Canção preservada ao voltar');
  const tokenCalls = fixture.calls.filter(call => call.path === '/auth/v1/token').length;
  await page.evaluate(async () => {
    const backendPath = '/src/lib/backend.ts';
    const { supabase } = await import(backendPath);
    if (!supabase) throw new Error('Cliente de teste indisponível.');
    const { error } = await supabase.auth.refreshSession();
    if (error) throw new Error('A renovação simulada falhou.');
  });
  expect(fixture.calls.filter(call => call.path === '/auth/v1/token')).toHaveLength(tokenCalls + 1);
  await expect(dialog.getByLabel('Título', { exact: true })).toHaveValue('Canção preservada ao voltar');
  const otherTab = await page.context().newPage();
  try {
    await otherTab.goto('about:blank');
    await otherTab.bringToFront();
    await page.bringToFront();
    await expect(dialog).toBeVisible();
    await expect(dialog.getByLabel('Título', { exact: true })).toHaveValue('Canção preservada ao voltar');
    await expect(dialog.getByRole('textbox', { name: /^Letra e cifra/ })).toHaveValue('[C]Tua luz nos [G/B]guia\n[Am7]Seguimos em [F]paz');
  } finally { await otherTab.close(); }
});

test('importa texto alinhado do Cifra Club com tom e fonte preservados após salvar', async ({ page }) => {
  const fixture = await loginAs(page);
  const sourceUrl = 'https://www.cifraclub.com.br/equipe-de-teste/luz-da-equipe/';
  const pastedText = 'Tom: D\n\nD           A/C#\nUma luz nos guia\nBm7      G\nSeguimos em paz';
  const chordPro = '[D]Uma luz nos [A/C#]guia\n[Bm7]Seguimos [G]em paz';
  await page.goto('/musicas');
  await page.getByRole('button', { name: 'Nova música', exact: true }).click();
  let dialog = page.getByRole('dialog');
  await dialog.getByLabel('Título', { exact: true }).fill('Luz da equipe de teste');
  await dialog.getByLabel('Artista / compositor', { exact: true }).fill('Equipe de teste');
  await dialog.getByRole('combobox', { name: 'Tom na igreja', exact: true }).selectOption('E');
  const existingContent = '[C]Meu rascunho anterior deve permanecer até importar';
  await dialog.getByRole('textbox', { name: /^Letra e cifra/ }).fill(existingContent);
  const primarySource = dialog.getByRole('region', { name: 'Importar cifra do Cifra Club', exact: true });
  await expect(primarySource).toBeVisible();
  await expect(primarySource).toContainText('FONTE PRINCIPAL');
  await expect(primarySource.getByRole('link', { name: 'Consultar no Cifra Club', exact: true })).toHaveAttribute('href', /^https:\/\/www\.cifraclub\.com\.br\//);
  await expect(dialog.getByRole('button', { name: /^Buscar letra e cifra/ })).toHaveAttribute('aria-expanded', 'false');
  await dialog.getByRole('textbox', { name: /^Link da cifra no Cifra Club/ }).fill(`${sourceUrl}?utm_source=fixture#cifra`);
  await dialog.getByRole('textbox', { name: /^Texto copiado do Cifra Club/ }).fill(pastedText);
  await expect(dialog.getByLabel('Prévia da cifra colada', { exact: true })).toHaveText(chordPro);
  await expect(primarySource).toContainText('Ao importar, a letra e cifra atuais serão substituídas.');
  await expect(dialog.getByRole('textbox', { name: /^Letra e cifra/ })).toHaveValue(existingContent);
  await expect(dialog.getByRole('combobox', { name: 'Tom original', exact: true })).toHaveValue('C');
  expect(fixture.calls.filter(call => call.path === '/rest/v1/rpc/save_song')).toHaveLength(0);
  await dialog.getByRole('button', { name: 'Importar texto do Cifra Club', exact: true }).click();
  await expect(dialog.getByRole('textbox', { name: /^Letra e cifra/ })).toHaveValue(existingContent);
  await expect(dialog.getByRole('combobox', { name: 'Tom original', exact: true })).toHaveValue('C');
  await dialog.getByRole('button', { name: 'Manter conteúdo atual', exact: true }).click();
  await expect(dialog.getByRole('textbox', { name: /^Letra e cifra/ })).toHaveValue(existingContent);
  await dialog.getByRole('button', { name: 'Importar texto do Cifra Club', exact: true }).click();
  await dialog.getByRole('button', { name: 'Substituir letra e cifra', exact: true }).click();
  await expect(dialog.getByRole('textbox', { name: /^Letra e cifra/ })).toHaveValue(chordPro);
  await expect(dialog.getByRole('combobox', { name: 'Tom original', exact: true })).toHaveValue('D');
  await expect(dialog.getByRole('combobox', { name: 'Tom na igreja', exact: true })).toHaveValue('E');
  await expect(dialog.getByRole('textbox', { name: /^Link da cifra no Cifra Club/ })).toHaveValue(sourceUrl);
  const notes = await dialog.getByLabel('Observações gerais').inputValue();
  expect(notes).toContain('Cifra Club');
  expect(notes).toContain(sourceUrl);
  await dialog.getByRole('button', { name: 'Salvar música', exact: true }).click();
  await expect(dialog).toBeHidden();
  await page.reload();
  await page.getByRole('article').filter({ hasText: 'Luz da equipe de teste' })
    .getByRole('link', { name: 'Luz da equipe de teste Equipe de teste', exact: true }).click();
  await expect(page.getByLabel('Tom da visualização')).toHaveValue('E');
  await expect(page.locator('.song-chord').filter({ hasText: /^B\/D#$/ })).toHaveCount(1);
  await expect(page.locator(`a[href="${sourceUrl}"]`)).toBeVisible();
  await page.getByRole('button', { name: 'Editar música', exact: true }).click();
  dialog = page.getByRole('dialog');
  await expect(dialog.getByRole('textbox', { name: /^Letra e cifra/ })).toHaveValue(chordPro);
  await expect(dialog.getByRole('combobox', { name: 'Tom original', exact: true })).toHaveValue('D');
  await expect(dialog.getByRole('combobox', { name: 'Tom na igreja', exact: true })).toHaveValue('E');
  expect(fixture.calls.filter(call => call.path === '/rest/v1/rpc/save_song')).toHaveLength(1);
  await dialog.getByRole('button', { name: 'Cancelar', exact: true }).click();
  await page.getByRole('button', { name: 'Sair', exact: true }).click();
  await page.getByRole('button', { name: 'Entrar sem cadastro', exact: true }).click();
  await page.goto('/musicas');
  await page.getByRole('article').filter({ hasText: 'Luz da equipe de teste' })
    .getByRole('link', { name: 'Luz da equipe de teste Equipe de teste', exact: true }).click();
  await expect(page.getByRole('link', { name: 'Abrir Cifra Club', exact: true })).toHaveAttribute('href', sourceUrl);
  await expect(page.getByRole('button', { name: 'Editar música', exact: true })).toHaveCount(0);
  await page.getByLabel('Tom da visualização').selectOption('F');
  await expect(page.locator('.song-chord').filter({ hasText: /^C\/E$/ })).toHaveCount(1);
  await page.reload();
  await expect(page.getByLabel('Tom da visualização')).toHaveValue('E');
  expect(fixture.data.songs.find(song => song.title === 'Luz da equipe de teste')?.churchKey).toBe('E');
  expect(fixture.calls.filter(call => call.path === '/rest/v1/rpc/save_song')).toHaveLength(1);
});
