import { expect, test, type Page } from '@playwright/test';
import { setupMockMinistry, type MockMinistry } from './fixtures';

const personCard = (page: Page, name: string) => page.locator('.people-person').filter({ has: page.getByRole('heading', { name, exact: true }) });
const teamRow = (page: Page, name: string) => page.locator('.service-team-list li').filter({ has: page.getByText(name, { exact: true }) });
const changes = (mock: MockMinistry) => mock.calls.filter(call => call.path.startsWith('/rest/v1/') && !['GET', 'OPTIONS'].includes(call.method));

async function seedPhoto(page: Page, mock: MockMinistry, ownerId: string, number: number) {
  const origin = await page.evaluate(async () => {
    const backendPath = '/src/lib/backend.ts';
    const { supabase } = await import(backendPath);
    return new URL(supabase.supabaseUrl).origin;
  });
  const path = `${ownerId}/30000000-0000-4000-8000-${String(number).padStart(12, '0')}.png`;
  mock.storage.objects.set(path, {
    body: Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/GXkAAAAASUVORK5CYII=', 'base64'),
    contentType: 'image/png',
  });
  return `${origin}/storage/v1/object/public/avatars/${path}`;
}

test('admin retira e reativa pessoa escalada sem apagar histórico, fotos ou conta aprovada', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  const mock = await setupMockMinistry(page);
  await page.goto('/');
  const person = mock.data.people[1];
  const account = mock.profiles.find(profile => profile.personId === person.id)!;
  person.photoUrl = await seedPhoto(page, mock, account.id, 31);
  account.photoUrl = await seedPhoto(page, mock, account.id, 32);
  // The first service is deliberately historical, with the existing assignments intact.
  const service = mock.data.services[0];
  service.date = '2026-01-04';
  const peopleBefore = structuredClone(mock.data.people);
  const servicesBefore = structuredClone(mock.data.services);
  const profilesBefore = structuredClone(mock.profiles);
  const photoPathsBefore = [...mock.storage.objects.keys()];
  await mock.login();
  await page.goto('/pessoas');
  await personCard(page, person.name).getByRole('button', { name: `Retirar ${person.name} da equipe`, exact: true }).click();
  let dialog = page.getByRole('dialog', { name: 'Retirar da equipe', exact: true });
  await expect(dialog).toContainText(person.name);
  await dialog.getByRole('button', { name: 'Cancelar', exact: true }).click();
  await expect(dialog).toBeHidden();
  expect(changes(mock)).toHaveLength(0);
  expect(mock.data.people.find(current => current.id === person.id)?.active).not.toBe(false);

  await personCard(page, person.name).getByRole('button', { name: `Retirar ${person.name} da equipe`, exact: true }).click();
  dialog = page.getByRole('dialog', { name: 'Retirar da equipe', exact: true });
  await dialog.getByRole('button', { name: 'Retirar da equipe', exact: true }).click();
  await expect(dialog).toBeHidden();
  await expect(personCard(page, person.name)).toHaveCount(0);
  expect(mock.data.people.find(current => current.id === person.id)).toEqual({ ...peopleBefore.find(current => current.id === person.id), active: false });
  expect(mock.data.people).toHaveLength(peopleBefore.length);
  expect(mock.data.services).toEqual(servicesBefore);
  expect(mock.profiles).toEqual(profilesBefore);
  expect([...mock.storage.objects.keys()]).toEqual(photoPathsBefore);
  expect(changes(mock)).toEqual([{ method: 'POST', path: '/rest/v1/rpc/set_person_active' }]);

  await page.goto(`/cultos/${service.id}`);
  const historicalRow = teamRow(page, person.name);
  await expect(historicalRow).toBeVisible();
  await expect(historicalRow.getByText(person.name, { exact: true })).toBeVisible();
  const historicalPhoto = historicalRow.locator('img');
  await expect(historicalPhoto).toHaveAttribute('src', person.photoUrl);
  await historicalPhoto.scrollIntoViewIfNeeded();
  await expect.poll(() => historicalPhoto.evaluate(element => (element as HTMLImageElement).naturalWidth)).toBe(1);
  await page.getByRole('button', { name: 'Editar equipe', exact: true }).click();
  const teamDialog = page.getByRole('dialog', { name: 'Editar equipe', exact: true });
  await expect(teamDialog.getByRole('checkbox', { name: `Selecionar ${person.name}`, exact: true })).toBeChecked();
  await expect(teamDialog.locator('.service-batch-person').filter({ hasText: person.name })).toContainText('Fora da equipe ativa');
  await teamDialog.getByRole('button', { name: 'Cancelar', exact: true }).click();

  await page.goto('/pessoas');
  const status = page.getByRole('combobox', { name: 'Situação na equipe', exact: true });
  await status.selectOption('archived');
  await expect(personCard(page, person.name)).toBeVisible();
  await expect(personCard(page, person.name).locator('img')).toHaveAttribute('src', person.photoUrl);
  await personCard(page, person.name).getByRole('button', { name: `Reativar ${person.name}`, exact: true }).click();
  await expect(personCard(page, person.name)).toHaveCount(0);
  await status.selectOption('active');
  await expect(personCard(page, person.name)).toBeVisible();
  expect(mock.data.people.find(current => current.id === person.id)).toEqual({ ...peopleBefore.find(current => current.id === person.id), active: true });
  expect(mock.data.services).toEqual(servicesBefore);
  expect(mock.profiles).toEqual(profilesBefore);
  expect([...mock.storage.objects.keys()]).toEqual(photoPathsBefore);
  expect(changes(mock)).toEqual([
    { method: 'POST', path: '/rest/v1/rpc/set_person_active' },
    { method: 'POST', path: '/rest/v1/rpc/set_person_active' },
  ]);
});

test('músico vê equipe ativa e escala histórica sem ações de retirar ou reativar', async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 740 });
  const mock = await setupMockMinistry(page, 'musician');
  const person = mock.data.people[1];
  person.active = false;
  const service = mock.data.services[0];
  service.date = '2026-01-04';
  await mock.login();
  await page.goto('/pessoas');
  await expect(page.getByRole('heading', { name: 'Nossa equipe', exact: true })).toBeVisible();
  await expect(personCard(page, person.name)).toHaveCount(0);
  await expect(page.locator('.people-person')).toHaveCount(mock.data.people.length - 1);
  await expect(page.getByRole('button', { name: /Retirar .+ da equipe|Reativar .+|Nova pessoa/ })).toHaveCount(0);
  await expect(page.getByRole('combobox', { name: 'Situação na equipe', exact: true })).toHaveCount(0);
  await page.goto(`/cultos/${service.id}`);
  await expect(teamRow(page, person.name)).toBeVisible();
  await expect(page.getByRole('button', { name: 'Editar equipe', exact: true })).toHaveCount(0);
  expect(mock.data.services[0].assignments.some(assignment => assignment.personId === person.id)).toBe(true);
  expect(changes(mock)).toHaveLength(0);
});
