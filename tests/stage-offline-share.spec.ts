import { expect, test } from '@playwright/test';
import { setupMockMinistry } from './fixtures';

test.use({ trace: 'off', screenshot: 'off' });

test('sem internet, o app abre os dados salvos no aparelho e bloqueia edições', async ({ page }) => {
  const mock = await setupMockMinistry(page, 'admin');
  await mock.login();
  const service = mock.data.services[0];
  await expect(page.getByRole('link', { name: 'Abrir culto', exact: true })).toBeVisible();
  // Every Supabase request now fails as if the phone had no signal.
  await page.route(/\/(auth|rest|storage)\/v1\//, route => route.abort('internetdisconnected'));
  await page.reload();
  await expect(page.getByText(/Sem conexão\. Mostrando os dados salvos neste aparelho/)).toBeVisible({ timeout: 45_000 });
  await page.getByRole('link', { name: 'Abrir culto', exact: true }).click();
  await expect(page.getByRole('heading', { name: service.type, level: 1 })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Editar culto' })).toHaveCount(0);
  const first = mock.data.songs.find(song => song.id === service.repertoire[0].songId)!;
  await page
    .getByRole('link', { name: new RegExp(first.title) })
    .first()
    .click();
  await expect(page.getByRole('heading', { name: first.title, level: 1 })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Editar música' })).toHaveCount(0);
});

test('com o aparelho desconectado, abre a cópia salva na hora e recarrega quando a internet volta', async ({ page }) => {
  const mock = await setupMockMinistry(page, 'musician');
  await mock.login();
  await expect(page.getByRole('link', { name: 'Abrir culto', exact: true })).toBeVisible();
  await page.addInitScript(() => {
    const state = { online: false };
    Object.defineProperty(Navigator.prototype, 'onLine', { configurable: true, get: () => state.online });
    (window as unknown as { goOnline: () => void }).goOnline = () => {
      state.online = true;
      window.dispatchEvent(new Event('online'));
    };
  });
  const blocked = (route: import('@playwright/test').Route) => route.abort('internetdisconnected');
  await page.route(/\/(auth|rest|storage)\/v1\//, blocked);
  await page.reload();
  await expect(page.getByText(/Sem conexão\. Mostrando os dados salvos neste aparelho/)).toBeVisible({ timeout: 3_000 });
  mock.data.services[0].type = 'Culto atualizado online';
  await page.unroute(/\/(auth|rest|storage)\/v1\//, blocked);
  await page.evaluate(() => (window as unknown as { goOnline: () => void }).goOnline());
  await expect(page.getByText(/Mostrando os dados salvos/)).toHaveCount(0);
  await expect(page.getByRole('heading', { name: 'Culto atualizado online', level: 2 })).toBeVisible();
});

test('sair apaga a cópia guardada no aparelho', async ({ page }) => {
  const mock = await setupMockMinistry(page, 'musician');
  await mock.login();
  await expect.poll(() => page.evaluate(() => localStorage.getItem('candeia.offline.v1') !== null)).toBe(true);
  await page.setViewportSize({ width: 1200, height: 900 });
  await page.getByRole('button', { name: 'Sair' }).click();
  await expect.poll(() => page.evaluate(() => localStorage.getItem('candeia.offline.v1'))).toBeNull();
});

test('modo palco: próxima música do repertório, rolagem automática e leitura mantida', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 700 });
  const mock = await setupMockMinistry(page, 'musician');
  const service = mock.data.services[0];
  const [first, second] = service.repertoire.map(item => mock.data.songs.find(song => song.id === item.songId)!);
  first.content = Array.from({ length: 80 }, (_, index) => `[G]Linha ${index + 1} da canção`).join('\n');
  await mock.login();
  await page.goto(`/musicas/${first.id}?service=${service.id}&item=${service.repertoire[0].id}`);
  await expect(page.getByText(`Música 1 de ${service.repertoire.length}`)).toBeVisible();
  await expect(page.getByLabel('Música anterior do repertório')).toHaveCount(0);
  await page.getByRole('button', { name: 'Entrar no modo leitura' }).click();
  const reader = page.getByRole('dialog', { name: `Leitura de ${first.title}` });
  await expect(reader).toBeVisible();
  await page.getByRole('button', { name: 'Rolar' }).click();
  await expect.poll(() => reader.evaluate(element => element.scrollTop)).toBeGreaterThan(20);
  await page.getByRole('button', { name: 'Pausar' }).click();
  await page.getByLabel('Próxima música do repertório').click();
  await expect(page.getByRole('dialog', { name: `Leitura de ${second.title}` })).toBeVisible();
  await expect(page).toHaveURL(new RegExp(`/musicas/${second.id}\\?service=${service.id}&item=${service.repertoire[1].id}`));
  await expect(page.getByLabel('Música anterior do repertório')).toBeVisible();
});

test('o tamanho da letra escolhido vale para as próximas músicas', async ({ page }) => {
  const mock = await setupMockMinistry(page, 'musician');
  await mock.login();
  const [first, second] = mock.data.songs;
  await page.goto(`/musicas/${first.id}`);
  await page.getByRole('button', { name: 'Aumentar tamanho da letra', exact: true }).click();
  await page.getByRole('button', { name: 'Aumentar tamanho da letra', exact: true }).click();
  await expect(page.locator('.song-sheet')).toHaveCSS('font-size', '22px');
  await page.goto(`/musicas/${second.id}`);
  await expect(page.locator('.song-sheet')).toHaveCSS('font-size', '22px');
});

test('compartilhar escala e repertório no WhatsApp', async ({ page }) => {
  const mock = await setupMockMinistry(page, 'musician');
  await mock.login();
  const service = mock.data.services[0];
  await page.goto(`/cultos/${service.id}`);
  const link = page.getByRole('link', { name: 'Enviar escala e repertório no WhatsApp' });
  const href = await link.getAttribute('href');
  expect(href).toMatch(/^https:\/\/wa\.me\/\?text=/);
  expect(href).toContain('%0A');
  const text = new URL(href!).searchParams.get('text')!;
  expect(text).toContain(`*${service.type}*`);
  expect(text.split('\n').length).toBeGreaterThan(8);
  const firstSong = mock.data.songs.find(song => song.id === service.repertoire[0].songId)!;
  expect(text).toContain(`1. ${firstSong.title} · Tom *${service.repertoire[0].key}*`);
  expect(text).toContain(`/cultos/${service.id}`);
});

test('biblioteca encontra músicas por um trecho da letra e mostra a linha encontrada', async ({ page }) => {
  const mock = await setupMockMinistry(page, 'musician');
  await mock.login();
  await page.goto('/musicas');
  await page.getByLabel('Buscar por título, artista ou trecho da letra').fill('vida recomecar');
  const rows = page.locator('.songs-row');
  await expect(rows).toHaveCount(1);
  await expect(rows.first().locator('.songs-lyric-hit mark')).toHaveText('vida recomeçar');
  // A title match shows no lyric line.
  await page.getByLabel('Buscar por título, artista ou trecho da letra').fill('Casa de paz');
  await expect(rows.first().locator('.songs-lyric-hit')).toHaveCount(0);
});

test('integrante confirma presença, marca data indisponível e o líder vê os avisos', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 860 });
  const mock = await setupMockMinistry(page, 'musician');
  const me = mock.data.people[0];
  const service = mock.data.services[0];
  if (!service.assignments.some(item => item.personId === me.id))
    service.assignments.push({ id: crypto.randomUUID(), personId: me.id, function: me.functions[0] });
  await mock.login();
  // Home: answer for the next service.
  await page.getByRole('button', { name: 'Confirmar presença' }).click();
  await expect(page.getByRole('group', { name: 'Sua presença neste culto' }).getByText('Confirmado')).toBeVisible();
  expect(service.assignments.filter(item => item.personId === me.id).every(item => item.status === 'confirmed')).toBe(true);
  await page.getByRole('button', { name: 'Não poderei' }).click();
  await page.getByLabel(/Motivo/).fill('Viagem');
  await page.getByRole('button', { name: 'Avisar que não poderei' }).click();
  await expect(page.getByText('Motivo: Viagem')).toBeVisible();
  // Profile: mark the date of the next service as unavailable.
  await page.goto('/perfil?aba=ajustes');
  await page.getByLabel('Data', { exact: true }).fill(service.date);
  await page.getByLabel(/Motivo/).fill('Casamento');
  await page.getByRole('button', { name: 'Marcar data' }).click();
  await expect(page.getByText('Casamento')).toBeVisible();
  expect(mock.data.unavailability).toEqual([expect.objectContaining({ personId: me.id, date: service.date, note: 'Casamento' })]);
  // Leader sees the answers on the service and the warning in the team picker.
  await page.setViewportSize({ width: 1200, height: 900 });
  await mock.login('leader');
  await page.goto(`/cultos/${service.id}`);
  const row = page.locator('.service-team-list li').filter({ hasText: me.name }).first();
  await expect(row.getByText('Não poderá')).toBeVisible();
  // The answer already says it; the unavailable date does not add a second badge.
  await expect(row.getByText('Marcou indisponível')).toHaveCount(0);
  await page.getByRole('button', { name: /Editar equipe|Selecionar equipe/ }).click();
  await expect(page.getByText('Indisponível neste dia: Casamento').first()).toBeVisible();
});

test('sem a atualização do banco, o app funciona sem os botões de presença', async ({ page }) => {
  const mock = await setupMockMinistry(page, 'musician');
  await page.route('**/rest/v1/unavailability**', route =>
    route.fulfill({
      status: 404,
      contentType: 'application/json',
      body: JSON.stringify({ code: 'PGRST205', message: "Could not find the table 'public.unavailability' in the schema cache" }),
    }),
  );
  await mock.login();
  await expect(page.getByRole('link', { name: 'Abrir culto', exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Confirmar presença' })).toHaveCount(0);
  await page.goto('/perfil?aba=ajustes');
  await expect(page.getByText('Datas em que não posso servir')).toHaveCount(0);
});

test('ao salvar a equipe, o app pede o envio dos avisos e o perfil oferece ativar notificações', async ({ page }) => {
  const mock = await setupMockMinistry(page, 'leader');
  const service = mock.data.services.find(item => item.assignments.length)!;
  const notices: unknown[] = [];
  await page.route('**/.netlify/functions/notify-assignments', route => {
    if (route.request().method() === 'POST')
      notices.push({ body: route.request().postDataJSON(), auth: route.request().headers().authorization });
    return route.fulfill({
      contentType: 'application/json',
      body: JSON.stringify(route.request().method() === 'POST' ? { emails: 1, pushes: 0, configured: true } : { publicKey: null }),
    });
  });
  await mock.login();
  await page.goto(`/cultos/${service.id}`);
  await page.getByRole('button', { name: 'Editar equipe', exact: true }).click();
  const dialog = page.getByRole('dialog');
  await dialog.getByRole('button', { name: 'Salvar equipe', exact: true }).click();
  await expect(dialog).toBeHidden();
  await expect.poll(() => notices).toEqual([{ body: { serviceId: service.id }, auth: expect.stringMatching(/^Bearer /) }]);
  await page.goto('/perfil?aba=ajustes');
  await expect(page.getByRole('heading', { name: 'Avisos de escala neste aparelho' })).toBeVisible();
});
