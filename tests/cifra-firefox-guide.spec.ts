import { expect, test } from '@playwright/test';
import { setupMockMinistry } from './fixtures';

const META = '**/downloads/candeia-cifraclub-firefox.json';
const XPI = '/downloads/candeia-cifraclub-firefox.xpi';
const release = { status: 'signed', version: '1.1.1', downloadUrl: XPI, sha256: 'a'.repeat(64) };

test('guia Android mantém PDF e explica assinatura pendente sem oferecer instalação sem assinatura', async ({ page }) => {
  const mock = await setupMockMinistry(page);
  await page.route(META, route => route.fulfill({ contentType: 'application/json', body: JSON.stringify({
    status: 'unsigned', version: '1.1.1', downloadUrl: null, sha256: null,
    unsignedDownloadUrl: '/downloads/candeia-cifraclub-firefox-unsigned.xpi',
  }) }));
  await page.setViewportSize({ width: 320, height: 740 });
  await mock.login();
  await page.goto('/conectar-cifra-club');
  await expect(page.getByRole('tab', { name: 'Celular', exact: true })).toHaveAttribute('aria-selected', 'true');
  const firefox = page.getByRole('region', { name: 'Importar pelo Firefox no Android', exact: true });
  await expect(firefox.getByRole('status')).toContainText('Instalação aguardando assinatura da Mozilla.');
  await expect(page.locator('a[href$=".xpi"]')).toHaveCount(0);
  await expect(firefox).toContainText('Candeia e Cifra Club no Firefox');
  await expect(firefox).toContainText('O Candeia aberto no Chrome ou no aplicativo instalado por ele não recebe');
  await expect(firefox).toContainText('Primeiro confira título, artista, acordes e tom sem salvar');
  await expect(firefox.locator('ol > li')).toHaveCount(4);
  await expect(page.getByRole('heading', { name: 'Importar PDF pelo celular', exact: true })).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(320);
  await page.getByRole('button', { name: 'iPhone / iPad', exact: true }).click();
  await expect(firefox).toHaveCount(0);
  await expect(page.getByRole('region', { name: 'Importar PDF pelo celular', exact: true })).toContainText('Safari');
  expect(mock.calls.filter(call => call.path.startsWith('/rest/v1/') && call.method !== 'GET')).toHaveLength(0);
});

test('guia oferece somente o endereço fixo do XPI cuja assinatura foi validada pelo empacotador', async ({ page }) => {
  const mock = await setupMockMinistry(page);
  await page.route(META, route => route.fulfill({ contentType: 'application/json', body: JSON.stringify(release) }));
  await page.setViewportSize({ width: 390, height: 844 });
  await mock.login();
  await page.goto('/conectar-cifra-club');
  const download = page.getByRole('link', { name: 'Baixar extensão assinada para Firefox', exact: true });
  await expect(download).toHaveAttribute('href', XPI);
  await expect(download).toHaveAttribute('download', '');
  await expect(page.getByRole('heading', { name: 'Importar PDF pelo celular', exact: true })).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(390);
});

for (const [name, metadata] of [
  ['URL fora do pacote publicado', { ...release, downloadUrl: 'https://example.invalid/package.xpi' }],
  ['hash ausente', { ...release, sha256: null }],
  ['versão inválida', { ...release, version: '1.1' }],
] as const) {
  test(`guia não oferece instalação com ${name}`, async ({ page }) => {
    const mock = await setupMockMinistry(page);
    await page.route(META, route => route.fulfill({ contentType: 'application/json', body: JSON.stringify(metadata) }));
    await page.setViewportSize({ width: 390, height: 844 });
    await mock.login();
    await page.goto('/conectar-cifra-club');
    await expect(page.getByRole('status')).toContainText('Não foi possível confirmar o pacote assinado.');
    await expect(page.getByRole('link', { name: 'Baixar extensão assinada para Firefox', exact: true })).toHaveCount(0);
    await expect(page.getByRole('heading', { name: 'Importar PDF pelo celular', exact: true })).toBeVisible();
  });
}

test('falha ao consultar o pacote mantém o guia PDF e o download Chrome continua separado', async ({ page }) => {
  const mock = await setupMockMinistry(page);
  let metadataRequests = 0;
  await page.route(META, route => { metadataRequests++; return route.fulfill({ status: 503, body: 'temporariamente indisponível' }); });
  await page.setViewportSize({ width: 1200, height: 900 });
  await mock.login();
  await page.goto('/conectar-cifra-club');
  await expect(page.getByRole('tab', { name: 'Computador', exact: true })).toHaveAttribute('aria-selected', 'true');
  await expect(page.getByRole('link', { name: 'Baixar importador', exact: true })).toHaveAttribute('href', '/downloads/candeia-cifraclub.zip');
  expect(metadataRequests).toBe(0);
  await page.getByRole('tab', { name: 'Celular', exact: true }).click();
  await expect(page.getByRole('status')).toContainText('Não foi possível confirmar o pacote assinado.');
  await expect(page.getByRole('link', { name: 'Abrir biblioteca para importar', exact: true })).toHaveAttribute('href', '/musicas');
  await expect(page.locator('a[href$=".xpi"]')).toHaveCount(0);
  // Development StrictMode mounts effects twice; both requests stay local to
  // the fixture and neither failure offers an unverified installation.
  expect(metadataRequests).toBeGreaterThanOrEqual(1);
  expect(metadataRequests).toBeLessThanOrEqual(2);
});
