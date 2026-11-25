import { expect, test } from '@playwright/test';
import { existsSync, readFileSync } from 'node:fs';
import { extname, join, normalize } from 'node:path';
import { setupMockMinistry } from './fixtures';

// Opens the production build (npm run build with VITE_SUPABASE_URL on *.supabase.co) under the
// Content-Security-Policy from netlify.toml and checks that nothing the app needs is blocked.
const DIST = join(process.cwd(), 'dist');
const ORIGIN = 'https://candeia.csp.test';
const csp = /Content-Security-Policy = "([^"]+)"/.exec(readFileSync('netlify.toml', 'utf8'))?.[1] ?? '';
const TYPES: Record<string, string> = {
  '.html': 'text/html',
  '.js': 'text/javascript',
  '.css': 'text/css',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.webmanifest': 'application/manifest+json',
  '.woff2': 'font/woff2',
  '.json': 'application/json',
};

test('o cabeçalho de segurança é igual nos dois arquivos de configuração', () => {
  expect(csp).toContain("script-src 'self'");
  expect(readFileSync('public/_headers', 'utf8')).toContain(`Content-Security-Policy: ${csp}`);
});

test('o site publicado funciona sob a política de segurança', async ({ page }) => {
  test.skip(
    !existsSync(join(DIST, 'index.html')) || !readFileSync(join(DIST, 'index.html'), 'utf8').includes('/assets/'),
    'Requer npm run build.',
  );
  await page.addInitScript(() => {
    (window as unknown as { violations: string[] }).violations = [];
    document.addEventListener('securitypolicyviolation', event =>
      (window as unknown as { violations: string[] }).violations.push(`${event.violatedDirective} ${event.blockedURI}`),
    );
  });
  await page.route(`${ORIGIN}/**`, async route => {
    const path = new URL(route.request().url()).pathname;
    if (path.startsWith('/.netlify/')) return route.fulfill({ status: 404, body: '' });
    let file = normalize(join(DIST, decodeURIComponent(path)));
    if (!file.startsWith(DIST) || !existsSync(file) || !extname(file)) file = join(DIST, 'index.html');
    await route.fulfill({
      status: 200,
      body: readFileSync(file),
      headers: { 'Content-Type': TYPES[extname(file)] ?? 'application/octet-stream', 'Content-Security-Policy': csp },
    });
  });
  const mock = await setupMockMinistry(page, 'admin');
  await page.goto(`${ORIGIN}/`);
  await page.getByLabel('E-mail', { exact: true }).fill('fixture@example.invalid');
  await page.getByLabel('Senha', { exact: true }).fill('local-fixture-password');
  await page.getByRole('button', { name: 'Entrar no ministério', exact: true }).click();
  await expect(page.getByRole('heading', { name: /^Olá,/ })).toBeVisible();
  for (const path of ['/cultos', '/musicas', '/equipe', '/perfil']) {
    await page.evaluate(target => {
      history.pushState({}, '', target);
      dispatchEvent(new PopStateEvent('popstate'));
    }, path);
    await page.waitForTimeout(300);
  }
  expect(mock.calls.some(call => call.path.startsWith('/rest/v1/'))).toBe(true);
  expect(await page.evaluate(() => (window as unknown as { violations: string[] }).violations)).toEqual([]);
});
