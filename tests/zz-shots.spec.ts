import { test, type Page } from '@playwright/test';
import { setupMockMinistry } from './fixtures';
const OUT = '/mnt/project-files/perfis/foto-textura';
async function seed(page: Page, mock: Awaited<ReturnType<typeof setupMockMinistry>>, owner: string, n: number, color: string) {
  const image = await page.evaluate(async c => {
    const { supabase } = await import('/src/lib/backend.ts' as string);
    const canvas = document.createElement('canvas'); canvas.width = 120; canvas.height = 120;
    const ctx = canvas.getContext('2d')!; ctx.fillStyle = c; ctx.fillRect(0, 0, 120, 120);
    ctx.fillStyle = '#f6d7b0'; ctx.beginPath(); ctx.arc(60, 52, 26, 0, 7); ctx.fill(); ctx.beginPath(); ctx.arc(60, 128, 46, 0, 7); ctx.fill();
    return { origin: new URL(supabase.supabaseUrl).origin, data: canvas.toDataURL('image/png') };
  }, color);
  const path = `${owner}/30000000-0000-4000-8000-${String(n).padStart(12, '0')}.png`;
  mock.storage.objects.set(path, { body: Buffer.from(image.data.split(',')[1], 'base64'), contentType: 'image/png' });
  return `${image.origin}/storage/v1/object/public/avatars/${path}`;
}
for (const theme of ['light', 'dark'] as const) {
  for (const [label, size] of [['celular', { width: 390, height: 844 }], ['pc', { width: 1366, height: 860 }]] as const) {
    test(`${theme} ${label}`, async ({ page }) => {
      await page.setViewportSize(size);
      const mock = await setupMockMinistry(page);
      await page.goto('/');
      await page.evaluate(t => localStorage.setItem('candeia.theme', t), theme);
      const me = mock.data.people[0];
      me.photoUrl = await seed(page, mock, mock.profiles[0].id, 71, '#4a6b8a');
      mock.profiles[0].photoUrl = await seed(page, mock, mock.profiles[0].id, 72, '#e0a43a');
      await mock.login();
      await page.goto('/');
      await page.waitForTimeout(800);
      await page.screenshot({ path: `${OUT}/inicio-${theme}-${label}.png` });
      await page.goto('/perfil');
      await page.waitForTimeout(500);
      await page.getByRole('button', { name: 'Alterar foto de perfil' }).click();
      await page.screenshot({ path: `${OUT}/perfil-menu-${theme}-${label}.png` });
      await page.keyboard.press('Escape');
      await page.goto('/pessoas');
      await page.waitForTimeout(800);
      await page.screenshot({ path: `${OUT}/equipe-${theme}-${label}.png` });
    });
  }
}
