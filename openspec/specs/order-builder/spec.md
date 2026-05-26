# order-builder — Capability Specification

**Capability slug:** `order-builder`
**Status:** draft
**Created:** 2026-05-23
**Author:** system (openspec)
**Linked design:** `openspec/changes/001-mvp-foundation/design.md`
**Linked proposal:** `openspec/changes/001-mvp-foundation/proposal.md`

---

## 1. Purpose

Enable an anonymous customer to browse today's menu on their phone, assemble a dine-in or takeaway order (full combo, partial, or individual drinks/desserts), select a table if eating in, and receive a short alphanumeric code plus a QR that they show at the register to trigger payment. No account, no personal data, no online payment — the QR is the only identity token for the order.

---

## 2. Actors

| Actor | Device | Auth |
|---|---|---|
| **Customer** | Mobile phone (primary); tablet and desktop are responsive. | Anonymous — no login, no session cookie. |

Staff actors (cashier, waiter, admin) interact with the *output* of this capability (the order) but their own flows are specified in `cashier-checkout`, `waiter-console`, and `admin-panel`.

---

## 3. Functional Requirements

### FR-1 — Menu landing

The customer lands on `/` and sees today's **open** daily menu, grouped by category (`starter`, `main`, `drink`, `dessert`). If no menu has been published for today, or the menu has been closed (`daily_menu.closed_at IS NOT NULL`), the page shows a "Cerrado" state with a message but no ordering UI.

Each menu item renders its name and availability. Sold-out items (`menu_item.is_available = false`) are shown greyed out and are not addable to the cart.

### FR-2 — Cart composition

The customer can add to the cart:

- Any available `starter` item.
- Any available `main` item.
- Any available `drink` or `dessert` item (priced individually via `menu_item.price_cents`).
- The **full combo** shortcut (1 starter + 1 main selected together from the menu).

Multiple items of the same menu item may be added; `quantity > 0` is enforced.

### FR-3 — Order item variants

Each line in the cart carries a `variant` that drives pricing:

| Variant | Applies to | Price source |
|---|---|---|
| `full_combo` | 1 starter + 1 main paired | `combo_config.dine_in_price_cents` or `takeaway_price_cents` |
| `only_starter` | 1 starter without a paired main | `combo_config.partial_starter_price_cents` |
| `only_main` | 1 main without a paired starter | `combo_config.partial_main_price_cents` |
| `drink_extra` | Any drink item | `menu_item.price_cents` |
| `dessert_extra` | Any dessert item | `menu_item.price_cents` |

**Schema extension (this capability owns this change):** `menu_item` gains a nullable column `price_cents INT NULL`. It is required for items of category `drink` or `dessert`; it is `NULL` (and ignored) for `starter` and `main`. Admin must set `price_cents` when creating a drink or dessert item; if it is missing, the admin panel must warn and block publish.

### FR-4 — Order type and tupper

Before submitting, the customer chooses:

- **Dine-in (`dine_in`):** eats at the restaurant. Table selection is then required (see FR-5).
- **Takeaway (`takeaway`):** takes the food away. Optional tupper add-on available.

Tupper add-on toggle (takeaway only):

- Shown as a checkbox/toggle labelled "Con tupper".
- Adds `combo_config.tupper_full_price_cents` (default S/2) if the order contains a `full_combo` line.
- Adds `combo_config.tupper_partial_price_cents` (default S/1) if the order contains only partial lines.
- The `with_tupper` flag is stored on each `order_item` row.

### FR-5 — Table selection (dine-in only)

If `order_type = dine_in`, the customer must pick a table before they can submit. The `TableGrid` component displays the floor layout using each table's `position_x` / `position_y` coordinates. Only **free** tables are selectable; occupied/tentatively-reserved tables are shown in a different visual state and are not interactive.

Selecting a table does **not** reserve it immediately — the reservation is created atomically inside the `POST /api/orders` transaction (see FR-6). If another customer submits an order for the same table in the window between the customer selecting and submitting, the second customer's submission receives a `409 TABLE_TAKEN` error.

Tentative reservation lifetime: 15 min (matches QR TTL). The table is released when:
- The order is cancelled (auto or manual), or
- `qr_expires_at` passes and the cleanup job cancels the order (see FR-8).

### FR-6 — Order submission

`POST /api/orders` performs all of the following in a **single database transaction**:

1. Validates items against today's published menu (all items `is_available = true`, correct `daily_menu_id`).
2. If `dine_in`, checks that the selected table is free (no order in status `pending`, `paid`, or `in_kitchen` references it). Fails with `409 TABLE_TAKEN` otherwise.
3. Runs `priceOrder()` to compute `total_cents` from the canonical combo config.
4. Generates `short_code`: 4 characters drawn from the safe alphabet `[A-Z \ {I, O}] ∪ [2-9]` (32 characters; 32⁴ = 1,048,576 combinations — sufficient for daily volume). Uniqueness enforced by the `order(short_code)` unique index; retry up to 5 times on collision.
5. Generates `qr_token`: HS256 JWT signed with `QR_SECRET`, TTL 15 min. Payload: `{ orderId, tableGroupId, nonce, iat, exp }`. Nonce is a random 8-byte hex string.
6. Creates one `order` row (`status = pending`) and one `order_item` row per cart line, with `unit_price_cents` frozen at the computed value.
7. If `dine_in`, creates (or reuses) a `table_group` row and a `table_group_member` row linking the selected table to the order.
8. Returns `{ orderId, shortCode, qrToken, qrExpiresAt, totalCents }`.
9. After the transaction commits, emits `NOTIFY table_changed` (so the floor grid on the customer-facing table picker updates live).

Rate limit: 10 submissions / min per IP (in-memory token bucket, per-process).

### FR-7 — Order ticket page

The page at `/pedido/[token]` is server-rendered (`[RSC]`) with the initial order state. It immediately hydrates a client component that subscribes to `GET /api/sse/order/:token`.

The page displays:
- `short_code` in a large, high-contrast font (minimum 48 px equivalent).
- QR code image encoding the order URL (200 × 200 px minimum, 300 × 300 px on ≥ `md` breakpoint).
- Instruction text: "Muestra este código en caja".
- Ordered items list with quantities and line totals.
- Total amount (`formatSoles(total_cents)`).
- Table code if `dine_in`.
- Status badge (see copy table in §10) that updates live via SSE without page reload.

### FR-8 — QR expiry and auto-cancel

A server-side cron job (or on-demand check triggered on cashier scan) runs every 60 s and transitions any order where `status = pending AND qr_expires_at < now()` to `status = cancelled`. On cancellation:

- Sets `cancelled_at = now()`.
- Releases the tentatively reserved table (the associated `table_group` / `table_group_member` rows are de-linked or the group is dissolved).
- Emits `NOTIFY order_status_changed` so the customer's SSE stream receives the `cancelled` event and the page shows the expired state.

The cashier scan endpoint (`POST /caja/scan`) also eagerly checks expiry and returns `EXPIRED` without touching order status — the cleanup job handles the actual transition.

### FR-9 — Cart editing while pending

The customer may modify their cart after submission while the order is still `pending` and `qr_expires_at > now()` via `PATCH /api/orders/:token/items`. Editing:
- Re-runs `priceOrder()` and updates `total_cents`.
- Replaces all `order_item` rows for the order (full replace, not patch per line).
- Does **not** change `short_code`, `qr_token`, or `qr_expires_at`.

Once status transitions to `paid`, the edit endpoint returns `423 LOCKED` with error code `ORDER_LOCKED`.

### FR-10 — No personal data

No email, phone number, name, or device identifier is collected or stored. The `order` row contains no customer PII. IP address used only for rate-limiting (not stored in the order record).

---

## 4. Non-Functional Requirements

| ID | Requirement | Target |
|---|---|---|
| NFR-1 | Mobile-first responsive | Tailwind breakpoints: base = mobile (< 768 px), `md:` = tablet+ (≥ 768 px), `lg:` = desktop (≥ 1024 px). |
| NFR-2 | Menu load performance | First Contentful Paint < 1.5 s on mid-range Android over 4G. Achieved via RSC + `revalidateTag('daily-menu')` cache with 30 s background revalidation. |
| NFR-3 | Order submission latency | `POST /api/orders` round-trip < 500 ms at p95 under 30 concurrent submissions. |
| NFR-4 | Cart state | Fully client-side until submit (Zustand store). No draft persistence in DB in MVP. If the customer closes the tab before submitting, the cart is lost. This is the accepted trade-off for zero server round-trips during browsing. |
| NFR-5 | SSE update latency | Status change visible on order ticket page < 2 s after the server event. |
| NFR-6 | Accessibility | Menu items and interactive controls meet WCAG 2.1 AA. QR image has `alt` text with the short code. |
| NFR-7 | JS-disabled degradation | Menu items are server-rendered and readable without JS. The cart requires JS; a `<noscript>` notice instructs the customer to ask the waiter for assistance. |

---

## 5. UI Flow (Screens)

### Screen 1 — Landing `/`

**Layout:** Sticky header with restaurant name and cart icon (badge shows item count). Menu items grouped in vertical sections by category (`starter`, `main`, `drink`, `dessert`). Sticky bottom bar: cart summary + "Pedir" CTA, disabled if cart is empty.

**Behaviour:**
- Closed-menu state: full-page "Cerrado" illustration + text, no CTA.
- Sold-out item: greyed card, no "Agregar" button, "Agotado" badge.
- Adding an item increments the Zustand cart store optimistically (no server call).
- Item that was in the cart and is sold out live (SSE `menu_changed` event) shows red "Ya no disponible" badge; item stays in cart but is marked invalid and blocks submission.

**Components used:** `MenuItemCard`, `OfflineBanner`, shadcn `Badge`, `Skeleton` (loading state).

### Screen 2 — Cart Drawer

Triggered by tapping the "Pedir" CTA or the cart icon. Rendered as a `shadcn/Sheet` sliding up from the bottom on mobile.

**Sections:**
1. **Items list** — each line shows name, variant selector, quantity stepper (−/+), line price, remove button.
2. **Order type toggle** — `dine_in` / `takeaway` radio; switching re-runs pricing and shows/hides tupper and table sections.
3. **Tupper toggle** — visible only if `takeaway`. Label: "Con tupper (+S/2)" or "Con tupper (+S/1)" depending on combo type detected by the pricing engine.
4. **Table picker** — visible only if `dine_in`. Renders `TableGrid` showing free tables. Selected table is highlighted.
5. **Price breakdown** — subtotal, tupper, total in `formatSoles()`.
6. **"Confirmar pedido"** CTA → navigates to Screen 3.

**Validation before proceeding:**
- Cart must have at least one item.
- All cart items must be available.
- If `dine_in`, a table must be selected.

### Screen 3 — Confirm Screen

Full-page review before the network call.

**Content:** Read-only items list, order type, table (if dine-in), total. "Editar" link returns to drawer. "Enviar pedido" button triggers `POST /api/orders`.

**Loading state:** button shows spinner, disabled. On error (rate limit, TABLE_TAKEN, etc.) an inline `shadcn/Alert` shows the translated error message. On success, the app navigates to Screen 4.

### Screen 4 — Order Ticket `/pedido/[token]`

**Content:**
- Short code in 48 px+ bold monospace.
- QR code (200 × 200 on mobile, 300 × 300 on `md`+) generated client-side from the `qrToken` JWT using a lightweight library (`qrcode` npm package, ~20 KB gzipped).
- "Muestra este código en caja" instruction.
- Status badge — updates live via SSE.
- Collapsible items detail + total.
- "Editar pedido" link (visible only while `pending` and QR not expired).

**Status badge states:**

| `order.status` | Badge copy | Badge colour |
|---|---|---|
| `pending` | "Esperando pago" | Yellow |
| `paid` | "Pago confirmado" | Blue |
| `in_kitchen` | "En cocina" | Orange |
| `delivered` | "Listo, te lo lleva el mozo" | Green |
| `cancelled` (QR expired) | "QR vencido, ya no puedes pagar este pedido" | Red |
| `cancelled` (other) | "Pedido cancelado" | Red |

**Expired QR state:** "Pedido vencido. Habla con un mozo si ya pagaste." Full-page alert, no editing possible.

---

## 6. Pricing Engine

Pure function — no side effects, no DB calls:

```ts
// src/server/services/pricing.ts

type OrderItemInput = {
  variant: 'full_combo' | 'only_starter' | 'only_main' | 'drink_extra' | 'dessert_extra';
  menuItemId: number;
  quantity: number;
  withTupper: boolean;
  unitPriceCents: number; // caller resolves from combo_config or menu_item.price_cents
};

type PriceOrderResult = {
  subtotalCents: number;
  tupperCents: number;
  totalCents: number;
  breakdown: { variant: string; quantity: number; unitPriceCents: number; lineCents: number }[];
};

function priceOrder(
  items: OrderItemInput[],
  orderType: 'dine_in' | 'takeaway',
  comboConfig: ComboConfigRow,
): PriceOrderResult
```

**Combo detection logic (applied by the caller before invoking `priceOrder`):**

1. Count distinct `starter` items and `main` items in the cart.
2. If exactly **one** starter item and **one** main item are present (each quantity = 1) and no other combo lines exist, auto-assign `variant = full_combo` and price both together using `comboConfig.dine_in_price_cents` or `comboConfig.takeaway_price_cents`.
3. If only a starter is present (no main), `variant = only_starter`, price = `comboConfig.partial_starter_price_cents`.
4. If only a main is present (no starter), `variant = only_main`, price = `comboConfig.partial_main_price_cents`.
5. Drinks and desserts are always priced at `menu_item.price_cents` regardless of what else is in the cart.

**Tupper calculation:**

- Tupper only applies if `orderType = takeaway`.
- If any `full_combo` line has `withTupper = true`: add `comboConfig.tupper_full_price_cents` per such line.
- If any `only_starter` or `only_main` line has `withTupper = true`: add `comboConfig.tupper_partial_price_cents` per such line.
- Drink and dessert lines ignore `withTupper`.

**Money rules:** All arithmetic uses integer cents. No floats. Use `sumCents()` from `lib/money/cents.ts`.

**Unit test matrix** (in `tests/unit/pricing.test.ts`):

| Scenario | Input | Expected `totalCents` |
|---|---|---|
| Full combo dine-in | 1 starter + 1 main, no tupper | 1300 |
| Full combo takeaway | 1 starter + 1 main, no tupper | 1500 |
| Full combo takeaway + tupper | 1 starter + 1 main, `withTupper=true` | 1700 |
| Starter only takeaway + tupper | 1 starter only, `withTupper=true` | `partial_starter + 100` |
| Main only dine-in | 1 main only | `partial_main_price_cents` |
| Drink add-on | 1 drink @ 200 | 200 |
| Full combo + drink | 1 starter + 1 main + 1 drink @ 150 | 1300 + 150 = 1450 (dine-in) |

---

## 7. API Contracts

All Route Handlers return JSON. Error shape: `{ error: { code: string, message: string } }`. Success HTTP codes: `200` (GET), `201` (POST creates). Money values in cents (integer).

### 7.1 `GET /api/menu/today`

Shared with `daily-menu` capability. Returns the published menu for today's service date.

**Response `200`:**
```jsonc
{
  "dailyMenuId": 42,
  "serviceDate": "2026-05-23",
  "status": "open", // "open" | "closed" | "not_found"
  "categories": {
    "starter": [
      { "id": 1, "name": "Sopa de fideos", "isAvailable": true, "priceCents": null }
    ],
    "main": [
      { "id": 2, "name": "Pollo a la brasa", "isAvailable": true, "priceCents": null }
    ],
    "drink": [
      { "id": 3, "name": "Chicha morada", "isAvailable": true, "priceCents": 150 }
    ],
    "dessert": [
      { "id": 4, "name": "Mazamorra", "isAvailable": true, "priceCents": 100 }
    ]
  },
  "comboConfig": {
    "dineInPriceCents": 1300,
    "takeawayPriceCents": 1500,
    "tupperFullPriceCents": 200,
    "tupperPartialPriceCents": 100,
    "partialStarterPriceCents": 700,
    "partialMainPriceCents": 800
  }
}
```

**Response `200` (no open menu):**
```jsonc
{ "status": "not_found" }
```

Cache tag: `daily-menu`. Revalidated on admin `menu_changed` NOTIFY.

### 7.2 `GET /api/tables/free`

Returns tables that have no active order (`status IN ('pending','paid','in_kitchen')`) referencing them.

**Response `200`:**
```jsonc
[
  { "id": 7, "code": "M07", "capacity": 4, "positionX": 2, "positionY": 3 }
]
```

No auth required. No caching (always fresh; called just before table picker renders).

### 7.3 `POST /api/orders`

**Request headers:** `Content-Type: application/json`, `X-Requested-With: rc-app`.

**Request body:**
```jsonc
{
  "orderType": "dine_in",        // "dine_in" | "takeaway"
  "tableId": 7,                   // required if dine_in; omit or null if takeaway
  "items": [
    {
      "menuItemId": 1,
      "variant": "full_combo",    // see FR-3 for valid values
      "quantity": 1,
      "withTupper": false
    },
    {
      "menuItemId": 2,
      "variant": "full_combo",
      "quantity": 1,
      "withTupper": false
    }
  ]
}
```

**Validation (Zod, schema in `lib/validation/orderSchemas.ts`):**
- `orderType`: required, enum.
- `tableId`: required integer if `dine_in`, must be omitted/null if `takeaway`.
- `items`: non-empty array, max 20 lines.
- `variant`: valid enum value.
- `quantity`: integer ≥ 1, ≤ 10.
- `withTupper`: boolean, default `false`.

**Response `201`:**
```jsonc
{
  "orderId": "01926e3c-1234-7abc-9def-000000000000",
  "shortCode": "A3F7",
  "qrToken": "<jwt>",
  "qrExpiresAt": "2026-05-23T13:15:00Z",
  "totalCents": 1300
}
```

**Error responses:**

| HTTP | Code | Condition |
|---|---|---|
| `400` | `VALIDATION_ERROR` | Zod schema failed. |
| `400` | `MENU_CLOSED` | No open menu today. |
| `400` | `ITEM_UNAVAILABLE` | One or more items `is_available = false`. |
| `400` | `ITEM_NOT_IN_MENU` | Item ID not in today's menu. |
| `409` | `TABLE_TAKEN` | Selected table has an active order. |
| `429` | `RATE_LIMITED` | >10 requests / min from this IP. |
| `500` | `INTERNAL_ERROR` | Unexpected server error. |

### 7.4 `GET /api/orders/:token`

Verifies the JWT `token` (signature + expiry check; expired tokens still return the order in its current state — do not reject expired tokens here). Returns full order.

**Response `200`:**
```jsonc
{
  "orderId": "01926e3c-...",
  "shortCode": "A3F7",
  "status": "pending",
  "orderType": "dine_in",
  "tableCode": "M07",
  "totalCents": 1300,
  "qrExpiresAt": "2026-05-23T13:15:00Z",
  "items": [
    { "menuItemId": 1, "name": "Sopa de fideos", "variant": "full_combo", "quantity": 1, "unitPriceCents": 1300, "withTupper": false }
  ]
}
```

**Error:** `404 NOT_FOUND` if token signature invalid or order not found.

### 7.5 `GET /api/sse/order/:token`

Opens a `text/event-stream`. Validates the JWT token (expired tokens are allowed — customer may keep the page open post-expiry to see final state). Sends:

- `event: status` — on each `order_status_changed` NOTIFY for this order.
- `: keepalive` — comment every 25 s.

Wire format per design §6.3:
```
event: status
id: 1716480000123
data: {"orderId":"...","status":"in_kitchen","at":"2026-05-23T18:00:00Z"}

: keepalive
```

Client sends `Last-Event-ID` on reconnect; server replays the latest state from `audit_log`.

### 7.6 `PATCH /api/orders/:token/items`

Modifies the cart. Only allowed while `status = pending` and `qr_expires_at > now()`.

**Request body:** same `items` array schema as `POST /api/orders`. Full replacement — all existing `order_item` rows are deleted and re-created.

**Response `200`:** Updated order summary (`totalCents`, `items`).

**Error responses:**

| HTTP | Code | Condition |
|---|---|---|
| `400` | `VALIDATION_ERROR` | Schema failed. |
| `400` | `ITEM_UNAVAILABLE` | Item no longer available. |
| `423` | `ORDER_LOCKED` | Status is not `pending` or QR expired. |
| `404` | `NOT_FOUND` | Token invalid. |

### 7.7 `POST /api/orders/:token/cancel`

Customer-initiated cancellation. Only allowed while `status = pending`.

**Request body:** empty `{}`.

**Response `200`:** `{ "cancelled": true }`.

**Error:** `423 ORDER_LOCKED` if not pending.

---

## 8. Acceptance Criteria (E2E)

Each AC maps to a Playwright test scenario (file: `tests/e2e/order-builder.spec.ts`).

**AC-1 — Full combo dine-in, correct total:**
Customer adds 1 starter + 1 main, selects dine-in, picks table 7 (code `M07`). Submits. Response `totalCents = 1300`. Order ticket page shows "S/13.00" and table code "M07".

**AC-2 — Partial takeaway with tupper, correct total:**
Customer adds 1 starter only, selects takeaway, toggles tupper. `totalCents = combo_config.partial_starter_price_cents + 100`. Order ticket page reflects correct total.

**AC-3 — Simultaneous table selection conflict:**
Two browser contexts (simulating two customers) both select table 7 at the same time. Second `POST /api/orders` to arrive (or the one that loses the DB transaction) receives `409` with `{ error: { code: "TABLE_TAKEN" } }`. The confirm screen shows an error alert "Mesa no disponible, elige otra". No order is created for the losing customer.

**AC-4 — QR expiry displayed correctly:**
Order created. Test advances the clock past `qr_expires_at` (using Playwright `clock.fastForward`). Cleanup job (or on-demand check) transitions order to `cancelled`. Customer SSE stream receives `status: cancelled`. Page shows "QR vencido, ya no puedes pagar este pedido" status badge and "Pedido vencido. Habla con un mozo si ya pagaste." alert. Editing controls are hidden.

**AC-5 — Live lock on payment:**
Customer opens order ticket in one tab (`status = pending`). In a second tab (cashier session), the cashier confirms payment. Within 2 s, the first tab's status badge updates to "Pago confirmado" via SSE. The "Editar pedido" link disappears. `PATCH /api/orders/:token/items` on the now-paid order returns `423 ORDER_LOCKED`.

**AC-6 — Sold-out item in cart:**
Customer adds item A to cart (it is available). Without refreshing, admin (second tab) marks item A as sold-out (`is_available = false`). Customer's landing page receives `menu_changed` SSE event and item A card goes grey. Cart shows item A with red badge "Ya no disponible, remover". "Confirmar pedido" CTA is disabled until the customer removes item A.

---

## 9. Edge Cases

| Scenario | Expected behaviour |
|---|---|
| Customer reserved a table but never paid (abandoned) | After 15 min, cleanup job cancels the order and dissolves the tentative table group. Table returns to free state. `NOTIFY table_changed` emitted so floor grid on other open tabs updates. |
| Customer refreshes order page after QR expiry | `GET /api/orders/:token` still returns the order in its final state (`cancelled`). The page does not error; it shows the expired/cancelled state using the initial RSC render. |
| Customer submits order for a drink with no `price_cents` set | Server returns `500 INTERNAL_ERROR` with an admin-facing log entry. This state should never reach production if the admin validation gate (FR-3 schema note) is enforced. |
| Two identical `short_code` values generated simultaneously | The `UNIQUE` constraint on `order.short_code` causes the second insert to fail. The service retries up to 5 times with a new random code before returning `500 INTERNAL_ERROR`. |
| Customer submits with JS disabled | Menu items are visible (RSC). The cart Zustand store and the Sheet drawer require JS. A `<noscript>` block at the bottom of the page reads: "Para hacer tu pedido, activa JavaScript o habla con un mozo." No form action fallback is provided in MVP. |
| `GET /api/tables/free` called with no open menu | Returns `[]` (empty array). Table picker shows "No hay mesas disponibles." The dine-in path is effectively blocked until admin opens the menu. |
| Customer picks dine-in but table becomes occupied between screen 2 and screen 3 | Submit returns `409 TABLE_TAKEN`. Error shown inline. Customer must re-open table picker and choose again. |

---

## 10. UI Copy (Spanish, es-PE)

| Element | Copy |
|---|---|
| Page heading | "Arma tu pedido" |
| Dine-in option | "Para comer aquí" |
| Takeaway option | "Para llevar" |
| Tupper toggle (full combo) | "Con tupper (+S/2)" |
| Tupper toggle (partial) | "Con tupper (+S/1)" |
| Table picker heading | "Elige tu mesa" |
| Free table label | "Mesa libre" |
| Occupied table label | "Mesa ocupada" |
| Submit button | "Enviar pedido" |
| Edit cart link | "Editar pedido" |
| Order code label | "Tu código" |
| Instruction below QR | "Muestra este código en caja" |
| Status: pending | "Esperando pago" |
| Status: paid | "Pago confirmado" |
| Status: in_kitchen | "En cocina" |
| Status: delivered | "Listo, te lo lleva el mozo" |
| Status: cancelled (QR expired) | "QR vencido, ya no puedes pagar este pedido" |
| Status: cancelled (other) | "Pedido cancelado" |
| Expired order notice | "Pedido vencido. Habla con un mozo si ya pagaste." |
| Sold-out item badge | "Agotado" |
| Cart item unavailable badge | "Ya no disponible, remover" |
| Closed menu state | "Cerrado por hoy. Vuelve mañana." |
| No tables available | "No hay mesas disponibles." |
| JS disabled notice | "Para hacer tu pedido, activa JavaScript o habla con un mozo." |
| Offline banner | "Sin conexión — reconectando…" |
| Rate limit error | "Demasiados intentos. Espera un momento." |
| Table taken error | "Mesa no disponible, elige otra." |

---

## 11. Out of Scope

- Saved favorites or order history.
- Customer push notifications, SMS, or email.
- Comments or special instructions per item (post-MVP).
- Loyalty, discounts, or promotions.
- Online payment; Yape is accepted only at the counter.
- Receipt printing from the customer's phone.
- Offline / PWA mode; no service worker.
- Multiple items of different starters or mains within a single `full_combo` line (one starter + one main per combo line only).

---

## 12. Schema Changes Owned by This Capability

**`menu_item` — add column:**

```sql
ALTER TABLE menu_item
  ADD COLUMN price_cents INT NULL;

COMMENT ON COLUMN menu_item.price_cents IS
  'Required for drink and dessert categories. NULL for starter and main (priced via combo_config).';
```

**Migration file:** `src/db/migrations/0002_menu_item_price_cents.sql`

**Application-level constraint** (enforced in admin-panel capability): when creating or updating a `menu_item` with `category IN ('drink','dessert')`, `price_cents` must be a positive integer. The admin UI must block save if this field is empty.

---

## Return Envelope

```yaml
status: complete
artifacts:
  - openspec/specs/order-builder/spec.md
executive_summary: >
  La spec define el flujo completo del cliente anónimo: desde que ve el menú del día hasta
  que recibe su código corto y QR para pagar en caja, incluyendo selección de mesa, motor
  de precios puro y actualizaciones en vivo vía SSE. Se documenta la extensión de esquema
  necesaria (price_cents en menu_item para bebidas y postres) y se establecen 6 criterios
  de aceptación E2E directamente ejecutables con Playwright. El siguiente paso natural es
  especificar cashier-checkout, que consume el QR generado aquí.
linked_capabilities:
  - daily-menu        # provides GET /api/menu/today; owns menu_item.is_available
  - table-management  # owns table state machine; order-builder reads free tables
  - cashier-checkout  # consumes short_code and qr_token generated here
  - realtime-sync     # SSE bus and LISTEN/NOTIFY plumbing shared across capabilities
next_recommended: cashier-checkout
```
