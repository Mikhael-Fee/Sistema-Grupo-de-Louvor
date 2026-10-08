import { expect, test } from '@playwright/test';
import { loginAs, setupMockMinistry } from './fixtures';
import type { Song } from '../src/types';

test.use({ trace: 'off', screenshot: 'off' });

/** Original selectable-text PDF; reads the actual local PDF.js worker. */
function cifraPdf(title: string, artist: string, key = 'D', chords = 'D        G        A', extra: string[] = []): Buffer {
  const literal = (value: string) => value.replace(/\\/g, '\\\\').replace(/\(/g, '\\(').replace(/\)/g, '\\)');
  const lines = [title, artist, ...(key ? [`Tom: ${key}`] : []), ...extra, chords, 'Nossa cancao segue em paz'];
  const stream = `BT /F1 10 Tf 14 TL 40 750 Td\n${lines.map((line, index) => `${index ? 'T* ' : ''}(${literal(line)}) Tj`).join('\n')}\nET`;
  const objects = [
    '<< /Type /Catalog /Pages 2 0 R >>',
    '<< /Type /Pages /Kids [3 0 R] /Count 1 >>',
    '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >>',
    '<< /Type /Font /Subtype /Type1 /BaseFont /Courier /Encoding /WinAnsiEncoding >>',
    `<< /Length ${Buffer.byteLength(stream, 'latin1')} >>\nstream\n${stream}\nendstream`,
  ];
  let length = 9; const offsets: number[] = [];
  const chunks = [Buffer.from('%PDF-1.4\n')];
  objects.forEach((object, index) => {
    offsets.push(length); const chunk = Buffer.from(`${index + 1} 0 obj\n${object}\nendobj\n`, 'latin1');
    chunks.push(chunk); length += chunk.length;
  });
  chunks.push(Buffer.from(`xref\n0 6\n0000000000 65535 f \n${offsets.map(offset => `${String(offset).padStart(10, '0')} 00000 n \n`).join('')}trailer\n<< /Size 6 /Root 1 0 R >>\nstartxref\n${length}\n%%EOF\n`));
  return Buffer.concat(chunks);
}

const file = (name: string, buffer: Buffer) => ({ name, mimeType: 'application/pdf', buffer });
const savedCalls = (calls: { method: string; path: string }[]) => calls.filter(call => call.method === 'POST' && call.path === '/rest/v1/rpc/save_song');

test('lote separado lê PDFs sequencialmente, preserva válidos e desmarca repetidos', async ({ page }) => {
  const mock = await loginAs(page);
  const existingCount = mock.data.songs.length;
  await page.goto('/musicas');
  await page.getByRole('button', { name: 'Importar PDFs', exact: true }).click();
  const dialog = page.getByRole('dialog');
  await expect(dialog.getByRole('heading', { name: 'Importar vários PDFs', exact: true })).toBeVisible();
  await expect(dialog.getByLabel('Arquivo PDF da cifra', { exact: true })).toHaveCount(0);
  let maximumWorkers = 0;
  page.on('worker', () => { maximumWorkers = Math.max(maximumWorkers, page.workers().length); });
  const pdf = cifraPdf('Cancao em D', 'Equipe da fonte');
  await dialog.getByLabel('Arquivos PDF das cifras', { exact: true }).setInputFiles([
    file('cancao-d.pdf', pdf), file('mesma-cancao-renomeada.pdf', pdf),
    file('cancao-capo.pdf', cifraPdf('Cancao com capo', 'Outra equipe', 'Bb (forma dos acordes no tom de G)', 'G        C        D', ['Capotraste: 3'])),
    file('arquivo-quebrado.pdf', Buffer.from('Este arquivo nao e um PDF.')),
  ]);
  await expect(dialog).toContainText('Leitura concluída');
  await expect(dialog.getByLabel('Tom na igreja de cancao-d.pdf', { exact: true })).toHaveValue('D');
  await expect(dialog.getByLabel('Tom na igreja de cancao-capo.pdf', { exact: true })).toHaveValue('G');
  await expect(dialog.getByRole('checkbox', { name: 'Selecionar mesma-cancao-renomeada.pdf', exact: true })).not.toBeChecked();
  await expect(dialog).toContainText('não é um PDF válido');
  expect(savedCalls(mock.calls)).toHaveLength(0);
  expect(maximumWorkers).toBeLessThanOrEqual(1);
  await expect.poll(() => page.workers().length).toBe(0);
  await dialog.getByRole('button', { name: 'Salvar selecionadas (2)', exact: true }).click();
  await expect(dialog).toContainText('2 músicas salvas nesta tentativa.');
  expect(mock.data.songs).toHaveLength(existingCount + 2);
  expect(mock.data.songs.find(song => song.title === 'Cancao em D')?.churchKey).toBe('D');
  expect(mock.data.songs.find(song => song.title === 'Cancao com capo')?.content).toContain('[G]');
  expect(savedCalls(mock.calls)).toHaveLength(2);
  await expect(dialog.getByRole('checkbox', { name: 'Selecionar cancao-d.pdf', exact: true })).toBeDisabled();
});

test('falha parcial após gravar mantém UUID no retry e não repete músicas salvas', async ({ page }) => {
  const mock = await loginAs(page);
  const originalCount = mock.data.songs.length;
  const attemptedIds: string[] = [];
  let failOnce = true;
  await page.route('**/rest/v1/rpc/save_song', async route => {
    const body = route.request().postDataJSON() as { p_song: Song };
    attemptedIds.push(body.p_song.id);
    if (body.p_song.title === 'Segunda cancao' && failOnce) {
      failOnce = false;
      // Model an ambiguous response: the server committed, but the client
      // receives a failure. Retrying must use the exact same entity ID.
      mock.data.songs.push(structuredClone(body.p_song));
      return route.fulfill({ status: 500, contentType: 'application/json', body: JSON.stringify({ code: 'test_response_lost', message: 'Conexao interrompida depois da gravacao.' }) });
    }
    return route.fallback();
  });
  await page.goto('/musicas');
  await page.getByRole('button', { name: 'Importar PDFs', exact: true }).click();
  const dialog = page.getByRole('dialog');
  await dialog.getByLabel('Arquivos PDF das cifras', { exact: true }).setInputFiles([
    file('primeira.pdf', cifraPdf('Primeira cancao', 'Equipe A')),
    file('segunda.pdf', cifraPdf('Segunda cancao', 'Equipe B', 'E', 'E        A        B')),
  ]);
  await expect(dialog).toContainText('Leitura concluída');
  await dialog.getByRole('button', { name: 'Salvar selecionadas (2)', exact: true }).click();
  await expect(dialog).toContainText('1 falha');
  await expect(dialog.getByRole('checkbox', { name: 'Selecionar primeira.pdf', exact: true })).toBeDisabled();
  await dialog.getByRole('button', { name: 'Salvar selecionadas (1)', exact: true }).click();
  await expect(dialog).toContainText('1 música salva nesta tentativa.');
  expect(attemptedIds).toHaveLength(3);
  expect(attemptedIds[0]).not.toBe(attemptedIds[1]);
  expect(attemptedIds[1]).toBe(attemptedIds[2]);
  expect(mock.data.songs).toHaveLength(originalCount + 2);
  expect(mock.data.songs.filter(song => song.title === 'Segunda cancao')).toHaveLength(1);
});

test('revisão em 320px preenche tom provável e recusa seleção acima de 20 PDFs', async ({ page }) => {
  const mock = await loginAs(page);
  await page.setViewportSize({ width: 320, height: 700 });
  await page.goto('/musicas');
  await page.getByRole('button', { name: 'Importar PDFs', exact: true }).click();
  const dialog = page.getByRole('dialog');
  const input = dialog.getByLabel('Arquivos PDF das cifras', { exact: true });
  await input.setInputFiles(Array.from({ length: 21 }, (_, index) => file(`arquivo-${index}.pdf`, cifraPdf('Limite', 'Equipe'))));
  await expect(dialog.getByRole('alert')).toContainText('20 PDFs');
  await expect(dialog.getByRole('textbox', { name: /^Título de / })).toHaveCount(0);
  await input.setInputFiles(file('sem-tom.pdf', cifraPdf('Cancao sem tom', 'Equipe original', '', 'G     A     D     Bm     C')));
  await expect(dialog).toContainText('Leitura concluída');
  await expect(dialog.getByLabel('Tom na igreja de sem-tom.pdf', { exact: true })).toHaveValue('D');
  await expect(dialog).toContainText('Tom provável: D maior');
  await expect(dialog).toContainText('Possíveis empréstimos: C');
  await expect(dialog.getByRole('button', { name: 'Salvar selecionadas (1)', exact: true })).toBeEnabled();
  expect(await dialog.evaluate(element => element.scrollWidth <= element.clientWidth + 1)).toBe(true);
  expect(savedCalls(mock.calls)).toHaveLength(0);
});

for (const role of ['guest', 'musician'] as const) test(`${role} não recebe ação para importar vários PDFs`, async ({ page }) => {
  const mock = await setupMockMinistry(page, role === 'guest' ? 'admin' : role);
  if (role === 'musician') await mock.login();
  await page.goto('/musicas');
  if (role === 'guest') await page.getByRole('button', { name: 'Entrar sem cadastro', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Biblioteca de músicas', exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Importar PDFs', exact: true })).toHaveCount(0);
  expect(savedCalls(mock.calls)).toHaveLength(0);
});
