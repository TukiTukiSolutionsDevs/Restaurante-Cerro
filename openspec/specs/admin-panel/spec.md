# Spec: `admin-panel`

**Status:** draft  
**Created:** 2026-05-23  
**Capability slug:** `admin-panel`  
**Change:** `001-mvp-foundation`

---

## 1. Purpose

PC-based control center for the restaurant owner/admin. Provides inline daily-menu editing, table layout management, staff user CRUD, daily operational reports, and an audit log viewer — all from a single authenticated desktop interface.

---

## 2. Actors

| Actor | Auth | Session TTL | Device |
|---|---|---|---|
| `admin` | 6-digit PIN (argon2id) via `iron-session` cookie | 12 hours (sliding) | PC browser |

No other roles access `/admin/*`. The `middleware.ts` role-guard rejects requests where the session role is not `admin` and redirects to `/auth/admin`.

---

## 3. Functional Requirements

### 3.1 Menu

Delegated primarily to the `daily-menu` spec. The admin-panel provides a thin integration surface:

- **Inline today's menu panel** — RSC that renders the current `daily_menu` row plus all its `menu_item` children. Each item shows name, category, and an availability toggle (`Switch`). Toggling calls the `POST /admin/menu/items/:id/availability` Server Action and emits `NOTIFY menu_changed`.
- **Combo prices editor** — form rendered from `combo_config` for today's date. Fields: `dine_in_price_cents`, `takeaway_price_cents`, `tupper_full_price_cents`, `tupper_partial_price_cents`. Includes a toggle **"Aplicar a todos los días futuros"**; when enabled the mutation writes the values as defaults (`combo_config` rows for future dates that have not been explicitly overridden); when disabled it writes a per-day override only.
- Full menu CRUD (add/remove items, reorder) is handled by the `daily-menu` spec routes. The admin-panel menu page embeds that spec's UI via the shared route `GET /admin/menu`.

### 3.2 Tables

Delegated to the `table-management` spec for full drag-and-drop UX. The admin-panel provides:

- **Layout editor** — 10×10 grid. Admin drags `table` tiles to set `position_x` / `position_y`. Each tile shows `code` and `capacity`. Saving writes via `PATCH /admin/tables/:id` (Server Action) updating position and capacity.
- **Activate / deactivate** — toggle `table.is_active` without deleting the row (preserves referential integrity with historical orders). A deactivated table is hidden from cashier and waiter views but its past orders remain in reports.
- Full table-group join/split is handled by the `table-management` spec.

### 3.3 Staff Users

Full CRUD on `staff_user` rows.

#### 3.3.1 List view

- Table columns: `display_name`, `role`, `is_active`, `last_seen_at` (derived from the most recent `staff_session.last_seen_at`), `active_sessions` (count of `staff_session` rows where `expires_at > now()`).
- Each row has action buttons: **Edit**, **Reset PIN**, **Force Logout**.

#### 3.3.2 Create / Edit

Fields:

| Field | Validation |
|---|---|
| `display_name` | Non-empty, max 80 chars |
| `role` | One of `cashier`, `waiter`, `admin` |
| `pin` (create only) | 6 digits, must pass PIN policy (§4) |

On create, PIN is hashed with argon2id before insert. `is_active` defaults to `true`.

#### 3.3.3 Reset PIN

Admin provides a new 6-digit PIN for the target user. Server Action hashes it and updates `pin_hash`. All existing `staff_session` rows for that user are deleted in the same transaction (equivalent to force-logout).

#### 3.3.4 Force Logout

Deletes all `staff_session` rows for the target user. On the next request from the affected browser, the middleware finds no valid session and redirects to `/auth/[role]`.

#### 3.3.5 Lockout Reset

If a staff user has been locked out via failed PIN attempts (tracked in the rate-limit store keyed by `(ip, role)`), admin can clear the lockout. MVP: exposes a **"Desbloquear"** button that calls `POST /admin/staff/:id/unlock` which clears the in-memory rate-limit bucket for that user's role. (Rate-limit store is per-process; this is acceptable for single-VPS deployment.)

#### 3.3.6 Self-deactivation guard

If the currently authenticated admin attempts to set `is_active = false` on their own `staff_user` row, the Server Action rejects with error code `SELF_DEACTIVATION_FORBIDDEN` and surfaces the message **"No puedes desactivar tu propia cuenta"**.

### 3.4 Reports (Daily)

#### 3.4.1 Date picker

Defaults to today (`service_date = current_date` in DB timezone). Accepts a `?date=YYYY-MM-DD` query param. Dates in the future are rejected (returns 400).

#### 3.4.2 KPIs

All queries are scoped to `order.paid_at::date = :date` (or `cancelled_at::date` for cancellations), using the index on `(paid_at, status)`.

| KPI | Query hint |
|---|---|
| Total orders by status | `SELECT status, count(*) FROM "order" WHERE paid_at::date = :date GROUP BY status` — also includes `cancelled_at::date = :date` for the `cancelled` bucket |
| Revenue total | `SUM(total_cents)` WHERE `status IN ('paid','in_kitchen','delivered')` |
| Revenue by `payment_method` | Grouped `SUM(total_cents)` split between `cash` and `yape` |
| Revenue by `order_type` | Grouped `SUM(total_cents)` split between `dine_in` and `takeaway` |
| Top 5 menu items by quantity | `JOIN order_item ON ... JOIN menu_item ON ... GROUP BY menu_item.id ORDER BY SUM(quantity) DESC LIMIT 5` |
| Avg kitchen+service latency | `AVG(delivered_at - paid_at)` WHERE `delivered_at IS NOT NULL` |
| Cancellations | `SELECT id, short_code, cancelled_at, payload->>'reason' AS reason FROM "order" WHERE cancelled_at::date = :date` — ordered by `cancelled_at` |

#### 3.4.3 Zero-orders state

When no orders exist for the selected date, the page renders an empty state with the copy **"Sin actividad en este día"** — not an error, HTTP 200.

#### 3.4.4 CSV export

`GET /admin/reports/daily.csv?date=YYYY-MM-DD` (Route Handler) streams a UTF-8 CSV with `Content-Disposition: attachment; filename="reporte-YYYY-MM-DD.csv"`. Columns match the displayed KPI rows. The download should produce totals identical to what is shown in the RSC page.

### 3.5 Audit Log Viewer

- Paginated table (25 rows/page) over `audit_log` ordered by `created_at DESC`.
- Filter controls: `actor_type` (staff / system), `action` (free-text prefix match on `audit_log.action`), `from` / `to` date range.
- Columns displayed: `created_at`, `actor_type`, `actor_id` (resolved to `display_name`), `action`, `entity`, `entity_id`, `payload` (JSON inline, collapsible).
- Read-only. Purpose: incident investigation (e.g. "¿Quién deshizo este cobro?").

---

## 4. Non-Functional Requirements

| ID | Requirement |
|---|---|
| NFR-1 | Daily report queries must execute in **< 500 ms** for a single-day window. Required indexes: `"order"(paid_at, status)`, `"order"(cancelled_at)`. These are defined in the migration for `001-mvp-foundation`. |
| NFR-2 | All destructive admin actions (create/edit/delete staff, force-logout, PIN reset, deactivate table, cancel a paid order, close day) must write a row to `audit_log` before returning a success response. The write and the mutation happen in the same DB transaction. |
| NFR-3 | **PIN policy** — a PIN is rejected if it matches any of the following patterns: all same digits (`000000`–`999999` where all chars equal), sequential ascending (`012345`, `123456`, `234567`, …`456789`), sequential descending (`987654`, `876543`, …`543210`). Validation runs in `lib/auth/pin.ts` as a pure function reused by both the Server Action and a client-side Zod refinement for immediate feedback. |
| NFR-4 | Admin session TTL is **12 hours** sliding (longer than the 8 h for cashier/waiter to accommodate management tasks outside service hours). |
| NFR-5 | All `/admin/*` routes are protected by `middleware.ts`; direct URL access without a valid `admin` session returns a 302 to `/auth/admin`. |

---

## 5. API Contracts

All Server Actions return `{ ok: true, data } | { ok: false, error: { code: string, message: string } }`.  
Route Handlers return JSON with standard HTTP codes unless noted otherwise.

### 5.1 Pages (RSC)

| Route | Kind | Description |
|---|---|---|
| `GET /admin` | RSC | Dashboard — widgets: today revenue, today orders, active tables, avg kitchen time. |
| `GET /admin/menu` | RSC | Defers to `daily-menu` spec; includes inline availability toggles and combo price editor. |
| `GET /admin/tables` | RSC | Defers to `table-management` spec; includes activate/deactivate controls. |
| `GET /admin/staff` | RSC | Staff user list with `last_seen_at` and active session count. |
| `GET /admin/reports/daily?date=YYYY-MM-DD` | RSC | Server-rendered daily report. |
| `GET /admin/audit?from=&to=&actor=&action=&page=` | RSC | Paginated audit log viewer. |

### 5.2 Staff Mutations (Server Actions)

| Route | Body | Success | Error codes |
|---|---|---|---|
| `POST /admin/staff` | `{ display_name: string, role: Role, pin: string }` | `{ id, display_name, role }` | `INVALID_PIN`, `DUPLICATE_NAME`, `VALIDATION_ERROR` |
| `PATCH /admin/staff/:id` | `{ display_name?: string, role?: Role, is_active?: boolean }` | `{ id, ...updated }` | `NOT_FOUND`, `SELF_DEACTIVATION_FORBIDDEN` |
| `POST /admin/staff/:id/reset-pin` | `{ new_pin: string }` | `{ ok: true }` | `NOT_FOUND`, `INVALID_PIN` |
| `POST /admin/staff/:id/force-logout` | _(empty)_ | `{ sessions_revoked: number }` | `NOT_FOUND` |
| `POST /admin/staff/:id/unlock` | _(empty)_ | `{ ok: true }` | `NOT_FOUND` |

### 5.3 Reports (Route Handler)

| Route | Response | Notes |
|---|---|---|
| `GET /admin/reports/daily.csv?date=YYYY-MM-DD` | `text/csv` stream | `Content-Disposition: attachment; filename="reporte-YYYY-MM-DD.csv"` |

### 5.4 Inherited Routes (delegated specs)

| Route | Delegated to |
|---|---|
| `POST /admin/menu/items` | `daily-menu` spec |
| `POST /admin/menu/items/:id/availability` | `daily-menu` spec |
| `POST /admin/tables/group` | `table-management` spec |

---

## 6. UI Structure

### 6.1 Layout

```
┌──────────────────────────────────────────────────────┐
│  Top bar: [logo] [day status: Abierto / Cerrado]     │
│           [Abrir día de atención] / [Cerrar día]     │
├──────────┬───────────────────────────────────────────┤
│ Sidebar  │  Main content area                        │
│          │                                           │
│ Panel    │                                           │
│ Menú     │                                           │
│ Mesas    │                                           │
│ Personal │                                           │
│ Reportes │                                           │
│ Auditoría│                                           │
└──────────┴───────────────────────────────────────────┘
```

### 6.2 Dashboard Widgets

Four stat cards displayed in a 2×2 grid:

| Widget | Data source |
|---|---|
| Ingresos de hoy | `SUM(total_cents)` WHERE `paid_at::date = today` |
| Pedidos de hoy | `COUNT(*)` WHERE `paid_at::date = today` |
| Mesas activas | `COUNT(*)` WHERE `table.is_active = true` |
| Tiempo promedio de cocina | `AVG(delivered_at - paid_at)` WHERE `delivered_at::date = today` |

### 6.3 Staff List Page

```
[+ Crear usuario]

┌──────────────┬──────────┬────────┬─────────────────┬─────────┬──────────────────────────┐
│ Nombre       │ Rol      │ Estado │ Última actividad │ Sesiones│ Acciones                 │
├──────────────┼──────────┼────────┼─────────────────┼─────────┼──────────────────────────┤
│ Lucía        │ Cajero   │ Activo │ hace 3 min       │ 1       │ [Editar] [Reset PIN] [✕] │
└──────────────┴──────────┴────────┴─────────────────┴─────────┴──────────────────────────┘
```

### 6.4 Reports Page

Date picker → KPI cards → tables (top items, cancellations) → [Exportar CSV] button.

### 6.5 shadcn/ui Primitives Used

`Sidebar`, `Card`, `Table`, `Switch`, `Dialog`, `Form`, `Input`, `Select`, `Button`, `Badge`, `DatePicker`, `Pagination`, `Collapsible` (audit payload), `Toast` (mutation feedback).

---

## 7. Acceptance Criteria (E2E)

| ID | Scenario | Expected result |
|---|---|---|
| AC-1 | Admin creates cashier user "Lucía" with a valid PIN via `POST /admin/staff`. | "Lucía" row appears in staff list. Lucía logs into `/caja` with the given PIN successfully. |
| AC-2 | Admin calls `POST /admin/staff/:id/reset-pin` with a new valid PIN for Lucía. | Lucía's previous PIN is rejected at `/caja` login. New PIN is accepted. |
| AC-3 | Admin calls `POST /admin/staff/:id/force-logout` while Lucía has an active browser session. | On Lucía's next request to any `/staff/*` route, `middleware.ts` finds no valid session and redirects to `/auth/cashier`. |
| AC-4 | Admin views `GET /admin/reports/daily?date=today` after mixed cash and Yape payments. | Revenue is split correctly by `payment_method`. The top-selling menu item is listed first in the top-5 table. |
| AC-5 | Admin submits `POST /admin/staff` with `pin = "000000"`. | Server Action returns `{ ok: false, error: { code: "INVALID_PIN", message: "El PIN no es seguro. Evita patrones como 000000 o 123456." } }`. No row is inserted. |
| AC-6 | Admin clicks **Exportar CSV** for today's report. | Browser downloads `reporte-YYYY-MM-DD.csv`. Row totals in the file match the totals displayed on the RSC page. |

---

## 8. Edge Cases

| Scenario | Behaviour |
|---|---|
| Two admins edit the same `menu_item` simultaneously | Last write wins (no optimistic lock at MVP). Both writes produce separate `audit_log` rows; the viewer shows the conflict. |
| Admin tries to deactivate their own account | `PATCH /admin/staff/:id` with `{ is_active: false }` where `:id` matches the session's `staff_user_id` returns `SELF_DEACTIVATION_FORBIDDEN`. |
| Report requested for a date with zero orders | RSC renders the **"Sin actividad en este día"** empty state. HTTP 200. No error thrown. |
| `force-logout` on a user with no active sessions | Server Action succeeds, returns `{ sessions_revoked: 0 }`. No error. |
| Admin resets PIN for another admin | Allowed. Write goes to `audit_log` with `action: 'staff.reset_pin'` and `payload: { target_id }`. |
| CSV export for a date with zero orders | Returns a valid CSV with headers only and no data rows. `Content-Length` is non-zero. |

---

## 9. UI Copy (Spanish, es-PE)

### Navigation
- `"Panel"` — dashboard link
- `"Menú"` — menu section link
- `"Mesas"` — tables section link
- `"Personal"` — staff section link
- `"Reportes"` — reports section link
- `"Auditoría"` — audit log section link

### Day Controls
- `"Abrir día de atención"` — open service day
- `"Cerrar día"` — close service day
- `"Abierto"` / `"Cerrado"` — day status badge

### Staff Actions
- `"Crear usuario"` — open create staff dialog
- `"Editar"` — open edit staff dialog
- `"Restablecer PIN"` — open reset PIN dialog
- `"Cerrar sesión forzada"` — force-logout button
- `"Desbloquear"` — clear lockout
- `"No puedes desactivar tu propia cuenta"` — self-deactivation error

### Reports
- `"Exportar CSV"` — export button
- `"Sin actividad en este día"` — zero-orders empty state
- `"Ingresos de hoy"` / `"Pedidos de hoy"` / `"Mesas activas"` / `"Tiempo promedio de cocina"` — dashboard widget labels
- `"Efectivo"` / `"Yape"` — payment method labels
- `"Para comer aquí"` / `"Para llevar"` — order type labels

### PIN Validation
- `"El PIN no es seguro. Evita patrones como 000000 o 123456."` — insecure PIN error

### Combo Prices
- `"Aplicar a todos los días futuros"` — combo price default toggle

---

## 10. Out of Scope

- Multi-restaurant / multi-branch management.
- SUNAT electronic invoicing (comprobante de pago).
- Ingredient inventory tracking.
- Cost / margin analytics.
- Discount or coupon configuration.
- Customer-facing loyalty or promotions.
- Thermal receipt printing (post-MVP).
- Prometheus / full metrics dashboard (post-MVP; `/api/metrics` counter endpoint is defined in `design.md §11` but not surfaced in admin UI at MVP).

---

## 11. Linked Capabilities

| Capability | Relationship |
|---|---|
| `daily-menu` | Admin-panel menu page embeds daily-menu routes and availability toggles. Combo price editor owns `combo_config` writes. |
| `table-management` | Admin-panel tables page embeds the layout editor and activate/deactivate controls. Full group join/split is owned by table-management. |
| `realtime-sync` | Menu availability toggles emit `NOTIFY menu_changed`; propagation to customer view is owned by realtime-sync. |
| `cashier-checkout` | Staff created here are the actors in cashier-checkout flows. Force-logout terminates cashier sessions. |
| `waiter-console` | Waiter staff users created/managed here. |

---

## 12. Open Questions

| # | Question | Default / Assumption |
|---|---|---|
| OQ-A1 | Should "Cerrar día" block new customer orders, or only lock admin edits? | Assume: blocks new `POST /api/orders` once `daily_menu.closed_at` is set. Confirm with product owner. |
| OQ-A2 | Is the combo price "apply to all future days" a database-level default or an explicit copy to every future `combo_config`? | Assume: writes a `combo_config` row for all future `daily_menu` rows that do not yet have an override. Confirm. |
| OQ-A3 | Should the dashboard show real-time counters (SSE-updated) or static RSC snapshot? | Assume: static RSC snapshot with a manual refresh button at MVP. SSE upgrade is post-MVP. |
| OQ-A4 | PIN lockout reset — clear by user ID or by `(ip, role)` bucket? | Assume: clears all buckets associated with the target `staff_user_id`. Implementation details in `lib/auth/rateLimit.ts`. |
