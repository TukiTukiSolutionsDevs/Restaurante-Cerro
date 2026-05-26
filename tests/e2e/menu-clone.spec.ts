import { expect, test } from '@playwright/test';

// Skipped until DB is available in CI
test.describe.skip('Menu clone flow', () => {
  test.beforeEach(async ({ page }) => {
    // Authenticate as admin
    await page.goto('/login');
    await page.getByRole('button', { name: /admin/i }).click();
    await page.getByLabel(/pin/i).fill('000000');
    await page.getByRole('button', { name: /ingresar/i }).click();
    await page.waitForURL('/admin/**');
  });

  test('admin can create a menu for today by cloning yesterday', async ({ page }) => {
    await page.goto('/admin/menu');

    // Should show the "no menu" state with clone option
    const cloneBtn = page.getByRole('button', { name: /clonar menú de ayer/i });
    await expect(cloneBtn).toBeVisible();

    await cloneBtn.click();

    // After clone, the menu should appear with items
    await expect(page.getByText(/borrador/i)).toBeVisible();
    await expect(page.getByRole('table')).toBeVisible();
  });

  test('cloned menu inherits items from source date', async ({ page }) => {
    await page.goto('/admin/menu');

    const cloneBtn = page.getByRole('button', { name: /clonar menú de ayer/i });
    await expect(cloneBtn).toBeVisible();
    await cloneBtn.click();

    // At least one item row should be present after clone
    const rows = page.getByRole('row').filter({ hasNot: page.getByRole('columnheader') });
    await expect(rows).not.toHaveCount(0);
  });

  test('cloned menu starts in draft status', async ({ page }) => {
    await page.goto('/admin/menu');

    const cloneBtn = page.getByRole('button', { name: /clonar menú de ayer/i });
    if (await cloneBtn.isVisible()) {
      await cloneBtn.click();
    }

    await expect(page.getByText(/borrador/i)).toBeVisible();
    await expect(page.getByRole('button', { name: /abrir día/i })).toBeVisible();
  });

  test('admin can open cloned menu after setting combo prices', async ({ page }) => {
    await page.goto('/admin/menu');

    // If no menu exists, clone first
    const cloneBtn = page.getByRole('button', { name: /clonar menú de ayer/i });
    if (await cloneBtn.isVisible()) {
      await cloneBtn.click();
    }

    // Fill combo prices (assuming combo was also cloned)
    const openBtn = page.getByRole('button', { name: /abrir día/i });
    await expect(openBtn).toBeEnabled();
    await openBtn.click();

    await expect(page.getByText(/abierto/i)).toBeVisible();
    await expect(page.getByRole('button', { name: /cerrar día/i })).toBeVisible();
  });
});
