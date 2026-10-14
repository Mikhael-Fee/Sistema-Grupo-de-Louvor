import { expect, test } from '@playwright/test';
import { setupMockMinistry } from './fixtures';
import { calendarMonthLabel, ministryToday, shiftCalendarMonth } from '../src/lib/service-calendar';

const month = ministryToday().slice(0, 7);

for (const width of [1200, 320]) {
  test(`calendário em ${width}px abre vários cultos e cria evento sem alterar os registros anteriores`, async ({ page }) => {
    await page.setViewportSize({ width, height: 850 });
    const mock = await setupMockMinistry(page);
    mock.data.services[0] = { ...mock.data.services[0], date: `${month}-08`, time: '10:00', type: 'Celebração da manhã' };
    mock.data.services[1] = { ...mock.data.services[1], date: `${month}-08`, time: '19:00', type: 'Evento da família', isEvent: true };
    mock.data.services[2] = { ...mock.data.services[2], date: `${month}-09`, type: 'Culto único' };
    const originalServices = structuredClone(mock.data.services);
    await mock.login();
    await page.goto('/cultos');
    const calendar = page.getByRole('region', { name: 'Calendário de cultos', exact: true });
    await expect(calendar).toBeVisible();
    await expect(page.getByRole('button', { name: 'Calendário', exact: true })).toHaveAttribute('aria-pressed', 'true');
    await expect(calendar.locator('[data-date]')).toHaveCount(42);
    await expect(calendar.getByRole('heading', { name: calendarMonthLabel(month), exact: true })).toBeVisible();
    await expect(calendar.locator(`[data-date="${month}-08"]`)).toHaveClass(/calendar-day-event/);
    await calendar.locator(`[data-date="${month}-08"]`).click();
    let dialog = page.getByRole('dialog');
    await expect(dialog.getByRole('link')).toHaveCount(2);
    await dialog.getByRole('link', { name: /Evento da família/ }).click();
    await expect(page).toHaveURL(new RegExp(`/cultos/${mock.data.services[1].id}$`));
    await expect(page.getByRole('heading', { name: 'Evento da família', exact: true })).toBeVisible();
    await page.goto('/cultos');
    await calendar.locator(`[data-date="${month}-09"]`).click();
    await expect(page).toHaveURL(new RegExp(`/cultos/${mock.data.services[2].id}$`));
    await expect(page.getByRole('dialog')).toHaveCount(0);
    await page.goto('/cultos');
    await calendar.locator(`[data-date="${month}-12"]`).click();
    dialog = page.getByRole('dialog');
    await expect(dialog.getByLabel('Data', { exact: true })).toHaveValue(`${month}-12`);
    await expect(dialog.getByRole('checkbox', { name: 'É um evento' })).not.toBeChecked();
    await dialog.getByRole('combobox', { name: 'Tipo de culto', exact: true }).fill('Evento de comunhão');
    await dialog.getByRole('checkbox', { name: 'É um evento' }).check();
    await dialog.getByRole('button', { name: 'Salvar culto', exact: true }).click();
    await expect(dialog).toBeHidden();
    const created = mock.data.services.find(service => service.type === 'Evento de comunhão')!;
    expect(created.isEvent).toBe(true);
    expect(created.date).toBe(`${month}-12`);
    expect(mock.data.services.filter(service => originalServices.some(original => original.id === service.id))).toEqual(originalServices);
    await expect(calendar.locator(`[data-date="${month}-12"]`)).toHaveClass(/calendar-day-event/);
    await page.reload();
    await expect(calendar.locator(`[data-date="${month}-12"]`)).toHaveClass(/calendar-day-event/);
    await page.getByRole('button', { name: 'Cards', exact: true }).click();
    const card = page.getByRole('article').filter({ hasText: 'Evento de comunhão' });
    await expect(card.getByText('Evento', { exact: true })).toBeVisible();
    await card.getByRole('button', { name: /^Editar Evento de comunhão/ }).click();
    dialog = page.getByRole('dialog');
    await expect(dialog.getByRole('checkbox', { name: 'É um evento' })).toBeChecked();
    await dialog.getByRole('checkbox', { name: 'É um evento' }).uncheck();
    await dialog.getByRole('button', { name: 'Salvar culto', exact: true }).click();
    await expect(dialog).toBeHidden();
    expect(mock.data.services.find(service => service.id === created.id)?.isEvent).toBe(false);
    await expect(card.getByText('Evento', { exact: true })).toHaveCount(0);
    expect(mock.data.services.filter(service => originalServices.some(original => original.id === service.id))).toEqual(originalServices);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
    await page.getByRole('button', { name: 'Calendário', exact: true }).click();
    expect(await calendar.evaluate(element => element.scrollWidth <= element.clientWidth)).toBe(true);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  });
}

test('filtros não confundem dias ocupados com livres e calendário navega pelos meses', async ({ page }) => {
  const mock = await setupMockMinistry(page);
  mock.data.services = [{ ...mock.data.services[0], date: `${month}-08`, type: 'Culto para localizar' }];
  await mock.login();
  await page.goto('/cultos');
  const calendar = page.getByRole('region', { name: 'Calendário de cultos', exact: true });
  await page.getByRole('textbox', { name: 'Buscar cultos', exact: true }).fill('inexistente');
  const occupied = calendar.locator(`[data-date="${month}-08"]`);
  await expect(occupied).toHaveAttribute('aria-label', /1 fora dos filtros/);
  await occupied.click();
  await expect(page).toHaveURL(new RegExp(`/cultos/${mock.data.services[0].id}$`));
  await expect(page.getByRole('dialog')).toHaveCount(0);
  expect(mock.calls.filter(call => call.path === '/rest/v1/rpc/save_service')).toHaveLength(0);
  await page.goto('/cultos');
  await calendar.getByRole('button', { name: 'Próximo mês', exact: true }).click();
  await expect(calendar.getByRole('heading', { name: calendarMonthLabel(shiftCalendarMonth(month, 1)), exact: true })).toBeVisible();
  await calendar.getByRole('button', { name: 'Mês anterior', exact: true }).click();
  await expect(calendar.getByRole('heading', { name: calendarMonthLabel(month), exact: true })).toBeVisible();
  await calendar.getByRole('button', { name: 'Mês anterior', exact: true }).click();
  await expect(calendar.getByRole('heading', { name: calendarMonthLabel(shiftCalendarMonth(month, -1)), exact: true })).toBeVisible();
  await calendar.getByRole('button', { name: 'Hoje', exact: true }).click();
  await expect(calendar.getByRole('heading', { name: calendarMonthLabel(month), exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Cards', exact: true }).click();
  await page.getByRole('button', { name: /^Anteriores/ }).click();
  const expectedPast = new Date(`${mock.data.services[0].date}T${mock.data.services[0].time}`).getTime() < Date.now();
  await expect(page.getByRole('article')).toHaveCount(expectedPast ? 1 : 0);
  await page.getByRole('button', { name: /^Próximos/ }).click();
  await expect(page.getByRole('article')).toHaveCount(expectedPast ? 0 : 1);
  await page.getByRole('button', { name: 'Todos', exact: true }).click();
  await expect(page.getByRole('article')).toHaveCount(1);
});

for (const role of ['leader', 'musician'] as const) {
  test(`${role} consulta dia ocupado e não cria culto por dia livre`, async ({ page }) => {
    const mock = await setupMockMinistry(page, role);
    mock.data.services = [{ ...mock.data.services[0], date: `${month}-08`, type: 'Encontro da equipe' }];
    await mock.login();
    await page.goto('/cultos');
    const calendar = page.getByRole('region', { name: 'Calendário de cultos', exact: true });
    await expect(calendar.locator(`[data-date="${month}-12"]`)).toBeDisabled();
    await expect(calendar.locator(`[data-date="${month}-08"]`)).toBeEnabled();
    await calendar.locator(`[data-date="${month}-08"]`).click();
    await expect(page).toHaveURL(new RegExp(`/cultos/${mock.data.services[0].id}$`));
    expect(mock.calls.filter(call => call.path === '/rest/v1/rpc/save_service')).toHaveLength(0);
  });
}

test('rascunho mantém evento e campos quando outro dia é escolhido sem salvar', async ({ page }) => {
  const mock = await setupMockMinistry(page);
  mock.data.services = [];
  await mock.login();
  await page.goto('/cultos');
  const calendar = page.getByRole('region', { name: 'Calendário de cultos', exact: true });
  await calendar.locator(`[data-date="${month}-12"]`).click();
  let dialog = page.getByRole('dialog');
  await dialog.getByRole('combobox', { name: 'Tipo de culto', exact: true }).fill('Evento em preparação');
  await dialog.getByRole('checkbox', { name: 'É um evento' }).check();
  await dialog.getByRole('button', { name: 'Fechar', exact: true }).click();
  await calendar.locator(`[data-date="${month}-14"]`).click();
  dialog = page.getByRole('dialog');
  await expect(dialog.getByLabel('Data', { exact: true })).toHaveValue(`${month}-14`);
  await expect(dialog.getByRole('checkbox', { name: 'É um evento' })).toBeChecked();
  await expect(dialog.getByRole('combobox', { name: 'Tipo de culto', exact: true })).toHaveValue('Evento em preparação');
  expect(mock.calls.filter(call => call.path === '/rest/v1/rpc/save_service')).toHaveLength(0);
  await dialog.getByRole('button', { name: 'Cancelar', exact: true }).click();
});
