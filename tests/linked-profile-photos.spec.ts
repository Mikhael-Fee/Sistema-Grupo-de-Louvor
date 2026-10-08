import { expect, test, type Locator, type Page } from '@playwright/test';
import { setupMockMinistry, type MockMinistry } from './fixtures';

test.use({ trace: 'off', screenshot: 'off' });

/** Seed real image bytes only in the isolated Storage mock. */
async function seedPhoto(page: Page, mock: MockMinistry, ownerId: string, number: number) {
  const image = await page.evaluate(async index => {
    const backendPath = '/src/lib/backend.ts';
    const { supabase } = await import(backendPath);
    const canvas = document.createElement('canvas'); canvas.width = 24; canvas.height = 24;
    const context = canvas.getContext('2d')!;
    context.fillStyle = index % 2 ? '#d36c27' : '#333333'; context.fillRect(0, 0, 24, 24);
    context.fillStyle = '#ffffff'; context.fillRect(6, 6, 12, 12);
    return { origin: new URL(supabase.supabaseUrl).origin, data: canvas.toDataURL('image/png') };
  }, number);
  const objectId = `30000000-0000-4000-8000-${String(number).padStart(12, '0')}`;
  const path = `${ownerId}/${objectId}.png`;
  mock.storage.objects.set(path, { body: Buffer.from(image.data.split(',')[1], 'base64'), contentType: 'image/png' });
  return `${image.origin}/storage/v1/object/public/avatars/${path}`;
}

async function expectPhoto(container: Locator, url: string) {
  const image = container.locator('img').first();
  await expect(image).toHaveAttribute('src', url);
  await image.scrollIntoViewIfNeeded();
  await expect.poll(() => image.evaluate(element => (element as HTMLImageElement).naturalWidth)).toBe(24);
}

const personCard = (page: Page, name: string) => page.locator('.people-person').filter({ has: page.getByRole('heading', { name, exact: true }) });
const teamRow = (page: Page, name: string) => page.locator('.service-team-list li').filter({ has: page.getByText(name, { exact: true }) });
// The home row also contains the current member's “você” badge.
const homeTeamRow = (page: Page, name: string) => page.locator('.home-team-person').filter({ hasText: name });

async function expectNextService(page: Page, mock: MockMinistry) {
  await expect(page.getByRole('heading', { name: 'Equipe escalada', exact: true })).toBeVisible();
  await expect(page.getByRole('link', { name: 'Abrir culto', exact: true })).toHaveAttribute('href', `/cultos/${mock.data.services[0].id}`);
}

async function openAccess(page: Page, name: string) {
  await page.goto('/administracao');
  await page.getByRole('button', { name: `Editar acesso de ${name}`, exact: true }).click();
  return page.getByRole('dialog');
}

test('foto cadastrada na pessoa aparece no painel, escala, seleção de equipe e perfil sem selfie', async ({ page }) => {
  const mock = await setupMockMinistry(page);
  await page.goto('/');
  const person = mock.data.people[0];
  const personPhoto = await seedPhoto(page, mock, mock.profiles[0].id, 1);
  person.photoUrl = personPhoto;
  await mock.login();
  await expectPhoto(page.locator('.topbar-profile-link'), personPhoto);
  await expectNextService(page, mock);
  await expectPhoto(homeTeamRow(page, person.name), personPhoto);
  await page.goto(`/cultos/${mock.data.services[0].id}`);
  await expectPhoto(teamRow(page, person.name), personPhoto);
  await page.getByRole('button', { name: 'Editar equipe', exact: true }).click();
  const dialog = page.getByRole('dialog');
  await expectPhoto(dialog.locator('.service-batch-person').filter({ has: page.getByRole('checkbox', { name: `Selecionar ${person.name}`, exact: true }) }), personPhoto);
  await dialog.getByRole('button', { name: 'Cancelar', exact: true }).click();
  await page.goto('/perfil');
  await expectPhoto(page.locator('.profile-page-identity'), personPhoto);
  await expect(page.getByRole('button', { name: 'Remover foto', exact: true })).toHaveCount(0);
  expect(mock.profiles[0].photoUrl).toBeUndefined();
  expect(mock.calls.filter(call => call.method === 'POST' && /\/rpc\/(?:save_service|update_my_profile_photo|update_profile)$/.test(call.path))).toHaveLength(0);
});

test('administrador vincula selfie à pessoa; desvincular ou suspender acesso retira o fallback', async ({ page }) => {
  const mock = await setupMockMinistry(page);
  await page.goto('/');
  const target = mock.data.people[2]; // Gabriel is assigned to guitar, without a linked account.
  const account = mock.profiles[2];
  account.personId = undefined;
  const selfie = await seedPhoto(page, mock, account.id, 2);
  account.photoUrl = selfie;
  await mock.login();
  let dialog = await openAccess(page, account.name);
  const selector = dialog.getByRole('combobox', { name: /^Pessoa vinculada/ });
  await expect(selector.locator(`option[value="${mock.data.people[1].id}"]`)).toHaveJSProperty('disabled', true);
  await selector.selectOption(target.id);
  await dialog.getByRole('button', { name: 'Salvar acesso', exact: true }).click();
  await expect(dialog).toBeHidden();
  expect(mock.profiles[2].photoUrl).toBe(selfie);
  expect(mock.data.people[2].photoUrl).toBeUndefined();
  await page.goto('/pessoas');
  await expectPhoto(personCard(page, target.name), selfie);
  await page.goto('/');
  await expectNextService(page, mock);
  await expectPhoto(homeTeamRow(page, target.name), selfie);
  await page.goto(`/cultos/${mock.data.services[0].id}`);
  await expectPhoto(teamRow(page, target.name), selfie);
  dialog = await openAccess(page, account.name);
  await dialog.getByRole('combobox', { name: /^Pessoa vinculada/ }).selectOption('');
  await dialog.getByRole('button', { name: 'Salvar acesso', exact: true }).click();
  await expect(dialog).toBeHidden();
  await page.goto('/pessoas');
  await expect(personCard(page, target.name).locator('img')).toHaveCount(0);
  await page.goto('/');
  await expectNextService(page, mock);
  await expect(homeTeamRow(page, target.name).locator('img')).toHaveCount(0);
  dialog = await openAccess(page, account.name);
  await dialog.getByRole('combobox', { name: /^Pessoa vinculada/ }).selectOption(target.id);
  await dialog.getByRole('checkbox', { name: 'Acesso aprovado', exact: false }).uncheck();
  await dialog.getByRole('button', { name: 'Salvar acesso', exact: true }).click();
  await expect(dialog).toBeHidden();
  await page.goto(`/cultos/${mock.data.services[0].id}`);
  await expect(teamRow(page, target.name).locator('img')).toHaveCount(0);
  await page.goto('/');
  await expectNextService(page, mock);
  await expect(homeTeamRow(page, target.name).locator('img')).toHaveCount(0);
  expect(mock.profiles[2].photoUrl).toBe(selfie);
});

test('foto própria da pessoa tem prioridade na equipe; remover selfie usa cadastro sem apagá-lo', async ({ page }) => {
  const mock = await setupMockMinistry(page);
  await page.goto('/');
  const person = mock.data.people[0];
  const personPhoto = await seedPhoto(page, mock, mock.profiles[0].id, 3);
  const selfie = await seedPhoto(page, mock, mock.profiles[0].id, 4);
  person.photoUrl = personPhoto; mock.profiles[0].photoUrl = selfie;
  await mock.login();
  await expectPhoto(page.locator('.topbar-profile-link'), selfie);
  await expectNextService(page, mock);
  await expectPhoto(homeTeamRow(page, person.name), personPhoto);
  await page.goto('/pessoas');
  await expectPhoto(personCard(page, person.name), personPhoto);
  await page.goto('/perfil');
  await page.getByRole('button', { name: 'Remover foto', exact: true }).click();
  await expectPhoto(page.locator('.photo-picker'), personPhoto);
  expect(mock.profiles[0].photoUrl).toBe(selfie);
  await page.getByRole('button', { name: 'Salvar foto', exact: true }).click();
  await expect(page.getByRole('status').filter({ hasText: 'Foto atualizada.' })).toBeVisible();
  await expectPhoto(page.locator('.topbar-profile-link'), personPhoto);
  expect(mock.profiles[0].photoUrl).toBeUndefined();
  expect(mock.data.people[0].photoUrl).toBe(personPhoto);
  expect(mock.storage.objects.has(new URL(personPhoto).pathname.split('/avatars/')[1])).toBe(true);
  expect(mock.storage.objects.has(new URL(selfie).pathname.split('/avatars/')[1])).toBe(false);
  await page.goto('/');
  await expectNextService(page, mock);
  await expectPhoto(homeTeamRow(page, person.name), personPhoto);
  await page.goto(`/cultos/${mock.data.services[0].id}`);
  await expectPhoto(teamRow(page, person.name), personPhoto);
});

test('remover foto do cadastro revela selfie vinculada também na consulta pública, sem contatos ou perfis', async ({ page }) => {
  const mock = await setupMockMinistry(page);
  await page.goto('/');
  const person = mock.data.people[0];
  const personPhoto = await seedPhoto(page, mock, mock.profiles[0].id, 5);
  const selfie = await seedPhoto(page, mock, mock.profiles[0].id, 6);
  person.photoUrl = personPhoto; person.email = 'private-contact@example.invalid'; mock.profiles[0].photoUrl = selfie;
  await mock.login();
  await page.goto('/pessoas');
  await page.getByRole('button', { name: `Editar ${person.name}`, exact: true }).click();
  const dialog = page.getByRole('dialog');
  await dialog.getByRole('button', { name: 'Remover foto', exact: true }).click();
  await expectPhoto(dialog.locator('.photo-picker'), selfie);
  await dialog.getByRole('button', { name: 'Salvar pessoa', exact: true }).click();
  await expect(dialog).toBeHidden();
  await expectPhoto(personCard(page, person.name), selfie);
  expect(mock.data.people[0].photoUrl).toBeUndefined();
  expect(mock.profiles[0].photoUrl).toBe(selfie);
  const projected = mock.calls.filter(call => call.path === '/rest/v1/rpc/read_team_profile_photos');
  expect(projected.length).toBeGreaterThan(0);
  expect(projected.every(call => call.method === 'GET')).toBe(true);
  await page.getByRole('button', { name: 'Sair', exact: true }).click();
  await page.goto('/pessoas');
  const responsePromise = page.waitForResponse(response => new URL(response.url()).pathname === '/rest/v1/rpc/read_public_ministry');
  await page.getByRole('button', { name: 'Entrar sem cadastro', exact: true }).click();
  const body = await (await responsePromise).json();
  const publicPerson = body.people.find((candidate: { id: string }) => candidate.id === person.id);
  expect(publicPerson.accountPhotoUrl).toBe(selfie);
  expect(publicPerson.email).toBe('');
  expect(Object.keys(publicPerson).sort()).toEqual(['accountPhotoUrl', 'email', 'functions', 'id', 'name', 'photoUrl']);
  expect(body.profiles).toBeUndefined();
  await expectPhoto(personCard(page, person.name), selfie);
  await expect(page.locator('a[href^="mailto:"]')).toHaveCount(0);
  await page.setViewportSize({ width: 320, height: 700 });
  await page.goto('/');
  await expectNextService(page, mock);
  await expectPhoto(homeTeamRow(page, person.name), selfie);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await expect(page.getByRole('link', { name: 'Meu perfil', exact: true })).toHaveCount(0);
  await page.goto(`/cultos/${mock.data.services[0].id}`);
  await expectPhoto(teamRow(page, person.name), selfie);
  await expect(page.getByRole('button', { name: 'Editar equipe', exact: true })).toHaveCount(0);
});
