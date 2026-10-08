import { expect, test } from '@playwright/test';
import { loginAs } from './fixtures';

for (const width of [1280, 350]) {
  test(`temática personalizada em ${width}px persiste, vira sugestão e aparece nos filtros`, async ({ page }) => {
    await page.setViewportSize({ width, height: 800 });
    const mock = await loginAs(page);
    await page.goto('/cultos');
    await page.getByRole('button', { name: 'Novo culto', exact: true }).click();
    let dialog = page.getByRole('dialog');
    const theme = dialog.getByRole('combobox', { name: 'Tipo de culto', exact: true });
    await expect(theme).toHaveValue('Culto de Domingo');
    await expect(dialog.locator('datalist option[value="Culto de Domingo"]')).toHaveCount(1);
    await theme.fill('  Santa Ceia  ');
    await dialog.getByLabel('Data', { exact: true }).fill('2099-11-10');
    await dialog.getByLabel('Horário', { exact: true }).fill('19:30');
    await dialog.getByLabel('Observações').fill('Tema livre para o encontro');
    await dialog.getByRole('button', { name: 'Selecionar equipe', exact: true }).click();
    await dialog.getByRole('checkbox', { name: 'Selecionar Ana Clara', exact: true }).check();
    await dialog.getByRole('button', { name: 'Aplicar equipe (1)', exact: true }).click();
    await dialog.getByRole('button', { name: 'Selecionar músicas', exact: true }).click();
    await dialog.getByRole('checkbox', { name: 'Selecionar Casa de paz', exact: true }).check();
    await dialog.getByRole('checkbox', { name: 'Selecionar Teu amor nos guia', exact: true }).check();
    await dialog.getByRole('button', { name: 'Salvar culto', exact: true }).click();
    await expect(dialog).toBeHidden();
    const saved = mock.data.services.find(service => service.type === 'Santa Ceia');
    expect(saved).toBeDefined();
    expect(saved?.assignments).toHaveLength(1);
    expect(saved?.repertoire).toHaveLength(2);
    expect(mock.calls.filter(call => call.path === '/rest/v1/rpc/save_service')).toHaveLength(1);

    await page.reload();
    await expect(page.getByRole('heading', { name: 'Cultos', exact: true })).toBeVisible();
    await page.getByLabel('Filtrar por tipo de culto').selectOption('Santa Ceia');
    await expect(page.getByRole('article')).toHaveCount(1);
    await expect(page.getByRole('article')).toContainText('Santa Ceia');
    await page.getByRole('article').getByRole('link', { name: 'Ver culto', exact: true }).click();
    await expect(page.getByRole('heading', { name: 'Santa Ceia', exact: true })).toBeVisible();
    await page.getByRole('button', { name: 'Editar culto', exact: true }).click();
    dialog = page.getByRole('dialog');
    await expect(dialog.getByRole('combobox', { name: 'Tipo de culto', exact: true })).toHaveValue('Santa Ceia');
    await expect(dialog.locator('datalist option[value="Santa Ceia"]')).toHaveCount(1);
    await dialog.getByRole('button', { name: 'Cancelar', exact: true }).click();

    await page.goto('/cultos');
    await page.getByRole('button', { name: 'Novo culto', exact: true }).click();
    dialog = page.getByRole('dialog');
    await expect(dialog.locator('datalist option[value="Santa Ceia"]')).toHaveCount(1);
    await expect(dialog.getByRole('combobox', { name: 'Tipo de culto', exact: true })).toHaveAttribute('maxlength', '100');
    await dialog.getByRole('combobox', { name: 'Tipo de culto', exact: true }).fill('   ');
    await dialog.getByRole('button', { name: 'Salvar culto', exact: true }).click();
    await expect(dialog.getByRole('alert')).toHaveText('Informe o tipo de culto.');
    expect(mock.calls.filter(call => call.path === '/rest/v1/rpc/save_service')).toHaveLength(1);

    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
    expect(await dialog.evaluate(element => element.scrollWidth <= element.clientWidth)).toBe(true);
    if (width === 350) await expect(dialog.getByRole('combobox', { name: 'Tipo de culto', exact: true })).toHaveCSS('font-size', '16px');
  });
}
