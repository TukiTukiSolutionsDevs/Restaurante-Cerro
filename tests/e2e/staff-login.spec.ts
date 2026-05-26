/**
 * E2E: Staff login lockout flow
 *
 * Prerequisites before running (skipped in CI / default runs):
 *   docker compose -f docker/docker-compose.dev.yml up -d db
 *   pnpm db:push
 *   pnpm db:seed
 *
 * Then run with: pnpm e2e --grep "staff-login"
 *
 * The webServer config in playwright.config.ts already starts `pnpm dev` automatically.
 */

import { expect, test } from '@playwright/test';

test.describe.skip('Staff login — lockout flow', () => {
  test('5 wrong PIN attempts triggers 15-min lockout', async ({ page }) => {
    // 1. Navigate to the cashier login page
    await page.goto('/login?role=cashier');
    await expect(page.getByText('Cajero')).toBeVisible();

    // 2. Enter a wrong PIN 5 times
    //    The seed script must have created a cashier user whose PIN is NOT '000000'.
    const wrongPin = ['0', '0', '0', '0', '0', '0'] as const;
    for (let attempt = 0; attempt < 5; attempt++) {
      for (const digit of wrongPin) {
        await page.getByRole('button', { name: digit }).first().click();
      }
      // Wait for the error message between attempts
      if (attempt < 4) {
        await expect(page.getByRole('alert')).toContainText('PIN incorrecto');
      }
    }

    // 3. The 6th attempt (triggered by the 5th wrong PIN auto-submit) should now be blocked.
    //    At attempt 5 the server returns 429.
    await expect(page.getByRole('alert')).toContainText('bloqueado');

    // 4. All pin-pad buttons should be disabled
    const buttons = page.getByRole('button');
    const count = await buttons.count();
    for (let i = 0; i < count; i++) {
      await expect(buttons.nth(i)).toBeDisabled();
    }

    // 5. Verify the network response was 429
    const [response] = await Promise.all([
      page.waitForResponse((r) => r.url().includes('/api/staff/login') && r.status() === 429),
      // The 429 was already received above; this just validates it was captured.
      Promise.resolve(),
    ]);
    expect(response.status()).toBe(429);
  });
});
