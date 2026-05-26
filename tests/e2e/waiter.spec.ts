import { test } from '@playwright/test';

test.describe.skip('Waiter console — E2E', () => {
  /**
   * AC-1 — Login and initial state
   *
   * Given a waiter with a valid PIN, when they navigate to /login?role=waiter
   * and enter their PIN, then they are redirected to /mozo and see a list of
   * active orders sorted by paid_at ascending (oldest first).
   */
  test('AC-1: waiter logs in and sees active orders sorted oldest-first', async ({ page }) => {
    await page.goto('/login?role=waiter');
    // Enter 6-digit PIN via on-screen keypad
    // Expect redirect to /mozo
    // Expect order cards sorted by elapsed time (oldest first)
  });

  /**
   * AC-2 — New order appears in real time
   *
   * Given the waiter's view is open, when a cashier confirms payment for a new
   * order, then that order card appears in the waiter's "Pedidos activos" tab
   * within 2 seconds, without any manual refresh.
   */
  test('AC-2: new paid order appears in real time without refresh', async ({ page, context: _context }) => {
    await page.goto('/mozo');
    // Open cashier in second page, confirm payment
    // Assert new card appears in waiter view within 2s
  });

  /**
   * AC-3 — Delivery clears order across views
   *
   * Given the waiter taps "Entregado" on order X, then within 2 seconds:
   * (a) the card fades out of the waiter's view, and
   * (b) the ticket for order X disappears from the kitchen TV display.
   */
  test('AC-3: tapping Entregado fades card and removes from kitchen display', async ({ page, context: _context }) => {
    await page.goto('/mozo');
    // Find first order card with "En cocina" status
    // Click "Entregado" button
    // Assert card fades out (opacity → 0) then removed
    // Open kitchen TV page and assert order no longer visible
  });

  /**
   * AC-4 — Join tables updates floor map and customer view
   *
   * Given tables M03 and M04 are free, when the waiter long-presses M03,
   * selects M04, and taps "Unir", then both tables show as a group on the floor
   * map and the customer's table-selection list no longer shows M03 or M04 as
   * individual options.
   */
  test('AC-4: joining M03+M04 updates floor map and hides them from customer', async ({ page, context: _context }) => {
    await page.goto('/mozo');
    // Navigate to Mesas tab
    // Long-press M03 cell (500ms pointer hold)
    // Tap M04 cell to add to selection
    // Tap "Unir mesas" button in join-mode banner
    // Assert M03+M04 cells show group color on floor map
    // Open customer page and assert M03 and M04 not in free-table list
  });

  /**
   * AC-5 — Cannot split group with active order
   *
   * Given a group containing M03+M04 has an order in in_kitchen state, when
   * the waiter taps the group and selects "Separar grupo", then the action
   * fails and a toast reads "No se puede separar: tiene pedido activo". The
   * group remains intact.
   */
  test('AC-5: splitting group with active in_kitchen order shows toast', async ({ page }) => {
    await page.goto('/mozo');
    // Navigate to Mesas tab
    // Tap a table that belongs to an active-order group
    // Tap "Separar grupo" (should be disabled or fail)
    // Assert toast "No se puede separar: tiene pedido activo"
    // Assert group still visible on floor map
  });

  /**
   * AC-6 — Long-press occupied table shows order overlay and gated release
   *
   * Given table M07 has an active order, when the waiter long-presses M07,
   * then the order card overlay appears. When the waiter taps "Liberar mesa",
   * then a confirm dialog appears with the warning copy. The release does not
   * execute until the waiter confirms.
   */
  test('AC-6: long-press occupied table shows overlay and confirm dialog before release', async ({ page }) => {
    await page.goto('/mozo');
    // Navigate to Mesas tab
    // Tap M07 (occupied) cell
    // Assert bottom sheet slides up with order details
    // Tap "Liberar mesa"
    // Assert confirm dialog with "¿Seguro? Esto no cobra el pedido si hay uno activo."
    // Assert release does NOT fire until [Liberar] is confirmed
  });
});
