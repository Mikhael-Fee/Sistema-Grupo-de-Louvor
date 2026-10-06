import { expect, test, type Page } from '@playwright/test';

async function enterDemo(page: Page) {
  await page.goto('/');
  await page.getByRole('button', { name: 'Entrar na demonstração', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Entrar na demonstração', exact: true })).toBeHidden();
}

async function createSong(page: Page, title = 'Canção de teste') {
  await page.goto('/musicas');
  await page.getByRole('button', { name: 'Nova música', exact: true }).click();
  const dialog = page.getByRole('dialog');
  await dialog.getByLabel('Título', { exact: true }).fill(title);
  await dialog.getByLabel('Artista / compositor', { exact: true }).fill('Equipe de teste');
  await dialog.getByRole('combobox', { name: 'Tom original', exact: true }).selectOption('C');
  await dialog.getByRole('combobox', { name: 'Tom na igreja', exact: true }).selectOption('D');
  await dialog.getByLabel('Letra e cifra').fill('[C]Tua luz nos [G/B]guia\n[Am7]Seguimos em [F]paz');
  await dialog.getByRole('button', { name: 'Adoração', exact: true }).click();
  await dialog.getByRole('button', { name: 'Gratidão', exact: true }).click();
  return dialog;
}

test('cadastra uma música, valida o vídeo, transpõe sem alterar o cadastro e persiste', async ({ page }) => {
  await enterDemo(page);
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
  await expect(page.getByRole('dialog').getByLabel('Letra e cifra')).toHaveValue('[C]Tua luz nos [G/B]guia\n[Am7]Seguimos em [F]paz');
});

test('combina todas as etiquetas selecionadas e os filtros de tom e pesquisa', async ({ page }) => {
  await enterDemo(page);
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
  await enterDemo(page);
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
  await enterDemo(page);
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

test('músico consulta e transpõe, e líder planeja sem editar a biblioteca', async ({ page }) => {
  await enterDemo(page);
  await page.getByLabel('Simular perfil').selectOption('musician');
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

  await page.getByLabel('Simular perfil').selectOption('leader');
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
  await enterDemo(page);
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
