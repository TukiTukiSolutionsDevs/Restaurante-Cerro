import { expect, test } from '@playwright/test';

/**
 * Kitchen TV display — E2E acceptance criteria (AC-1 through AC-6).
 * Skipped until the full test environment (real DB + seeded data) is wired up.
 */
test.describe.skip('Kitchen TV display', () => {
  test.describe('AC-1 — New order appears within 2 s with chime', () => {
    test('ticket appears on board within 2 s of cashier confirming payment', async ({
      page,
      context,
    }) => {
      // Pair the device
      await context.addCookies([
        {
          name: 'cerro_kitchen',
          value: process.env.TEST_KITCHEN_COOKIE!,
          domain: 'localhost',
          path: '/',
        },
      ]);
      await page.goto('/cocina');
      await expect(page.getByText('Cocina en vivo')).toBeVisible();

      // Cashier confirms a pending order in another tab
      const cashierPage = await context.newPage();
      await cashierPage.goto('/caja');
      // ... trigger confirm payment action
      // Expect ticket to appear on kitchen board within 2 s
      await expect(page.locator('article').first()).toBeVisible({ timeout: 2_000 });
    });
  });

  test.describe('AC-2 — Waiter delivers → ticket disappears', () => {
    test('ticket fades and is removed from DOM after delivery', async ({ page, context }) => {
      await context.addCookies([
        {
          name: 'cerro_kitchen',
          value: process.env.TEST_KITCHEN_COOKIE!,
          domain: 'localhost',
          path: '/',
        },
      ]);
      await page.goto('/cocina');
      const initialCount = await page.locator('article').count();
      expect(initialCount).toBeGreaterThan(0);

      // Waiter marks order delivered via API
      // ...

      await expect(page.locator('article')).toHaveCount(initialCount - 1, { timeout: 3_000 });
    });
  });

  test.describe('AC-3 — Wi-Fi disconnect → reconnect → state matches DB', () => {
    test('shows Reconectando overlay after 5 s of disconnect', async ({ page, context }) => {
      await context.addCookies([
        {
          name: 'cerro_kitchen',
          value: process.env.TEST_KITCHEN_COOKIE!,
          domain: 'localhost',
          path: '/',
        },
      ]);
      await page.goto('/cocina');
      await page.route('/api/sse/kitchen', (route) => route.abort());
      await expect(page.getByText('Reconectando…')).toBeVisible({ timeout: 7_000 });
    });

    test('overlay dismissed and board updated after reconnect', async ({ page, context }) => {
      await context.addCookies([
        {
          name: 'cerro_kitchen',
          value: process.env.TEST_KITCHEN_COOKIE!,
          domain: 'localhost',
          path: '/',
        },
      ]);
      await page.goto('/cocina');
      let blocked = true;
      await page.route('/api/sse/kitchen', (route) => {
        if (blocked) return route.abort();
        return route.continue();
      });
      await page.waitForTimeout(6_000);
      blocked = false;
      await page.unroute('/api/sse/kitchen');
      await expect(page.getByText('Reconectando…')).not.toBeVisible({ timeout: 10_000 });
    });
  });

  test.describe('AC-4 — 20 concurrent tickets trigger pagination', () => {
    test('shows Página 1 / 2 and auto-flips after 10 s', async ({ page, context }) => {
      await context.addCookies([
        {
          name: 'cerro_kitchen',
          value: process.env.TEST_KITCHEN_COOKIE!,
          domain: 'localhost',
          path: '/',
        },
      ]);
      await page.goto('/cocina');
      // Seed 20 in_kitchen orders via API before navigating
      await expect(page.getByText('Página 1 / 2')).toBeVisible();
      await expect(page.locator('article')).toHaveCount(16);
      await page.waitForTimeout(10_500);
      await expect(page.getByText('Página 2 / 2')).toBeVisible();
      await expect(page.locator('article')).toHaveCount(4);
    });
  });

  test.describe('AC-5 — Timer turns red after 10 min', () => {
    test('elapsed timer is red with animate-pulse for order > 10 min old', async ({
      page,
      context,
    }) => {
      await context.addCookies([
        {
          name: 'cerro_kitchen',
          value: process.env.TEST_KITCHEN_COOKIE!,
          domain: 'localhost',
          path: '/',
        },
      ]);
      await page.goto('/cocina');
      // Verify a ticket with paidAt > 10 min ago shows red timer
      const timer = page.locator('span.text-red-400').first();
      await expect(timer).toBeVisible({ timeout: 2_000 });
      await expect(timer).toHaveClass(/animate-pulse/);
    });
  });

  test.describe('AC-6 — Expired device session → re-pair screen, no data leak', () => {
    test('redirects to PIN entry when kitchen cookie is absent', async ({ page }) => {
      // No kitchen cookie set
      await page.goto('/cocina');
      await expect(page.getByText('Ingresa el PIN del dispositivo')).toBeVisible();
      await expect(page.locator('article')).toHaveCount(0);
    });

    test('SSE returns 401 for expired cookie and board redirects to pair screen', async ({
      page,
      context,
    }) => {
      await context.addCookies([
        {
          name: 'cerro_kitchen',
          value: 'expired-or-invalid-seal',
          domain: 'localhost',
          path: '/',
        },
      ]);
      await page.goto('/cocina');
      await expect(page.getByText('Ingresa el PIN del dispositivo')).toBeVisible();
    });
  });
});
