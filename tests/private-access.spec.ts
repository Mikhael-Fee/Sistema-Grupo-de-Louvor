import { expect, test } from '@playwright/test';
import { setupMockMinistry } from './fixtures';

test('links antigos e sessão visitante exigem conta sem solicitar dados do ministério', async ({ page }) => {
  const mock = await setupMockMinistry(page);
  await page.addInitScript(() => sessionStorage.setItem('candeia.public.session', '1'));
  for (const path of ['/consulta', '/cultos', '/cultos/legacy', '/musicas', '/pessoas', '/etiquetas', '/graficos', '/importar-cifra', '/conectar-cifra-club']) {
    await page.goto(path);
    await expect(page.getByRole('button', { name: 'Entrar no ministério', exact: true })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Entrar sem cadastro', exact: true })).toHaveCount(0);
    await expect(page.getByRole('navigation', { name: 'Navegação principal', exact: true })).toHaveCount(0);
    expect(await page.evaluate(() => sessionStorage.getItem('candeia.public.session'))).toBeNull();
  }
  expect(mock.calls.filter(call => call.path.startsWith('/rest/v1/'))).toHaveLength(0);
});

test('cadastro e recuperação continuam disponíveis com a aprovação explícita', async ({ page }) => {
  const mock = await setupMockMinistry(page);
  let signupBody: Record<string, unknown> | undefined;
  await page.route('**/auth/v1/signup**', route => {
    signupBody = route.request().postDataJSON();
    return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ user: { id: 'new-user', email: 'new@example.invalid', identities: [] }, session: null }) });
  });
  await page.goto('/');
  await page.getByRole('button', { name: 'Criar conta', exact: true }).click();
  await page.getByLabel('Seu nome', { exact: true }).fill('Nova pessoa');
  await page.getByLabel('E-mail', { exact: true }).fill('new@example.invalid');
  await page.getByLabel('Senha', { exact: true }).fill('local-test-password');
  await page.getByRole('button', { name: 'Criar minha conta', exact: true }).click();
  await expect(page.getByRole('status')).toHaveText('Cadastro enviado. Confirme seu e-mail e aguarde a aprovação de um administrador.');
  expect(signupBody?.email).toBe('new@example.invalid');
  expect(signupBody?.data).toEqual({ name: 'Nova pessoa' });
  await page.getByRole('button', { name: 'Entrar', exact: true }).click();
  await page.getByRole('button', { name: 'Esqueci minha senha', exact: true }).click();
  await page.getByRole('button', { name: 'Enviar link de recuperação', exact: true }).click();
  await expect(page.getByRole('status')).toHaveText(/receberá um link para redefinir/);
  expect(mock.calls.some(call => call.path === '/auth/v1/recover')).toBe(true);
  expect(mock.calls.filter(call => call.path.startsWith('/rest/v1/'))).toHaveLength(0);
});

test('conta pendente não lê dados e só entra após verificar sua aprovação', async ({ page }) => {
  const mock = await setupMockMinistry(page);
  mock.profiles[0].approved = false;
  await page.goto('/');
  await page.getByLabel('E-mail', { exact: true }).fill('fixture@example.invalid');
  await page.getByLabel('Senha', { exact: true }).fill('local-fixture-password');
  await page.getByRole('button', { name: 'Entrar no ministério', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Seu cadastro está em análise', exact: true })).toBeVisible();
  await page.goto('/conectar-cifra-club');
  await expect(page.getByRole('heading', { name: 'Seu cadastro está em análise', exact: true })).toBeVisible();
  expect(mock.calls.filter(call => call.path.startsWith('/rest/v1/') && call.path !== '/rest/v1/profiles')).toHaveLength(0);
  await page.goto('/');
  await expect(page.getByRole('heading', { name: 'Seu cadastro está em análise', exact: true })).toBeVisible();
  mock.profiles[0].approved = true;
  await page.getByRole('button', { name: 'Verificar aprovação', exact: true }).click();
  await expect(page.getByRole('heading', { name: /^Olá,/ })).toBeVisible();
  await page.getByRole('button', { name: 'Sair', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Entrar no ministério', exact: true })).toBeVisible();
  await page.goto('/cultos');
  await expect(page.getByRole('button', { name: 'Entrar no ministério', exact: true })).toBeVisible();
});

test('administrador mantém navegação rolável pelo teclado sem barra visível', async ({ page }) => {
  const mock = await setupMockMinistry(page);
  await page.setViewportSize({ width: 1200, height: 550 });
  await mock.login();
  const sidebar = page.getByLabel('Menu do ministério', { exact: true });
  await expect(sidebar).toBeVisible();
  const styles = await sidebar.evaluate(element => ({ scrollbar: getComputedStyle(element).scrollbarWidth, overflow: getComputedStyle(element).overflowY, canScroll: element.scrollHeight > element.clientHeight }));
  expect(styles).toEqual({ scrollbar: 'none', overflow: 'auto', canScroll: true });
  await sidebar.focus();
  await sidebar.press('PageDown');
  await expect.poll(() => sidebar.evaluate(element => element.scrollTop)).toBeGreaterThan(0);
  await sidebar.getByRole('button', { name: 'Sair', exact: true }).scrollIntoViewIfNeeded();
  await expect(sidebar.getByRole('button', { name: 'Sair', exact: true })).toBeInViewport();
  await page.goto('/administracao');
  await expect(page.getByRole('heading', { name: 'Administração', exact: true })).toBeVisible();
  await expect(page.getByText('Consulta sem cadastro', { exact: true })).toHaveCount(0);
  expect(mock.calls.some(call => /(?:get_public_access|save_public_access|read_public_ministry)/.test(call.path))).toBe(false);
});

test('celular exige conta e mostra ícones de instalação da mesma chama da marca', async ({ page }) => {
  await setupMockMinistry(page);
  await page.setViewportSize({ width: 320, height: 740 });
  await page.goto('/');
  await expect(page.getByRole('button', { name: 'Entrar no ministério', exact: true })).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(320);
  const source = await (await page.request.get('/icon.svg')).text();
  const internalPath = await page.locator('.candeia-brand-mark path').first().getAttribute('d');
  expect(source).toContain(`d="${internalPath}"`);
  expect(source).toContain('stroke="#f0a340"');
  expect(source).toContain('fill="#2e251b"');
  await expect(page.locator('link[rel="apple-touch-icon"]')).toHaveAttribute('href', '/apple-touch-icon.png');
  for (const [path, size] of [['/pwa-192.png', 192], ['/pwa-512.png', 512], ['/pwa-maskable-512.png', 512], ['/apple-touch-icon.png', 180]] as const) {
    const result = await page.evaluate(async url => { const image = new Image(); image.src = url; await image.decode(); return { width: image.naturalWidth, height: image.naturalHeight }; }, path);
    expect(result).toEqual({ width: size, height: size });
  }
});
