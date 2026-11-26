import { expect, test, type Page } from '@playwright/test';
import { setupMockMinistry } from './fixtures';

test.use({ trace: 'off', screenshot: 'off' });
const SHOTS = process.env.MEMBER_PROFILE_SHOTS;

async function shot(page: Page, name: string, fullPage = true) {
  if (SHOTS) await page.screenshot({ path: `${SHOTS}/${name}.png`, fullPage });
}

function todayParts() {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Sao_Paulo',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(new Date());
  const part = (type: string) => parts.find(value => value.type === type)!.value;
  return { year: Number(part('year')), month: Number(part('month')), day: Number(part('day')) };
}

test('membro edita o próprio perfil, salva tons e aparece nos aniversariantes', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  const mock = await setupMockMinistry(page, 'musician');
  const me = mock.data.people[0];
  const [first, second] = mock.data.songs;
  // A past service, so history and "you played it" have something to show.
  mock.data.services.push({
    id: '40000000-0000-4000-8000-000000000099',
    date: '2026-01-11',
    time: '18:00',
    type: 'Culto de Domingo',
    notes: '',
    assignments: [{ id: '50000000-0000-4000-8000-000000000099', personId: me.id, function: 'Voz' }],
    repertoire: [{ id: '60000000-0000-4000-8000-000000000099', songId: first.id, key: 'G', notes: '' }],
  });
  // A few recent services, so the six-month chart has bars.
  [12, 40, 47, 75, 110].forEach((daysAgo, index) => {
    const date = new Date(Date.now() - daysAgo * 86_400_000).toISOString().slice(0, 10);
    mock.data.services.push({
      id: `40000000-0000-4000-8000-0000000001${index}0`,
      date,
      time: '18:00',
      type: 'Culto de Domingo',
      notes: '',
      assignments: [{ id: `50000000-0000-4000-8000-0000000001${index}0`, personId: me.id, function: index % 2 ? 'Violão' : 'Voz' }],
      repertoire: [{ id: `60000000-0000-4000-8000-0000000001${index}0`, songId: mock.data.songs[index % 3].id, key: 'G', notes: '' }],
    });
  });
  mock.data.songKeys = [{ personId: me.id, songId: second.id, key: 'A' }];
  await mock.login();
  await page.goto('/perfil');
  for (const title of ['Minhas próximas escalas', 'Meu histórico'])
    await expect(page.getByRole('heading', { name: title, exact: true })).toBeVisible();
  await shot(page, 'perfil-geral');
  await page.getByRole('tab', { name: 'Músicas' }).click();
  for (const title of ['Para ensaiar', 'Meus tons']) await expect(page.getByRole('heading', { name: title, exact: true })).toBeVisible();
  await expect(page.getByLabel(`Meu tom em ${second.title}`)).toHaveValue('A');
  await page.getByRole('tab', { name: 'Meus dados' }).click();
  await expect(page).toHaveURL(/aba=dados/);

  const { month, day } = todayParts();
  const about = page.locator('section').filter({ has: page.getByRole('heading', { name: 'Sobre mim', exact: true }) });
  // A function already in a scale cannot be removed by the member.
  await about.getByText('Violão', { exact: true }).click();
  await about.getByRole('button', { name: 'Salvar meus dados' }).click();
  await expect(about.getByText(/está numa escala/)).toBeVisible();
  await about.getByText('Violão', { exact: true }).click();

  await about.getByText('Teclado', { exact: true }).click();
  await about.getByLabel('Dia do aniversário').selectOption(String(day));
  await about.getByLabel('Mês').selectOption(String(month));
  await about.getByLabel(/WhatsApp/).fill('(11) 98765-4321');
  await about.getByRole('button', { name: 'Salvar meus dados' }).click();
  await expect(about.getByRole('status')).toHaveText(/Dados atualizados/);
  const saved = mock.data.people.find(person => person.id === me.id)!;
  expect(saved.functions).toEqual(['Voz', 'Teclado', 'Violão']);
  expect([saved.birthMonth, saved.birthDay, saved.whatsapp]).toEqual([month, day, '5511987654321']);
  await expect(page.getByRole('link', { name: 'WhatsApp de Mikhael' })).toHaveAttribute('href', 'https://wa.me/5511987654321');
  await page.evaluate(() => scrollTo(0, 0));
  await shot(page, 'perfil-dados');
  await page.getByRole('tab', { name: 'Músicas' }).click();

  const keys = page.locator('section').filter({ has: page.getByRole('heading', { name: 'Meus tons', exact: true }) });
  await keys.getByLabel('Música').selectOption({ label: first.title });
  await keys
    .locator('.member-key-form')
    .getByLabel(/Meu tom/)
    .selectOption('E');
  await keys.getByRole('button', { name: 'Adicionar tom' }).click();
  await expect(page.getByLabel(`Meu tom em ${first.title}`)).toHaveValue('E');
  expect(mock.data.songKeys).toContainEqual({ personId: me.id, songId: first.id, key: 'E' });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.evaluate(() => scrollTo(0, 0));
  await shot(page, 'perfil-musicas');
  await page.getByRole('tab', { name: 'Visão geral' }).click();
  await page.evaluate(() => document.documentElement.setAttribute('data-theme', 'dark'));
  await shot(page, 'perfil-geral-escuro');
  await page.evaluate(() => document.documentElement.setAttribute('data-theme', 'light'));
  await page.setViewportSize({ width: 1280, height: 900 });
  await shot(page, 'perfil-computador');
  await page.setViewportSize({ width: 390, height: 844 });

  await page.goto('/');
  const birthdays = page.locator('section').filter({ has: page.getByRole('heading', { name: 'Aniversariantes da semana' }) });
  await expect(birthdays.getByText('Hoje! 🎉')).toBeVisible();
  await shot(page, 'inicio-aniversario', false);
});

test('líder vê tom de quem canta, contagem no mês, mini perfil e indisponível sem "aguardando"', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 900 });
  const mock = await setupMockMinistry(page, 'admin');
  const service = mock.data.services[0];
  const helena = mock.data.people[4];
  const lucas = mock.data.people[3];
  const firstSong = mock.data.songs.find(song => song.id === service.repertoire[0].songId)!;
  const ownKey = firstSong.churchKey === 'E' ? 'F' : 'E';
  mock.data.songKeys = [{ personId: helena.id, songId: firstSong.id, key: ownKey }];
  mock.data.unavailability = [{ id: crypto.randomUUID(), personId: lucas.id, date: service.date, note: 'Viagem' }];
  await mock.login();

  await page.goto(`/cultos/${service.id}`);
  await expect(page.getByText('0 confirmados · 1 não poderão · 5 aguardando')).toBeVisible();
  const lucasRow = page.locator('.service-team-list li').filter({ hasText: lucas.name });
  await expect(lucasRow.getByText('Marcou indisponível')).toBeVisible();
  await expect(lucasRow.getByText('Aguardando')).toHaveCount(0);
  await shot(page, 'culto-equipe-indisponivel', false);

  await page
    .getByRole('button', { name: `Editar tom e observação de ${firstSong.title}` })
    .first()
    .click();
  await expect(page.getByText(`(voz neste culto) canta em`)).toBeVisible();
  await page.getByRole('button', { name: `Usar ${ownKey}` }).click();
  await expect(page.getByRole('combobox').filter({ hasText: ownKey }).first()).toHaveValue(ownKey);
  await shot(page, 'culto-tom-sugerido', false);
  await page.getByRole('button', { name: 'Cancelar' }).click();

  await page.getByRole('button', { name: 'Editar equipe' }).click();
  await expect(page.locator('.service-batch-month').first()).toHaveText(/neste mês/);
  await shot(page, 'escala-justa', false);
  await page.keyboard.press('Escape');

  await page.goto('/pessoas');
  await page.getByRole('button', { name: helena.name, exact: true }).click();
  const dialog = page.getByRole('dialog', { name: `Perfil de ${helena.name}` });
  await expect(dialog.getByRole('heading', { name: `Tons de ${helena.name}` })).toBeVisible();
  await expect(dialog.getByText(firstSong.title)).toBeVisible();
  await shot(page, 'equipe-mini-perfil', false);
});

test('sem a atualização 010 do banco, o perfil continua funcionando sem tons e sem edição dos dados', async ({ page }) => {
  const mock = await setupMockMinistry(page, 'musician');
  await page.route('**/rest/v1/person_song_keys**', route =>
    route.fulfill({
      status: 404,
      contentType: 'application/json',
      body: JSON.stringify({ code: 'PGRST205', message: "Could not find the table 'public.person_song_keys' in the schema cache" }),
    }),
  );
  await mock.login();
  await page.goto('/perfil');
  await expect(page.getByRole('heading', { name: 'Minhas próximas escalas', exact: true })).toBeVisible();
  await page.getByRole('tab', { name: 'Músicas' }).click();
  await expect(page.getByRole('heading', { name: 'Meus tons', exact: true })).toHaveCount(0);
  await page.getByRole('tab', { name: 'Meus dados' }).click();
  await expect(page.getByRole('heading', { name: 'Sobre mim', exact: true })).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Salvar foto', exact: true })).toBeVisible();
});
