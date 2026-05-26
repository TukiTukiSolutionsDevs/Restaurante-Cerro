import { expect,test } from '@playwright/test';

/**
 * AC scenarios from order-builder spec §8.
 * Skipped until the app is deployed against a real test DB.
 * Run with: pnpm e2e --grep "order-flow"
 */
test.describe.skip('Order flow — acceptance criteria', () => {
  test('AC-1 — Full combo dine-in, correct total', async ({ page }) => {
    await page.goto('/');

    // Add 1 starter + 1 main
    await page.getByRole('button', { name: 'Agregar' }).nth(0).click(); // starter
    await page.getByRole('button', { name: 'Agregar' }).nth(1).click(); // main

    // Open cart and switch to dine-in
    await page.getByText('Ver pedido').click();
    await page.getByText('Para comer aquí').click();

    // Select table M07
    await page.getByText('M07').click();

    // Submit
    await page.getByRole('button', { name: 'Enviar pedido' }).click();

    // Assert order ticket page
    await expect(page).toHaveURL(/\/pedido\//);
    await expect(page.getByText('S/13.00')).toBeVisible();
    await expect(page.getByText('M07')).toBeVisible();
  });

  test('AC-2 — Partial takeaway with tupper, correct total', async ({ page }) => {
    await page.goto('/');

    // Add 1 starter only
    await page.getByRole('button', { name: 'Agregar' }).nth(0).click();

    await page.getByText('Ver pedido').click();
    await page.getByText('Para llevar').click();
    await page.getByRole('switch').click(); // enable tupper

    await page.getByRole('button', { name: 'Enviar pedido' }).click();

    await expect(page).toHaveURL(/\/pedido\//);
    // total = partial_starter (700) + tupper_partial (100) = 800
    await expect(page.getByText('S/8.00')).toBeVisible();
  });

  test('AC-3 — Simultaneous table selection conflict', async ({ browser }) => {
    const ctx1 = await browser.newContext();
    const ctx2 = await browser.newContext();
    const page1 = await ctx1.newPage();
    const page2 = await ctx2.newPage();

    await page1.goto('/');
    await page2.goto('/');

    // Both add a starter and select dine-in + table M07
    for (const page of [page1, page2]) {
      await page.getByRole('button', { name: 'Agregar' }).nth(0).click();
      await page.getByText('Ver pedido').click();
      await page.getByText('Para comer aquí').click();
      await page.getByText('M07').click();
    }

    // Submit both — one should succeed, the other should see TABLE_TAKEN
    const [res1] = await Promise.allSettled([
      page1.getByRole('button', { name: 'Enviar pedido' }).click(),
      page2.getByRole('button', { name: 'Enviar pedido' }).click(),
    ]);

    // At least one page should show the error
    const errorVisible =
      (await page1.getByText('Mesa no disponible').isVisible()) ||
      (await page2.getByText('Mesa no disponible').isVisible());

    expect(errorVisible).toBe(true);
    void res1;

    await ctx1.close();
    await ctx2.close();
  });

  test('AC-4 — QR expiry displayed correctly', async ({ page }) => {
    await page.goto('/');
    await page.getByRole('button', { name: 'Agregar' }).nth(0).click();
    await page.getByText('Ver pedido').click();
    await page.getByText('Para llevar').click();
    await page.getByRole('button', { name: 'Enviar pedido' }).click();

    await expect(page).toHaveURL(/\/pedido\//);

    // Fast-forward 16 minutes past QR TTL
    await page.clock.fastForward(16 * 60 * 1000);

    // SSE should deliver cancelled status
    await expect(page.getByText('QR vencido')).toBeVisible({ timeout: 5000 });
    await expect(page.getByText('Pedido vencido')).toBeVisible();
  });

  test('AC-5 — Live lock on payment', async ({ browser }) => {
    const customerCtx = await browser.newContext();
    const cashierCtx = await browser.newContext();
    const customerPage = await customerCtx.newPage();
    const cashierPage = await cashierCtx.newPage();

    await customerPage.goto('/');
    await customerPage.getByRole('button', { name: 'Agregar' }).nth(0).click();
    await customerPage.getByText('Ver pedido').click();
    await customerPage.getByText('Para llevar').click();
    await customerPage.getByRole('button', { name: 'Enviar pedido' }).click();
    await expect(customerPage).toHaveURL(/\/pedido\//);

    // Cashier confirms payment (simulated via API)
    const shortCode = await customerPage.locator('p.font-mono').textContent();
    await cashierPage.goto('/caja');
    await cashierPage.getByPlaceholder(/código/i).fill(shortCode ?? '');
    await cashierPage.getByRole('button', { name: 'Confirmar pago' }).click();

    // Customer page should update via SSE within 2s
    await expect(customerPage.getByText('Pago confirmado')).toBeVisible({
      timeout: 3000,
    });

    await customerCtx.close();
    await cashierCtx.close();
  });

  test('AC-6 — Sold-out item in cart shows unavailable badge', async ({
    browser,
  }) => {
    const customerCtx = await browser.newContext();
    const adminCtx = await browser.newContext();
    const customerPage = await customerCtx.newPage();
    const adminPage = await adminCtx.newPage();

    await customerPage.goto('/');
    await customerPage.getByRole('button', { name: 'Agregar' }).nth(0).click();
    await customerPage.getByText('Ver pedido').click();

    // Admin marks item as sold-out
    await adminPage.goto('/admin/menu');
    await adminPage.getByRole('switch').nth(0).click();

    // Customer page should reflect the unavailability via SSE
    await expect(
      customerPage.getByText('Ya no disponible, remover'),
    ).toBeVisible({ timeout: 3000 });
    await expect(
      customerPage.getByRole('button', { name: 'Enviar pedido' }),
    ).toBeDisabled();

    await customerCtx.close();
    await adminCtx.close();
  });
});
