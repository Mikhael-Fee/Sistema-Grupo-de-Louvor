import { expect, test, type Page } from '@playwright/test';
import { loginAs, setupMockMinistry, type MockMinistry } from './fixtures';

test.use({ trace: 'off', screenshot: 'off' });
const isWrite = (call: { method: string; path: string }) => !['GET', 'HEAD', 'OPTIONS'].includes(call.method)
  && /\/(?:rest|storage)\/v1\//.test(call.path) && !/\/rpc\/(?:get_public_access|read_public_ministry)$/.test(call.path);
const uploads = (mock: MockMinistry) => mock.calls.filter(call => call.method === 'POST' && call.path.startsWith('/storage/v1/object/avatars/'));

async function photo(page: Page) {
  const url = await page.evaluate(() => {
    const canvas = document.createElement('canvas'); canvas.width = 48; canvas.height = 32;
    const context = canvas.getContext('2d')!; context.fillStyle = '#d56825'; context.fillRect(0, 0, 48, 32);
    context.fillStyle = '#ffffff'; context.fillRect(12, 8, 24, 16);
    return canvas.toDataURL('image/png');
  });
  return { name: 'foto-original-de-teste.png', mimeType: 'image/png', buffer: Buffer.from(url.split(',')[1], 'base64') };
}

test('foto da pessoa é preparada localmente e só enviada ao confirmar Salvar pessoa', async ({ page }) => {
  const mock = await loginAs(page);
  await page.goto('/pessoas');
  await page.getByRole('button', { name: 'Nova pessoa', exact: true }).click();
  let dialog = page.getByRole('dialog');
  await dialog.getByLabel('Nome', { exact: true }).fill('Pessoa com foto');
  await dialog.getByRole('checkbox', { name: 'Voz', exact: true }).check();
  await dialog.getByLabel('Escolher foto', { exact: true }).setInputFiles(await photo(page));
  await expect(dialog.getByRole('status').filter({ hasText: 'Foto pronta.' })).toBeVisible();
  expect(uploads(mock)).toHaveLength(0);
  expect(mock.calls.filter(isWrite)).toHaveLength(0);
  await dialog.getByRole('button', { name: 'Cancelar', exact: true }).click();
  await expect(dialog).toBeHidden();
  expect(mock.storage.objects.size).toBe(0);
  await page.getByRole('button', { name: 'Nova pessoa', exact: true }).click();
  dialog = page.getByRole('dialog');
  await dialog.getByLabel('Nome', { exact: true }).fill('Pessoa com foto');
  await dialog.getByRole('checkbox', { name: 'Voz', exact: true }).check();
  await dialog.getByLabel('Escolher foto', { exact: true }).setInputFiles(await photo(page));
  await expect(dialog.getByRole('status').filter({ hasText: 'Foto pronta.' })).toBeVisible();
  await dialog.getByRole('button', { name: 'Salvar pessoa', exact: true }).click();
  await expect(dialog).toBeHidden();
  const saved = mock.data.people.find(person => person.name === 'Pessoa com foto')!;
  expect(saved.photoUrl).toMatch(/\/storage\/v1\/object\/public\/avatars\/20000000-0000-4000-8000-000000000001\/[0-9a-f-]{36}\.webp$/);
  expect(uploads(mock)).toHaveLength(1);
  expect(mock.storage.objects.size).toBe(1);
  const stored = [...mock.storage.objects.values()][0];
  expect(stored.contentType).toBe('image/webp');
  expect(stored.body.subarray(0, 4).toString()).toBe('RIFF');
  expect(stored.body.subarray(8, 12).toString()).toBe('WEBP');
  await page.reload();
  const card = page.getByRole('article').filter({ hasText: 'Pessoa com foto' });
  await expect(card.locator('img')).toHaveAttribute('src', saved.photoUrl!);
  await expect.poll(() => card.locator('img').evaluate(image => (image as HTMLImageElement).naturalWidth)).toBeGreaterThan(0);
});

test('imagem inválida mostra erro e mantém formulário sem enviar foto ou pessoa', async ({ page }) => {
  const mock = await loginAs(page);
  await page.goto('/pessoas');
  await page.getByRole('button', { name: 'Nova pessoa', exact: true }).click();
  const dialog = page.getByRole('dialog');
  await dialog.getByLabel('Escolher foto', { exact: true }).setInputFiles({ name: 'invalida.svg', mimeType: 'image/svg+xml', buffer: Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"></svg>') });
  await expect(dialog.getByRole('alert')).toContainText(/JPG|PNG|WebP|imagem|formato/i);
  expect(mock.calls.filter(isWrite)).toHaveLength(0);
  expect(mock.storage.objects.size).toBe(0);
});

test('músico atualiza e remove própria foto preservando papel, aprovação e pessoa vinculada', async ({ page }) => {
  const mock = await loginAs(page, 'musician');
  const before = structuredClone(mock.profiles[0]);
  await expect(page.locator('.topbar-profile-link')).toHaveAttribute('aria-label', 'Meu perfil');
  await page.locator('.topbar-profile-link').click();
  await expect(page.getByRole('heading', { name: 'Meu perfil', exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Salvar foto', exact: true })).toBeDisabled();
  await page.getByLabel('Escolher foto', { exact: true }).setInputFiles(await photo(page));
  await expect(page.getByRole('status').filter({ hasText: 'Foto pronta.' })).toBeVisible();
  expect(uploads(mock)).toHaveLength(0);
  await page.getByRole('button', { name: 'Salvar foto', exact: true }).click();
  await expect(page.getByRole('status').filter({ hasText: 'Foto atualizada.' })).toBeVisible();
  const saved = mock.profiles[0];
  expect(saved.photoUrl).toBeTruthy();
  expect({ ...saved, photoUrl: undefined }).toEqual({ ...before, photoUrl: undefined });
  expect(mock.data.people.find(person => person.id === before.personId)?.photoUrl).toBeUndefined();
  await expect(page.locator('.topbar-profile-link img')).toHaveAttribute('src', saved.photoUrl!);
  await page.getByRole('button', { name: 'Remover foto', exact: true }).click();
  expect(mock.profiles[0].photoUrl).toBe(saved.photoUrl);
  await page.getByRole('button', { name: 'Salvar foto', exact: true }).click();
  await expect.poll(() => mock.profiles[0].photoUrl).toBeUndefined();
  await expect(page.locator('.topbar-profile-link img')).toHaveCount(0);
  expect(mock.profiles[0].role).toBe('musician'); expect(mock.profiles[0].approved).toBe(true);
  expect(mock.calls.filter(call => call.path === '/rest/v1/rpc/update_my_profile_photo')).toHaveLength(2);
  expect(mock.calls.filter(call => call.path === '/rest/v1/rpc/update_profile')).toHaveLength(0);
});

function analyticsData(mock: MockMinistry) {
  const [person, second] = mock.data.people;
  const [song, other, third] = mock.data.songs;
  const make = (index: number, date: string, assignments: { personId: string; function: string }[], songs: string[]) => ({
    id: `90000000-0000-4000-8000-${String(index).padStart(12, '0')}`, date, time: '18:00', type: index === 3 ? 'Vigília da equipe' : 'Encontro de teste', notes: '',
    assignments: assignments.map((assignment, item) => ({ id: `a-${index}-${item}`, ...assignment })),
    repertoire: songs.map((songId, item) => ({ id: `r-${index}-${item}`, songId, key: 'G', notes: '' })),
  });
  mock.data.services = [
    make(1, '2026-10-01', [{ personId: person.id, function: 'Voz' }, { personId: person.id, function: 'Violão' }, { personId: person.id, function: 'Voz' }, { personId: second.id, function: 'Teclado' }], [song.id, song.id, other.id]),
    make(2, '2026-10-03', [{ personId: person.id, function: 'Voz' }], [song.id]),
    make(3, '2026-11-01', [{ personId: second.id, function: 'Voz' }], [third.id]),
  ];
}

async function kpi(page: Page, label: string, number: string) {
  await expect(page.getByRole('region', { name: 'Resumo das análises', exact: true }).locator('.analytics-stat').filter({ has: page.getByText(label, { exact: true }) }).locator('strong')).toHaveText(number);
}

test('gráficos deduplicam pessoa e música por culto e filtram datas sem gravar dados', async ({ page }) => {
  await page.clock.setFixedTime(new Date('2026-10-08T15:00:00Z'));
  const mock = await setupMockMinistry(page); analyticsData(mock); await mock.login();
  await page.goto('/graficos');
  await expect(page.getByRole('heading', { name: 'Gráficos', exact: true })).toBeVisible();
  await kpi(page, 'Cultos no período', '3'); await kpi(page, 'Participações na escala', '4'); await kpi(page, 'Músicas nos repertórios', '4');
  const people = page.getByRole('region', { name: 'Pessoas mais escaladas', exact: true });
  await expect(people.locator('li').filter({ hasText: 'Mikhael' }).locator('b')).toHaveText('2');
  const songs = page.getByRole('region', { name: 'Músicas mais utilizadas', exact: true });
  await expect(songs.locator('li').filter({ hasText: 'Casa de paz' }).locator('b')).toHaveText('2');
  await page.getByLabel('Filtrar gráficos por tipo de culto', { exact: true }).selectOption('Vigília da equipe');
  await kpi(page, 'Cultos no período', '1'); await kpi(page, 'Participações na escala', '1'); await kpi(page, 'Músicas nos repertórios', '1');
  await page.getByLabel('Filtrar gráficos por tipo de culto', { exact: true }).selectOption('');
  await page.getByLabel('Período das análises', { exact: true }).selectOption('custom');
  await page.getByLabel('Data inicial das análises', { exact: true }).fill('2026-10-01');
  await page.getByLabel('Data final das análises', { exact: true }).fill('2026-10-03');
  await kpi(page, 'Cultos no período', '2'); await kpi(page, 'Participações na escala', '3'); await kpi(page, 'Músicas nos repertórios', '3');
  await page.getByText('Ver números do gráfico', { exact: true }).click();
  const table = page.getByRole('table', { name: 'Planejamento por período', exact: true });
  await expect(table.getByRole('row')).toHaveCount(2);
  await expect(table.getByRole('row').last().getByRole('cell')).toHaveText(['2', '3', '3']);
  await page.getByLabel('Data final das análises', { exact: true }).fill('2026-09-30');
  await expect(page.getByRole('alert')).toContainText('data inicial');
  await page.getByLabel('Período das análises', { exact: true }).selectOption('30');
  await kpi(page, 'Cultos no período', '2');
  expect(mock.calls.filter(isWrite)).toHaveLength(0);
});

test('consulta pública vê gráficos no celular, sem e-mails ou ações de edição', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  const mock = await setupMockMinistry(page); analyticsData(mock);
  await page.goto('/graficos');
  await page.getByRole('button', { name: 'Entrar sem cadastro', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Gráficos', exact: true })).toBeVisible();
  await kpi(page, 'Cultos no período', '3');
  await page.getByLabel('Buscar músicas nas análises', { exact: true }).fill('Casa');
  await expect(page.getByRole('region', { name: 'Músicas mais utilizadas', exact: true }).locator('li')).toHaveCount(1);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await expect(page.locator('a[href^="mailto:"]')).toHaveCount(0);
  await expect(page.getByRole('button', { name: /Salvar|Nova pessoa|Editar música/ })).toHaveCount(0);
  expect(mock.calls.filter(isWrite)).toHaveLength(0);
});
