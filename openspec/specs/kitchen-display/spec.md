# Spec: `kitchen-display`

**Status:** draft  
**Created:** 2026-05-23  
**Capability slug:** `kitchen-display`  
**Change set:** `001-mvp-foundation`

---

## 1. Purpose

The kitchen display is a large-screen TV mounted in the kitchen that shows all orders currently in state `in_kitchen`, in chronological order (oldest paid first), with table and item information. Its sole job is to give cooks a clear, real-time command queue so they know what to cook and in what order. The screen is read-only: no kitchen input is required in the MVP — waiters are the ones who mark orders as delivered from their own tablet console.

---

## 2. Actors

| Actor | Device | Interaction |
|---|---|---|
| **Kitchen device** | TV or smart display running Chrome 100+ | Read-only browser client. Authenticated once via a "device PIN" entered at setup; session is long-lived (30 days). Subscribes to the SSE stream and renders the ticket board. |
| **Cook** | Human in kitchen | Visual consumer only. No interaction with the screen is expected during service. |

### 2.1 Authentication model

The kitchen device uses a dedicated **device PIN** that is distinct from the 6-digit staff PINs used by cashiers, waiters, and admins. Pairing is a one-time setup step:

1. Admin navigates to `/admin/kitchen/devices` and generates a device PIN.
2. Operator enters the PIN into the TV browser at `/cocina`.
3. Server verifies the PIN via `POST /api/kitchen/device-pair`, returns a signed `httpOnly` cookie with a 30-day TTL.
4. Cookie is stored on the TV browser; subsequent page loads skip the PIN prompt until expiry.

The device session cookie carries `role: 'kitchen'` and is validated by the `(staff)` middleware chain like any other role session, but with the extended 30-day expiry instead of the normal 8-hour sliding window.

---

## 3. Functional requirements

### FR-1 — Boot and authentication gate

On navigating to `/cocina`:
- The `RoleAuthGate` server component checks for a valid `kitchen` role session cookie.
- If absent or expired, the page renders a full-screen PIN entry screen (`PinPad` component) with the prompt "Ingresa el PIN del dispositivo".
- On successful pairing the device is redirected back to `/cocina` with the session cookie set.
- No other data (tickets, orders) is rendered or accessible until the session is established.

### FR-2 — Display layout

The board uses a CSS grid layout optimised for landscape TV resolutions (minimum 1280 × 720, target 1920 × 1080):

- **Grid:** 4 columns × variable rows, tickets fill left-to-right, top-to-bottom.
- **Order:** newest `paid_at` at bottom-right; oldest at top-left (FIFO — oldest order needs the most urgency).
- **Typography:** minimum 24 px base size; ticket `short_code` rendered at ≥ 72 px; all text legible from 3 m at standard TV brightness.
- **No scroll** for ≤ 16 tickets. If > 16 tickets, auto-pagination applies (see FR-7).

### FR-3 — Ticket content

Each ticket card displays, in order:

1. **Short code** — e.g. `A3F7`, rendered very large (≥ 72 px, monospace, high contrast).
2. **Table identifier** — e.g. `MESA M14`; if `order_type === 'takeaway'`, display the `PARA LLEVAR` tag instead.
3. **Tupper indicator** — if `with_tupper === true`, show a tupper icon and the label `Con tupper`.
4. **Item list** — items grouped by category in presentation order: starter → main → drink → dessert. Within each group, show:
   - Display name (e.g. `Caldo de gallina`).
   - Variant label in parentheses when not `full_combo` (e.g. `solo entrada`, `solo segundo`).
   - Quantity suffix (e.g. `× 2`).
5. **Elapsed timer** — live counter showing time since `paid_at`, formatted as `mm:ss`. Color coding:
   - `< 5 min` → green (`#22c55e` or equivalent)
   - `5 – 10 min` → amber (`#f59e0b` or equivalent)
   - `> 10 min` → red (`#ef4444` or equivalent), pulsing border animation to attract attention.

Variant label mapping (UI copy):

| `variant` value | Display label |
|---|---|
| `full_combo` | *(no label — omit parenthetical)* |
| `only_starter` | `solo entrada` |
| `only_main` | `solo segundo` |
| `drink_extra` | `extra bebida` |
| `dessert_extra` | `extra postre` |

### FR-4 — New order notification

When an `add` SSE event is received and a new ticket is rendered:

- The ticket card flashes with a brief entrance animation (e.g. background highlight pulse, 600 ms).
- A chime sound is played via the Web Audio API.
- Mute is configurable: a discreet mute toggle button is visible in the corner of the board header. State is persisted in `localStorage` on the device so it survives page refreshes.

### FR-5 — Order removal

When a waiter marks an order as `delivered`, the server emits an `order_status_changed` event. The SSE client receives a `remove` event for that order:

- The ticket plays a fade-out animation (300 ms opacity → 0) then is removed from the DOM.
- No manual dismissal is needed; the board is purely reactive.

**Admin cancellation edge case** (see also §9): if an order in `in_kitchen` is cancelled by an admin override, the board receives a `remove` event. The ticket displays a 3-second strikethrough flash animation before disappearing to signal the unusual transition to cooks.

### FR-6 — SSE disconnect and reconnect

- If the SSE connection drops:
  - After 5 s: display a full-board overlay banner "Reconectando…" with a spinner. The overlay is semi-transparent so cooks can still read existing tickets.
  - Retry with exponential backoff: 1 s → 2 → 4 → 8 → 15 → 30 s (cap), consistent with the global reconnect policy in `lib/realtime/sse.ts`.
- On successful reconnect:
  - Perform a full refetch via `GET /api/sse/kitchen` (snapshot event) to eliminate any stale or missed state.
  - Dismiss the "Reconectando…" banner with a brief "Conectado" confirmation for 2 s.
- The `Last-Event-ID` header is sent on reconnect so the server can attempt to replay missed events from `audit_log` before falling back to the full snapshot.

### FR-7 — Pagination for > 16 tickets

- The board tracks the current page index client-side.
- If the ticket count exceeds 16, the board splits into pages of 16 and auto-flips every 10 s.
- A page indicator is shown in the header: `Página 1 / 2`.
- No manual navigation; pagination is fully automatic.

---

## 4. Non-functional requirements

| ID | Requirement |
|---|---|
| NFR-1 | Elapsed-timer animation runs at 60 fps using `requestAnimationFrame`; timer DOM updates do not cause layout reflow. |
| NFR-2 | Dark background (`#0a0a0a` or equivalent near-black), white primary text, accent colors (green/amber/red) only for timer states and alerts. |
| NFR-3 | Must render correctly on Chrome 100+ running on a $200 Android TV stick or smart TV. No features that require Chrome 110+ or non-Chromium browsers. |
| NFR-4 | JS heap must remain below 100 MB after 12 h of continuous operation. No unbounded data accumulation: completed orders are pruned from client state on removal. |
| NFR-5 | SSE keepalive comment sent every 25 s by the server to prevent proxy and TV idle-connection timeouts. |
| NFR-6 | Page renders a usable (non-blank) board within 2 s of navigation on a 100 Mbps LAN connection. |

---

## 5. State subscribed

The kitchen client subscribes to the `order_status_changed` Postgres `LISTEN/NOTIFY` channel, relayed via the `GET /api/sse/kitchen` SSE endpoint.

**Client-side filter:** the client only maintains tickets where `status === 'in_kitchen'`. The SSE protocol handles this via typed events so the client does not need to re-filter.

**Initial state on connect:** the first SSE event from the server is always `snapshot`, which carries the full array of currently `in_kitchen` orders. This replaces any local state to ensure consistency.

**Event types received:**

| SSE `event` field | Meaning | Client action |
|---|---|---|
| `snapshot` | Full list of current `in_kitchen` orders | Replace entire local ticket array |
| `add` | A new order entered `in_kitchen` | Append ticket, play chime, animate entrance |
| `update` | An order field changed (e.g. item quantity corrected pre-kitchen — post-MVP, but contract reserved) | Update existing ticket in place |
| `remove` | Order left `in_kitchen` (delivered or cancelled) | Animate removal, prune from state |
| `keepalive` | SSE comment (`: keepalive`) | No action; browser native EventSource handles it |

---

## 6. API contracts

### 6.1 `GET /cocina` — Kitchen board page

- **Kind:** `[RSC]` React Server Component.
- **Guard:** `RoleAuthGate` with `role: 'kitchen'`. Redirects to PIN entry if no valid session.
- **Renders:** empty `KitchenBoard` shell hydrated client-side. No server-side ticket data is embedded (board state comes entirely from SSE snapshot on mount to avoid stale RSC cache).
- **Response:** HTML, standard Next.js App Router page.

### 6.2 `GET /api/sse/kitchen` — Kitchen SSE stream

- **Kind:** `[RH]` Route Handler, `Content-Type: text/event-stream`.
- **Auth:** same `kitchen` role session cookie validated in handler.
- **Connection lifecycle:**
  1. On connect: query `SELECT ... FROM "order" WHERE status = 'in_kitchen' ORDER BY paid_at ASC`.
  2. Emit `snapshot` event with the result array.
  3. Subscribe to `order_status_changed` via `getRealtimeBus()`.
  4. On each `order_status_changed` notification:
     - If `status === 'in_kitchen'` and `previousStatus !== 'in_kitchen'`: emit `add` with full `KitchenTicket` shape.
     - If `previousStatus === 'in_kitchen'` and `status !== 'in_kitchen'`: emit `remove` with `{ order_id, status }` (client uses `status` to distinguish delivery vs. cancellation for animation choice).
  5. Emit `: keepalive` every 25 s.
  6. On client disconnect: unsubscribe from bus, close stream.

**Wire format examples:**

```
event: snapshot
id: 1716480000000
data: [{"order_id":"...","short_code":"A3F7",...},{"order_id":"...","short_code":"B9K2",...}]

event: add
id: 1716480001234
data: {"order_id":"...","short_code":"C4X1","table_code":"M14","order_type":"dine_in","with_tupper":false,"paid_at":"2026-05-23T18:02:00Z","items":[...]}

event: remove
id: 1716480005678
data: {"order_id":"...","status":"delivered"}

: keepalive
```

### 6.3 `POST /api/kitchen/device-pair` — Device pairing

- **Kind:** `[RH]` Route Handler, public (no session required).
- **Body:** `{ device_pin: string }`
- **Validation:** Zod schema; `device_pin` must be a non-empty string.
- **Logic:**
  1. Look up the PIN against a hashed value stored in a `kitchen_device_pin` config entry (admin-managed, argon2id hash).
  2. Rate-limit: 5 attempts / 15 min per IP (same bucket mechanism as staff PIN auth).
  3. On success: set a signed `httpOnly` cookie with `role: 'kitchen'`, `expiresIn: '30d'`, via `iron-session`.
  4. Return `{ ok: true }`.
  5. On failure: return `{ ok: false, error: { code: 'INVALID_PIN' } }` with HTTP 401.
- **No body logging** of the raw PIN.

---

## 7. Ticket data shape (TypeScript)

```ts
type KitchenTicket = {
  order_id: string;           // UUID v7
  short_code: string;         // 4-char alphanum, e.g. "A3F7"
  table_code: string | null;  // null = takeaway
  order_type: 'dine_in' | 'takeaway';
  with_tupper: boolean;
  paid_at: string;            // ISO 8601 timestamptz
  items: Array<{
    name: string;             // Spanish display name from menu_item.name
    category: 'starter' | 'main' | 'drink' | 'dessert';
    variant: 'full_combo' | 'only_starter' | 'only_main' | 'drink_extra' | 'dessert_extra';
    quantity: number;
  }>;
};

// Discriminated union for SSE event payloads
type KitchenSSEEvent =
  | { event: 'snapshot'; data: KitchenTicket[] }
  | { event: 'add';      data: KitchenTicket }
  | { event: 'update';   data: Partial<KitchenTicket> & { order_id: string } }
  | { event: 'remove';   data: { order_id: string; status: 'delivered' | 'cancelled' } };
```

The server assembles `KitchenTicket` by joining `order`, `order_item`, `menu_item`, and `table_group` / `table` in a single query. The client shape is read-only; no mutation paths use this type.

---

## 8. Component tree

```
app/(staff)/cocina/page.tsx          [RSC — auth gate + shell]
  └── KitchenBoard                   [Client Component]
        ├── KitchenBoardHeader        displays page indicator, mute toggle
        ├── KitchenTicketGrid         CSS grid, manages pagination
        │     └── KitchenTicket × N   individual order card
        │           ├── TicketHeader  short_code + table/takeaway tag
        │           ├── TupperBadge   conditional
        │           ├── ItemList      grouped by category
        │           └── ElapsedTimer  rAF-driven, color-coded
        ├── ReconnectOverlay          shown on SSE disconnect > 5s
        └── PinEntryScreen            shown when no valid device session
```

**Key implementation notes:**

- `KitchenBoard` owns the SSE connection via a custom `useKitchenSSE()` hook that wraps `EventSource` with the exponential backoff logic from `lib/realtime/sse.ts`.
- `ElapsedTimer` uses `requestAnimationFrame` internally; it reads `paid_at` as a `Date` on mount and computes elapsed seconds on each frame. Color class is derived from elapsed seconds, not re-queried from state.
- `KitchenTicketGrid` derives the page count from `Math.ceil(tickets.length / 16)` and increments page index via `setInterval` at 10 s.
- The chime is loaded as an `AudioBuffer` via Web Audio API on first user interaction (to satisfy autoplay policies) and cached for the session.

---

## 9. Edge cases

| Scenario | Handling |
|---|---|
| **TV browser sleeps / display off** | On wake, the underlying OS TCP connection may have been silently dropped. The `EventSource` readyState transitions to `CLOSED`. The `useKitchenSSE` hook detects this via an `onerror` handler and triggers the reconnect backoff sequence, followed by a full snapshot refetch. |
| **Order edited after payment** | Not possible in MVP — no edits are allowed after a cashier confirms payment. The `KitchenTicket` shape is immutable once emitted. The `update` SSE event type is reserved in the contract for post-MVP use only. |
| **Admin cancels an `in_kitchen` order** | Server emits `remove` with `{ status: 'cancelled' }`. Client detects `status === 'cancelled'` and plays the 3-second strikethrough flash animation before removing the ticket DOM node. |
| **Multiple tabs / windows on the same TV** | Each tab opens an independent SSE connection. Not a supported configuration; only one tab should be open. The server handles multiple connections correctly (each gets its own stream), but the TV OS should be configured to open `/cocina` full-screen in kiosk mode. |
| **Device PIN expires mid-session** | The SSE route handler validates the session cookie on each new connection. If the cookie has expired and the `EventSource` reconnects, the server returns HTTP 401, which causes `EventSource` to fire `onerror` and stop retrying (per spec). The hook detects HTTP 401 specifically and redirects the page to the PIN entry screen without exposing any order data. |
| **Clock skew between server and TV** | `paid_at` is a server-side timestamp. The `ElapsedTimer` computes `Date.now() - new Date(paid_at).getTime()` using the client clock. Minor skew (< 1 min) is acceptable. The timer is for visual urgency cues, not billing. |
| **SSE snapshot arrives while animation is in flight** | Snapshot replaces the entire ticket array. Any in-progress entrance/exit animations are cancelled by unmounting the old component tree. React key-based reconciliation ensures tickets with the same `order_id` are updated in place if they persist across the snapshot. |

---

## 10. UI copy (Spanish, es-PE)

| Key | String |
|---|---|
| Board header | `Cocina en vivo` |
| Table tag | `MESA M14` (dynamic table code) |
| Takeaway tag | `PARA LLEVAR` |
| Tupper indicator | `Con tupper` |
| Empty state | `Esperando pedidos…` |
| Reconnecting banner | `Reconectando…` |
| Reconnected confirmation | `Conectado` |
| PIN entry prompt | `Ingresa el PIN del dispositivo` |
| PIN expired redirect | `Sesión de dispositivo vencida. Ingresa el PIN nuevamente.` |
| Mute button (muted) | `Sin sonido` |
| Mute button (unmuted) | `Con sonido` |
| Pagination indicator | `Página {n} / {total}` |

---

## 11. Acceptance criteria (E2E)

**AC-1 — New order appears within 2 s with chime**

Given a cashier confirms payment for an order,  
when the kitchen board is open,  
then the order ticket appears on the board within 2 s of the `POST /caja/confirm` Server Action completing, and a chime sound plays.

**AC-2 — Waiter delivers → ticket disappears**

Given a ticket is visible on the kitchen board,  
when a waiter marks the order as delivered via `POST /mozo/deliver/:orderId`,  
then the ticket fades out and is removed from the board DOM.

**AC-3 — Wi-Fi disconnect → reconnect → state matches DB**

Given the kitchen board is displaying tickets,  
when the TV's network connection is cut for 30 s,  
then the "Reconectando…" overlay appears within 5 s of disconnect;  
when the network is restored,  
then the board re-fetches and displays the current `in_kitchen` orders matching the DB state, with the overlay dismissed.

**AC-4 — 20 concurrent tickets trigger pagination**

Given 20 orders are simultaneously in `in_kitchen`,  
then the board shows 16 tickets on page 1 and 4 on page 2, with the indicator `Página 1 / 2`, and the display auto-flips to page 2 after 10 s and back to page 1 after another 10 s.

**AC-5 — Timer turns red after 10 min**

Given a ticket has been on the board for more than 10 min (based on `paid_at`),  
then the elapsed timer is displayed in red with a pulsing border animation.

**AC-6 — Expired device session → re-pair screen, no data leak**

Given a kitchen device session cookie has expired,  
when the TV browser reconnects (or the SSE stream attempts to reconnect),  
then the page redirects to the PIN entry screen and no order data is visible or fetchable until a valid PIN is re-entered.

---

## 12. Out of scope (MVP)

| Feature | Rationale |
|---|---|
| Per-station routing (drink station vs. hot station) | Single unified screen in MVP; station logic requires item-level routing rules. |
| Cook marking order "ready" (separate from waiter marking "delivered") | Would require a new `ready` status and additional waiter–kitchen coordination flow; deferred post-MVP. |
| Recipe or prep-time estimates | No recipe data in the current domain model. |
| Audio voice announcements | Text-to-speech for accessibility; deferred. |
| Admin UI for device pairing (full) | MVP ships PIN generation only; a managed device registry is post-MVP. |
| Multiple kitchen displays (e.g. cold + hot stations) | Single-tenant, single-display assumption throughout MVP. |

---

## 13. Linked capabilities

| Capability | Relationship |
|---|---|
| `cashier-checkout` | Triggers the `pending → in_kitchen` transition that produces kitchen tickets. |
| `waiter-console` | Issues `in_kitchen → delivered` transitions that remove tickets from the board. |
| `realtime-sync` | Provides the `order_status_changed` channel and SSE infrastructure consumed here. |
| `admin-panel` | Manages kitchen device PINs; can issue admin cancellations that trigger the strikethrough edge case. |

---

## 14. Open questions

| # | Question | Default assumption | Owner |
|---|---|---|---|
| OQ-K1 | Where is the `kitchen_device_pin` hash stored? A dedicated DB table row or an env variable? | DB row managed via admin panel (more operable). | Architect |
| OQ-K2 | Should the chime be a bundled audio asset or generated via Web Audio oscillator? | Bundled `.mp3` / `.ogg` in `public/sounds/`; avoids Web Audio complexity. | Product owner |
| OQ-K3 | Is a 30-day device session the right TTL, or should it be indefinite (revocable only by admin)? | 30 days with admin revocation capability. | Product owner |
| OQ-K4 | Should the TV auto-reload the full page daily (e.g. at 04:00) to clear any memory accumulation? | Yes; a `setInterval` daily reload at configurable off-peak hour satisfies NFR-4. | Architect |
