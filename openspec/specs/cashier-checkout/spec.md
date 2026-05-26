# Spec: cashier-checkout

**Capability slug:** `cashier-checkout`
**Status:** draft
**Created:** 2026-05-23
**Depends on:** `001-mvp-foundation` (design.md — ERD §3, state machine §4, API §5, security §10)

---

## 1. Purpose

The cashier console is the **payment gate**: no order reaches the kitchen until a cashier confirms payment here. This directly solves pain point P1 from the MVP proposal — customers leaving without paying because waiters served on trust. Every `in_kitchen` ticket is guaranteed to have a corresponding `paid_at` timestamp and `paid_by_cashier_id`, making revenue accountability auditable and eliminating revenue leakage.

---

## 2. Actors

| Actor | Device | Auth | Notes |
|---|---|---|---|
| `cashier` | PC (desktop browser) | 6-digit PIN → 12 h sliding session cookie | Primary operator of this console |
| `admin` | PC (desktop browser) | 6-digit PIN → 12 h sliding session cookie | `admin` role grants cashier access; can perform all cashier actions |

Customers, waiters, and kitchen display have no access to `/caja`.

---

## 3. Functional requirements

### FR-1 — Authentication

- Staff logs in at `/auth/cashier` (route: `(staff)/auth/[role]/page.tsx`) with a 6-digit PIN.
- On success: `iron-session` cookie is set with `{ staffId, role, sessionId }`; session expires after **12 hours of inactivity** (sliding window — `last_seen_at` refreshed on every authenticated request by middleware).
- Wrong PIN: rate-limited to **5 attempts per 15 minutes per `(ip, role)` pair**; on lockout returns generic error `"PIN incorrecto. Te quedan N intentos."` counting down; after 5 failures: `"Cuenta bloqueada 15 min por seguridad."`.
- Lockout is tracked in-memory (per-process token bucket, acceptable for single-VPS deployment).

### FR-2 — Main console layout (`GET /caja`)

Console loads as a React Server Component with the following regions:

- **Daily summary bar** (top): count of orders paid today + total revenue broken down by `cash` and `yape` (e.g. `Efectivo: S/182.00 · Yape: S/91.00 · Total: S/273.00`).
- **Left panel (60%)**: code entry input (auto-focused, 4-char `short_code`) + QR scanner panel + order detail / confirm workflow.
- **Right panel (40%)**: live pending orders queue (real-time via SSE, sorted by `created_at ASC`) + last 5 confirmed orders today (with undo link when within 2-minute window).

### FR-3 — Order lookup

Cashier triggers lookup by either:

- Typing a 4-char `short_code` and pressing **Enter**.
- Scanning a QR code with the device camera (`@zxing/browser`; fallback gracefully if permission denied — code entry remains functional).

Server Action `POST /caja/scan` resolves the code to an order and returns:

| Field | Notes |
|---|---|
| `orderId` | UUID v7 |
| `shortCode` | 4-char code |
| `status` | Current enum value |
| `orderType` | `dine_in` \| `takeaway` |
| `tableLabel` | Table code (e.g. `"M14"`) or `"Para llevar"` |
| `items[]` | Each item: name, variant, `withTupper`, quantity, `unitPriceCents` |
| `totalCents` | Frozen total in cents |
| `qrExpired` | `boolean` — `qr_expires_at < now()` |
| `qrConsumed` | `boolean` — `qr_consumed_at IS NOT NULL` |

**QR validity handling:**

- `qrExpired = true` AND status still `pending` → show red banner: `"QR vencido — confirma con cliente y elige cobrar manualmente o cancelar"`. Cashier may still confirm (manual override); this sets `qr_expired_at_confirm: true` in `audit_log.payload`.
- `qrConsumed = true` OR `status != 'pending'` → show error toast; confirm button disabled.

### FR-4 — Payment method selection

After order detail loads, cashier selects:

- **`cash`** — no additional fields.
- **`yape`** — optional Yape operation reference number: free text, 4–12 characters. Label: `"N° de operación Yape (opcional)"`.

Keyboard hotkeys: `1` = cash, `2` = Yape (active when order detail panel is focused).

### FR-5 — Confirm payment

`POST /caja/confirm` (Server Action). Body:

```ts
{
  orderId: string;          // UUID
  paymentMethod: 'cash' | 'yape';
  yapeReference?: string;   // 4–12 chars, only when paymentMethod = 'yape'
  idempotencyKey: string;   // UUID v4 generated client-side per click; prevents double-charge on network retry
}
```

**Server-side transaction (single DB tx, target <300 ms p95):**

1. `SELECT … FOR UPDATE` on `order` row — acquires row-level lock (concurrent cashier race → second gets `ALREADY_LOCKED` → resolved as 409).
2. Guards: `status = 'pending'`, `qr_consumed_at IS NULL` (QR may be expired — allowed with audit flag).
3. Set `status = 'in_kitchen'`, `paid_at = now()`, `paid_by_cashier_id`, `payment_method`, `yape_reference`, `qr_consumed_at = now()`.
4. Insert `audit_log` row: `action = 'order.confirm_payment'`, payload includes `{ paymentMethod, yapeReference?, totalCents, idempotencyKey, qrExpiredAtConfirm }`.
5. `NOTIFY order_status_changed` with `{ orderId, previousStatus: 'pending', status: 'in_kitchen', tableGroupId }`.
6. Commit.

The intermediate `paid` state is materialized — the order passes through `pending → paid → in_kitchen` in one transaction (both `paid_at` and status `in_kitchen` are set atomically), consistent with the design §4 state machine.

### FR-6 — Post-confirm UI update

On success:

- Order disappears from pending queue.
- Appears in "Confirmados hoy" list on right panel with `paid_at` timestamp and payment method badge.
- Toast: `"Pedido enviado a cocina"`.
- Code entry input clears and re-focuses for next scan.

### FR-7 — Undo within 2 minutes

`POST /caja/undo/:orderId` (Server Action).

**Guards:**

- `paid_at` is within 2 minutes of now (`paid_at > now() - interval '2 minutes'`).
- `delivered_at IS NULL` (waiter has not yet marked delivery).
- Actor role is `cashier` or `admin`.

On success:

- `status` reverts to `pending`; `paid_at`, `paid_by_cashier_id`, `payment_method`, `yape_reference`, `qr_consumed_at` all set to `NULL`.
- Insert `audit_log` row: `action = 'order.undo_payment'`.
- `NOTIFY order_status_changed` with `{ orderId, previousStatus: 'in_kitchen', status: 'pending' }`.
- Kitchen TV removes the ticket; order reappears in pending queue.

UI: undo appears as a subtle text link next to each confirmed order in "Confirmados hoy". Link is hidden/disabled after 2 minutes (client-side countdown + server guard).

### FR-8 — Cancel order

`POST /caja/cancel/:orderId` (Server Action). Body: `{ reason: string }` (minimum 5 characters).

**Guards:** `status = 'pending'` only (cashier may not cancel an already-paid order; only admin can cancel `paid` status per design §4).

On success:

- `status = 'cancelled'`, `cancelled_at = now()`.
- Insert `audit_log` row: `action = 'order.cancel'`, payload includes `{ reason }`.
- `NOTIFY order_status_changed`.
- Order removed from pending queue; does not appear in confirmed list.

### FR-9 — Daily summary

Top bar recalculates on each SSE event and on page load. Queries:

```sql
SELECT
  COUNT(*) FILTER (WHERE status != 'cancelled') AS paid_count,
  SUM(total_cents) FILTER (WHERE payment_method = 'cash') AS cash_cents,
  SUM(total_cents) FILTER (WHERE payment_method = 'yape') AS yape_cents
FROM "order"
WHERE paid_at::date = CURRENT_DATE;
```

---

## 4. Non-functional requirements

| Requirement | Target |
|---|---|
| Confirm action round-trip | <300 ms p95 (single SQL transaction, row-lock + NOTIFY) |
| Pending queue scalability | Virtualized list when >30 items (no scroll lag at 60+ concurrent pending orders) |
| Audit completeness | Every confirm, undo, cancel writes an `audit_log` row — non-skippable, inside the same transaction |
| Session security | Role + `staffId` in signed `iron-session` cookie; middleware rejects mismatched roles |
| Idempotency | `idempotencyKey` (client UUID) stored in `audit_log.payload`; server checks for duplicate key before processing confirm |
| SSE reconnect | Auto-reconnect with exponential backoff (1→2→4→8→15→30 s cap); `<OfflineBanner />` after 5 s; full `invalidateQueries` on reconnect |

---

## 5. State transitions guarded here

```
pending  ──confirm(cash|yape)──▶  paid → in_kitchen   (atomic, single tx)
paid     ──undo (within 2min)──▶  pending             (only if delivered_at IS NULL)
pending  ──cancel(reason)─────▶  cancelled
```

Any other attempted transition is rejected with HTTP 409, error code `INVALID_TRANSITION`.

Guards map to `server/services/orders.ts` — all transitions run inside `db.transaction()` with `SELECT … FOR UPDATE`.

---

## 6. API contracts

All Server Actions return `{ ok: true, data } | { ok: false, error: { code, message } }`.

### 6.1 Authentication

| Method | Path | Kind | Body | Response |
|---|---|---|---|---|
| `POST` | `/api/staff/login` | `[RH]` | `{ role: 'cashier'\|'admin', pin: string }` | Sets `iron-session` cookie; returns `{ staffId, displayName, role }` |
| `POST` | `/api/staff/logout` | `[RH]` | — | Clears cookie |

### 6.2 Console page

| Method | Path | Kind | Notes |
|---|---|---|---|
| `GET` | `/caja` | `[RSC]` | Middleware guards: requires session with `role ∈ {cashier, admin}`. Renders console shell with SSE-hydrated queue. |

### 6.3 Server Actions (`src/server/actions/cashier.ts`)

| Action | Path | Body | Success `data` | Error codes |
|---|---|---|---|---|
| Lookup | `POST /caja/scan` | `{ code: string }` | `OrderDetail` (see §3 FR-3) | `NOT_FOUND`, `INVALID_CODE` |
| Confirm | `POST /caja/confirm` | `{ orderId, paymentMethod, yapeReference?, idempotencyKey }` | `{ orderId, status: 'in_kitchen', paidAt }` | `INVALID_TRANSITION`, `ALREADY_CONSUMED`, `ORDER_NOT_FOUND`, `DUPLICATE_IDEMPOTENCY_KEY` |
| Undo | `POST /caja/undo/:orderId` | — | `{ orderId, status: 'pending' }` | `UNDO_WINDOW_EXPIRED`, `ALREADY_DELIVERED`, `INVALID_TRANSITION` |
| Cancel | `POST /caja/cancel/:orderId` | `{ reason: string }` | `{ orderId, status: 'cancelled' }` | `INVALID_TRANSITION`, `REASON_TOO_SHORT` |

### 6.4 SSE stream

| Method | Path | Kind | Events |
|---|---|---|---|
| `GET` | `/api/sse/cashier-queue` | `[RH]` | `order_status_changed` filtered to `pending` orders for today; emits full pending list on connect, then delta events. Keepalive comment every 25 s. |

Wire format (consistent with design §6.3):

```
event: queue_update
id: 1716480000123
data: {"type":"order_added"|"order_removed","orderId":"...","status":"pending","shortCode":"A3F7","tableLabel":"M14","totalCents":1300,"createdAt":"..."}

: keepalive
```

---

## 7. UI structure

### 7.1 Layout

```
┌─────────────────────────────────────────────────────────────────┐
│  DAILY SUMMARY BAR — Efectivo: S/182.00 · Yape: S/91.00        │
├───────────────────────────────────┬─────────────────────────────┤
│  LEFT PANEL (60%)                 │  RIGHT PANEL (40%)          │
│                                   │                             │
│  [ Ingresa código o escanea QR ]  │  COLA PENDIENTE (live)      │
│  [    QR scanner viewport     ]   │  ┌──────────────────────┐   │
│                                   │  │ A3F7  M14  S/13.00  │   │
│  ── Order detail (on lookup) ───  │  │ B9K2  M07  S/15.00  │   │
│  Mesa: M14  Para llevar: —        │  │ …                   │   │
│  Items list                       │  └──────────────────────┘   │
│  Total: S/13.00 (large font)      │                             │
│                                   │  CONFIRMADOS HOY (last 5)   │
│  ( ) Efectivo   ( ) Yape          │  ┌──────────────────────┐   │
│      [N° op. Yape (opcional)]     │  │ C1R4  14:03  cash   │   │
│                                   │  │       [Deshacer]     │   │
│  [ CONFIRMAR COBRO  ]             │  └──────────────────────┘   │
│  Cancelar pedido (text link)      │                             │
└───────────────────────────────────┴─────────────────────────────┘
```

### 7.2 Keyboard-first interaction

| Key | Action |
|---|---|
| Focus auto | Code entry input on page load |
| `Enter` | Submit code lookup (when input focused); confirm payment (when detail loaded + method selected) |
| `1` | Select "Efectivo" (when detail panel focused) |
| `2` | Select "Yape" (when detail panel focused) |
| `Escape` | Clear detail panel, refocus code entry |

### 7.3 Component mapping

| Component | File | Notes |
|---|---|---|
| `CajaPage` | `(staff)/caja/page.tsx` | RSC shell; passes initial data to client components |
| `CashierCodeEntry` | `components/cashier/CashierCodeEntry.tsx` | Auto-focused text input + submit |
| `QrScanner` | `components/cashier/QrScanner.tsx` | `@zxing/browser` wrapper; degrades gracefully on permission denial |
| `OrderDetailPanel` | `components/cashier/OrderDetailPanel.tsx` | Items list, total, payment method radio group, confirm button |
| `PendingQueue` | `components/cashier/PendingQueue.tsx` | Virtualized list (`react-virtual` when >30); SSE-driven |
| `ConfirmedToday` | `components/cashier/ConfirmedToday.tsx` | Last 5 confirmed; countdown-gated undo links |
| `DailySummaryBar` | `components/cashier/DailySummaryBar.tsx` | Cash / Yape / total breakdown |
| `CancelDialog` | `components/cashier/CancelDialog.tsx` | `shadcn/ui Dialog`; requires reason ≥5 chars |
| `RoleAuthGate` | `components/auth/RoleAuthGate.tsx` | Shared; 302 to `/auth/cashier` when no valid session |

### 7.4 Audio feedback

- Sound plays on each new item arriving in the pending queue.
- Implemented via a short audio file (`/public/sounds/new-order.mp3`) played by the `PendingQueue` component on SSE `order_added` event.
- Configurable: toggle stored in `localStorage`; default **on**.

---

## 8. Acceptance criteria (E2E — Playwright)

Tests live in `tests/e2e/cashier-checkout.spec.ts`.

| ID | Scenario | Steps | Expected |
|---|---|---|---|
| AC-1 | Valid PIN login | Navigate to `/auth/cashier`, enter correct PIN | Console `/caja` loads; daily summary visible |
| AC-2 | Code lookup | Type `"A3F7"` in code entry, press Enter | Order detail panel shows items and `S/13.00` total |
| AC-3 | Cash confirm → kitchen | Select "Efectivo", press Enter to confirm | Order moves to "Confirmados hoy"; kitchen TV tab shows ticket within 2 s |
| AC-4 | Duplicate confirm | Attempt to confirm already-paid order | 409 toast with message from `ALREADY_CONSUMED` |
| AC-5 | Undo within window | Confirm, then click "Deshacer" within 30 s | Order returns to pending queue; kitchen ticket removed within 2 s |
| AC-6 | Undo after window | Confirm, wait >3 minutes | "Deshacer" link is disabled/hidden |
| AC-7 | PIN lockout | Enter wrong PIN 5 times | Lockout message appears; login blocked for 15 min |
| AC-8 | Cancel with reason | Click "Cancelar pedido", enter `"cliente sin dinero"`, confirm | Order status → `cancelled`; `audit_log` row with `reason` present in DB |

---

## 9. Edge cases

### 9.1 Expired QR, manual cash override

When `qr_expires_at < now()` but status is still `pending`:

- Red banner: `"QR vencido — confirma con cliente y elige cobrar manualmente o cancelar"`.
- Confirm button remains enabled.
- On confirm, `audit_log.payload` includes `{ qrExpiredAtConfirm: true, qrExpiresAt: "..." }`.
- No `qr_consumed_at` is set (token was already logically expired); `paid_at` and status transition proceed normally.

### 9.2 Network blip / double-click protection

- Client generates a `idempotencyKey` (UUID v4) per confirm click.
- Server checks `audit_log` for an existing row with matching `idempotencyKey` in `payload` before processing.
- On duplicate: returns the original success response without re-applying the transition.
- Confirm button is disabled immediately on first click and re-enabled only after server response.

### 9.3 Concurrent cashier race

- `SELECT … FOR UPDATE NOWAIT` on the `order` row inside the confirm transaction.
- If the row is already locked (second cashier hits confirm simultaneously), the second request fails immediately with `ALREADY_LOCKED` → HTTP 409 → toast: `"Este pedido ya está siendo procesado."`.

### 9.4 Camera permission denied

- `QrScanner` component catches `NotAllowedError` from `@zxing/browser`.
- Scanner viewport collapses; informational message shown: `"Cámara no disponible — ingresa el código manualmente"`.
- `CashierCodeEntry` remains fully functional.

### 9.5 SSE disconnect during confirm

- If the SSE stream is down when confirm succeeds, the pending queue will be stale.
- On SSE reconnect, `queryClient.invalidateQueries(['cashier-queue'])` fetches the current pending list from the server — eventual consistency restored automatically.

---

## 10. UI copy (Spanish, `es-PE`)

| Key | Copy |
|---|---|
| `code_entry.placeholder` | `"Ingresa código o escanea QR"` |
| `payment.cash` | `"Efectivo"` |
| `payment.yape` | `"Yape"` |
| `payment.yape_reference` | `"N° de operación Yape (opcional)"` |
| `action.confirm` | `"Confirmar cobro"` |
| `action.undo` | `"Deshacer"` |
| `action.cancel` | `"Cancelar pedido"` |
| `toast.success` | `"Pedido enviado a cocina"` |
| `toast.already_paid` | `"Este pedido ya fue cobrado."` |
| `toast.race_condition` | `"Este pedido ya está siendo procesado."` |
| `qr.expired_banner` | `"QR vencido — confirma con cliente y elige cobrar manualmente o cancelar"` |
| `camera.denied` | `"Cámara no disponible — ingresa el código manualmente"` |
| `auth.wrong_pin` | `"PIN incorrecto. Te quedan N intentos."` |
| `auth.locked` | `"Cuenta bloqueada 15 min por seguridad."` |
| `undo.window_expired` | `"El tiempo para deshacer ha expirado."` |
| `cancel.reason_label` | `"Motivo de cancelación"` |
| `cancel.reason_hint` | `"Mínimo 5 caracteres"` |

---

## 11. Out of scope

- **Multi-payment split** (e.g. 50% cash + 50% Yape) — post-MVP.
- **Receipt printer integration** (thermal / PDF) — post-MVP.
- **End-of-day cash reconciliation report** — covered by `admin-panel` spec.
- **Admin-initiated cancellation of a `paid` order** — covered by `admin-panel` spec (requires `admin` role guard, not cashier).
- **Yape API / QR gateway integration** — explicitly out of MVP (physical Yape scan at counter only).

---

## Return envelope

```json
{
  "status": "complete",
  "artifacts": [
    "openspec/specs/cashier-checkout/spec.md"
  ],
  "executive_summary": "La especificación define la consola del cajero como la barrera de pago que impide que cualquier pedido llegue a cocina sin confirmación previa, resolviendo la pérdida de ingresos del flujo actual. Cubre autenticación por PIN, flujo de escaneo/código, confirmación atómica con bloqueo a nivel de fila, deshacer con ventana de 2 minutos y cancelación con auditoría obligatoria. La siguiente capacidad recomendada es `kitchen-display`, que consume los eventos `order_status_changed` emitidos por esta especificación.",
  "linked_capabilities": [
    "order-builder",
    "kitchen-display",
    "realtime-sync",
    "admin-panel"
  ],
  "next_recommended": "kitchen-display"
}
```
