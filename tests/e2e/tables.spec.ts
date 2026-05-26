import { expect, test } from '@playwright/test';

// T6.7 — E2E para gestión de mesas
// describe.skip: los tests están listos para ejecutarse una vez levantado el stack completo
// con la DB seeded (docker-compose + migrations).

test.describe.skip('Tables E2E', () => {
  test.beforeAll(async () => {
    // Prerequisite: app running at baseURL with a clean test DB
  });

  test('Admin crea 30 mesas M01-M30 via acción masiva', async ({ page }) => {
    // Login as admin
    await page.goto('/auth/admin');
    await page.getByLabel('PIN').fill('123456');
    await page.getByRole('button', { name: /ingresar/i }).click();

    await page.goto('/admin/tables');

    // Click bulk create button
    await page.getByRole('button', { name: /Crear M01–M30/i }).click();
    await page.getByRole('button', { name: /aceptar|ok/i }).click();

    // Wait for success toast
    await expect(page.getByText(/30 mesas creadas/i)).toBeVisible({ timeout: 10_000 });
  });

  test('El mapa de sala muestra 30 mesas libres', async ({ page }) => {
    await page.goto('/admin/tables');

    // All 30 buttons should be present with state=free (bg-green-500)
    const cells = page.getByRole('button', { name: /Mesa M/i });
    await expect(cells).toHaveCount(30);

    // Each cell should have the free state color
    const count = await cells.count();
    for (let i = 0; i < count; i++) {
      const cls = await cells.nth(i).getAttribute('class');
      expect(cls).toContain('bg-green-500');
    }
  });
});
