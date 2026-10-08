import { expect, test, type Page } from '@playwright/test';
import { loginAs, setupMockMinistry } from './fixtures';

const MANUAL_CHURCH_CONTENT = '[D]Tua luz nos [A/C#]guia\n[Bm7]Seguimos em [G]paz';

async function createSong(page: Page, title = 'Canção de teste') {
  await page.goto('/musicas');
  await page.getByRole('button', { name: 'Nova música', exact: true }).click();
  const dialog = page.getByRole('dialog');
  await dialog.getByLabel('Título', { exact: true }).fill(title);
  await dialog.getByLabel('Artista / compositor', { exact: true }).fill('Equipe de teste');
  await expect(dialog.getByRole('combobox', { name: 'Tom original', exact: true })).toHaveCount(0);
  await dialog.getByRole('combobox', { name: 'Tom na igreja', exact: true }).selectOption('D');
  await dialog.getByRole('textbox', { name: /^Letra e cifra/ }).fill(MANUAL_CHURCH_CONTENT);
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
  await expect(row).not.toContainText('Original:');
  await expect(row.locator('.songs-key-badge')).toHaveText('D');
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
  await expect(page.getByRole('dialog').getByRole('combobox', { name: 'Tom original', exact: true })).toHaveCount(0);
  await expect(page.getByRole('dialog').getByRole('combobox', { name: 'Tom na igreja', exact: true })).toHaveValue('D');
  await expect(page.getByRole('dialog').getByRole('textbox', { name: /^Letra e cifra/ })).toHaveValue(MANUAL_CHURCH_CONTENT);
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
  await dialog.getByRole('combobox', { name: 'Tipo de culto', exact: true }).fill('Especial');
  await dialog.getByLabel('Observações').fill('Planejamento de teste');
  await dialog.getByRole('button', { name: 'Salvar culto', exact: true }).click();
  await expect(dialog).toBeHidden();
  await page.getByRole('article').filter({ hasText: 'Planejamento de teste' }).getByRole('link', { name: 'Ver culto' }).click();
  const serviceUrl = page.url();
  await page.getByRole('button', { name: 'Selecionar equipe', exact: true }).click();
  dialog = page.getByRole('dialog');
  await dialog.getByRole('checkbox', { name: 'Selecionar Ana Clara', exact: true }).check();
  await dialog.getByRole('combobox', { name: 'Função de Ana Clara', exact: true }).selectOption('Teclado');
  await dialog.getByRole('button', { name: 'Salvar equipe', exact: true }).click();
  await expect(dialog).toBeHidden();
  await expect(page.locator('.service-team-list')).toContainText('Ana Clara');
  await expect(page.locator('.service-team-list')).toContainText('Teclado');

  await page.getByRole('button', { name: 'Selecionar músicas', exact: true }).click();
  dialog = page.getByRole('dialog');
  for (const title of ['Casa de paz', 'Teu amor nos guia']) {
    await dialog.getByRole('checkbox', { name: `Selecionar ${title}`, exact: true }).check();
  }
  await dialog.getByRole('button', { name: 'Adicionar selecionadas (2)', exact: true }).click();
  await expect(dialog).toBeHidden();
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
  await expect(dialog.getByRole('combobox', { name: 'Tom original', exact: true })).toHaveCount(0);
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
  await expect(page.getByRole('button', { name: 'Selecionar músicas', exact: true })).toHaveCount(0);
  await expect(page.getByRole('button', { name: /^(Selecionar|Editar) equipe$/ })).toHaveCount(0);
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
  await expect(page.getByRole('button', { name: 'Selecionar músicas', exact: true })).toBeVisible();
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
  await expect(dialog.getByRole('textbox', { name: /^Letra e cifra/ })).toHaveValue(MANUAL_CHURCH_CONTENT);
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
  await dialog.getByRole('combobox', { name: 'Tipo de culto', exact: true }).fill('Especial');
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
  await dialog.getByRole('button', { name: 'Selecionar equipe', exact: true }).click();
  for (const [name, role] of [['Ana Clara', 'Teclado'], ['Mikhael', 'Violão'], ['Lucas', 'Baixo']]) {
    await dialog.getByRole('checkbox', { name: `Selecionar ${name}`, exact: true }).check();
    await dialog.getByRole('combobox', { name: `Função de ${name}`, exact: true }).selectOption(role);
  }
  await dialog.getByRole('button', { name: 'Aplicar equipe (3)', exact: true }).click();
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

test('preserva a seleção ativa ao remover do resumo e reutilizar a última escala', async ({ page }) => {
  await loginAs(page);
  async function prepareService(date: string, note: string, team: [string, string][]) {
    await page.goto('/cultos');
    await page.getByRole('button', { name: 'Novo culto', exact: true }).click();
    const dialog = page.getByRole('dialog');
    await dialog.getByLabel('Data', { exact: true }).fill(date);
    await dialog.getByLabel('Observações').fill(note);
    await dialog.getByRole('button', { name: 'Selecionar equipe', exact: true }).click();
    for (const [name, role] of team) {
      await dialog.getByRole('checkbox', { name: `Selecionar ${name}`, exact: true }).check();
      await dialog.getByRole('combobox', { name: `Função de ${name}`, exact: true }).selectOption(role);
    }
    await dialog.getByRole('button', { name: 'Salvar culto', exact: true }).click();
    await expect(dialog).toBeHidden();
  }
  await prepareService('2099-11-23', 'Última escala para reutilizar', [['Lucas', 'Baixo']]);
  await prepareService('2099-11-24', 'Escala com seleção ativa', [['Ana Clara', 'Voz'], ['Mikhael', 'Violão']]);
  await page.getByRole('article').filter({ hasText: 'Escala com seleção ativa' }).getByRole('link', { name: 'Ver culto' }).click();
  await page.getByRole('button', { name: 'Editar culto', exact: true }).click();
  const dialog = page.getByRole('dialog');
  await dialog.getByRole('button', { name: 'Editar equipe', exact: true }).click();
  await dialog.getByRole('checkbox', { name: 'Selecionar Gabriel', exact: true }).check();
  await dialog.getByRole('combobox', { name: 'Função de Gabriel', exact: true }).selectOption('Violão');
  await dialog.getByRole('combobox', { name: 'Função de Ana Clara', exact: true }).selectOption('Teclado');
  const summary = dialog.locator('.service-editor-assignments > li');
  await expect(summary).toHaveCount(3);
  await expect(summary.filter({ hasText: 'Gabriel' })).toContainText('Violão');
  await expect(summary.filter({ hasText: 'Ana Clara' })).toContainText('Teclado');
  await dialog.getByRole('button', { name: 'Remover Mikhael da escala em edição', exact: true }).click();
  await expect(summary).toHaveCount(2);
  await expect(summary.filter({ hasText: 'Gabriel' })).toContainText('Violão');
  await expect(summary.filter({ hasText: 'Ana Clara' })).toContainText('Teclado');
  await dialog.getByRole('button', { name: 'Editar equipe', exact: true }).click();
  await dialog.getByRole('checkbox', { name: 'Selecionar Davi', exact: true }).check();
  await dialog.getByRole('combobox', { name: 'Função de Davi', exact: true }).selectOption('Percussão');
  await expect(summary.filter({ hasText: 'Davi' })).toContainText('Percussão');
  await dialog.getByRole('button', { name: 'Reutilizar última escala', exact: true }).click();
  await expect(summary).toHaveCount(4);
  await expect(summary.filter({ hasText: 'Davi' })).toContainText('Percussão');
  await expect(summary.filter({ hasText: 'Lucas' })).toContainText('Baixo');
  await expect(summary.filter({ hasText: 'Gabriel' })).toContainText('Violão');
  await expect(summary.filter({ hasText: 'Mikhael' })).toHaveCount(0);
  await dialog.getByRole('button', { name: 'Salvar culto', exact: true }).click();
  await expect(dialog).toBeHidden();
  await page.reload();
  const saved = page.locator('.service-team-list > li');
  await expect(saved).toHaveCount(4);
  for (const [name, role] of [['Ana Clara', 'Teclado'], ['Gabriel', 'Violão'], ['Davi', 'Percussão'], ['Lucas', 'Baixo']]) {
    await expect(saved.filter({ hasText: name })).toContainText(role);
  }
  await expect(saved.filter({ hasText: 'Mikhael' })).toHaveCount(0);
});

test('edita a equipe inteira em lote, troca funções e remove pessoas sem duplicar pares', async ({ page }) => {
  await loginAs(page);
  await page.goto('/cultos');
  await page.getByRole('button', { name: 'Novo culto', exact: true }).click();
  let dialog = page.getByRole('dialog');
  await dialog.getByLabel('Data', { exact: true }).fill('2099-11-21');
  await dialog.getByLabel('Observações').fill('Escala em lote no detalhe');
  await dialog.getByRole('button', { name: 'Salvar culto', exact: true }).click();
  await expect(dialog).toBeHidden();
  await page.getByRole('article').filter({ hasText: 'Escala em lote no detalhe' }).getByRole('link', { name: 'Ver culto' }).click();
  await page.getByRole('button', { name: 'Selecionar equipe', exact: true }).click();
  dialog = page.getByRole('dialog');
  for (const [name, role] of [['Ana Clara', 'Teclado'], ['Mikhael', 'Violão'], ['Lucas', 'Baixo']]) {
    await dialog.getByRole('checkbox', { name: `Selecionar ${name}`, exact: true }).check();
    await dialog.getByRole('combobox', { name: `Função de ${name}`, exact: true }).selectOption(role);
  }
  await dialog.getByRole('button', { name: 'Salvar equipe', exact: true }).click();
  await expect(dialog).toBeHidden();
  const assignments = page.locator('.service-team-list > li');
  await expect(assignments).toHaveCount(3);
  for (const [name, role] of [['Ana Clara', 'Teclado'], ['Mikhael', 'Violão'], ['Lucas', 'Baixo']]) {
    await expect(assignments.filter({ hasText: name })).toContainText(role);
  }
  await expect(page.getByRole('button', { name: 'Adicionar pessoa à escala', exact: true })).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Adicionar pessoa', exact: true })).toHaveCount(0);
  await page.getByRole('button', { name: 'Editar equipe', exact: true }).click();
  dialog = page.getByRole('dialog');
  for (const name of ['Ana Clara', 'Mikhael', 'Lucas']) {
    await expect(dialog.getByRole('checkbox', { name: `Selecionar ${name}`, exact: true })).toBeChecked();
  }
  await expect(dialog.getByRole('combobox', { name: 'Função de Ana Clara', exact: true })).toHaveValue('Teclado');
  await dialog.getByRole('combobox', { name: 'Função de Ana Clara', exact: true }).selectOption('Voz');
  await dialog.getByRole('checkbox', { name: 'Selecionar Lucas', exact: true }).uncheck();
  await dialog.getByRole('button', { name: 'Salvar equipe', exact: true }).click();
  await expect(dialog).toBeHidden();
  await expect(assignments).toHaveCount(2);
  await expect(assignments.filter({ hasText: 'Ana Clara' })).toContainText('Voz');
  await expect(assignments.filter({ hasText: 'Lucas' })).toHaveCount(0);
  await page.getByRole('button', { name: 'Editar equipe', exact: true }).click();
  await page.getByRole('dialog').getByRole('button', { name: 'Salvar equipe', exact: true }).click();
  await expect(page.getByRole('dialog')).toBeHidden();
  await page.reload();
  await expect(assignments).toHaveCount(2);
  await expect(assignments.filter({ hasText: 'Ana Clara' })).toContainText('Voz');
});

test('preserva funções múltiplas e rascunho no editor único de equipe, e permite limpar a escala', async ({ page }) => {
  await loginAs(page);
  await page.goto('/cultos');
  await page.getByRole('button', { name: 'Novo culto', exact: true }).click();
  let dialog = page.getByRole('dialog');
  await dialog.getByLabel('Data', { exact: true }).fill('2099-11-22');
  await dialog.getByLabel('Observações').fill('Equipe com funções múltiplas');
  await dialog.getByRole('button', { name: 'Selecionar equipe', exact: true }).click();
  await dialog.getByRole('checkbox', { name: 'Selecionar Ana Clara', exact: true }).check();
  const ana = dialog.locator('.service-batch-person').filter({ hasText: 'Ana Clara' });
  await ana.getByText('Outras funções', { exact: true }).click();
  await ana.getByRole('checkbox', { name: 'Também Ana Clara em Teclado', exact: true }).check();
  await dialog.getByRole('button', { name: 'Salvar culto', exact: true }).click();
  await expect(dialog).toBeHidden();
  await page.getByRole('article').filter({ hasText: 'Equipe com funções múltiplas' }).getByRole('link', { name: 'Ver culto' }).click();
  const serviceUrl = page.url();
  const assignments = page.locator('.service-team-list > li');
  await expect(assignments).toHaveCount(2);
  await expect(assignments.filter({ hasText: 'Ana Clara' }).filter({ hasText: 'Voz' })).toHaveCount(1);
  await expect(assignments.filter({ hasText: 'Ana Clara' }).filter({ hasText: 'Teclado' })).toHaveCount(1);
  await page.getByRole('button', { name: 'Editar equipe', exact: true }).click();
  dialog = page.getByRole('dialog');
  await dialog.locator('.service-batch-person').filter({ hasText: 'Ana Clara' }).getByText('2 funções selecionadas', { exact: true }).click();
  await expect(dialog.getByRole('checkbox', { name: 'Também Ana Clara em Teclado', exact: true })).toBeChecked();
  await dialog.getByRole('checkbox', { name: 'Também Ana Clara em Teclado', exact: true }).uncheck();
  await dialog.getByRole('button', { name: 'Fechar', exact: true }).click();
  await page.goto('/cultos');
  await page.goto(serviceUrl);
  await page.getByRole('button', { name: 'Editar equipe', exact: true }).click();
  dialog = page.getByRole('dialog');
  await dialog.locator('.service-batch-person').filter({ hasText: 'Ana Clara' }).getByText('Outras funções', { exact: true }).click();
  await expect(dialog.getByRole('checkbox', { name: 'Também Ana Clara em Teclado', exact: true })).not.toBeChecked();
  await dialog.getByRole('button', { name: 'Cancelar', exact: true }).click();
  await page.getByRole('button', { name: 'Editar equipe', exact: true }).click();
  dialog = page.getByRole('dialog');
  await dialog.locator('.service-batch-person').filter({ hasText: 'Ana Clara' }).getByText('2 funções selecionadas', { exact: true }).click();
  await expect(dialog.getByRole('checkbox', { name: 'Também Ana Clara em Teclado', exact: true })).toBeChecked();
  await dialog.getByRole('button', { name: 'Salvar equipe', exact: true }).click();
  await expect(dialog).toBeHidden();
  await expect(assignments).toHaveCount(2);
  await page.getByRole('button', { name: 'Editar equipe', exact: true }).click();
  await page.getByRole('dialog').getByRole('button', { name: 'Limpar seleção', exact: true }).click();
  await page.getByRole('dialog').getByRole('button', { name: 'Salvar equipe', exact: true }).click();
  await expect(page.getByRole('dialog')).toBeHidden();
  await expect(assignments).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Selecionar equipe', exact: true })).toBeVisible();
  await page.reload();
  await expect(assignments).toHaveCount(0);
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
  await expect(page.getByRole('button', { name: /^(Selecionar|Editar) equipe$/ })).toHaveCount(0);
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

interface SourceFixture {
  id: string; title: string; artist: string; source: 'Cifra Club' | 'LRCLIB';
  kind: 'chords' | 'lyrics'; sourceUrl: string; content?: string; originalKey?: string;
  capo?: number; soundingKey?: string; keyUnknownReason?: string;
}

async function mockUnifiedSources(page: Page, options: { chords?: SourceFixture[]; lyrics?: { id: number; trackName: string; artistName: string; plainLyrics: string; instrumental?: boolean }[]; chordError?: string; lyricError?: boolean; previewError?: string } = {}) {
  await page.route('https://lrclib.net/api/search**', route => route.fulfill({
    status: options.lyricError ? 503 : 200, contentType: 'application/json',
    body: JSON.stringify(options.lyricError ? { error: 'Fonte de letras indisponível.' } : options.lyrics || []),
  }));
  await page.route('**/.netlify/functions/song-search**', route => {
    const params = new URL(route.request().url()).searchParams;
    if (params.has('url')) {
      const song = options.chords?.find(item => item.sourceUrl === params.get('url'));
      return route.fulfill({ status: options.previewError ? 502 : song ? 200 : 400, contentType: 'application/json', body: JSON.stringify(options.previewError ? { error: options.previewError } : song ? { song } : { error: 'Prévia não simulada.' }) });
    }
    expect(params.get('source')).toBe('cifraclub');
    return route.fulfill({ status: options.chordError ? 502 : 200, contentType: 'application/json', body: JSON.stringify(options.chordError ? { error: options.chordError } : { results: (options.chords || []).map(({ content: _content, ...result }) => result) }) });
  });
}

test('pesquisa única oferece letra LRCLIB quando a cifra falha e preserva o rascunho até confirmar', async ({ page }) => {
  const fixture = await loginAs(page);
  const importedLyrics = 'Uma letra original criada para testar\nCada palavra permanece no seu lugar';
  await mockUnifiedSources(page, {
    chordError: 'Cifra Club indisponível neste momento.',
    lyrics: [{ id: 12345, trackName: 'Título da fonte', artistName: 'Artista da fonte', plainLyrics: importedLyrics, instrumental: false }],
  });
  const dialog = await createSong(page, 'Minha canção em edição');
  const originalContent = await dialog.getByRole('textbox', { name: /^Letra e cifra/ }).inputValue();
  await dialog.getByRole('button', { name: 'Pesquisar cifra e letra', exact: true }).click();
  const source = dialog.getByRole('region', { name: 'Busca online de letra e cifra', exact: true });
  await expect(source).toContainText('Cifra Club indisponível neste momento.');
  await expect(source.getByRole('button', { name: 'Somente letra', exact: true })).toHaveCount(0);
  await expect(source.getByRole('button', { name: 'Buscar na fonte', exact: true })).toHaveCount(0);
  await source.getByRole('button', { name: 'Ver prévia de Título da fonte', exact: true }).click();
  await expect(source.getByLabel('Prévia do conteúdo para importar', { exact: true })).toHaveText(importedLyrics);
  await expect(dialog.getByRole('textbox', { name: /^Letra e cifra/ })).toHaveValue(originalContent);
  await expect(source.getByRole('checkbox', { name: 'Atualizar título e artista com os dados da fonte', exact: true })).not.toBeChecked();
  expect(fixture.calls.filter(call => call.path === '/rest/v1/rpc/save_song')).toHaveLength(0);
  await source.getByRole('button', { name: 'Importar letra sem acordes', exact: true }).click();
  await expect(dialog.getByRole('textbox', { name: /^Letra e cifra/ })).toHaveValue(originalContent);
  await source.getByRole('button', { name: 'Manter conteúdo atual', exact: true }).click();
  await source.getByRole('button', { name: 'Importar letra sem acordes', exact: true }).click();
  await source.getByRole('button', { name: 'Substituir letra e cifra', exact: true }).click();
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

test('pesquisa única prioriza versões do Cifra Club, importa cifra e deriva a letra sem acordes', async ({ page }) => {
  const fixture = await loginAs(page);
  const sourceSong: SourceFixture = {
    id: 'https://www.cifraclub.com.br/equipe-de-teste/luz-da-equipe/',
    title: 'Luz da equipe de teste', artist: 'Equipe da fonte', source: 'Cifra Club', kind: 'chords',
    sourceUrl: 'https://www.cifraclub.com.br/equipe-de-teste/luz-da-equipe/',
    originalKey: 'D', content: '[D]Uma luz nos [A/C#]guia\n[Bm7]Seguimos [G]em paz',
  };
  await mockUnifiedSources(page, {
    chords: [sourceSong, { ...sourceSong, id: 'https://www.cifraclub.com.br/outra-equipe/luz-da-equipe/', artist: 'Outra equipe', title: 'Luz da equipe (acústica)', sourceUrl: 'https://www.cifraclub.com.br/outra-equipe/luz-da-equipe/' }],
    lyrics: [{ id: 12345, trackName: 'Luz da equipe', artistName: 'Equipe de teste', plainLyrics: 'Uma letra secundária original' }],
  });
  await page.goto('/musicas');
  await page.getByRole('button', { name: 'Nova música', exact: true }).click();
  const dialog = page.getByRole('dialog');
  await dialog.getByLabel('Título', { exact: true }).fill('Luz da equipe');
  await dialog.getByLabel('Artista / compositor', { exact: true }).fill('Minha equipe');
  await dialog.getByRole('combobox', { name: 'Tom na igreja', exact: true }).selectOption('E');
  await expect(dialog.getByRole('textbox', { name: /^Texto copiado do Cifra Club/ })).toHaveCount(0);
  await dialog.getByRole('button', { name: 'Pesquisar cifra e letra', exact: true }).click();
  const source = dialog.getByRole('region', { name: 'Busca online de letra e cifra', exact: true });
  await expect(source.locator('.songs-source-results > li')).toHaveCount(3);
  await expect(source.locator('.songs-source-results > li').first()).toContainText('Cifra Club');
  await expect(source.locator('.songs-source-results > li').last()).toContainText('LRCLIB');
  await expect(source.getByRole('link', { name: `Abrir ${sourceSong.title} na fonte`, exact: true })).toHaveAttribute('href', sourceSong.sourceUrl);
  await source.getByRole('button', { name: 'Ver prévia de Luz da equipe (acústica)', exact: true }).click();
  await expect(source.getByLabel('Prévia do conteúdo para importar', { exact: true })).toHaveText(sourceSong.content!);
  await expect(source).toContainText('Outra equipe');
  await source.getByRole('button', { name: `Ver prévia de ${sourceSong.title}`, exact: true }).click();
  await expect(source.getByLabel('Prévia do conteúdo para importar', { exact: true })).toHaveText(sourceSong.content!);
  await expect(dialog.getByRole('textbox', { name: /^Letra e cifra/ })).toHaveValue('');
  await source.getByRole('checkbox', { name: 'Ver somente letra na prévia', exact: true }).check();
  await expect(source.getByLabel('Prévia do conteúdo para importar', { exact: true })).toHaveText('Uma luz nos guia\nSeguimos em paz');
  await source.getByRole('checkbox', { name: 'Atualizar título e artista com os dados da fonte', exact: true }).check();
  await source.getByRole('button', { name: 'Importar cifra e letra', exact: true }).click();
  await expect(dialog.getByLabel('Título', { exact: true })).toHaveValue(sourceSong.title);
  await expect(dialog.getByLabel('Artista / compositor', { exact: true })).toHaveValue(sourceSong.artist);
  await expect(dialog.getByRole('combobox', { name: 'Tom original', exact: true })).toHaveCount(0);
  await expect(dialog.getByRole('textbox', { name: /^Letra e cifra/ })).toHaveValue('[E]Uma luz nos [B/D#]guia\n[C#m7]Seguimos [A]em paz');
  await expect(dialog.getByRole('combobox', { name: 'Tom na igreja', exact: true })).toHaveValue('E');
  await expect(dialog.getByLabel('Observações gerais')).toHaveValue(`Fonte da cifra: Cifra Club — ${sourceSong.sourceUrl}`);
  await dialog.getByRole('button', { name: 'Salvar música', exact: true }).click();
  await expect(dialog).toBeHidden();
  await page.reload();
  await page.getByRole('article').filter({ hasText: sourceSong.title }).getByRole('link', { name: `${sourceSong.title} ${sourceSong.artist}`, exact: true }).click();
  await expect(page.getByLabel('Tom da visualização')).toHaveValue('E');
  await expect(page.locator('.song-chord').filter({ hasText: /^B\/D#$/ })).toHaveCount(1);
  await expect(page.getByRole('link', { name: 'Abrir Cifra Club', exact: true })).toHaveAttribute('href', sourceSong.sourceUrl);
  await page.getByRole('button', { name: 'Somente letra', exact: true }).click();
  await expect(page.locator('.song-lyrics-only')).toHaveText('Uma luz nos guia\nSeguimos em paz');
  await expect(page.locator('.song-chord')).toHaveCount(0);
  await page.getByRole('button', { name: 'Editar música', exact: true }).click();
  const restored = page.getByRole('dialog');
  await expect(restored.getByRole('textbox', { name: /^Letra e cifra/ })).toHaveValue('[E]Uma luz nos [B/D#]guia\n[C#m7]Seguimos [A]em paz');
  await expect(restored.getByRole('combobox', { name: 'Tom original', exact: true })).toHaveCount(0);
  await expect(restored.getByRole('combobox', { name: 'Tom na igreja', exact: true })).toHaveValue('E');
  expect(fixture.calls.filter(call => call.path === '/rest/v1/rpc/save_song')).toHaveLength(1);
  expect(fixture.data.songs.find(song => song.title === sourceSong.title)).toMatchObject({ originalKey: 'E', churchKey: 'E', content: '[E]Uma luz nos [B/D#]guia\n[C#m7]Seguimos [A]em paz' });
});

for (const importBeforeSave of [true, false]) {
  test(`dados da fonte completam artista vazio e salvam ${importBeforeSave ? 'após importar' : 'diretamente da prévia'} sem redigitar campos`, async ({ page }) => {
    const fixture = await loginAs(page);
    const sourceSong: SourceFixture = {
      id: 'https://www.cifraclub.com.br/equipe/metadata-completa/',
      title: 'Luz da fonte encontrada', artist: 'Artista retornado na busca', source: 'Cifra Club', kind: 'chords',
      sourceUrl: 'https://www.cifraclub.com.br/equipe/metadata-completa/',
      originalKey: 'D', content: '[D]Uma luz nos [A/C#]guia',
    };
    await mockUnifiedSources(page, { chords: [sourceSong] });
    await page.goto('/musicas');
    await page.getByRole('button', { name: 'Nova música', exact: true }).click();
    const dialog = page.getByRole('dialog');
    await dialog.getByLabel('Título', { exact: true }).fill('Luz procurada');
    await expect(dialog.getByLabel('Artista / compositor', { exact: true })).toHaveValue('');
    await dialog.getByRole('combobox', { name: 'Tom na igreja', exact: true }).selectOption('E');
    await dialog.getByRole('button', { name: 'Pesquisar cifra e letra', exact: true }).click();
    const source = dialog.getByRole('region', { name: 'Busca online de letra e cifra', exact: true });
    await source.getByRole('button', { name: `Ver prévia de ${sourceSong.title}`, exact: true }).click();
    await source.getByRole('checkbox', { name: 'Atualizar título e artista com os dados da fonte', exact: true }).check();
    await expect(dialog.getByLabel('Título', { exact: true })).toHaveValue(sourceSong.title);
    await expect(dialog.getByLabel('Artista / compositor', { exact: true })).toHaveValue(sourceSong.artist);
    await expect(dialog.getByRole('textbox', { name: /^Letra e cifra/ })).toHaveValue('');
    expect(fixture.calls.filter(call => call.path === '/rest/v1/rpc/save_song')).toHaveLength(0);
    if (importBeforeSave) {
      await source.getByRole('button', { name: 'Importar cifra e letra', exact: true }).click();
      await expect(dialog.getByRole('textbox', { name: /^Letra e cifra/ })).toHaveValue('[E]Uma luz nos [B/D#]guia');
    }
    await dialog.getByRole('button', { name: 'Salvar música', exact: true }).click();
    await expect(dialog).toBeHidden();
    expect(fixture.data.songs.find(song => song.title === sourceSong.title)).toMatchObject({
      artist: sourceSong.artist, originalKey: 'E', churchKey: 'E', content: '[E]Uma luz nos [B/D#]guia',
    });
    expect(fixture.calls.filter(call => call.path === '/rest/v1/rpc/save_song')).toHaveLength(1);
    await page.reload();
    await page.getByRole('article').filter({ hasText: sourceSong.title }).getByRole('link', { name: `${sourceSong.title} ${sourceSong.artist}`, exact: true }).click();
    await expect(page.getByLabel('Tom da visualização')).toHaveValue('E');
    await expect(page.locator('.song-chord')).toHaveText(['E', 'B/D#']);
  });
}

test('salvar com dados da fonte ativos preserva a cifra já preenchida sem substituição confirmada', async ({ page }) => {
  const fixture = await loginAs(page);
  const sourceSong: SourceFixture = {
    id: 'https://www.cifraclub.com.br/equipe/outro-arranjo/',
    title: 'Canção com arranjo da equipe', artist: 'Equipe retornada na busca', source: 'Cifra Club', kind: 'chords',
    sourceUrl: 'https://www.cifraclub.com.br/equipe/outro-arranjo/',
    originalKey: 'G', content: '[G]Outro arranjo ainda não aprovado',
  };
  await mockUnifiedSources(page, { chords: [sourceSong] });
  const dialog = await createSong(page, 'Arranjo em preparação');
  await dialog.getByRole('button', { name: 'Pesquisar cifra e letra', exact: true }).click();
  const source = dialog.getByRole('region', { name: 'Busca online de letra e cifra', exact: true });
  await source.getByRole('button', { name: `Ver prévia de ${sourceSong.title}`, exact: true }).click();
  await source.getByRole('checkbox', { name: 'Atualizar título e artista com os dados da fonte', exact: true }).check();
  await expect(dialog.getByRole('textbox', { name: /^Letra e cifra/ })).toHaveValue(MANUAL_CHURCH_CONTENT);
  await dialog.getByRole('button', { name: 'Salvar música', exact: true }).click();
  await expect(dialog).toBeHidden();
  expect(fixture.data.songs.find(song => song.title === sourceSong.title)).toMatchObject({
    artist: sourceSong.artist, originalKey: 'D', churchKey: 'D', content: MANUAL_CHURCH_CONTENT,
  });
  expect(fixture.calls.filter(call => call.path === '/rest/v1/rpc/save_song')).toHaveLength(1);
});

test('importa acordes em G com capotraste 3 para Bb e visualiza em C sem somar o capotraste duas vezes', async ({ page }) => {
  const fixture = await loginAs(page);
  const sourceSong: SourceFixture = {
    id: 'https://www.cifraclub.com.br/equipe/luz-com-capo/',
    title: 'Luz com capotraste', artist: 'Equipe de teste', source: 'Cifra Club', kind: 'chords',
    sourceUrl: 'https://www.cifraclub.com.br/equipe/luz-com-capo/',
    originalKey: 'G', capo: 3, soundingKey: 'Bb',
    content: '[G]Tua luz nos [D/F#]guia\n[Em7]Seguimos em [C]paz',
  };
  const churchContent = '[Bb]Tua luz nos [F/A]guia\n[Gm7]Seguimos em [Eb]paz';
  await mockUnifiedSources(page, { chords: [sourceSong] });
  await page.goto('/musicas');
  await page.getByRole('button', { name: 'Nova música', exact: true }).click();
  const dialog = page.getByRole('dialog');
  await dialog.getByLabel('Título', { exact: true }).fill(sourceSong.title);
  await dialog.getByLabel('Artista / compositor', { exact: true }).fill(sourceSong.artist);
  await dialog.getByRole('combobox', { name: 'Tom na igreja', exact: true }).selectOption('Bb');
  await dialog.getByRole('button', { name: 'Pesquisar cifra e letra', exact: true }).click();
  const source = dialog.getByRole('region', { name: 'Busca online de letra e cifra', exact: true });
  await source.getByRole('button', { name: `Ver prévia de ${sourceSong.title}`, exact: true }).click();
  await expect(source.getByLabel('Prévia do conteúdo para importar', { exact: true })).toHaveText(sourceSong.content!);
  await expect(dialog.getByRole('textbox', { name: /^Letra e cifra/ })).toHaveValue('');
  expect(fixture.calls.filter(call => call.path === '/rest/v1/rpc/save_song')).toHaveLength(0);
  await source.getByRole('button', { name: 'Importar cifra e letra', exact: true }).click();
  await expect(dialog.getByRole('textbox', { name: /^Letra e cifra/ })).toHaveValue(churchContent);
  await dialog.getByRole('button', { name: 'Salvar música', exact: true }).click();
  await expect(dialog).toBeHidden();
  expect(fixture.data.songs.find(song => song.title === sourceSong.title)).toMatchObject({ originalKey: 'Bb', churchKey: 'Bb', content: churchContent });
  await page.reload();
  await page.getByRole('article').filter({ hasText: sourceSong.title }).getByRole('link', { name: `${sourceSong.title} ${sourceSong.artist}`, exact: true }).click();
  await expect(page.getByLabel('Tom da visualização')).toHaveValue('Bb');
  await expect(page.locator('.song-chord')).toHaveText(['Bb', 'F/A', 'Gm7', 'Eb']);
  await page.getByLabel('Tom da visualização').selectOption('C');
  await expect(page.locator('.song-chord')).toHaveText(['C', 'G/B', 'Am7', 'F']);
  await page.getByRole('button', { name: 'Somente letra', exact: true }).click();
  await expect(page.locator('.song-lyrics-only')).toHaveText('Tua luz nos guia\nSeguimos em paz');
  expect(fixture.calls.filter(call => call.path === '/rest/v1/rpc/save_song')).toHaveLength(1);
});

test('uma cifra sem tom confiável exige confirmação dos acordes antes de importar', async ({ page }) => {
  const fixture = await loginAs(page);
  const sourceSong: SourceFixture = {
    id: 'https://www.cifraclub.com.br/equipe/tom-nao-informado/',
    title: 'Canção sem tom confirmado', artist: 'Equipe de teste', source: 'Cifra Club', kind: 'chords',
    sourceUrl: 'https://www.cifraclub.com.br/equipe/tom-nao-informado/',
    content: '[G]Uma voz nos [D]guia', capo: 3,
    keyUnknownReason: 'O capotraste foi informado, mas o tom dos acordes não foi identificado com segurança.',
  };
  await mockUnifiedSources(page, { chords: [sourceSong] });
  await page.goto('/musicas');
  await page.getByRole('button', { name: 'Nova música', exact: true }).click();
  const dialog = page.getByRole('dialog');
  await dialog.getByLabel('Título', { exact: true }).fill(sourceSong.title);
  await dialog.getByLabel('Artista / compositor', { exact: true }).fill(sourceSong.artist);
  await dialog.getByRole('combobox', { name: 'Tom na igreja', exact: true }).selectOption('Bb');
  await dialog.getByRole('button', { name: 'Pesquisar cifra e letra', exact: true }).click();
  const source = dialog.getByRole('region', { name: 'Busca online de letra e cifra', exact: true });
  await source.getByRole('button', { name: `Ver prévia de ${sourceSong.title}`, exact: true }).click();
  const receivedKey = source.getByRole('combobox', { name: 'Tom dos acordes recebidos', exact: true });
  await expect(receivedKey).toHaveValue('');
  await expect(source.getByRole('button', { name: 'Importar cifra e letra', exact: true })).toBeDisabled();
  await expect(dialog.getByRole('textbox', { name: /^Letra e cifra/ })).toHaveValue('');
  expect(fixture.calls.filter(call => call.path === '/rest/v1/rpc/save_song')).toHaveLength(0);
  await receivedKey.selectOption('G');
  await expect(source.getByRole('button', { name: 'Importar cifra e letra', exact: true })).toBeEnabled();
  await source.getByRole('button', { name: 'Importar cifra e letra', exact: true }).click();
  await expect(dialog.getByRole('textbox', { name: /^Letra e cifra/ })).toHaveValue('[Bb]Uma voz nos [F]guia');
  await dialog.getByRole('button', { name: 'Salvar música', exact: true }).click();
  await expect(dialog).toBeHidden();
  expect(fixture.data.songs.find(song => song.title === sourceSong.title)).toMatchObject({ originalKey: 'Bb', churchKey: 'Bb', content: '[Bb]Uma voz nos [F]guia' });
});

test('trocar o tom na igreja altera os acordes do formulário e preserva a base correta ao salvar', async ({ page }) => {
  const fixture = await loginAs(page);
  const dialog = await createSong(page, 'Canção com tom ajustado');
  const content = dialog.getByRole('textbox', { name: /^Letra e cifra/ });
  await expect(content).toHaveValue(MANUAL_CHURCH_CONTENT);
  await dialog.getByRole('combobox', { name: 'Tom na igreja', exact: true }).selectOption('Bb');
  await expect(content).toHaveValue('[Bb]Tua luz nos [F/A]guia\n[Gm7]Seguimos em [Eb]paz');
  await dialog.getByRole('combobox', { name: 'Tom na igreja', exact: true }).selectOption('C');
  await expect(content).toHaveValue('[C]Tua luz nos [G/B]guia\n[Am7]Seguimos em [F]paz');
  expect(fixture.calls.filter(call => call.path === '/rest/v1/rpc/save_song')).toHaveLength(0);
  await dialog.getByRole('button', { name: 'Salvar música', exact: true }).click();
  await expect(dialog).toBeHidden();
  expect(fixture.data.songs.find(song => song.title === 'Canção com tom ajustado')).toMatchObject({ originalKey: 'C', churchKey: 'C', content: '[C]Tua luz nos [G/B]guia\n[Am7]Seguimos em [F]paz' });
  await page.reload();
  await page.getByRole('article').filter({ hasText: 'Canção com tom ajustado' }).getByRole('link', { name: 'Canção com tom ajustado Equipe de teste', exact: true }).click();
  await expect(page.getByLabel('Tom da visualização')).toHaveValue('C');
  await expect(page.locator('.song-chord')).toHaveText(['C', 'G/B', 'Am7', 'F']);
  await page.getByLabel('Tom da visualização').selectOption('Bb');
  await expect(page.locator('.song-chord')).toHaveText(['Bb', 'F/A', 'Gm7', 'Eb']);
});

test('normaliza cadastro legado e permite corrigir acordes em G que estavam identificados como Bb', async ({ page }) => {
  const fixture = await setupMockMinistry(page);
  const originalContent = '[G]Tua luz nos [D/F#]guia\n[Em7]Seguimos em [C]paz';
  const churchContent = '[Bb]Tua luz nos [F/A]guia\n[Gm7]Seguimos em [Eb]paz';
  const legacy = fixture.data.songs[0];
  Object.assign(legacy, { title: 'Legada com tons diferentes', originalKey: 'G', churchKey: 'Bb', content: originalContent });
  const mislabeled = fixture.data.songs[1];
  Object.assign(mislabeled, { title: 'Legada identificada errado', originalKey: 'Bb', churchKey: 'Bb', content: originalContent });
  await fixture.login();
  await page.goto('/musicas');
  await page.getByRole('button', { name: 'Editar Legada com tons diferentes', exact: true }).click();
  let dialog = page.getByRole('dialog');
  await expect(dialog.getByRole('textbox', { name: /^Letra e cifra/ })).toHaveValue(churchContent);
  await expect(dialog.getByRole('combobox', { name: 'Tom original', exact: true })).toHaveCount(0);
  await expect(dialog.getByRole('combobox', { name: 'Tom na igreja', exact: true })).toHaveValue('Bb');
  expect(legacy.content).toBe(originalContent);
  expect(fixture.calls.filter(call => call.path === '/rest/v1/rpc/save_song')).toHaveLength(0);
  await dialog.getByRole('button', { name: 'Salvar música', exact: true }).click();
  await expect(dialog).toBeHidden();
  expect(fixture.data.songs.find(song => song.id === legacy.id)).toMatchObject({ originalKey: 'Bb', churchKey: 'Bb', content: churchContent });
  await page.getByRole('button', { name: 'Editar Legada identificada errado', exact: true }).click();
  dialog = page.getByRole('dialog');
  await expect(dialog.getByRole('textbox', { name: /^Letra e cifra/ })).toHaveValue(originalContent);
  await dialog.locator('summary').filter({ hasText: 'Corrigir cifra com tom incorreto' }).click();
  await dialog.getByRole('combobox', { name: 'Tom dos acordes atuais', exact: true }).selectOption('G');
  await dialog.getByRole('button', { name: 'Aplicar correção do tom', exact: true }).click();
  await expect(dialog.getByRole('textbox', { name: /^Letra e cifra/ })).toHaveValue(churchContent);
  await expect(dialog.getByRole('combobox', { name: 'Tom na igreja', exact: true })).toHaveValue('Bb');
  expect(fixture.calls.filter(call => call.path === '/rest/v1/rpc/save_song')).toHaveLength(1);
  await dialog.getByRole('button', { name: 'Salvar música', exact: true }).click();
  await expect(dialog).toBeHidden();
  await page.reload();
  const restored = fixture.data.songs.find(song => song.id === mislabeled.id);
  expect(restored).toMatchObject({ originalKey: 'Bb', churchKey: 'Bb', content: churchContent });
  await page.getByRole('article').filter({ hasText: 'Legada identificada errado' }).getByRole('link', { name: 'Legada identificada errado Composição de demonstração', exact: true }).click();
  await expect(page.locator('.song-chord')).toHaveText(['Bb', 'F/A', 'Gm7', 'Eb']);
  await page.getByLabel('Tom da visualização').selectOption('C');
  await expect(page.locator('.song-chord')).toHaveText(['C', 'G/B', 'Am7', 'F']);
  expect(fixture.calls.filter(call => call.path === '/rest/v1/rpc/save_song')).toHaveLength(2);
});

test('busca sem resultados ou com fontes indisponíveis mantém campos e permite tentar novamente', async ({ page }) => {
  await loginAs(page);
  await mockUnifiedSources(page);
  const dialog = await createSong(page, 'Canção sem resultado');
  const content = dialog.getByRole('textbox', { name: /^Letra e cifra/ });
  const original = await content.inputValue();
  await dialog.getByRole('button', { name: 'Pesquisar cifra e letra', exact: true }).click();
  const source = dialog.getByRole('region', { name: 'Busca online de letra e cifra', exact: true });
  await expect(source).toContainText('Nenhuma versão encontrada.');
  await expect(content).toHaveValue(original);
  await mockUnifiedSources(page, { chordError: 'Cifra Club temporariamente indisponível.', lyricError: true });
  await dialog.getByRole('button', { name: 'Pesquisar cifra e letra', exact: true }).click();
  await expect(source).toContainText(/indisponível|Não foi possível/);
  await expect(content).toHaveValue(original);
  await mockUnifiedSources(page, { chords: [{ id: 'https://www.cifraclub.com.br/equipe/teste/', title: 'Resultado recuperado', artist: 'Equipe', source: 'Cifra Club', kind: 'chords', sourceUrl: 'https://www.cifraclub.com.br/equipe/teste/', originalKey: 'C', content: '[C]Uma letra de teste' }], previewError: 'Prévia indisponível.' });
  await dialog.getByRole('button', { name: 'Pesquisar cifra e letra', exact: true }).click();
  await source.getByRole('button', { name: 'Ver prévia de Resultado recuperado', exact: true }).click();
  await expect(source.getByRole('alert')).toContainText('Prévia indisponível.');
  await expect(content).toHaveValue(original);
});

test('fechar uma busca cancela a resposta antiga e uma nova busca mantém somente suas versões', async ({ page }) => {
  await loginAs(page);
  await mockUnifiedSources(page);
  let releaseOld!: () => void;
  let reportStarted!: () => void;
  let reportFinished!: () => void;
  const oldGate = new Promise<void>(resolve => { releaseOld = resolve; });
  const oldStarted = new Promise<void>(resolve => { reportStarted = resolve; });
  const oldFinished = new Promise<void>(resolve => { reportFinished = resolve; });
  await page.route('**/.netlify/functions/song-search**', async route => {
    const title = new URL(route.request().url()).searchParams.get('title');
    const old = title === 'Busca antiga';
    if (old) { reportStarted(); await oldGate; }
    const result = { id: old ? 'https://www.cifraclub.com.br/equipe/antiga/' : 'https://www.cifraclub.com.br/equipe/nova/', title: old ? 'Resposta antiga' : 'Resposta nova', artist: 'Equipe', source: 'Cifra Club', kind: 'chords', sourceUrl: old ? 'https://www.cifraclub.com.br/equipe/antiga/' : 'https://www.cifraclub.com.br/equipe/nova/' };
    try { await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ results: [result] }) }); }
    catch (cause) { if (!old) throw cause; } // The first fetch was intentionally aborted.
    finally { if (old) reportFinished(); }
  });
  const dialog = await createSong(page, 'Busca antiga');
  const source = dialog.getByRole('region', { name: 'Busca online de letra e cifra', exact: true });
  try {
    await dialog.getByRole('button', { name: 'Pesquisar cifra e letra', exact: true }).click();
    await oldStarted;
    await source.getByRole('button', { name: 'Fechar busca', exact: true }).click();
    await dialog.getByLabel('Título', { exact: true }).fill('Busca nova');
    await dialog.getByRole('button', { name: 'Pesquisar cifra e letra', exact: true }).click();
    await expect(source.getByRole('button', { name: 'Ver prévia de Resposta nova', exact: true })).toBeVisible();
    releaseOld();
    await oldFinished;
    await expect(source.getByRole('button', { name: 'Ver prévia de Resposta antiga', exact: true })).toHaveCount(0);
    await expect(source.getByRole('button', { name: 'Ver prévia de Resposta nova', exact: true })).toBeVisible();
    await expect(dialog.getByRole('textbox', { name: /^Letra e cifra/ })).toHaveValue(MANUAL_CHURCH_CONTENT);
  } finally { releaseOld(); }
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
    await expect(dialog.getByRole('textbox', { name: /^Letra e cifra/ })).toHaveValue(MANUAL_CHURCH_CONTENT);
  } finally { await otherTab.close(); }
});

test('colar texto no campo único limpa tablatura, converte o tom e preserva os acordes depois de salvar', async ({ page }) => {
  const fixture = await loginAs(page);
  const pastedText = 'Tom: D\n\ne|--0-2-3--|\nB|--0-1-3--|\nG|--0-0-0--|\nD           A/C#\nUma luz nos guia\nBm7      G\nSeguimos em paz';
  const churchChordPro = '[E]Uma luz nos [B/D#]guia\n[C#m7]Seguimos [A]em paz';
  await page.goto('/musicas');
  await page.getByRole('button', { name: 'Nova música', exact: true }).click();
  let dialog = page.getByRole('dialog');
  await dialog.getByLabel('Título', { exact: true }).fill('Luz da equipe de teste');
  await dialog.getByLabel('Artista / compositor', { exact: true }).fill('Equipe de teste');
  await dialog.getByRole('combobox', { name: 'Tom na igreja', exact: true }).selectOption('E');
  const content = dialog.getByRole('textbox', { name: /^Letra e cifra/ });
  await expect(content).toHaveCount(1);
  await expect(dialog.getByRole('textbox', { name: /^Texto copiado do Cifra Club/ })).toHaveCount(0);
  await expect(dialog.locator('summary').filter({ hasText: 'Importar texto manualmente' })).toHaveCount(0);
  await expect(dialog.getByRole('textbox', { name: /^Link da cifra no Cifra Club/ })).toHaveCount(0);
  await expect(dialog.getByRole('button', { name: 'Pesquisar cifra e letra', exact: true })).toBeVisible();
  await content.fill(pastedText);
  await dialog.getByLabel('Título', { exact: true }).click();
  await expect(content).toHaveValue(churchChordPro);
  expect(fixture.calls.filter(call => call.path === '/rest/v1/rpc/save_song')).toHaveLength(0);
  await expect(dialog.getByRole('combobox', { name: 'Tom original', exact: true })).toHaveCount(0);
  await expect(dialog.getByRole('combobox', { name: 'Tom na igreja', exact: true })).toHaveValue('E');
  await dialog.getByRole('button', { name: 'Salvar música', exact: true }).click();
  await expect(dialog).toBeHidden();
  await page.reload();
  await page.getByRole('article').filter({ hasText: 'Luz da equipe de teste' })
    .getByRole('link', { name: 'Luz da equipe de teste Equipe de teste', exact: true }).click();
  await expect(page.getByLabel('Tom da visualização')).toHaveValue('E');
  await expect(page.locator('.song-chord').filter({ hasText: /^B\/D#$/ })).toHaveCount(1);
  await expect(page.locator('.song-chord')).toHaveText(['E', 'B/D#', 'C#m7', 'A']);
  await expect(page.locator('.song-reader')).not.toContainText('e|');
  await page.getByRole('button', { name: 'Editar música', exact: true }).click();
  dialog = page.getByRole('dialog');
  await expect(dialog.getByRole('textbox', { name: /^Letra e cifra/ })).toHaveValue(churchChordPro);
  await expect(dialog.getByRole('combobox', { name: 'Tom original', exact: true })).toHaveCount(0);
  await expect(dialog.getByRole('combobox', { name: 'Tom na igreja', exact: true })).toHaveValue('E');
  expect(fixture.calls.filter(call => call.path === '/rest/v1/rpc/save_song')).toHaveLength(1);
  await dialog.getByRole('button', { name: 'Cancelar', exact: true }).click();
  await page.getByRole('button', { name: 'Sair', exact: true }).click();
  await page.getByRole('button', { name: 'Entrar sem cadastro', exact: true }).click();
  await page.goto('/musicas');
  await page.getByRole('article').filter({ hasText: 'Luz da equipe de teste' })
    .getByRole('link', { name: 'Luz da equipe de teste Equipe de teste', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Editar música', exact: true })).toHaveCount(0);
  await page.getByLabel('Tom da visualização').selectOption('F');
  await expect(page.locator('.song-chord').filter({ hasText: /^C\/E$/ })).toHaveCount(1);
  await page.reload();
  await expect(page.getByLabel('Tom da visualização')).toHaveValue('E');
  expect(fixture.data.songs.find(song => song.title === 'Luz da equipe de teste')?.churchKey).toBe('E');
  expect(fixture.data.songs.find(song => song.title === 'Luz da equipe de teste')?.originalKey).toBe('E');
  expect(fixture.calls.filter(call => call.path === '/rest/v1/rpc/save_song')).toHaveLength(1);
});

test('cifra colada com capotraste e tom ambíguo mantém a confirmação pendente ao fechar e impede salvar no tom errado', async ({ page }) => {
  const fixture = await loginAs(page);
  const pastedText = 'Tom: Bb\nCapotraste: 3ª casa\n\nG           D/F#\nUma luz nos guia\nEm7      C\nSeguimos em paz';
  const churchContent = '[Bb]Uma luz nos [F/A]guia\n[Gm7]Seguimos [Eb]em paz';
  await page.goto('/musicas');
  await page.getByRole('button', { name: 'Nova música', exact: true }).click();
  let dialog = page.getByRole('dialog');
  await dialog.getByLabel('Título', { exact: true }).fill('Cifra colada com capotraste');
  await dialog.getByLabel('Artista / compositor', { exact: true }).fill('Equipe de teste');
  await dialog.getByRole('combobox', { name: 'Tom na igreja', exact: true }).selectOption('Bb');
  await dialog.getByRole('textbox', { name: /^Letra e cifra/ }).fill(pastedText);
  await dialog.getByLabel('Título', { exact: true }).click();
  await expect(dialog.getByRole('combobox', { name: 'Tom dos acordes recebidos', exact: true })).toHaveValue('');
  await expect(dialog.getByRole('textbox', { name: /^Letra e cifra/ })).toHaveValue(pastedText);
  await dialog.getByRole('button', { name: 'Fechar', exact: true }).click();
  await expect(dialog).toBeHidden();
  await navigate(page, 'Cultos');
  await navigate(page, 'Biblioteca');
  await page.getByRole('button', { name: 'Nova música', exact: true }).click();
  dialog = page.getByRole('dialog');
  await expect(dialog.getByRole('textbox', { name: /^Letra e cifra/ })).toHaveValue(pastedText);
  await expect(dialog.getByRole('combobox', { name: 'Tom dos acordes recebidos', exact: true })).toHaveValue('');
  await dialog.getByRole('button', { name: 'Salvar música', exact: true }).click();
  await expect(dialog).toBeVisible();
  await expect(dialog.getByRole('alert')).toContainText(/tom|capotraste/i);
  expect(fixture.calls.filter(call => call.path === '/rest/v1/rpc/save_song')).toHaveLength(0);
  await dialog.getByRole('combobox', { name: 'Tom dos acordes recebidos', exact: true }).selectOption('G');
  await expect(dialog.getByRole('textbox', { name: /^Letra e cifra/ })).toHaveValue(churchContent);
  await expect(dialog.getByRole('combobox', { name: 'Tom dos acordes recebidos', exact: true })).toHaveCount(0);
  await dialog.getByRole('button', { name: 'Salvar música', exact: true }).click();
  await expect(dialog).toBeHidden();
  expect(fixture.data.songs.find(song => song.title === 'Cifra colada com capotraste')).toMatchObject({
    originalKey: 'Bb', churchKey: 'Bb', content: churchContent,
  });
  expect(fixture.calls.filter(call => call.path === '/rest/v1/rpc/save_song')).toHaveLength(1);
});

test('colar um trecho com tom conhecido converte só o trecho e preserva os acordes existentes no tom da igreja', async ({ page }) => {
  const fixture = await loginAs(page);
  await page.goto('/musicas');
  await page.getByRole('button', { name: 'Nova música', exact: true }).click();
  const dialog = page.getByRole('dialog');
  await dialog.getByLabel('Título', { exact: true }).fill('Cifra com trecho acrescentado');
  await dialog.getByLabel('Artista / compositor', { exact: true }).fill('Equipe de teste');
  await dialog.getByRole('combobox', { name: 'Tom na igreja', exact: true }).selectOption('Bb');
  const content = dialog.getByRole('textbox', { name: /^Letra e cifra/ });
  const prefix = '[Bb]Primeira parte preservada\n';
  await content.fill(prefix);
  async function paste(text: string) {
    return content.evaluate((element, clipboardText) => {
      if (!(element instanceof HTMLTextAreaElement)) throw new Error('Campo de cifra indisponível.');
      element.focus();
      element.setSelectionRange(element.value.length, element.value.length);
      const clipboardData = new DataTransfer();
      clipboardData.setData('text/plain', clipboardText);
      const event = new ClipboardEvent('paste', { clipboardData, bubbles: true, cancelable: true });
      element.dispatchEvent(event);
      return event.defaultPrevented;
    }, text);
  }
  expect(await paste('Tom: G\nG           D/F#\nUma luz nos guia')).toBe(true);
  const expectedContent = `${prefix}[Bb]Uma luz nos [F/A]guia`;
  await expect(content).toHaveValue(expectedContent);
  // A fragment without a source key must not leave two different key bases in one sheet.
  expect(await paste('G         D\nOutro trecho sem tom informado')).toBe(true);
  await expect(content).toHaveValue(expectedContent);
  await expect(dialog.getByRole('alert')).toContainText(/inclua o cabeçalho|selecione todo o campo/i);
  expect(fixture.calls.filter(call => call.path === '/rest/v1/rpc/save_song')).toHaveLength(0);
  await dialog.getByRole('button', { name: 'Salvar música', exact: true }).click();
  await expect(dialog).toBeHidden();
  expect(fixture.data.songs.find(song => song.title === 'Cifra com trecho acrescentado')).toMatchObject({
    originalKey: 'Bb', churchKey: 'Bb', content: expectedContent,
  });
  expect(fixture.calls.filter(call => call.path === '/rest/v1/rpc/save_song')).toHaveLength(1);
});
