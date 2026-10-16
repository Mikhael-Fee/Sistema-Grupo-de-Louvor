import { expect, test } from '@playwright/test';
import { setupMockMinistry } from './fixtures';

for (const width of [320, 390]) {
  test(`equipe e seleção em duas colunas com nomes longos em ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 844 });
    const mock = await setupMockMinistry(page);
    const longName = 'Ana Clara de Albuquerque Fernandes';
    const person = mock.data.people[1];
    person.name = longName;
    await page.goto('/');
    const origin = await page.evaluate(async () => {
      const modulePath = '/src/lib/backend.ts';
      const { supabase } = await import(modulePath);
      return new URL(supabase.supabaseUrl).origin;
    });
    const photoPath = `${mock.profiles[0].id}/30000000-0000-4000-8000-000000000011.png`;
    // A one-pixel local PNG keeps avatar rendering independent of network access.
    mock.storage.objects.set(photoPath, { body: Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aWQAAAABJRU5ErkJggg==', 'base64'), contentType: 'image/png' });
    person.photoUrl = `${origin}/storage/v1/object/public/avatars/${photoPath}`;
    await mock.login();
    await page.goto('/pessoas');
    await expect(page.locator('.people-person')).toHaveCount(mock.data.people.length);
    const columns = await page.locator('.people-grid').evaluate(element => getComputedStyle(element).gridTemplateColumns.split(' ').length);
    expect(columns).toBe(2);
    const personCard = page.locator('.people-person').filter({ has: page.getByRole('heading', { name: longName, exact: true }) });
    await expect(personCard.locator('img')).toHaveAttribute('src', person.photoUrl);
    await expect.poll(() => personCard.locator('img').evaluate(image => (image as HTMLImageElement).naturalWidth)).toBe(1);
    for (const button of await personCard.getByRole('button').all()) {
      const box = await button.boundingBox();
      expect(box!.width).toBeGreaterThanOrEqual(44);
      expect(box!.height).toBeGreaterThanOrEqual(44);
    }
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);

    const service = mock.data.services[0];
    await page.goto(`/cultos/${service.id}`);
    await page.getByRole('button', { name: 'Editar equipe', exact: true }).click();
    const dialog = page.getByRole('dialog');
    await expect(dialog).not.toContainText('Marque quem vai participar');
    expect(await dialog.locator('.service-batch-list').evaluate(element => getComputedStyle(element).gridTemplateColumns.split(' ').length)).toBe(2);
    const pickerCard = dialog.locator('.service-batch-person').filter({ has: page.getByRole('checkbox', { name: `Selecionar ${longName}`, exact: true }) });
    await expect(pickerCard.locator('img')).toHaveAttribute('src', person.photoUrl);
    const labelBox = await pickerCard.locator('.service-batch-check').boundingBox();
    expect(labelBox!.height).toBeGreaterThanOrEqual(44);
    const roleSelect = pickerCard.getByRole('combobox', { name: `Função de ${longName}`, exact: true });
    await roleSelect.selectOption('Voz');
    await pickerCard.getByText('Outras funções', { exact: true }).click();
    await pickerCard.getByRole('checkbox', { name: `Também ${longName} em Teclado`, exact: true }).check();
    await expect(pickerCard.getByText('2 funções selecionadas', { exact: true })).toBeVisible();
    expect(await dialog.evaluate(element => element.scrollWidth <= element.clientWidth)).toBe(true);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    await dialog.getByRole('button', { name: 'Salvar equipe', exact: true }).click();
    await expect(dialog).toBeHidden();
    const assignments = mock.data.services.find(item => item.id === service.id)!.assignments.filter(item => item.personId === person.id);
    expect(assignments.map(item => item.function).sort()).toEqual(['Teclado', 'Voz']);
  });
}

test('seleção preserva inativo na escala existente e não o oferece em novo culto', async ({ page }) => {
  const mock = await setupMockMinistry(page);
  const archived = mock.data.people[0];
  archived.active = false;
  const service = mock.data.services[0];
  const originalAssignments = structuredClone(service.assignments);
  await mock.login();
  await page.goto(`/cultos/${service.id}`);
  await page.getByRole('button', { name: 'Editar equipe', exact: true }).click();
  let dialog = page.getByRole('dialog');
  await expect(dialog.getByRole('checkbox', { name: `Selecionar ${archived.name}`, exact: true })).toBeChecked();
  await expect(dialog.locator('.service-batch-person').filter({ hasText: archived.name })).toContainText('Fora da equipe ativa');
  await dialog.getByRole('button', { name: 'Salvar equipe', exact: true }).click();
  await expect(dialog).toBeHidden();
  expect(mock.data.services.find(item => item.id === service.id)!.assignments).toEqual(originalAssignments);
  await page.goto('/cultos');
  await page.getByRole('button', { name: 'Novo culto', exact: true }).click();
  dialog = page.getByRole('dialog');
  await dialog.getByRole('button', { name: 'Selecionar equipe', exact: true }).click();
  await expect(dialog.getByRole('checkbox', { name: `Selecionar ${archived.name}`, exact: true })).toHaveCount(0);
  await dialog.getByRole('button', { name: 'Cancelar', exact: true }).click();
});
