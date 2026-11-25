import { expect, test } from '@playwright/test';
import { setupMockMinistry } from './fixtures';

test('salvar uma etiqueta recarrega só as etiquetas, não o ministério inteiro', async ({ page }) => {
  const mock = await setupMockMinistry(page, 'admin');
  await mock.login('admin');
  await page.goto('/etiquetas');
  await page.getByRole('button', { name: 'Nova etiqueta' }).first().click();
  await page.getByLabel('Nome').fill('Natal');
  const before = mock.calls.length;
  await page.getByRole('button', { name: 'Salvar etiqueta' }).click();
  await expect(page.getByRole('link', { name: 'Ver músicas com a etiqueta Natal', exact: true })).toBeVisible();
  const after = mock.calls
    .slice(before)
    .filter(call => call.method === 'GET')
    .map(call => call.path.split('?')[0]);
  expect(after).toContain('/rest/v1/tags');
  for (const table of ['songs', 'people', 'services', 'assignments', 'repertoire', 'profiles'])
    expect(after).not.toContain(`/rest/v1/${table}`);
});
