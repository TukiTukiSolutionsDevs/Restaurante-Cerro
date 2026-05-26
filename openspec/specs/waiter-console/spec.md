# Spec: waiter-console

**Status:** draft  
**Created:** 2026-05-23  
**Capability slug:** `waiter-console`  
**Change:** `001-mvp-foundation`

---

## 1. Purpose

Tablet-optimized interface for the restaurant's 4 waiters. Provides a real-time view of all active orders by table, the floor map state, and single-tap delivery confirmation. Designed for continuous use while moving across the dining floor — the waiter never needs to manually refresh.

**Primary goals:**
- Surface all `paid` and `in_kitchen` orders so waiters know what to pick up and deliver.
- Allow delivery confirmation with one tap, updating the kitchen TV simultaneously.
- Show table occupancy at a glance; support joining/splitting tables and force-freeing a table when needed.
- Stream all state changes in real time via SSE; reconnect automatically if the connection drops.

---

## 2. Actors

| Actor | Auth | Primary device | Notes |
|---|---|---|---|
| **Waiter** (`role = waiter`) | 6-digit PIN, session cookie 12 h | 10–11" tablet (iPad or Android), landscape preferred | Moves constantly; touch-first; no hover states relied upon |

No other role accesses `/mozo` routes. Admin may inspect audit logs after the fact but has no waiter-specific screen.

---

## 3. Functional requirements

### FR-1 — Authentication

- Waiter navigates to `/login?role=waiter`.
- Enters 6-digit PIN via `<PinPad />` (on-screen keypad, no native keyboard).
- On success: `iron-session` cookie written, `staff_session` row created, redirected to `/mozo`.
- Session TTL: 12 hours (sliding on activity).
- Failed PIN: rate-limited 5 attempts / 15 min per `(ip, role)` pair; lock returns generic "PIN incorrecto" without revealing remaining attempts.
- `RoleAuthGate` server component protects all `/mozo/*` routes; unauthenticated requests 302 → `/login?role=waiter`.

### FR-2 — Main view `/mozo` — two tabs

| Tab | Default | Content |
|---|---|---|
| **Pedidos activos** | Yes (default) | List/grid of all orders with `status IN ('paid', 'in_kitchen')`, sorted ascending by `paid_at` (oldest first). |
| **Mesas** | No | Floor map showing all tables with state colors; reuses `<TableGrid />`. |

Tab bar is fixed at the top of the viewport; content area is scrollable.

### FR-3 — Order card content

Each card in the **Pedidos activos** tab displays:

| Element | Source | Notes |
|---|---|---|
| `short_code` | `order.short_code` | Large, bold — primary identifier for waiter |
| Table code | `table.code` via `order.table_group_id` | e.g. `"M03"`, or `"M03 + M04"` for a group |
| Items summary | `order_item` rows joined to `menu_item.name` | Truncated list: up to 3 lines, then `"+N más"` |
| Elapsed time | `now() - order.paid_at` | Displayed as `"hace Xm Ys"` |
| Status badge | `order.status` | `"Esperando cocina"` (paid) · `"En cocina"` (in_kitchen) |
| "Listo para llevar" hint | Computed | Shown when `status = 'in_kitchen'` AND `(now() - paid_at) > 8 minutes` |
| **"Entregado"** button | — | Primary action; 64 dp minimum height |

### FR-4 — Delivery confirmation

1. Waiter taps **"Entregado"** on an order card.
2. Optimistic UI: card dims immediately, button disabled.
3. Server Action `POST /mozo/deliver/:order_id` fires:
   - Guard: `status = 'in_kitchen'` AND `actor.role = 'waiter'`.
   - Transition: `in_kitchen → delivered`, sets `delivered_at = now()`.
   - Emits `NOTIFY order_status_changed`.
4. On success: card fades out with CSS `transition: opacity 400ms` then is removed from the list.
5. On 409 (`ALREADY_DELIVERED`): toast "Ya fue entregado por otro mozo"; card refreshes to reflect delivered state.
6. On any other error: optimistic update reverts, toast with generic message.
7. Haptic feedback via `navigator.vibrate(50)` on tap where supported.

### FR-5 — Floor map (Mesas tab)

- Renders `<TableGrid />` driven by `table.position_x / position_y` coordinates.
- Table cell states and colors defined in §6.
- Tap a table with an active order (`paid` or `in_kitchen`) → overlay sheet slides up showing that table's order card (same card component as Pedidos activos tab).
- Tap a free table → no action (no order to show).

### FR-6 — Join tables

1. Waiter long-presses (≥ 500 ms) a **free** table on the floor map.
2. UI enters **"join mode"**: a floating banner "Modo unir activo — toca las mesas a unir" appears; other free tables highlight with a dashed border.
3. Waiter taps one or more additional free tables to add them to the selection.
4. **"Unir"** button (in the banner) becomes active once ≥ 2 tables are selected.
5. Tapping **"Unir"** calls Server Action `POST /mozo/tables/join` → creates a `table_group` row and `table_group_member` rows.
6. SSE `table_changed` event propagates to all clients; floor map updates; customer's free-table list no longer shows the joined tables as individual options.
7. Pressing **"Cancelar"** exits join mode without changes.

### FR-7 — Split a group

1. Waiter taps a table that belongs to a group (no active order on that group).
2. Bottom sheet shows group info and a **"Separar grupo"** button.
3. Tapping **"Separar grupo"** calls Server Action `POST /mozo/tables/group/:id/split`:
   - Guard: `table_group` has no order with `status IN ('paid', 'in_kitchen')`.
   - On pass: sets `table_group.closed_at = now()`; members revert to free.
4. If guard fails (active order exists): action returns `ACTIVE_ORDER`; waiter sees toast "No se puede separar: tiene pedido activo".

### FR-8 — Force-free a table

1. Waiter taps a table with status `occupied` or `awaiting-payment`.
2. Bottom sheet shows active order summary (if any) and a **"Liberar mesa"** button.
3. Tapping **"Liberar mesa"** opens a confirm dialog:
   > "¿Seguro? Esto no cobra el pedido si hay uno activo."
   > [Cancelar] [Liberar]
4. On confirm: Server Action `POST /mozo/tables/:id/release`:
   - Sets `table_group.closed_at = now()` (if part of a group) or marks table free by closing any associated open order as `cancelled` (if `status = 'paid'` only; `in_kitchen` orders cannot be cancelled by waiter — show toast instead).
   - Writes `audit_log` row: `{ action: 'table.force_release', entity: 'table', entity_id, payload: { orderId?, reason: 'waiter_force_release' } }`.
5. SSE `table_changed` event propagates.

---

## 4. Non-functional requirements

### NFR-1 — Touch targets
- All interactive elements: minimum **48 × 48 dp**.
- Primary action buttons ("Entregado", "Unir", "Liberar"): minimum **64 dp** height.

### NFR-2 — Device support
- **Primary**: 10–11" tablet, landscape orientation. Layout optimized for this form factor.
- **Secondary**: tablet portrait (reflow to 2-column cards).
- **Fallback**: smartphone allowed but not designed for; no breakage, reduced columns.

### NFR-3 — Real-time updates
- All state changes arrive via `GET /api/sse/floor` (SSE).
- No manual refresh required during normal operation.
- SSE reconnect: exponential backoff 1 s → 2 → 4 → 8 → 15 → 30 s (cap). On first successful reconnect: `queryClient.invalidateQueries` to backfill any missed state.
- `<OfflineBanner />` appears after 5 s of SSE disconnection: "Sin conexión — reconectando…". Banner is sticky at the top, yellow/amber background.

### NFR-4 — Performance
- Initial RSC render must show meaningful content (order list or skeleton) within **1 s** on LAN.
- SSE event → visible card update: **< 500 ms** (p95).

### NFR-5 — No offline writes
- When offline (SSE disconnected), all mutation buttons are disabled. Writes are not queued. Waiter must wait for reconnect.

---

## 5. API contracts

### 5.1 Pages

| Route | Kind | Auth guard | Description |
|---|---|---|---|
| `GET /mozo` | RSC | `role = waiter` | Renders skeleton shell + initial `paid`/`in_kitchen` order list. Hydrates client components for SSE. |

### 5.2 SSE stream

**`GET /api/sse/floor`** — Route Handler, `text/event-stream`

Emits a snapshot on connect, then incremental events on change.

**Snapshot event (on connect):**
```
event: snapshot
data: {
  "orders": [{ "orderId", "shortCode", "status", "paidAt", "tableCode", "items": [...] }],
  "tables": [{ "tableId", "code", "state", "groupId" }]
}
```

**Incremental events:**

| Event name | Trigger | Data shape |
|---|---|---|
| `order_update` | `order_status_changed` NOTIFY | `{ orderId, status, paidAt, deliveredAt? }` |
| `table_update` | `table_changed` NOTIFY | `{ tableId, state, groupId? }` |
| `keepalive` | Every 25 s | `: keepalive` comment line |

Clients pass `Last-Event-ID` on reconnect; server refetches events from `audit_log` since that timestamp to backfill.

### 5.3 Server Actions

All Server Actions return `{ ok: true, data } | { ok: false, error: { code, message } }`.

---

**`POST /mozo/deliver/:order_id`**

```ts
// Input: path param order_id (UUID)
// Guard: status = 'in_kitchen' AND actor.role = 'waiter'
// Effect: status → 'delivered', delivered_at = now()
//         audit_log: { action: 'order.delivered', entity: 'order', entity_id: order_id }
//         NOTIFY order_status_changed
// Success: { ok: true, data: { orderId, deliveredAt } }
// Errors:
//   INVALID_TRANSITION (400): order not in in_kitchen state
//   ALREADY_DELIVERED (409): delivered_at already set
//   NOT_FOUND (404)
```

---

**`POST /mozo/tables/join`**

Shared with `table-management` spec. Called by waiter only.

```ts
// Body: { tableIds: number[] }   // min 2
// Guard: all tableIds are free (no open table_group_member), actor.role = 'waiter'|'admin'
// Effect: INSERT table_group; INSERT table_group_member for each id
//         NOTIFY table_changed { kind: 'group_created', tableGroupId }
// Success: { ok: true, data: { tableGroupId } }
// Errors:
//   TABLE_OCCUPIED (409): one or more tables already in a group
//   NOT_FOUND (404): unknown table id
//   VALIDATION (400): fewer than 2 tables
```

---

**`POST /mozo/tables/group/:id/split`**

```ts
// Path: group id (bigint)
// Guard: table_group has no order with status IN ('paid','in_kitchen')
//        actor.role = 'waiter'|'admin'
// Effect: table_group.closed_at = now()
//         NOTIFY table_changed { kind: 'group_closed', tableGroupId: id }
// Success: { ok: true }
// Errors:
//   ACTIVE_ORDER (409): group has active in_kitchen/paid order → "No se puede separar: tiene pedido activo"
//   NOT_FOUND (404)
```

---

**`POST /mozo/tables/:id/release`**

```ts
// Path: table id (bigint)
// Guard: actor.role = 'waiter'|'admin'
//        If table has order with status = 'in_kitchen': reject (cannot release while food in transit)
// Effect:
//   - If table has a 'paid' order: order.status → 'cancelled', cancelled_at = now()
//   - If table is in a group: table_group.closed_at = now()
//   - audit_log: { action: 'table.force_release', payload: { orderId?, reason: 'waiter_force_release' } }
//   - NOTIFY table_changed { kind: 'group_closed' | 'activity' }
// Success: { ok: true }
// Errors:
//   IN_KITCHEN_ACTIVE (409): order currently in_kitchen → toast "No se puede liberar: el pedido está en cocina"
//   NOT_FOUND (404)
```

---

## 6. UX micro-details

### Layout

```
┌─────────────────────────────────────────────────────────┐
│  [Pedidos activos]  [Mesas]                 OfflineBanner│  ← fixed tab bar
├─────────────────────────────────────────────────────────┤
│  ┌──────────┐  ┌──────────┐  ┌──────────┐              │
│  │ Card     │  │ Card     │  │ Card     │              │  ← 3-col landscape
│  │ A3F7     │  │ B2K9     │  │ C1M4     │              │
│  │ M03      │  │ M07      │  │ M12+M13  │              │
│  │ hace 4m  │  │ hace 12m │  │ hace 2m  │              │
│  │          │  │ ⚑ Listo  │  │          │              │
│  │[Entregado│  │[Entregado│  │[Entregado│              │
│  └──────────┘  └──────────┘  └──────────┘              │
└─────────────────────────────────────────────────────────┘
```

- **Landscape (≥ 1024 px):** 3-column card grid.
- **Portrait (≥ 600 px < 1024 px):** 2-column card grid.
- **Narrow (< 600 px):** 1-column list (fallback only).

### Color tokens

| State | Token | Tailwind class | Usage |
|---|---|---|---|
| `paid` (waiting for kitchen) | `--color-status-waiting` | `bg-blue-100 border-blue-400` | Card left border accent + badge |
| `in_kitchen` (cooking) | `--color-status-cooking` | `bg-amber-100 border-amber-400` | Card left border accent + badge |
| `in_kitchen` > 8 min | `--color-status-ready` | `bg-amber-200 border-amber-600` | Intensified amber + "Listo para llevar" hint |
| `delivered` (animating out) | — | `opacity-0 transition-opacity duration-400` | Fade-out before removal |
| Table free | `--color-table-free` | `bg-green-100 border-green-400` | Floor map cell |
| Table occupied | `--color-table-occupied` | `bg-red-100 border-red-400` | Floor map cell |
| Table group | `--color-table-group` | `bg-purple-100 border-purple-400` | Floor map cells in a group |

### Floor map

- Default zoom: all 30 tables fit on screen without scrolling (grid scale auto-calculated from viewport).
- Pinch-to-zoom supported via CSS `touch-action: pinch-zoom` + JS transform; min scale 0.5, max 2.0.
- Grid cells are square; minimum cell size 56 × 56 dp at default zoom.
- Long-press threshold: 500 ms; visual feedback starts at 200 ms (cell darkens slightly).

### Animations

| Interaction | Animation |
|---|---|
| New order appears | `animate-slide-in-top 200ms ease-out` |
| Order delivered | `opacity 0 over 400ms` → remove from DOM |
| Tab switch | Instant (no transition, tablet must feel snappy) |
| Bottom sheet open | Slide up from bottom, 250 ms ease-out |

### Haptics

```ts
// On "Entregado" tap
if ('vibrate' in navigator) navigator.vibrate(50);
// On join mode activated (long-press confirmed)
if ('vibrate' in navigator) navigator.vibrate([30, 20, 30]);
```

---

## 7. Acceptance criteria (E2E)

**AC-1 — Login and initial state**  
> Given a waiter with a valid PIN, when they navigate to `/login?role=waiter` and enter their PIN, then they are redirected to `/mozo` and see a list of active orders sorted by `paid_at` ascending (oldest first).

**AC-2 — New order appears in real time**  
> Given the waiter's view is open, when a cashier confirms payment for a new order, then that order card appears in the waiter's "Pedidos activos" tab within 2 seconds, without any manual refresh.

**AC-3 — Delivery clears order across views**  
> Given the waiter taps "Entregado" on order `X`, then within 2 seconds: (a) the card fades out of the waiter's view, (b) the ticket for order `X` disappears from the kitchen TV display.

**AC-4 — Join tables updates floor map and customer view**  
> Given tables M03 and M04 are free, when the waiter long-presses M03, selects M04, and taps "Unir", then both tables show as a group on the floor map and the customer's table-selection list no longer shows M03 or M04 as individual options.

**AC-5 — Cannot split group with active order**  
> Given a group containing M03+M04 has an order in `in_kitchen` state, when the waiter taps the group and selects "Separar grupo", then the action fails and a toast reads "No se puede separar: tiene pedido activo". The group remains intact.

**AC-6 — Long-press occupied table shows order overlay and gated release**  
> Given table M07 has an active order, when the waiter long-presses M07, then the order card overlay appears. When the waiter taps "Liberar mesa", then a confirm dialog appears with the warning copy. The release does not execute until the waiter confirms.

---

## 8. Edge cases

| Scenario | Behavior |
|---|---|
| Two waiters tap "Entregado" simultaneously on the same order | The second request receives `409 ALREADY_DELIVERED`; toast "Ya fue entregado por otro mozo"; card refreshes to show delivered state. |
| Waiter tries to release a table with order `in_kitchen` | Server returns `IN_KITCHEN_ACTIVE (409)`; toast "No se puede liberar: el pedido está en cocina"; dialog closes. |
| Tablet screen sleeps and wakes | `EventSource` reconnects automatically; on first successful reconnect `queryClient.invalidateQueries(['floor'])` fires to backfill any missed events. |
| SSE connection drops mid-service | `<OfflineBanner />` appears after 5 s; all mutation buttons are disabled with `aria-disabled="true"` and a tooltip "Sin conexión". Reconnect backoff: 1 s → 2 → 4 → 8 → 15 → 30 s. |
| Order delivered then needs reversal | Out of scope for waiter. Waiter must notify admin; admin performs manual correction with `audit_log` reason. No in-app reversal flow in MVP. |
| Waiter enters join mode then navigates to Pedidos tab | Join mode is cancelled; banner dismisses; no group is created. State is local to the floor map component. |
| 30 tables + 4 waiters all subscribing to `/api/sse/floor` | Each waiter holds one SSE connection; 4 concurrent SSE connections to the floor channel. Acceptable under the target load (60 concurrent connections across all channels). |
| `table_group_member` row exists but `table_group.closed_at IS NOT NULL` | Treated as free (stale member rows ignored); query always filters `WHERE table_group.closed_at IS NULL`. |

---

## 9. UI copy (Spanish, `es-PE`)

| Key | String |
|---|---|
| `tab.activeOrders` | "Pedidos activos" |
| `tab.tables` | "Mesas" |
| `btn.deliver` | "Entregado" |
| `badge.inKitchen` | "En cocina" |
| `badge.waitingKitchen` | "Esperando cocina" |
| `hint.readyToDeliver` | "Listo para llevar" |
| `table.free` | "Mesa libre" |
| `table.occupied` | "Mesa ocupada" |
| `table.reserved` | "Reservada" |
| `btn.joinTables` | "Unir mesas" |
| `btn.splitGroup` | "Separar grupo" |
| `btn.releaseTable` | "Liberar mesa" |
| `toast.alreadyDelivered` | "Ya fue entregado por otro mozo" |
| `toast.cannotSplit` | "No se puede separar: tiene pedido activo" |
| `toast.cannotReleaseInKitchen` | "No se puede liberar: el pedido está en cocina" |
| `dialog.releaseWarning` | "¿Seguro? Esto no cobra el pedido si hay uno activo." |
| `dialog.releaseConfirm` | "Liberar" |
| `dialog.cancel` | "Cancelar" |
| `banner.offline` | "Sin conexión — reconectando…" |
| `joinMode.banner` | "Modo unir activo — toca las mesas a unir" |
| `joinMode.cancel` | "Cancelar" |
| `elapsed` | "hace {{m}}m {{s}}s" |

---

## 10. Out of scope (MVP)

- Per-waiter table assignment ("esta es mi mesa").
- Waiter-to-waiter or waiter-to-cashier in-app messaging.
- Tip calculation or tip recording.
- Customer call button at the table (e.g. "llamen al mozo").
- Order modification after `paid` state.
- Order delivery reversal (admin-only workaround via SQL + audit_log).
- Takeaway order tracking on the floor map (takeaway orders have no `table_group_id`; they appear in Pedidos activos but not on the floor map).
- Offline writes / queue (write operations require SSE connection to be active).

---

## Return envelope

```json
{
  "status": "ok",
  "artifacts": [
    "openspec/specs/waiter-console/spec.md"
  ],
  "executive_summary": "La especificación de waiter-console define la consola tablet del mozo: vista en tiempo real de pedidos activos por mesa con confirmación de entrega en un toque, mapa de piso con colores de estado y soporte completo para unir, separar y liberar mesas. Todo el estado llega por SSE sin recarga manual, con reconexión automática y banner de desconexión visible. El spec cubre contratos de API, tokens de color, criterios de aceptación E2E y nueve casos borde incluyendo entregas concurrentes y liberación de mesa con pedido activo.",
  "linked_capabilities": [
    "table-management",
    "kitchen-display",
    "cashier-checkout",
    "realtime-sync"
  ],
  "next_recommended": "admin-panel"
}
```
