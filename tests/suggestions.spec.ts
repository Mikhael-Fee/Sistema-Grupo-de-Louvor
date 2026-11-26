import { expect, test, type Page } from '@playwright/test';
import { loginAs, setupMockMinistry, type MockSuggestion } from './fixtures';

const PIXEL = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/GXkAAAAASUVORK5CYII=', 'base64');
const video = (id: string, title: string, channel: string) => ({
  id,
  title,
  channel,
  url: `https://www.youtube.com/watch?v=${id}`,
  thumbnailUrl: `https://i.ytimg.com/vi/${id}/hqdefault.jpg`,
});
const RESULTS = [
  video('Lugar_Secr1', 'Gabriela Rocha - Lugar Secreto (Ao Vivo)', 'Gabriela Rocha'),
  video('Outro_Video', 'Lugar Secreto | Cover acústico', 'Canal Qualquer'),
];

async function stubYoutube(page: Page) {
  await page.route('https://i.ytimg.com/**', route => route.fulfill({ contentType: 'image/png', body: PIXEL }));
  await page.route('**/.netlify/functions/youtube-search?**', route =>
    route.fulfill({ contentType: 'application/json', body: JSON.stringify({ results: RESULTS }) }),
  );
}
const daysAgo = (days: number) => new Date(Date.now() - days * 86_400_000).toISOString();
function seedSuggestion(over: Partial<MockSuggestion>): MockSuggestion {
  return {
    id: crypto.randomUUID(),
    title: 'Canção antiga',
    artist: 'Ministério Exemplo',
    videoId: 'AAAAAAAAAAA',
    videoTitle: '',
    channel: '',
    status: 'suggested',
    statusNote: '',
    createdBy: '20000000-0000-4000-8000-000000000002',
    authorName: 'Ana Clara',
    createdAt: daysAgo(2),
    statusChangedAt: daysAgo(2),
    tagIds: [],
    voters: [],
    comments: [],
    ...over,
  };
}

test('membro sugere pelo YouTube com etiqueta, curte e comenta', async ({ page }) => {
  const mock = await loginAs(page, 'musician');
  await stubYoutube(page);
  await page.goto('/sugestoes');
  await expect(page.getByRole('heading', { name: 'Sugestões de louvores' })).toBeVisible();
  await page.getByRole('button', { name: 'Sugerir louvor' }).first().click();
  const dialog = page.getByRole('dialog');
  await dialog.getByLabel('Nome do louvor ou artista').fill('lugar secreto');
  await dialog.getByRole('button', { name: 'Buscar' }).click();
  await dialog.getByRole('button', { name: `Escolher ${RESULTS[0].title}` }).click();
  await expect(dialog.getByLabel('Louvor')).toHaveValue('Lugar Secreto');
  await expect(dialog.getByLabel('Artista ou ministério')).toHaveValue('Gabriela Rocha');
  await dialog.getByRole('button', { name: 'Adoração' }).click();
  await dialog.getByRole('button', { name: 'Publicar sugestão' }).click();
  await expect(dialog).toBeHidden();

  const card = page.locator('article', { hasText: 'Lugar Secreto' });
  await expect(card.getByText('Sugerida', { exact: true })).toBeVisible();
  await expect(card.getByText('Você sugeriu')).toBeVisible();
  await expect(card.getByText('Adoração')).toBeVisible();
  expect(mock.suggestions![0]).toMatchObject({ videoId: 'Lugar_Secr1', tagIds: ['10000000-0000-4000-8000-000000000202'] });

  await card.getByRole('button', { name: /^Curtir Lugar Secreto/ }).click();
  await expect(card.getByRole('button', { name: /^Descurtir Lugar Secreto/ })).toHaveText('1');
  await card.getByRole('button', { name: /^Comentários/ }).click();
  await card.getByLabel('Escrever comentário').fill('Boa para a Santa Ceia');
  await card.getByRole('button', { name: 'Enviar comentário' }).click();
  await expect(card.getByText('Boa para a Santa Ceia')).toBeVisible();
  // Members never see the leader's decision buttons.
  await expect(card.getByRole('button', { name: 'Aprovar' })).toHaveCount(0);
});

test('avisa repetidas: mesmo vídeo em aberto pede curtida, mesmo nome na Biblioteca só avisa', async ({ page }) => {
  const mock = await setupMockMinistry(page, 'musician');
  mock.suggestions!.push(seedSuggestion({ title: 'Lugar Secreto', videoId: 'Lugar_Secr1' }));
  mock.data.songs[0].title = 'Lugar Secreto';
  await mock.login();
  await stubYoutube(page);
  await page.goto('/sugestoes');
  await page.getByRole('button', { name: 'Sugerir louvor' }).first().click();
  const dialog = page.getByRole('dialog');
  await dialog.getByLabel('Nome do louvor ou artista').fill('lugar secreto');
  await dialog.getByRole('button', { name: 'Buscar' }).click();
  await expect(dialog.getByText('Já sugerida por Ana Clara')).toBeVisible();
  await dialog.getByRole('button', { name: `Escolher ${RESULTS[0].title}` }).click();
  await expect(dialog.getByText('Este vídeo já foi sugerido por Ana Clara.')).toBeVisible();
  await expect(dialog.getByRole('button', { name: 'Publicar sugestão' })).toBeDisabled();
  await dialog.getByRole('button', { name: 'Trocar' }).click();
  await dialog.getByRole('button', { name: `Escolher ${RESULTS[1].title}` }).click();
  await dialog.getByLabel('Louvor').fill('Lugar secreto');
  await expect(dialog.getByText('já está na Biblioteca')).toBeVisible();
  await expect(dialog.getByRole('button', { name: 'Publicar sugestão' })).toBeEnabled();
  await dialog.getByRole('button', { name: 'Trocar' }).click();
  await dialog.getByRole('button', { name: `Escolher ${RESULTS[0].title}` }).click();
  await dialog.getByRole('button', { name: 'Curtir a sugestão existente' }).click();
  await expect(dialog).toBeHidden();
  expect(mock.suggestions![0].voters).toHaveLength(1);
});

test('líder aprova: vira música na Biblioteca com cifra pendente e sai de Em aberto', async ({ page }) => {
  const mock = await setupMockMinistry(page, 'leader');
  mock.suggestions!.push(seedSuggestion({ title: 'Ninguém Explica Deus', artist: 'Preto no Branco', videoId: 'Ninguem_Exp' }));
  mock.suggestions!.push(seedSuggestion({ title: 'Recusável', videoId: 'Recusavel_1' }));
  await mock.login();
  await stubYoutube(page);
  await page.goto('/sugestoes');
  const card = page.locator('article', { hasText: 'Ninguém Explica Deus' });
  await card.getByRole('button', { name: 'Em avaliação' }).click();
  await expect(card.getByText('Em avaliação', { exact: true }).first()).toBeVisible();
  await card.getByRole('button', { name: 'Aprovar' }).click();
  const dialog = page.getByRole('dialog');
  await dialog.getByLabel('Tom da igreja').selectOption('G');
  await dialog.getByRole('button', { name: 'Aprovar e adicionar' }).click();
  await expect(dialog).toBeHidden();
  await expect(card).toBeHidden();

  const other = page.locator('article', { hasText: 'Recusável' });
  await other.getByRole('button', { name: 'Recusar' }).click();
  await page
    .getByRole('dialog')
    .getByLabel(/Motivo/)
    .fill('Tom muito alto');
  await page.getByRole('dialog').getByRole('button', { name: 'Recusar' }).click();

  await page.getByRole('tab', { name: /Decididas/ }).click();
  await expect(page.getByText('Recusada: Tom muito alto')).toBeVisible();
  await page.getByRole('link', { name: /Na Biblioteca como Ninguém Explica Deus/ }).click();
  await expect(page.getByRole('heading', { name: 'Ninguém Explica Deus' })).toBeVisible();
  const song = mock.data.songs.find(item => item.title === 'Ninguém Explica Deus')!;
  expect(song).toMatchObject({ churchKey: 'G', youtubeUrl: 'https://www.youtube.com/watch?v=Ninguem_Exp' });
  await page.goto('/musicas');
  await expect(page.locator('.songs-row', { hasText: 'Ninguém Explica Deus' }).getByText('Cifra pendente')).toBeVisible();
});

test('ordena por recentes ou curtidas e arquiva sugestões paradas', async ({ page }) => {
  const mock = await setupMockMinistry(page, 'musician');
  const voters = (n: number) => Array.from({ length: n }, (_, i) => ({ userId: `u${i}`, at: daysAgo(5) }));
  mock.suggestions!.push(
    seedSuggestion({ title: 'Popular', videoId: 'Popular____', createdAt: daysAgo(6), voters: voters(4) }),
    seedSuggestion({ title: 'Nova', videoId: 'Nova_______', createdAt: daysAgo(0) }),
    seedSuggestion({ title: 'Esquecida', videoId: 'Esquecida__', createdAt: daysAgo(90), statusChangedAt: daysAgo(90) }),
    seedSuggestion({ title: 'Aprovada antiga', videoId: 'Antiga_____', status: 'approved', statusChangedAt: daysAgo(30) }),
  );
  await mock.login();
  await stubYoutube(page);
  await page.goto('/sugestoes');
  const titles = page.locator('.sug-card h3');
  await expect(titles).toHaveText(['Nova', 'Popular']);
  await page.getByRole('button', { name: 'Mais curtidas' }).click();
  await expect(titles).toHaveText(['Popular', 'Nova']);
  await page.getByRole('tab', { name: /Arquivo/ }).click();
  await expect(titles).toHaveText(['Aprovada antiga', 'Esquecida']);
});

test('sem a atualização do banco, a aba explica o que falta', async ({ page }) => {
  const mock = await setupMockMinistry(page, 'admin');
  mock.suggestions = null;
  await mock.login();
  await page.goto('/sugestoes');
  await expect(page.getByText('Rode o arquivo 011_song_suggestions.sql')).toBeVisible();
});
