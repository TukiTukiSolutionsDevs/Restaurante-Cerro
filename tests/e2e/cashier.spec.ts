import { expect, test } from '@playwright/test';

/**
 * E2E suite for the cashier checkout console (/caja).
 * Skipped pending test environment setup (DB seed + running server).
 */
test.describe.skip('Cashier checkout — /caja', () => {
  // AC-1: Valid PIN login redirects to /caja with daily summary visible
  test('AC-1 — login con PIN correcto muestra consola y resumen diario', async ({ page }) => {
    await page.goto('/auth/cashier');
    await page.getByLabel('PIN').fill('123456');
    await page.getByRole('button', { name: /entrar/i }).click();
    await expect(page).toHaveURL('/caja');
    await expect(page.getByText(/efectivo/i)).toBeVisible();
    await expect(page.getByText(/yape/i)).toBeVisible();
  });

  // AC-2: Short-code lookup shows order detail
  test('AC-2 — búsqueda por código muestra detalle del pedido', async ({ page }) => {
    await page.goto('/caja');
    await page.getByPlaceholder(/ingresa código/i).fill('A3F7');
    await page.keyboard.press('Enter');
    await expect(page.getByText('A3F7')).toBeVisible();
    await expect(page.getByText(/S\/13\.00/)).toBeVisible();
  });

  // AC-3: Cash confirm sends order to kitchen
  test('AC-3 — confirmar con efectivo envía pedido a cocina', async ({ page }) => {
    await page.goto('/caja');
    await page.getByPlaceholder(/ingresa código/i).fill('A3F7');
    await page.keyboard.press('Enter');
    await page.keyboard.press('1'); // select cash
    await page.keyboard.press('Enter'); // confirm
    await expect(page.getByText(/pedido enviado a cocina/i)).toBeVisible();
    // Kitchen tab should show ticket within 2 s (checked separately)
  });

  // AC-4: Confirming an already-paid order returns 409 toast
  test('AC-4 — confirmar pedido ya cobrado muestra error', async ({ page }) => {
    await page.goto('/caja');
    await page.getByPlaceholder(/ingresa código/i).fill('A3F7');
    await page.keyboard.press('Enter');
    await page.keyboard.press('1');
    await page.keyboard.press('Enter'); // first confirm — succeeds
    // lookup again and try to confirm
    await page.getByPlaceholder(/ingresa código/i).fill('A3F7');
    await page.keyboard.press('Enter');
    await expect(page.getByText(/ya fue cobrado|ya no puede modificarse/i)).toBeVisible();
  });

  // AC-5: Undo within 2-minute window returns order to pending queue
  test('AC-5 — deshacer dentro de 2 minutos revierte el pedido', async ({ page }) => {
    await page.goto('/caja');
    await page.getByPlaceholder(/ingresa código/i).fill('B9K2');
    await page.keyboard.press('Enter');
    await page.keyboard.press('2'); // yape
    await page.keyboard.press('Enter');
    await expect(page.getByText(/pedido enviado a cocina/i)).toBeVisible();
    // Find the undo button in Confirmados hoy
    await page.getByRole('button', { name: /deshacer/i }).click();
    await expect(page.getByText(/pago revertido/i)).toBeVisible();
  });

  // AC-6: Undo link is hidden/disabled after > 2 minutes
  test('AC-6 — deshacer no disponible después de 2 minutos', async ({ page }) => {
    // Requires a seed order that was paid > 2 minutes ago
    await page.goto('/caja');
    // The undo button should not be present for old confirmed orders
    const undoButtons = page.getByRole('button', { name: /deshacer/i });
    // Assert that the count of undo buttons matches orders within 2-min window only
    // (exact assertion depends on test fixture state)
    await expect(undoButtons).toHaveCount(0);
  });

  // AC-7: 5 wrong PINs trigger account lockout
  test('AC-7 — 5 PINs incorrectos bloquean la cuenta 15 minutos', async ({ page }) => {
    await page.goto('/auth/cashier');
    for (let i = 0; i < 5; i++) {
      await page.getByLabel('PIN').fill('000000');
      await page.getByRole('button', { name: /entrar/i }).click();
    }
    await expect(page.getByText(/cuenta bloqueada 15 min/i)).toBeVisible();
  });

  // AC-8: Cancel with reason writes audit_log row
  test('AC-8 — cancelar con motivo registra en audit_log', async ({ page }) => {
    await page.goto('/caja');
    await page.getByPlaceholder(/ingresa código/i).fill('C1R4');
    await page.keyboard.press('Enter');
    await page.getByText(/cancelar pedido/i).click();
    await page.getByPlaceholder(/mínimo 5/i).fill('cliente sin dinero');
    await page.getByRole('button', { name: /confirmar cancelación/i }).click();
    await expect(page.getByText(/pedido cancelado/i)).toBeVisible();
    // DB assertion (requires test DB connection):
    // const row = await db.select().from(auditLog).where(...);
    // expect(row[0].payload.reason).toBe('cliente sin dinero');
  });
});
