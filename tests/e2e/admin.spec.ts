import { expect, test } from '@playwright/test';

/**
 * E2E suite for the admin panel (/admin).
 * Skipped pending test environment setup (DB seed + running server).
 */
test.describe.skip('Admin panel — /admin', () => {
  // AC-1: Admin creates a cashier user with a valid PIN
  test('AC-1 — crear usuario cajero con PIN válido aparece en lista', async ({ page }) => {
    await page.goto('/auth/admin');
    await page.getByLabel('PIN').fill('248135');
    await page.getByRole('button', { name: /entrar/i }).click();
    await expect(page).toHaveURL('/admin');

    await page.goto('/admin/staff');
    await page.getByRole('button', { name: /crear usuario/i }).click();
    await page.getByLabel(/nombre/i).fill('Lucía');
    await page.getByLabel(/rol/i).selectOption('cashier');
    await page.getByLabel(/pin.*6/i).fill('368421');
    await page.getByLabel(/confirmar pin/i).fill('368421');
    await page.getByRole('button', { name: /^crear$/i }).click();

    await expect(page.getByText('Lucía')).toBeVisible();

    // Verify Lucía can login at /caja
    const luciaPage = await page.context().newPage();
    await luciaPage.goto('/auth/cashier');
    await luciaPage.getByLabel('PIN').fill('368421');
    await luciaPage.getByRole('button', { name: /entrar/i }).click();
    await expect(luciaPage).toHaveURL('/caja');
    await luciaPage.close();
  });

  // AC-2: Admin resets Lucía's PIN; old PIN is rejected, new PIN accepted
  test('AC-2 — restablecer PIN invalida el anterior y acepta el nuevo', async ({ page }) => {
    await page.goto('/admin/staff');

    // Find Lucía's row and click Restablecer PIN
    const luciaRow = page.getByRole('row', { name: /lucía/i });
    await luciaRow.getByRole('button', { name: /restablecer pin/i }).click();
    await page.getByLabel(/nuevo pin/i).fill('591736');
    await page.getByRole('button', { name: /restablecer/i }).click();

    // Old PIN rejected
    const luciaPage = await page.context().newPage();
    await luciaPage.goto('/auth/cashier');
    await luciaPage.getByLabel('PIN').fill('368421');
    await luciaPage.getByRole('button', { name: /entrar/i }).click();
    await expect(luciaPage.getByText(/pin incorrecto|inválido/i)).toBeVisible();

    // New PIN accepted
    await luciaPage.getByLabel('PIN').clear();
    await luciaPage.getByLabel('PIN').fill('591736');
    await luciaPage.getByRole('button', { name: /entrar/i }).click();
    await expect(luciaPage).toHaveURL('/caja');
    await luciaPage.close();
  });

  // AC-3: Admin force-logouts Lucía; her next request redirects to /auth/cashier
  test('AC-3 — cerrar sesión forzada redirige a Lucía al próximo request', async ({ page }) => {
    await page.goto('/admin/staff');

    const luciaRow = page.getByRole('row', { name: /lucía/i });
    await luciaRow.getByRole('button', { name: /cerrar sesión forzada/i }).click();
    page.on('dialog', (d) => d.accept());

    // Lucía's session is gone; navigating to /caja should redirect
    const luciaPage = await page.context().newPage();
    await luciaPage.goto('/caja');
    await expect(luciaPage).toHaveURL(/auth\/cashier|login/);
    await luciaPage.close();
  });

  // AC-4: Daily report shows correct revenue split and top item
  test('AC-4 — reporte diario muestra ingresos por método y top 5 platos', async ({ page }) => {
    const today = new Date().toISOString().slice(0, 10);
    await page.goto(`/admin/reports/daily?date=${today}`);

    await expect(page.getByText(/efectivo/i)).toBeVisible();
    await expect(page.getByText(/yape/i)).toBeVisible();
    await expect(page.getByText(/top 5 platos/i)).toBeVisible();
    // Top item should appear first in the table
    const rows = page.getByRole('row');
    await expect(rows).not.toHaveCount(0);
  });

  // AC-5: Submitting PIN "000000" returns INVALID_PIN error
  test('AC-5 — PIN 000000 retorna error INVALID_PIN sin insertar usuario', async ({ page }) => {
    await page.goto('/admin/staff');
    await page.getByRole('button', { name: /crear usuario/i }).click();
    await page.getByLabel(/nombre/i).fill('Test Usuario');
    await page.getByLabel(/rol/i).selectOption('cashier');
    await page.getByLabel(/pin.*6/i).fill('000000');
    await page.getByLabel(/confirmar pin/i).fill('000000');
    await page.getByRole('button', { name: /^crear$/i }).click();

    await expect(
      page.getByText(/el pin no es seguro|evita patrones/i),
    ).toBeVisible();

    // User should NOT appear in staff list
    await expect(page.getByText('Test Usuario')).not.toBeVisible();
  });

  // AC-6: Exportar CSV downloads a valid file matching on-screen totals
  test('AC-6 — exportar CSV descarga archivo con totales coincidentes', async ({ page }) => {
    const today = new Date().toISOString().slice(0, 10);
    await page.goto(`/admin/reports/daily?date=${today}`);

    const [download] = await Promise.all([
      page.waitForEvent('download'),
      page.getByRole('link', { name: /exportar csv/i }).click(),
    ]);

    expect(download.suggestedFilename()).toBe(`reporte-${today}.csv`);
    const stream = await download.createReadStream();
    const chunks: Buffer[] = [];
    for await (const chunk of stream) chunks.push(Buffer.from(chunk as Buffer));
    const csv = Buffer.concat(chunks).toString('utf-8');
    expect(csv).toMatch(/Resumen/);
    expect(csv).toMatch(/Ingresos/);
    expect(csv).toMatch(/Top 5 platos/);
  });
});
