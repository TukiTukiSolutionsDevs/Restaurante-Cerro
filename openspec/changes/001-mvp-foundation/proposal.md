# Proposal: 001-mvp-foundation

**Status:** draft  
**Created:** 2026-05-23  
**Author:** system (openspec)

---

## 1. Problem

### Current manual flow

1. Customer arrives at restaurant and requests a meal verbally or by reading a handwritten/printed board.
2. Waiter writes a paper ticket and hands it to the kitchen.
3. Kitchen prepares and plates the order.
4. Waiter serves the order — often before payment is confirmed.
5. Customer pays at the register at the end of the meal.

### Pain points

| # | Pain point | Impact |
|---|---|---|
| P1 | Customers leave without paying — waiter served on trust, no payment gate before food leaves the kitchen. | Direct revenue loss. |
| P2 | No visibility of available dishes mid-service — caldo or a main course runs out but there is no way to mark it; waiters and customers learn by trial and error. | Order errors, re-takes, wasted kitchen time. |
| P3 | No digital command queue — kitchen works from handwritten tickets that pile up, get lost, or are read out of order. | Wrong delivery order, customer wait time increases. |
| P4 | No table occupancy view — waiters do not know at a glance which tables are free, occupied, or waiting for payment. | Inefficient floor management. |
| P5 | No order pre-loading — customers cannot browse and build their order before they arrive or while waiting; the menu is not accessible digitally. | Slower table turnover. |

---

## 2. Solution (high-level)

A responsive web application (mobile / tablet / desktop / TV) with five role-based views and a strict payment-gate rule: **no order reaches the kitchen without confirmed payment**.

### Role views

| Role | Primary device | Responsibility |
|---|---|---|
| **Customer** | Mobile phone (web) | Browse daily menu, build order (full combo or partial), add tupper option, select table, receive a QR / short code. |
| **Cashier** | PC | Scan or enter customer code, confirm payment method (cash or Yape), release order to kitchen. |
| **Kitchen** | TV display (read-only) | Real-time queue of paid orders grouped by table, ordered by confirmation time. |
| **Waiter** | Tablet | View active orders and table occupancy, mark individual orders as delivered. |
| **Admin** | PC | Daily menu CRUD (add / remove / mark sold-out), pricing, table layout, daily reports. |

### Core flow (happy path)

```
Customer (phone)
  → builds order → receives QR code
      ↓
Cashier (PC)
  → scans QR → confirms payment (cash / Yape)
      ↓
Kitchen TV
  → order appears in real-time queue
      ↓
Waiter (tablet)
  → sees order on table view → delivers → marks delivered
```

### Order composition rules

| Selection | Price | Tupper add-on |
|---|---|---|
| Full combo (starter + main + drink + dessert) — dine-in | S/ 13 | +S/ 2 |
| Full combo — takeaway | S/ 15 | +S/ 2 |
| Partial combo (any subset of courses) — dine-in | S/ 13 | +S/ 1 |
| Partial combo — takeaway | S/ 15 | +S/ 1 |

---

## 3. Goals (measurable)

| ID | Goal | Target |
|---|---|---|
| G1 | Eliminate uncollected orders | Zero kitchen tickets without prior cashier payment confirmation. |
| G2 | Reduce order-to-kitchen latency | >50% reduction vs. paper ticket median time. |
| G3 | Menu availability update | Admin marks a dish sold-out in <10 s; change propagates to customer view in real time. |
| G4 | Concurrent load | 30 tables + 4 active waiters + ~60 simultaneous pending orders without UI lag (p95 update <500 ms). |

---

## 4. Non-goals (MVP out-of-scope)

- **No online payment gateway** — Culqi, Niubiz, MercadoPago, Yape API are all excluded; Yape is accepted only as a physical scan at the counter.
- **No customer accounts or login** — orders are fully anonymous; QR code is the only identifier.
- **No offline PWA mode** — service workers and background sync are not implemented.
- **No native mobile apps** — no iOS App Store or Google Play distribution.
- **No accounting or tax integration** — no SUNAT e-invoice (comprobante de pago) generation.
- **No multi-restaurant / multi-branch support** — single-tenant deployment.
- **No loyalty or promotions engine** — no discounts, punch cards, or campaigns.
- **No delivery partner integration** — PedidosYa, Rappi, etc. are out of scope.

---

## 5. Capabilities to be specced

| Capability slug | Description |
|---|---|
| `daily-menu` | Admin-editable daily menu with per-dish availability flags; real-time propagation to customer view. |
| `order-builder` | Anonymous customer order construction (full / partial combo, tupper, table selection) + QR / code generation. |
| `table-management` | Table state machine (free → occupied → awaiting-payment → free), capacity per table, personal/family join/split. |
| `cashier-checkout` | Scan or enter order code, display order summary, confirm payment method (cash / Yape), release to kitchen. |
| `kitchen-display` | TV-optimized real-time board: paid orders grouped by table, sorted by confirmation time, status transitions. |
| `waiter-console` | Tablet view of active orders by table, delivery confirmation per order line, table occupancy overview. |
| `admin-panel` | Daily menu CRUD, table layout configuration, waiter management, end-of-day reports. |
| `realtime-sync` | Cross-role state propagation: menu changes, payment confirmation events, order status updates. |

Specs will be created under `openspec/specs/<capability-slug>/` in the design phase.

---

## 6. Architectural shape

> Full design decisions (ERD, API contracts, component tree) are deferred to `/sdd-design`. This section captures the shape only.

### Framework

**Next.js 15 App Router** — full-stack, RSC + Server Actions where applicable.

- RSC for read-heavy views (kitchen display, customer menu browse).
- Server Actions for mutations (place order, confirm payment, mark delivered, update menu).
- Route groups per role: `(customer)`, `(cashier)`, `(kitchen)`, `(waiter)`, `(admin)`.

### Database & ORM

**Recommendation: Drizzle ORM over Prisma**

| Concern | Drizzle | Prisma |
|---|---|---|
| Query performance | SQL-first; zero abstraction overhead | Query engine binary adds ~50 ms cold-start on serverless |
| Type safety | Full TypeScript inference from schema | Good, but relies on generated client |
| Migration story | SQL migration files, easy to inspect | Prisma Migrate; shadow DB required |
| Bundle size | Tiny (~30 KB) | Large generated client |
| Ecosystem maturity | Newer but stable; active community | More battle-tested, larger ecosystem |

For a single-tenant VPS deployment with no cold-start concerns the difference is smaller, but Drizzle's SQL-first transparency is preferred for a team that may hand off the project.

### Realtime

**Recommendation: Postgres LISTEN/NOTIFY + Server-Sent Events (SSE)**

| Concern | SSE + LISTEN/NOTIFY | WebSocket layer (e.g. Socket.io / Partykit) |
|---|---|---|
| Infrastructure complexity | Zero extra service; reuses existing PG connection | Requires persistent WS server or third-party service |
| Deployment fit | Works natively in Node.js; compatible with VPS + Docker | Needs sticky sessions or a broker (Redis pub/sub) |
| Browser support | Universal (HTTP/1.1 fallback available) | Universal |
| Bidirectional need | Not needed for MVP (server → client only) | Overkill if not bidirectional |
| Reconnect/backfill | Simple: re-subscribe + fetch missed events on reconnect | Handled by Socket.io but adds weight |

SSE is sufficient because all realtime data flows server → client. Client mutations go through Server Actions (HTTP POST), so no bidirectional channel is needed at MVP.

### Infrastructure

```
docker-compose.yml
├── app          # Next.js (Node.js 20 Alpine)
└── postgres     # PostgreSQL 16 Alpine
```

Same image promoted to prod on company VPS. Environment variables manage dev/prod differences. No Kubernetes at MVP.

### Authentication

- **Staff roles** (cashier, waiter, admin): simple PIN-based auth stored server-side; session via `httpOnly` cookie.
- **Customers**: no auth; anonymous.
- No OAuth, no JWT rotation complexity at MVP.

---

## 7. Risks

| ID | Risk | Likelihood | Impact | Mitigation |
|---|---|---|---|---|
| R1 | Peak-load realtime sync — 60+ concurrent SSE connections + Postgres NOTIFY bursts | Medium | High | Load test before go-live; connection pooling via PgBouncer if needed. |
| R2 | Single-tenant VPS — no redundancy; disk/hardware failure loses data | Low | Critical | Daily automated PG dump to off-site storage (S3 or SFTP); document recovery runbook. |
| R3 | Anonymous QR collision or replay — short code space could be guessed or reused | Medium | Medium | Signed token with short TTL (e.g. 15 min); server validates signature + expiry; single-use flag in DB. |
| R4 | Kitchen TV Wi-Fi drop — display goes blank; kitchen loses order visibility | Medium | High | Visible "Conexión perdida — reconectando…" overlay on SSE disconnect; auto-reconnect with last-known state re-fetch. |
| R5 | PIN-based staff auth brute-force — 4-digit PIN is weak | Low | Medium | Rate-limit PIN attempts per IP; consider 6-digit PINs or role-based lockout after N failures. |

---

## 8. Open questions for design phase

| # | Question | Options | Owner |
|---|---|---|---|
| OQ1 | Realtime mechanism | SSE + PG LISTEN/NOTIFY (recommended) vs. WebSocket | Architect |
| OQ2 | ORM choice | Drizzle (recommended) vs. Prisma | Architect |
| OQ3 | QR token format and TTL | HMAC-SHA256 signed short code, 15 min TTL — confirm or adjust | Architect |
| OQ4 | Customer receipt printing | Print local receipt with order code now or defer to post-MVP? | Product owner |
| OQ5 | Partial combo pricing | Is partial combo always S/ 13 dine-in regardless of which courses are selected? | Product owner |
| OQ6 | Table pre-selection by customer | Can a customer select a table before arriving, or only at the cashier? | Product owner |
