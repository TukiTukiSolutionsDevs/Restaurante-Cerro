# Spec: realtime-sync

**Status:** draft  
**Created:** 2026-05-23  
**Type:** cross-cutting capability  
**Source design:** `openspec/changes/001-mvp-foundation/design.md §6`

---

## 1. Purpose

`realtime-sync` is the single shared mechanism by which any state change committed to Postgres reaches every interested client across the five role views (customer, cashier, waiter, kitchen, admin) without a page reload.

It works as follows: a Postgres `NOTIFY` fires inside the committing transaction; a singleton listener process in the Next.js server receives it and fans the event out via an in-memory `EventEmitter`; each active SSE Route Handler subscribed to that channel writes a typed event frame into its `ReadableStream`; the browser's `EventSource` receives the frame and updates the TanStack Query cache.

The end-to-end latency target is **p95 ≤ 2 s** from transaction commit to all active subscribers updating.

---

## 2. Architecture

```
Postgres ───NOTIFY───▶ pg singleton listener (Next.js server process)
                              │
                              ├─ EventEmitter (in-memory fanout)
                              │
                              ├─▶ SSE /api/sse/menu          (customers, admin live view)
                              ├─▶ SSE /api/sse/order/:token  (one customer per order)
                              ├─▶ SSE /api/sse/kitchen       (kitchen TV)
                              ├─▶ SSE /api/sse/floor         (waiter tablets)
                              └─▶ SSE /api/sse/cashier-queue (cashier console)
```

**Data flow:**

1. A Server Action or system cron calls `notifyAfterTx(channel, payload)` inside a Drizzle transaction.
2. On `COMMIT`, Postgres delivers the `NOTIFY` to the singleton `pg.Client`.
3. The listener parses the JSON payload and calls `bus.emit(channel, payload)`.
4. Each SSE Route Handler that registered a listener on the bus writes an SSE event frame.
5. The browser `EventSource` receives the frame; the `useSSE` hook calls `queryClient.setQueryData` or `queryClient.invalidateQueries`.

All components run inside the single Next.js Node.js process on the company VPS. There is no external message broker in MVP.

---

## 3. Channels

| Channel | Payload shape | Producers |
|---|---|---|
| `menu_changed` | `{ menu_id: number, change_type: 'availability' \| 'crud', entity_id?: number }` | `daily-menu` Server Actions, `admin-panel` Server Actions |
| `order_status_changed` | `{ order_id: string, from: OrderStatus, to: OrderStatus, short_code: string, table_id?: number }` | `cashier-checkout` confirm action, `waiter-console` deliver action, system cron cancel |
| `table_changed` | `{ table_id?: number, group_id?: number, change: 'group_created' \| 'group_closed' \| 'activity' }` | `admin-panel` table-group ops, `waiter-console` (derived from order activity) |

**Payload discipline:**

- NOTIFY payload MUST be ≤ 8 000 bytes (hard Postgres limit). Payloads contain only IDs and change type; subscribers refetch detail from the companion REST endpoint if they need full entity data.
- Any emit call that would produce a payload > 7 900 bytes MUST throw at construction time (defensive check in `notifyAfterTx`).
- Payload values are JSON-serializable primitives (no `Date` objects; use ISO-8601 strings when timestamps are needed).

**TypeScript channel registry** (`src/lib/realtime/channels.ts`):

```ts
export type MenuChangedPayload = {
  menu_id: number;
  change_type: 'availability' | 'crud';
  entity_id?: number;
};

export type OrderStatusChangedPayload = {
  order_id: string;
  from: OrderStatus;
  to: OrderStatus;
  short_code: string;
  table_id?: number;
};

export type TableChangedPayload = {
  table_id?: number;
  group_id?: number;
  change: 'group_created' | 'group_closed' | 'activity';
};

export type ChannelPayloadMap = {
  menu_changed: MenuChangedPayload;
  order_status_changed: OrderStatusChangedPayload;
  table_changed: TableChangedPayload;
};

export type Channel = keyof ChannelPayloadMap;
```

---

## 4. Listener singleton

**File:** `src/lib/realtime/listener.ts`

### 4.1 Implementation contract

- Uses a **dedicated `pg.Client`** (raw `node-postgres`), never a pool connection. A pool connection returned to the pool would lose the `LISTEN` registration.
- The client is stored on `globalThis.__pgListener` so that Next.js HMR in dev does not create a second connection on each module reload.
- Exported as `getRealtimeBus(): TypedEventEmitter<ChannelPayloadMap>`.

### 4.2 Boot sequence

```
1. if (globalThis.__pgListener) return globalThis.__pgListener   // HMR guard
2. const client = new pg.Client({ connectionString: process.env.DATABASE_URL })
3. await client.connect()
4. await client.query('LISTEN menu_changed; LISTEN order_status_changed; LISTEN table_changed;')
5. client.on('notification', (msg) => {
     const payload = JSON.parse(msg.payload ?? '{}')
     bus.emit(msg.channel, payload)
   })
6. client.on('error', scheduleReconnect)
7. client.on('end', scheduleReconnect)
8. globalThis.__pgListener = bus
```

### 4.3 Reconnect strategy

- On `error` or `end` event: the existing client is destroyed and a new `pg.Client` is created.
- Backoff series: **1 s → 2 s → 4 s → 8 s → 15 s → 30 s** (cap). Resets to 1 s on successful reconnect.
- On successful reconnect: re-issue `LISTEN` commands, then emit `__reconnected__` on the bus so all SSE routes can push a `snapshot` event to their subscribers.
- Log every reconnect attempt with `{ reason, attempt, backoffMs, durationMs }` via `pino`.
- The listener state (`connected` | `reconnecting`) is exposed via `getListenerState()` and surfaced in `/api/health`.

### 4.4 Initialization

The singleton is initialized at Next.js server startup via an **instrumentation hook** (`src/instrumentation.ts`):

```ts
export async function register() {
  if (process.env.NEXT_RUNTIME === 'nodejs') {
    const { initRealtimeListener } = await import('./lib/realtime/listener')
    await initRealtimeListener()
  }
}
```

This ensures the listener is live before the first request is served, and runs only in the Node.js runtime (not the Edge runtime).

---

## 5. SSE route pattern

Every SSE Route Handler follows this template. Other specs reference this section instead of duplicating it.

**File pattern:** `src/app/api/sse/<route>/route.ts`

```ts
export const dynamic = 'force-dynamic';

export async function GET(req: Request) {
  const bus = getRealtimeBus();

  const stream = new ReadableStream({
    start(controller) {
      const encoder = new TextEncoder();

      // Helper to write a typed SSE frame
      const send = (event: string, data: unknown, id?: string) => {
        let frame = '';
        if (id)    frame += `id: ${id}\n`;
        if (event) frame += `event: ${event}\n`;
        frame += `data: ${JSON.stringify(data)}\n\n`;
        controller.enqueue(encoder.encode(frame));
      };

      // 1) Send initial snapshot immediately on connect
      fetchSnapshot().then((snapshot) => send('snapshot', snapshot, String(Date.now())));

      // 2) Subscribe to relevant channel(s) via the bus
      const handler = (payload: RelevantPayload) => {
        if (!isRelevantToThisRoute(payload)) return;
        send('update', payload, String(Date.now()));
      };
      bus.on('relevant_channel', handler);

      // 3) Keepalive — send SSE comment every 25 s
      const keepalive = setInterval(() => {
        controller.enqueue(encoder.encode(': keepalive\n\n'));
      }, 25_000);

      // 4) Cleanup on client disconnect
      req.signal.addEventListener('abort', () => {
        bus.off('relevant_channel', handler);
        clearInterval(keepalive);
        controller.close();
      });
    },
  });

  return new Response(stream, {
    headers: {
      'Content-Type':      'text/event-stream',
      'Cache-Control':     'no-cache',
      'X-Accel-Buffering': 'no',   // disables nginx buffering
      'Connection':        'keep-alive',
    },
  });
}
```

**SSE wire format:**

```
event: snapshot
id: 1716480000100
data: {"items":[...]}

event: update
id: 1716480000200
data: {"order_id":"...","to":"in_kitchen","short_code":"A3F7"}

: keepalive
```

- `id:` is a server monotonic timestamp (ms). Browsers pass `Last-Event-ID` on reconnect; the route uses it to query `audit_log` for missed transitions and backfill them before resuming live events.
- The `snapshot` event frame is always the first frame sent; it carries enough data to render the full view without a separate REST call.

### 5.1 Route-to-channel mapping

| SSE Route | Channels subscribed | Filtered by |
|---|---|---|
| `/api/sse/menu` | `menu_changed` | none (broadcast) |
| `/api/sse/order/:token` | `order_status_changed` | `order_id` resolved from validated JWT token |
| `/api/sse/kitchen` | `order_status_changed` | `to` in `['paid','in_kitchen']` |
| `/api/sse/floor` | `order_status_changed`, `table_changed` | none (broadcast active scope) |
| `/api/sse/cashier-queue` | `order_status_changed` | `to === 'pending'` (new arrivals) |

---

## 6. Client subscription pattern

**File:** `src/lib/realtime/useSSE.ts`

### 6.1 Hook contract

```ts
function useSSE<TSnapshot, TUpdate>(
  url: string,
  options: {
    onSnapshot: (data: TSnapshot) => void;
    onUpdate:   (data: TUpdate)   => void;
    enabled?:   boolean;
  }
): { connected: boolean }
```

### 6.2 Behavior

- Uses the native **`EventSource` API** (no external library).
- On `snapshot` event: calls `options.onSnapshot(data)` — typically `queryClient.setQueryData(key, data)`.
- On `update` event: calls `options.onUpdate(data)` — typically `queryClient.setQueryData` with a partial merge.
- On `error` / `close`: closes the `EventSource`, waits the current backoff interval, then opens a new `EventSource`. After a successful reconnect, calls `queryClient.invalidateQueries` to backfill any missed state.
- **Backoff series:** 1 s → 2 s → 4 s → 8 s → 15 s → 30 s (cap), with ±20 % jitter to avoid thundering-herd on process restart.
- **Offline banner:** exposes `connected: boolean`; the `<OfflineBanner />` component renders when `!connected` for > 5 s.
- Cleans up the `EventSource` and removes all event listeners on component unmount.

### 6.3 Usage example (customer order page)

```ts
const { connected } = useSSE<OrderSnapshot, OrderStatusChangedPayload>(
  `/api/sse/order/${token}`,
  {
    onSnapshot: (data) => queryClient.setQueryData(['order', token], data),
    onUpdate:   (data) => queryClient.setQueryData(['order', token], (old) => merge(old, data)),
  }
);
```

---

## 7. NOTIFY emitters

**File:** `src/lib/realtime/notify.ts`

### 7.1 Helper function

```ts
async function notifyAfterTx<C extends Channel>(
  tx: DrizzleTransaction,
  channel: C,
  payload: ChannelPayloadMap[C],
): Promise<void> {
  const json = JSON.stringify(payload);
  if (Buffer.byteLength(json, 'utf8') > 7_900) {
    throw new Error(`NOTIFY payload exceeds 7900 bytes on channel "${channel}"`);
  }
  await tx.execute(sql`SELECT pg_notify(${channel}, ${json})`);
}
```

- Called **inside the Drizzle transaction** that performs the state mutation, so the `NOTIFY` is atomic with the data change: it fires if and only if the transaction commits, and is suppressed on rollback.
- The 7 900-byte guard is a defensive pre-check (Postgres hard limit is 8 000 bytes; the 100-byte margin covers the channel name and framing).

### 7.2 Call sites

| Caller | Channel | Trigger |
|---|---|---|
| `server/actions/admin.ts` — `toggleAvailability` | `menu_changed` | `is_available` flip on `menu_item` |
| `server/actions/admin.ts` — `upsertMenuItem` | `menu_changed` | insert / update / delete `menu_item` |
| `server/actions/cashier.ts` — `confirmPayment` | `order_status_changed` | `pending → paid → in_kitchen` composite transition |
| `server/actions/waiter.ts` — `markDelivered` | `order_status_changed` | `in_kitchen → delivered` |
| `server/services/orders.ts` — cron cancel | `order_status_changed` | `pending → cancelled` (expired QR) |
| `server/actions/admin.ts` — `createTableGroup` | `table_changed` | new group created |
| `server/actions/admin.ts` — `dissolveTableGroup` | `table_changed` | group closed |

---

## 8. Reliability requirements

| Property | Guarantee |
|---|---|
| **Delivery** | At-least-once. `NOTIFY` fires only on `COMMIT`; if the listener connection drops between commit and receipt, the snapshot refetch on reconnect covers it. |
| **Ordering** | No global ordering across channels. Within a single channel, events are delivered in the order Postgres sends them to the listener (FIFO per connection). |
| **Latency** | p95 ≤ 2 s from transaction commit to all SSE subscribers receiving the event frame. |
| **Durability** | NOTIFY is not persisted. Missed events during listener downtime are recovered by the `__reconnected__` → snapshot refetch path. |
| **Missed-event recovery** | SSE clients pass `Last-Event-ID` on reconnect; the route queries `audit_log` for transitions after that timestamp and replays them before resuming live events. |

---

## 9. Limits and capacity

| Parameter | Value | Rationale |
|---|---|---|
| Max concurrent SSE connections | 200 | Customers (≈190) + 1 kitchen + 4 waiters + 2 admin + 2 cashiers = budget |
| Memory per SSE connection | ~1 KB (EventEmitter listener closure + stream controller reference) | |
| Total SSE memory budget | ≤ 200 KB | Fits well within total Node.js memory envelope |
| NOTIFY payload hard limit | 8 000 bytes (Postgres) | |
| NOTIFY payload soft check | 7 900 bytes (enforced in `notifyAfterTx`) | |
| Keepalive interval | 25 s | Below most proxy idle-timeout defaults (30–60 s) |
| Reconnect backoff cap | 30 s | |

**nginx configuration** (required for SSE to pass through the reverse proxy without buffering):

```nginx
location /api/sse/ {
    proxy_pass         http://app:3000;
    proxy_http_version 1.1;
    proxy_set_header   Connection "";
    proxy_buffering    off;
    proxy_cache        off;
    proxy_read_timeout 3600s;
}
```

---

## 10. Acceptance criteria (system-level)

| ID | Criterion |
|---|---|
| **AC-1** | With 100 concurrent customer SSE connections open, a menu `is_available` toggle propagates to all subscribers in < 2 s p95 (measured via load test). |
| **AC-2** | Killing the pg listener connection (`pg_terminate_backend`) causes the listener to reconnect within 30 s; all SSE subscribers receive a refreshed `snapshot` event without a page reload. |
| **AC-3** | Restarting the Next.js process drops all SSE connections; browsers auto-reconnect and receive a `snapshot` event within 30 s. |
| **AC-4** | After 12 h of constant synthetic load (orders + menu toggles + SSE connections churning), the Node.js process RSS does not grow unboundedly (stays < 200 MB). |
| **AC-5** | Calling `notifyAfterTx` with a payload > 7 900 bytes throws synchronously before any DB call, and the outer transaction is rolled back. |

---

## 11. Observability

### 11.1 Metrics

| Metric | Type | Labels |
|---|---|---|
| `realtime_notifications_total` | Counter | `channel` |
| `realtime_sse_connections` | Gauge | `route` |
| `realtime_reconnects_total` | Counter | `reason` (`error` \| `end`) |

Incremented in `listener.ts` on each notification received and in each SSE route on connection open/close. Exposed via `/api/metrics` (basic JSON scrape; full Prometheus format is post-MVP).

### 11.2 Logging

- Every reconnect attempt: `{ level: 'warn', event: 'pg_listener_reconnect', attempt, backoffMs, reason }`.
- Successful reconnect: `{ level: 'info', event: 'pg_listener_connected', durationMs }`.
- NOTIFY payload size guard triggered: `{ level: 'error', event: 'notify_payload_too_large', channel, byteLength }`.
- SSE connection open/close: `{ level: 'debug', event: 'sse_connect'|'sse_disconnect', route, durationMs }`.

All log entries include `requestId` (ULID) from the middleware context.

### 11.3 Health endpoint

`GET /api/health` includes:

```json
{
  "ok": true,
  "db": "up",
  "listener": "connected",
  "listenerReconnects": 0,
  "uptimeSec": 3600
}
```

`listener` field is `"connected"` | `"reconnecting"`. nginx and the uptime monitor poll this endpoint.

---

## 12. Out of scope (MVP)

- **WebSockets** — rejected; bidirectional transport is not needed for server-push-only flows.
- **External message broker (Redis, NATS)** — Postgres-only for MVP; complexity and operational overhead not justified.
- **Multi-instance scaling** — single Next.js node assumed; horizontal scaling would require replacing the in-process `EventEmitter` fanout with a Redis pub/sub bus.
- **Push notifications to phones** — not in MVP.
- **Persistent event log / replay beyond audit_log** — full event sourcing is post-MVP.
- **Edge Runtime** — the `pg.Client` singleton requires Node.js runtime; SSE routes must set `export const runtime = 'nodejs'` (or rely on the default App Router behavior).

---

## Return envelope

```json
{
  "status": "complete",
  "artifacts": [
    "openspec/specs/realtime-sync/spec.md"
  ],
  "executive_summary": "Se especificó el mecanismo de sincronización en tiempo real de Restaurante Cerro: un listener singleton de Postgres distribuye notificaciones NOTIFY a través de un EventEmitter interno hacia cinco rutas SSE independientes, con reconexión automática y backfill de snapshots ante caídas. Cada cambio de estado (menú, pedido, mesa) disparado dentro de una transacción Drizzle llega a todos los clientes activos en menos de 2 segundos p95. El diseño no requiere broker externo y cabe en el presupuesto de 200 conexiones SSE simultáneas del VPS propio.",
  "linked_capabilities": [
    "openspec/specs/daily-menu/spec.md",
    "openspec/specs/order-builder/spec.md",
    "openspec/specs/cashier-checkout/spec.md",
    "openspec/specs/waiter-console/spec.md",
    "openspec/specs/kitchen-display/spec.md",
    "openspec/specs/admin-panel/spec.md",
    "openspec/specs/table-management/spec.md"
  ],
  "next_recommended": "openspec/specs/order-builder/spec.md — it is the first capability to emit order_status_changed events and defines the customer SSE subscription lifecycle end-to-end."
}
```
