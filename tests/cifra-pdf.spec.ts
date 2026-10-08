import { expect, test } from '@playwright/test';
import { deflateSync } from 'node:zlib';
import { resolve } from 'node:path';
import { loginAs, setupMockMinistry } from './fixtures';
import { stripChords } from '../src/lib/music';

test.use({ trace: 'off', screenshot: 'off' });
const SOURCE = 'https://www.cifraclub.com.br/equipe-de-teste/cancao-do-arquivo/';
const writes = (calls: { method: string; path: string }[]) => calls.filter(call => !['GET', 'HEAD', 'OPTIONS'].includes(call.method)
  && /\/(?:rest|storage)\/v1\//.test(call.path) && !/\/rpc\/(?:get_public_access|read_public_ministry)$/.test(call.path));

/** A valid, entirely original PDF fixture with real selectable Type1 text. */
function documentPdf(lines: string[], imageOnly = false): Buffer {
  const literal = (value: string) => value.replace(/\\/g, '\\\\').replace(/\(/g, '\\(').replace(/\)/g, '\\)');
  const content = imageOnly ? 'q 200 0 0 200 30 30 cm /Im0 Do Q' : `BT /F1 10 Tf 14 TL 40 750 Td\n${lines.map((line, index) => `${index ? 'T* ' : ''}(${literal(line)}) Tj`).join('\n')}\nET`;
  const stream = Buffer.from(content, 'latin1');
  const image = deflateSync(Buffer.from([255, 120, 20]));
  const objects = [
    Buffer.from('<< /Type /Catalog /Pages 2 0 R >>'),
    Buffer.from('<< /Type /Pages /Kids [3 0 R] /Count 1 >>'),
    Buffer.from(`<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << ${imageOnly ? '/XObject << /Im0 6 0 R >>' : '/Font << /F1 4 0 R >>'} >> /Contents 5 0 R >>`),
    Buffer.from('<< /Type /Font /Subtype /Type1 /BaseFont /Courier /Encoding /WinAnsiEncoding >>'),
    Buffer.concat([Buffer.from(`<< /Length ${stream.length} >>\nstream\n`), stream, Buffer.from('\nendstream')]),
    Buffer.concat([Buffer.from(`<< /Type /XObject /Subtype /Image /Width 1 /Height 1 /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /FlateDecode /Length ${image.length} >>\nstream\n`), image, Buffer.from('\nendstream')]),
  ];
  const chunks = [Buffer.from('%PDF-1.4\n')]; const offsets = [0]; let length = chunks[0].length;
  objects.forEach((object, index) => {
    offsets.push(length);
    const chunk = Buffer.concat([Buffer.from(`${index + 1} 0 obj\n`), object, Buffer.from('\nendobj\n')]);
    chunks.push(chunk); length += chunk.length;
  });
  chunks.push(Buffer.from(`xref\n0 ${objects.length + 1}\n0000000000 65535 f \n${offsets.slice(1).map(offset => `${String(offset).padStart(10, '0')} 00000 n \n`).join('')}trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${length}\n%%EOF\n`));
  return Buffer.concat(chunks);
}

test('PDF real fornece título, artista, cifra e capotraste; salva teclado Bb com uma RPC', async ({ page }) => {
  const mock = await loginAs(page);
  const pdfRequests: string[] = [];
  page.on('request', request => { if (/pdf|worker/i.test(request.url())) pdfRequests.push(request.url()); });
  await page.goto('/musicas');
  await page.getByRole('button', { name: 'Nova música', exact: true }).click();
  const dialog = page.getByRole('dialog');
  const buffer = documentPdf(['Canção do arquivo', 'Equipe da fonte', 'Tom: Bb (forma dos acordes no tom de G)', 'Capotraste: 3',
    'G           D/F#', 'Uma luz nos guia', 'Em7         C', 'Seguimos em paz', 'e|--0--2--3--|', 'B|--1--3--0--|', SOURCE]);
  await dialog.getByLabel('Arquivo PDF da cifra', { exact: true }).setInputFiles({ name: 'cifra-com-capo.pdf', mimeType: 'application/pdf', buffer });
  await expect(dialog.getByLabel('Prévia do conteúdo para importar', { exact: true })).toHaveText('[G]Uma luz nos [D/F#]guia\n[Em7]Seguimos em [C]paz');
  await expect(dialog).toContainText('Capotraste na fonte: 3ª casa');
  expect(writes(mock.calls)).toHaveLength(0);
  await dialog.getByLabel('Tom na igreja', { exact: true }).selectOption('Bb');
  const metadata = dialog.getByRole('checkbox', { name: 'Atualizar título e artista com os dados da fonte', exact: true });
  if (!await metadata.isChecked()) await metadata.check();
  await expect(dialog.getByLabel('Título', { exact: true })).toHaveValue('Canção do arquivo');
  await expect(dialog.getByLabel('Artista / compositor', { exact: true })).toHaveValue('Equipe da fonte');
  await dialog.getByRole('button', { name: 'Salvar música', exact: true }).click();
  await expect(dialog).toBeHidden();
  const saved = mock.data.songs.find(song => song.title === 'Canção do arquivo')!;
  expect(saved.content).toBe('[Bb]Uma luz nos [F/A]guia\n[Gm7]Seguimos em [Eb]paz');
  expect(saved.artist).toBe('Equipe da fonte'); expect(saved.originalKey).toBe('Bb'); expect(saved.churchKey).toBe('Bb');
  expect(saved.notes).toContain(SOURCE);
  expect(writes(mock.calls)).toEqual([{ method: 'POST', path: '/rest/v1/rpc/save_song' }]);
  expect(pdfRequests.every(url => new URL(url).origin === 'http://127.0.0.1:5173')).toBe(true);
});

test('PDF próprio sem referência permite revisar título e artista antes de salvar', async ({ page }) => {
  // Simulate the missing phone API in both the page and the real worker.
  await page.addInitScript(() => { Object.defineProperty(Promise, 'withResolvers', { value: undefined, configurable: true, writable: true }); });
  let compatibilityWorker = false;
  await page.route(/cifra-pdf-worker\.ts\?worker_file/, async route => {
    const response = await route.fetch();
    compatibilityWorker = true;
    await route.fulfill({ response, body: `Object.defineProperty(Promise, 'withResolvers', { value: undefined, configurable: true, writable: true });\n${await response.text()}` });
  });
  const mock = await loginAs(page);
  await page.goto('/musicas');
  await page.getByRole('button', { name: 'Nova música', exact: true }).click();
  const dialog = page.getByRole('dialog');
  await dialog.getByLabel('Arquivo PDF da cifra', { exact: true }).setInputFiles(resolve('tests/fixtures/cifra-chart.pdf'));
  await expect(dialog.getByLabel('Prévia do conteúdo para importar', { exact: true })).toBeVisible();
  const metadata = dialog.getByRole('checkbox', { name: 'Atualizar título e artista com os dados da fonte', exact: true });
  if (await metadata.isChecked()) await metadata.uncheck();
  await dialog.getByLabel('Título', { exact: true }).fill('Título revisado pelo músico');
  await dialog.getByLabel('Artista / compositor', { exact: true }).fill('Artista informado manualmente');
  await dialog.getByLabel('Tom na igreja', { exact: true }).selectOption('G');
  await dialog.getByRole('button', { name: 'Importar cifra e letra', exact: true }).click();
  const sheet = await dialog.getByRole('textbox', { name: /^Letra e cifra/ }).inputValue();
  expect(sheet).toContain('[G]');
  expect(sheet).toContain('[F#7(b9)]');
  expect(stripChords(sheet)).toContain('Luz nos guia e seguimos em paz');
  await dialog.getByRole('button', { name: 'Salvar música', exact: true }).click();
  await expect(dialog).toBeHidden();
  const saved = mock.data.songs.find(song => song.title === 'Título revisado pelo músico')!;
  expect(saved.artist).toBe('Artista informado manualmente');
  expect(saved.notes).toContain('Arquivo PDF');
  expect(saved.content).not.toMatch(/[eEBGDA]\|[-0-9]/);
  expect(writes(mock.calls)).toHaveLength(1);
  expect(compatibilityWorker).toBe(true);
});

test('leituras consecutivas encerram workers e preservam o rascunho; cancelar ignora respostas atrasadas', async ({ page }) => {
  test.setTimeout(120_000);
  const mock = await loginAs(page);
  await page.goto('/musicas');
  await page.getByRole('button', { name: 'Nova música', exact: true }).click();
  const dialog = page.getByRole('dialog');
  const input = dialog.getByLabel('Arquivo PDF da cifra', { exact: true });
  await dialog.getByRole('textbox', { name: /^Letra e cifra/ }).fill('[C]Conteúdo em edição');
  const file = { name: 'leitura-local.pdf', mimeType: 'application/pdf', buffer: documentPdf(['Canção local', 'Equipe local', 'Tom: C', 'C          G', 'Letra de teste original']) };
  const read = async () => {
    await input.setInputFiles(file);
    await expect(dialog).toContainText('PDF lido');
    await expect.poll(() => page.workers().length).toBe(0);
  };
  for (let i = 0; i < 3; i++) await read();
  const cdp = await page.context().newCDPSession(page);
  await cdp.send('HeapProfiler.collectGarbage');
  const before = await cdp.send('Runtime.getHeapUsage');
  for (let i = 0; i < 20; i++) await read();
  await cdp.send('HeapProfiler.collectGarbage');
  const after = await cdp.send('Runtime.getHeapUsage');
  // This bounds retained page JavaScript after warm-up, not Chrome's total RAM.
  expect(after.usedSize - before.usedSize).toBeLessThan(20 * 1024 * 1024);
  console.log(`PDF: 23 leituras, zero workers restantes; variação do heap retido ${Math.round((after.usedSize - before.usedSize) / 1024)} KiB.`);
  await expect(dialog.getByRole('textbox', { name: /^Letra e cifra/ })).toHaveValue('[C]Conteúdo em edição');
  expect(writes(mock.calls)).toHaveLength(0);

  let release!: () => void;
  const gate = new Promise<void>(resolveGate => { release = resolveGate; });
  await page.route(/pdf.*worker|worker.*pdf/, async route => { await gate; await route.continue(); });
  await input.setInputFiles(file);
  await expect(dialog.getByRole('button', { name: 'Cancelar leitura', exact: true })).toBeVisible();
  await dialog.getByRole('button', { name: 'Cancelar leitura', exact: true }).click();
  release();
  await expect.poll(() => page.workers().length).toBe(0);
  await expect(dialog.getByRole('button', { name: 'Cancelar leitura', exact: true })).toHaveCount(0);
  await expect(dialog.getByRole('textbox', { name: /^Letra e cifra/ })).toHaveValue('[C]Conteúdo em edição');
  expect(writes(mock.calls)).toHaveLength(0);

  // Cancel while the OS is still returning the file bytes: no worker may
  // start later, even though File.arrayBuffer itself cannot be aborted.
  let workersAfterCancel = 0;
  const startedWorker = () => { workersAfterCancel++; };
  page.on('worker', startedWorker);
  const cancelledDuringIo = await page.evaluate(async bytes => {
    const browserModulePath = '/src/lib/cifra-pdf.ts';
    const { readCifraPdf } = await import(browserModulePath);
    const local = new File([new Uint8Array(bytes)], 'arquivo-lento.pdf', { type: 'application/pdf' });
    let entered!: () => void; let releaseBytes!: () => void;
    const reading = new Promise<void>(resolveIo => { entered = resolveIo; });
    const gate = new Promise<void>(resolveIo => { releaseBytes = resolveIo; });
    local.arrayBuffer = async () => { entered(); await gate; return new Uint8Array(bytes).buffer; };
    const controller = new AbortController();
    const pending = readCifraPdf(local, controller.signal).then(() => 'unexpected success', (error: Error) => error.name);
    await reading;
    controller.abort(); releaseBytes();
    return await pending;
  }, [...file.buffer]);
  page.off('worker', startedWorker);
  expect(cancelledDuringIo).toBe('AbortError');
  expect(workersAfterCancel).toBe(0);
  expect(writes(mock.calls)).toHaveLength(0);
});

for (const kind of ['digitalizado', 'acima de 8 MB'] as const) test(`PDF ${kind} é rejeitado localmente e preserva rascunho sem gravar`, async ({ page }) => {
  const mock = await loginAs(page);
  await page.goto('/musicas');
  await page.getByRole('button', { name: 'Nova música', exact: true }).click();
  const dialog = page.getByRole('dialog');
  await dialog.getByLabel('Título', { exact: true }).fill('Rascunho preservado');
  await dialog.getByRole('textbox', { name: /^Letra e cifra/ }).fill('[C]Letra original em edição');
  const buffer = kind === 'digitalizado' ? documentPdf([], true) : Buffer.alloc(8 * 1024 * 1024 + 1, 32);
  await dialog.getByLabel('Arquivo PDF da cifra', { exact: true }).setInputFiles({ name: 'arquivo-invalido.pdf', mimeType: 'application/pdf', buffer });
  await expect(dialog.getByRole('alert')).toContainText(kind === 'digitalizado' ? /imagem|texto selecionável/i : '8 MB');
  await expect(dialog.getByLabel('Título', { exact: true })).toHaveValue('Rascunho preservado');
  await expect(dialog.getByRole('textbox', { name: /^Letra e cifra/ })).toHaveValue('[C]Letra original em edição');
  expect(writes(mock.calls)).toHaveLength(0);
});

for (const role of ['guest', 'musician'] as const) test(`${role} não recebe campo para importar PDF ou criar música`, async ({ page }) => {
  const mock = await setupMockMinistry(page, role === 'guest' ? 'admin' : role);
  if (role === 'musician') await mock.login();
  await page.goto('/musicas');
  if (role === 'guest') await page.getByRole('button', { name: 'Entrar sem cadastro', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Biblioteca de músicas', exact: true })).toBeVisible();
  await expect(page.getByLabel('Arquivo PDF da cifra', { exact: true })).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Nova música', exact: true })).toHaveCount(0);
  expect(writes(mock.calls)).toHaveLength(0);
});
