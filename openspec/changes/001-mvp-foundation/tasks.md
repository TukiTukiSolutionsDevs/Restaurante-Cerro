# Tasks: 001-mvp-foundation

## Review Workload Forecast

| Field | Value |
|---|---|
| Estimated changed lines | 12k–18k implementation lines across app, tests, migrations, and ops docs |
| 400-line budget risk | High |
| Chained PRs recommended | Yes |
| Suggested split | Bootstrap → domain/db → realtime/auth → menu/tables → customer orders → staff ops → hardening/launch |
| Delivery strategy | ask-on-risk (default; not explicitly provided) |
| Chain strategy | pending |

Decision needed before apply: Yes
Chained PRs recommended: Yes
Chain strategy: pending
400-line budget risk: High

### Suggested Work Units

| Unit | Goal | Likely PR | Notes |
|---|---|---|---|
| 1 | Project bootstrap and CI | PR 1 | T0; no business logic; proves tooling |
| 2 | Domain primitives and DB foundation | PR 2 | T1–T2; enables all services |
| 3 | Realtime and staff auth | PR 3 | T3–T4; cross-cutting runtime |
| 4 | Menu and table management | PR 4 | T5–T6; admin data + floor state |
| 5 | Customer order flow | PR 5 | T7; first end-to-end customer path |
| 6 | Cashier, kitchen, waiter operations | PR 6 | T8–T10; payment gate through delivery |
| 7 | Admin, load, production hardening | PR 7 | T11–T14; reports, resilience, deploy, launch |

## Phase 0 — Project bootstrap (no business code)

- [ ] **T0.1** Initialize Next.js 15 — App Router, TypeScript strict, `src/`, ESLint, Tailwind.
      Files: `package.json`, `next.config.ts`, `tsconfig.json`, `src/app/layout.tsx`, `src/app/page.tsx`, `src/app/globals.css`.
      TDD: RED add a smoke render/typecheck expectation; GREEN scaffold until it passes; REFACTOR remove starter copy and align aliases.
      Tests (write first): `tests/unit/bootstrap.test.ts` → imports app metadata and fails before scaffold.
      Acceptance: `npm run lint`, `npm run typecheck`, and smoke test pass with strict TS.
      Depends on: none.

- [ ] **T0.2** Add Prettier + ESLint config — `next/core-web-vitals` plus import sort.
      Files: `.prettierrc`, `eslint.config.mjs`, `.eslintignore`, `package.json`.
      TDD: RED add intentionally unsorted import fixture; GREEN configure formatter/lint scripts; REFACTOR centralize lint rules.
      Tests (write first): `tests/tooling/eslint-import-sort.test.ts` → verifies lint rejects unsorted imports.
      Acceptance: `npm run format:check` and `npm run lint` enforce style and import ordering.
      Depends on: T0.1.

- [ ] **T0.3** Add Vitest + RTL + jsdom; sample test passes.
      Files: `vitest.config.ts`, `tests/setup.ts`, `tests/component/sample.test.tsx`, `package.json`.
      TDD: RED add failing component sample; GREEN install/configure Vitest, RTL, jsdom; REFACTOR split unit/component configs if needed.
      Tests (write first): `tests/component/sample.test.tsx` → renders a sample button.
      Acceptance: `npm run test:unit` passes in jsdom.
      Depends on: T0.1.

- [ ] **T0.4** Add Playwright — chromium + webkit; sample test passes.
      Files: `playwright.config.ts`, `tests/e2e/sample.spec.ts`, `package.json`.
      TDD: RED add sample navigation test; GREEN configure browsers and local web server; REFACTOR add test tags and trace policy.
      Tests (write first): `tests/e2e/sample.spec.ts` → visits `/` in chromium and webkit.
      Acceptance: `npm run test:e2e` passes locally.
      Depends on: T0.1.

- [ ] **T0.5** Add Drizzle ORM + drizzle-kit + `pg` driver.
      Files: `drizzle.config.ts`, `src/db/client.ts`, `src/db/schema.ts`, `package.json`.
      TDD: RED add config import test expecting `DATABASE_URL`; GREEN wire Drizzle client and pg pool; REFACTOR isolate env parsing.
      Tests (write first): `tests/unit/db-client.test.ts` → validates env guard and client factory.
      Acceptance: Drizzle config loads without connecting during unit tests.
      Depends on: T0.1, T0.3.

- [ ] **T0.6** Add Tailwind + shadcn/ui init; install button, input, dialog, sheet, toast, table, badge.
      Files: `components.json`, `src/components/ui/*`, `tailwind.config.ts`, `src/lib/utils.ts`.
      TDD: RED add component smoke test for `Button`; GREEN initialize shadcn components; REFACTOR normalize variants and aliases.
      Tests (write first): `tests/component/ui-button.test.tsx` → verifies accessible button render.
      Acceptance: required shadcn primitives compile and render.
      Depends on: T0.1, T0.3.

- [ ] **T0.7** Add Zod, React Hook Form, React Query, Zustand, argon2, iron-session, jose.
      Files: `package.json`, `src/lib/query/client.ts`, `src/lib/store/index.ts`, `src/lib/validation/index.ts`.
      TDD: RED add import smoke tests; GREEN install and expose minimal factories; REFACTOR keep provider setup thin.
      Tests (write first): `tests/unit/dependency-smoke.test.ts` → imports each dependency path.
      Acceptance: dependencies import under Node/jsdom without runtime errors.
      Depends on: T0.1, T0.3.

- [ ] **T0.8** Create Docker setup — app + postgres + nginx, plus dev override.
      Files: `docker/Dockerfile`, `docker/docker-compose.yml`, `docker/docker-compose.dev.yml`, `docker/nginx/nginx.conf`.
      TDD: RED add compose validation script/test; GREEN write Dockerfiles and compose services; REFACTOR move shared env anchors.
      Tests (write first): `tests/tooling/docker-compose.test.ts` → runs `docker compose config` through a script.
      Acceptance: dev compose config validates and exposes app/db correctly.
      Depends on: T0.1, T0.5.

- [ ] **T0.9** Add `.env.example`, `.env.local`, and secrets handling for `DATABASE_URL`, `SESSION_SECRET`, `QR_SECRET`, `DEVICE_PIN_SECRET`.
      Files: `.env.example`, `.env.local`, `src/lib/env.ts`, `.gitignore`.
      TDD: RED add env schema test for missing secrets; GREEN add Zod env parser and examples; REFACTOR split server-only env.
      Tests (write first): `tests/unit/env.test.ts` → rejects missing/weak secrets.
      Acceptance: examples document every required secret and `.env.local` is ignored.
      Depends on: T0.7.

- [ ] **T0.10** Add GitHub Actions CI — lint, typecheck, Vitest, Playwright on PR.
      Files: `.github/workflows/ci.yml`, `package.json`.
      TDD: RED add workflow lint check; GREEN wire jobs and cache; REFACTOR split unit/e2e artifacts.
      Tests (write first): `tests/tooling/ci-workflow.test.ts` → validates workflow commands exist.
      Acceptance: workflow runs lint, typecheck, unit/component, and Playwright chromium+webkit.
      Depends on: T0.2, T0.3, T0.4.

- [ ] **T0.11** README quick-start — clone → docker compose up → seeded admin PIN.
      Files: `README.md`.
      TDD: RED add docs checklist test; GREEN document quick-start; REFACTOR add troubleshooting table.
      Tests (write first): `tests/tooling/readme.test.ts` → verifies required quick-start sections.
      Acceptance: README includes local setup, compose commands, and dev-only seed PIN warning.
      Depends on: T0.8, T0.9.

## Phase 1 — Domain primitives (libraries, no UI)

- [ ] **T1.1** `lib/money/` — `formatSoles(cents)`, `priceOrder(items, type, withTupper)` pure function.
      Files: `src/lib/money/cents.ts`, `src/server/services/pricing.ts`.
      TDD: RED cover all pricing matrix variants and edge cases; GREEN implement integer-cent arithmetic; REFACTOR extract helpers and forbid floats.
      Tests (write first): `tests/unit/pricing.test.ts`, `tests/unit/money.test.ts` → order-builder AC-1, AC-2.
      Acceptance: full/partial, dine-in/takeaway, tupper, drink/dessert totals match specs.
      Depends on: T0.3.

- [ ] **T1.2** `lib/auth/pin.ts` — `hashPin`, `verifyPin`, `isInsecurePin(pin)` with argon2id.
      Files: `src/lib/auth/pin.ts`.
      TDD: RED test weak PIN patterns and verify failures; GREEN implement argon2id hash/verify; REFACTOR tune parameters/constants.
      Tests (write first): `tests/unit/pin.test.ts` → admin-panel AC-5 and auth lockout prerequisites.
      Acceptance: insecure PINs are rejected; valid 6-digit PINs hash and verify.
      Depends on: T0.7.

- [ ] **T1.3** `lib/qr/token.ts` — sign/verify JWT HS256 with TTL and nonce.
      Files: `src/lib/qr/token.ts`, `src/lib/qr/shortCode.ts`.
      TDD: RED test expiry, tamper, nonce, and short-code collision shape; GREEN implement jose helpers; REFACTOR isolate clock injection.
      Tests (write first): `tests/unit/qr-token.test.ts`, `tests/unit/short-code.test.ts` → order-builder QR flows.
      Acceptance: tokens validate by secret, expire at 15 min, and include order/table/nonce payload.
      Depends on: T0.7, T0.9.

- [ ] **T1.4** `lib/auth/session.ts` — iron-session helpers and staff/device role typing.
      Files: `src/lib/auth/session.ts`, `src/lib/auth/roles.ts`.
      TDD: RED test read/write/destroy and role mismatch; GREEN implement session helpers; REFACTOR separate staff roles from kitchen device role.
      Tests (write first): `tests/unit/session.test.ts` → role-based auth foundation.
      Acceptance: helpers type cashier/waiter/admin/kitchen sessions and support destroy.
      Depends on: T1.2, T0.9.

- [ ] **T1.5** `lib/realtime/channels.ts` — typed `ChannelPayloadMap`, `notifyAfterTx` helper.
      Files: `src/lib/realtime/channels.ts`, `src/lib/realtime/notify.ts`.
      TDD: RED test channel typing and 7,900-byte payload guard; GREEN implement typed notify helper; REFACTOR share payload constants.
      Tests (write first): `tests/unit/realtime-channels.test.ts` → realtime-sync AC-5.
      Acceptance: `notifyAfterTx` emits typed `pg_notify` only under payload size limit.
      Depends on: T0.5.

## Phase 2 — Database schema & migrations

- [ ] **T2.1** Drizzle schema for menu and tables — `daily_menu`, `menu_item` with `price_cents`, `combo_config`, `table`, `table_group`, `table_group_member`.
      Files: `src/db/schema.ts`, `src/db/types.ts`.
      TDD: RED add schema metadata tests for columns/enums; GREEN define tables and relations; REFACTOR group domain exports.
      Tests (write first): `tests/unit/db-schema-menu-tables.test.ts` → daily-menu/table-management requirements.
      Acceptance: menu, item price, combo, and table/group schemas compile with inferred types.
      Depends on: T0.5.

- [ ] **T2.2** Drizzle schema for orders and staff — `order`, `order_item`, `staff_user`, `staff_session`, `audit_log`.
      Files: `src/db/schema.ts`, `src/db/order-schema.ts` if split.
      TDD: RED assert lifecycle enums and FK metadata; GREEN add order/staff/audit schema; REFACTOR preserve quoted SQL table names.
      Tests (write first): `tests/unit/db-schema-orders.test.ts` → state-machine prerequisites.
      Acceptance: UUID order IDs, statuses, payment fields, sessions, and audit payloads are typed.
      Depends on: T2.1.

- [ ] **T2.3** Add all indexes from design §3 and spec-specific report indexes.
      Files: `src/db/schema.ts`, `src/db/indexes.ts`, migration SQL when raw partial indexes are needed.
      TDD: RED test index definitions include short code, QR, status/created, audit, paid/cancelled report paths; GREEN add indexes; REFACTOR document raw SQL edge cases.
      Tests (write first): `tests/unit/db-indexes.test.ts` → design §3 and admin-panel NFR-1.
      Acceptance: all lookup/report/realtime indexes are present in generated SQL.
      Depends on: T2.1, T2.2.

- [ ] **T2.4** Generate migration and verify via `docker compose up db` + `drizzle-kit push`.
      Files: `src/db/migrations/*`, `drizzle/meta/*`.
      TDD: RED add migration smoke script against empty DB; GREEN generate and push migration; REFACTOR split raw partial indexes safely.
      Tests (write first): `tests/integration/migration-smoke.test.ts` → empty Postgres reaches schema state.
      Acceptance: migration applies cleanly to fresh Postgres and can be re-run safely.
      Depends on: T2.3, T0.8.

- [ ] **T2.5** Seed script — dev admin PIN `654321`, 30 tables M01–M30 in 5×6 grid, today's empty draft menu.
      Files: `src/db/seed.ts`, `package.json`, `README.md`.
      TDD: RED add seed idempotency test; GREEN implement seed script; REFACTOR gate dev-only PIN by `NODE_ENV`.
      Tests (write first): `tests/integration/seed.test.ts` → table-management AC-1 foundation.
      Acceptance: seed is idempotent and creates admin, 30 tables, and draft menu.
      Depends on: T1.2, T2.4.

## Phase 3 — Realtime infrastructure (per realtime-sync spec)

- [ ] **T3.1** `lib/realtime/listener.ts` singleton with reconnect logic.
      Files: `src/lib/realtime/listener.ts`, `src/lib/realtime/bus.ts`.
      TDD: RED mock `pg.Client` error/end reconnect behavior; GREEN implement HMR-safe singleton and LISTEN setup; REFACTOR expose listener state.
      Tests (write first): `tests/unit/realtime-listener.test.ts` → realtime-sync AC-2.
      Acceptance: reconnect backoff resets on success and re-LISTENs all channels.
      Depends on: T1.5, T0.9.

- [ ] **T3.2** `lib/realtime/sse.ts` reusable SSE Response builder + 25s keepalive.
      Files: `src/lib/realtime/sse.ts`.
      TDD: RED test frame format, keepalive, abort cleanup; GREEN implement builder; REFACTOR type event writers.
      Tests (write first): `tests/unit/sse-builder.test.ts` → realtime-sync route pattern.
      Acceptance: builder emits `event`, `id`, `data`, keepalive comments, and cleanup callbacks.
      Depends on: T3.1.

- [ ] **T3.3** `useSSE` React hook with backoff+jitter + React Query invalidation.
      Files: `src/lib/realtime/useSSE.ts`, `src/components/system/OfflineBanner.tsx`.
      TDD: RED fake `EventSource` reconnect and invalidation tests; GREEN implement hook; REFACTOR extract backoff utility.
      Tests (write first): `tests/component/use-sse.test.tsx` → realtime-sync client pattern.
      Acceptance: hook handles snapshot/update, cleanup, jittered reconnect, and exposes connected state.
      Depends on: T0.7, T3.2.

- [ ] **T3.4** `instrumentation.ts` boots the listener.
      Files: `src/instrumentation.ts`, `next.config.ts` if needed.
      TDD: RED test Node runtime import guard; GREEN register listener only in Node; REFACTOR avoid edge runtime side effects.
      Tests (write first): `tests/unit/instrumentation.test.ts` → listener boot contract.
      Acceptance: app startup initializes listener once and skips non-Node runtime.
      Depends on: T3.1.

- [ ] **T3.5** `/api/health` endpoint shows listener status.
      Files: `src/app/api/health/route.ts`, `src/lib/health.ts`.
      TDD: RED test DB up/down and listener connected/reconnecting JSON; GREEN implement route; REFACTOR centralize status mapping.
      Tests (write first): `tests/integration/health-route.test.ts` → realtime-sync observability.
      Acceptance: returns `{ ok, db, listener, listenerReconnects, uptimeSec }` with correct HTTP status.
      Depends on: T3.1, T0.5.

- [ ] **T3.6** Integration test — write row + emit NOTIFY → SSE subscriber receives.
      Files: `tests/integration/realtime-sse.test.ts`, test helpers.
      TDD: RED add failing subscriber test before route exists; GREEN add minimal test SSE route/harness; REFACTOR reusable SSE assertion helper.
      Tests (write first): `tests/integration/realtime-sse.test.ts` → realtime-sync AC-1 foundation.
      Acceptance: committed `pg_notify` frame reaches a connected SSE stream.
      Depends on: T3.1, T3.2, T2.4.

## Phase 4 — Staff auth (cross-cutting)

- [ ] **T4.1** `POST /api/staff/login` Server Action/route handler + rate-limit.
      Files: `src/app/api/staff/login/route.ts`, `src/lib/auth/rateLimit.ts`, `src/server/services/staff-auth.ts`.
      TDD: RED test valid PIN, wrong PIN, 5× lockout; GREEN implement login and session write; REFACTOR share generic bucket store.
      Tests (write first): `tests/integration/staff-login.test.ts` → cashier AC-1, waiter AC-1.
      Acceptance: valid PIN sets session; wrong PIN locks `(ip, role)` for 15 min after 5 attempts.
      Depends on: T1.2, T1.4, T2.2.

- [ ] **T4.2** `POST /api/staff/logout` clears session.
      Files: `src/app/api/staff/logout/route.ts`, `src/server/services/staff-auth.ts`.
      TDD: RED test cookie/session removal; GREEN destroy iron-session and staff_session row; REFACTOR reuse auth response helpers.
      Tests (write first): `tests/integration/staff-logout.test.ts`.
      Acceptance: logout invalidates cookie and redirects protected routes to login.
      Depends on: T4.1.

- [ ] **T4.3** Middleware protects `/admin/**`, `/caja/**`, `/mozo/**`, `/cocina/**` by role.
      Files: `middleware.ts`, `src/lib/auth/routeRoles.ts`.
      TDD: RED table-test every route/role combination; GREEN implement session guard and redirects; REFACTOR keep matcher explicit.
      Tests (write first): `tests/unit/middleware-auth.test.ts` → admin-panel NFR-5.
      Acceptance: unauthenticated users redirect to `/login?role=...`; wrong roles get 403/redirect.
      Depends on: T1.4, T4.1.

- [ ] **T4.4** `<PinPad />` component — numeric, accessible, 6 digits.
      Files: `src/components/auth/PinPad.tsx`.
      TDD: RED write keyboard/touch/a11y tests; GREEN implement keypad and hidden input; REFACTOR extract digit button.
      Tests (write first): `tests/component/pin-pad.test.tsx` → cashier/waiter/admin login UX.
      Acceptance: supports keypad, backspace, paste rejection, labels, and 6-digit submit.
      Depends on: T0.6, T0.7.

- [ ] **T4.5** Login page `/login?role=...` with redirect after success.
      Files: `src/app/login/page.tsx`, `src/components/auth/LoginForm.tsx`.
      TDD: RED component test for role-specific heading and redirect; GREEN wire login form; REFACTOR normalize error copy.
      Tests (write first): `tests/component/login-page.test.tsx`, `tests/e2e/auth-login.spec.ts`.
      Acceptance: cashier/waiter/admin/kitchen-compatible role prompts redirect to target route after success.
      Depends on: T4.1, T4.4.

- [ ] **T4.6** E2E — wrong PIN 5× → lockout 15 min.
      Files: `tests/e2e/auth-lockout.spec.ts`.
      TDD: RED Playwright scenario before UI/server complete; GREEN implement missing test hooks; REFACTOR use seeded staff fixtures.
      Tests (write first): `tests/e2e/auth-lockout.spec.ts` → cashier-checkout AC-7.
      Acceptance: fifth wrong PIN shows lockout and a correct PIN remains blocked until window expires.
      Depends on: T4.1, T4.5.

## Phase 5 — Daily menu (admin write + customer read)

- [ ] **T5.1** Service: `MenuService.createForToday(cloneFrom?)`.
      Files: `src/server/services/menu.ts`, `src/lib/validation/menuSchemas.ts`.
      TDD: RED test unique date, clone success, clone missing; GREEN implement transactional create/clone; REFACTOR share date helpers.
      Tests (write first): `tests/unit/menu-service-create.test.ts` → daily-menu AC-1.
      Acceptance: creates draft menu and clones items/config with availability reset.
      Depends on: T2.1, T2.4.

- [ ] **T5.2** Service: `MenuService.addItem / patchItem / toggleAvailability`.
      Files: `src/server/services/menu.ts`, `src/lib/validation/menuSchemas.ts`.
      TDD: RED test validation, gap sort, referenced delete guard, audit, NOTIFY; GREEN implement item mutations; REFACTOR split repository helpers.
      Tests (write first): `tests/unit/menu-service-items.test.ts`, `tests/integration/menu-delete-guard.test.ts` → daily-menu AC-4.
      Acceptance: CRUD respects closed menus, price requirements, audit, and availability events.
      Depends on: T5.1, T1.5.

- [ ] **T5.3** Service: `MenuService.openDay / closeDay` with guards.
      Files: `src/server/services/menu.ts`.
      TDD: RED test missing combo, cannot reopen, close draft blocked; GREEN implement state transitions; REFACTOR extract `menuStatus`.
      Tests (write first): `tests/unit/menu-service-state.test.ts` → daily-menu AC-3, AC-5.
      Acceptance: draft/open/closed guards match spec and emit `menu_changed`.
      Depends on: T5.1, T5.2.

- [ ] **T5.4** Server Actions wired to services + `notifyAfterTx('menu_changed', ...)`.
      Files: `src/server/actions/menu.ts`, `src/app/(staff)/admin/menu/actions.ts`.
      TDD: RED action tests for envelopes/error codes; GREEN wire actions to services; REFACTOR centralize action result helper.
      Tests (write first): `tests/integration/menu-actions.test.ts`.
      Acceptance: admin actions return discriminated unions and notify after committed tx.
      Depends on: T5.2, T5.3, T4.3.

- [ ] **T5.5** `GET /api/menu/today` route handler.
      Files: `src/app/api/menu/today/route.ts`, `src/server/queries/menu.ts`.
      TDD: RED route tests for draft/open/closed and available-only filtering; GREEN implement cached handler; REFACTOR invalidate cache on menu events.
      Tests (write first): `tests/integration/menu-today-route.test.ts` → daily-menu AC-3.
      Acceptance: returns 404 unless opened and excludes sold-out items.
      Depends on: T5.3, T3.1.

- [ ] **T5.6** `GET /api/sse/menu` SSE route.
      Files: `src/app/api/sse/menu/route.ts`.
      TDD: RED SSE event test for `availability_toggled`; GREEN implement snapshot/live stream; REFACTOR reuse `createSSEStream`.
      Tests (write first): `tests/integration/menu-sse.test.ts` → daily-menu AC-2.
      Acceptance: menu changes stream with keepalive and replay/snapshot behavior.
      Depends on: T3.2, T5.5.

- [ ] **T5.7** Admin UI `/admin/menu` — today's menu CRUD + toggle availability.
      Files: `src/app/(staff)/admin/menu/page.tsx`, `src/components/menu/MenuItemEditor.tsx`, `src/components/menu/MenuAdminTable.tsx`.
      TDD: RED component tests for add/edit/toggle/price validation; GREEN build RSC page and client forms; REFACTOR extract category sections.
      Tests (write first): `tests/component/admin-menu.test.tsx`.
      Acceptance: admin can clone, edit, open/close, toggle sold-out, and see warnings.
      Depends on: T5.4, T5.5, T0.6.

- [ ] **T5.8** E2E — admin clones yesterday → today shows same items.
      Files: `tests/e2e/daily-menu-clone.spec.ts`.
      TDD: RED write Playwright clone scenario; GREEN fill missing UI hooks; REFACTOR stable seed fixture.
      Tests (write first): `tests/e2e/daily-menu-clone.spec.ts` → daily-menu AC-1.
      Acceptance: cloned menu appears with same names/categories/sort order and availability true.
      Depends on: T5.7.

- [ ] **T5.9** E2E — admin toggles “Caldo” sold-out → customer tab updates within 2s.
      Files: `tests/e2e/daily-menu-realtime-availability.spec.ts`.
      TDD: RED multi-tab realtime test; GREEN wire customer subscription; REFACTOR add p95 timing assertion helper.
      Tests (write first): `tests/e2e/daily-menu-realtime-availability.spec.ts` → daily-menu AC-2.
      Acceptance: customer page disables sold-out item without refresh inside 2 s.
      Depends on: T5.6, T5.7.

## Phase 6 — Table management

- [ ] **T6.1** Service: `TableService.create/patch/deactivate`.
      Files: `src/server/services/tables.ts`, `src/lib/validation/tableSchemas.ts`.
      TDD: RED test duplicate codes, deactivate with active order warning; GREEN implement mutations; REFACTOR share audit helper.
      Tests (write first): `tests/unit/table-service.test.ts` → table-management AC-6.
      Acceptance: admin table mutations validate, audit, and emit `table_changed`.
      Depends on: T2.1, T1.5.

- [ ] **T6.2** Service: `TableGroupService.join/split` with active-order guards.
      Files: `src/server/services/table-groups.ts`.
      TDD: RED test join free tables, reject grouped/occupied, reject active split; GREEN implement transactions; REFACTOR derive group labels.
      Tests (write first): `tests/unit/table-group-service.test.ts` → table-management AC-2, AC-5.
      Acceptance: join/split rules preserve one open group per table and notify changes.
      Depends on: T6.1, T2.3.

- [ ] **T6.3** SQL view or query for derived table state.
      Files: `src/server/queries/tables.ts`, optional migration view.
      TDD: RED fixture tests for free/tentative/occupied/group/inactive; GREEN implement derived-state query; REFACTOR document 30-min delivered rule.
      Tests (write first): `tests/integration/table-state-query.test.ts` → table-management AC-3, AC-4, AC-7.
      Acceptance: state is derived from orders/groups and survives app restart.
      Depends on: T2.1, T2.2.

- [ ] **T6.4** `GET /api/tables` + `GET /api/tables/free` route handlers.
      Files: `src/app/api/tables/route.ts`, `src/app/api/tables/free/route.ts`.
      TDD: RED route tests for full and free-only lists; GREEN implement handlers; REFACTOR cache nothing and keep response shape stable.
      Tests (write first): `tests/integration/tables-routes.test.ts`.
      Acceptance: public handlers return active derived table states and free list.
      Depends on: T6.3.

- [ ] **T6.5** Admin UI `/admin/tables` — grid editor.
      Files: `src/app/(staff)/admin/tables/page.tsx`, `src/components/floor/TableLayoutEditor.tsx`.
      TDD: RED component tests for edit/deactivate warning; GREEN build table forms/grid; REFACTOR isolate grid cell component.
      Tests (write first): `tests/component/admin-tables.test.tsx`.
      Acceptance: admin can create/edit/deactivate 30-table layout and see state colors.
      Depends on: T6.1, T6.4.

- [ ] **T6.6** Shared `<TableGrid />` component.
      Files: `src/components/floor/TableGrid.tsx`.
      TDD: RED render/selection/state-color tests; GREEN implement responsive grid/list modes; REFACTOR support customer/waiter/admin variants.
      Tests (write first): `tests/component/table-grid.test.tsx`.
      Acceptance: one component supports customer free-list, waiter floor, and admin layout.
      Depends on: T6.4, T0.6.

- [ ] **T6.7** E2E — 30 tables in 5×6 grid created by admin.
      Files: `tests/e2e/table-management-grid.spec.ts`.
      TDD: RED Playwright admin grid scenario; GREEN wire missing UI flows; REFACTOR shared admin login helper.
      Tests (write first): `tests/e2e/table-management-grid.spec.ts` → table-management AC-1.
      Acceptance: M01–M30 render in 5×6 grid as free after admin/seed setup.
      Depends on: T6.5, T6.6.

## Phase 7 — Order builder (customer)

- [ ] **T7.1** `OrderService.createOrder(input)` — pricing, table tentative reservation, QR generation in one tx + NOTIFY.
      Files: `src/server/services/orders.ts`, `src/lib/validation/orderSchemas.ts`.
      TDD: RED unit/integration tests for pricing, table conflict, token, atomicity, NOTIFY; GREEN implement service; REFACTOR split repositories.
      Tests (write first): `tests/unit/order-service.test.ts`, `tests/integration/order-create.test.ts` → order-builder AC-1, AC-2, AC-3.
      Acceptance: pending order has short code, QR token, `qr_expires_at=now+15min`, frozen totals, and reserved table.
      Depends on: T1.1, T1.3, T2.1, T2.2, T2.4, T3.1, T6.3.

- [ ] **T7.2** Service: `OrderService.patchItems` only when `status=pending`.
      Files: `src/server/services/orders.ts`.
      TDD: RED tests pending edit, paid lock, expired lock, unavailable item; GREEN implement full item replacement; REFACTOR reuse validation/pricing.
      Tests (write first): `tests/unit/order-patch-items.test.ts` → order-builder AC-5.
      Acceptance: pending edits recompute total without changing code/token/expiry; paid returns `ORDER_LOCKED`.
      Depends on: T7.1.

- [ ] **T7.3** Service: `OrderService.cancel` customer cancel.
      Files: `src/server/services/orders.ts`.
      TDD: RED tests pending cancel, locked cancel, table release, NOTIFY; GREEN implement transition; REFACTOR share cancellation reason handling.
      Tests (write first): `tests/unit/order-cancel.test.ts`.
      Acceptance: only pending orders cancel and release tentative table/group.
      Depends on: T7.1.

- [ ] **T7.4** Cron/job cancels orders whose `qr_expires_at < now()` and still `pending`.
      Files: `src/server/jobs/cancel-expired-orders.ts`, `src/app/api/jobs/cancel-expired-orders/route.ts` if HTTP-triggered.
      TDD: RED fake-clock cleanup tests; GREEN implement 60s job/on-demand hook; REFACTOR make scheduler idempotent.
      Tests (write first): `tests/integration/expired-order-job.test.ts` → order-builder AC-4.
      Acceptance: expired pending orders become cancelled, notify order/table, and release tables.
      Depends on: T7.3, T3.1.

- [ ] **T7.5** `POST /api/orders` + `GET /api/orders/:token` + `GET /api/sse/order/:token`.
      Files: `src/app/api/orders/route.ts`, `src/app/api/orders/[token]/route.ts`, `src/app/api/sse/order/[token]/route.ts`.
      TDD: RED route/SSE tests for validation, token lookup, fallback status, keepalive; GREEN implement handlers; REFACTOR standardize error JSON.
      Tests (write first): `tests/integration/orders-routes.test.ts`, `tests/integration/order-sse.test.ts`.
      Acceptance: routes create/read/edit stream order state with rate limits and no customer PII.
      Depends on: T7.1, T7.2, T7.3, T7.4, T3.2.

- [ ] **T7.6** UI `/` — RSC menu + client cart drawer + table picker.
      Files: `src/app/(customer)/page.tsx`, `src/components/menu/MenuItemCard.tsx`, `src/components/menu/OrderSummaryDrawer.tsx`, `src/lib/store/cart.ts`.
      TDD: RED component tests for cart, sold-out block, table required; GREEN build mobile-first flow; REFACTOR extract cart selectors.
      Tests (write first): `tests/component/customer-order-builder.test.tsx` → order-builder AC-6.
      Acceptance: customer can browse, build cart, select table, see totals, and submit.
      Depends on: T5.5, T5.6, T6.4, T6.6, T7.5.

- [ ] **T7.7** UI `/pedido/[token]` — big code, QR png, live status.
      Files: `src/app/(customer)/pedido/[token]/page.tsx`, `src/components/order/QrCodeDisplay.tsx`, `src/components/order/OrderStatusTimeline.tsx`, `package.json`.
      TDD: RED tests for code size, QR alt, status update, edit visibility; GREEN install/use QR library and build page; REFACTOR isolate status copy.
      Tests (write first): `tests/component/order-ticket.test.tsx`.
      Acceptance: ticket page shows code, QR, totals, table, status, and live lock/expiry state.
      Depends on: T7.5, T3.3.

- [ ] **T7.8** E2E — AC-1 through AC-6 from order-builder spec.
      Files: `tests/e2e/order-builder.spec.ts`.
      TDD: RED add all six Playwright scenarios; GREEN complete missing UX/API hooks; REFACTOR fixture factories and timing helpers.
      Tests (write first): `tests/e2e/order-builder.spec.ts` → order-builder AC-1..AC-6.
      Acceptance: all customer order-builder acceptance criteria pass in chromium and webkit.
      Depends on: T7.6, T7.7.

## Phase 8 — Cashier checkout

- [ ] **T8.1** Service: `CashierService.lookup(code)`.
      Files: `src/server/services/cashier.ts`.
      TDD: RED tests short code, QR token, expired, consumed, not found; GREEN implement lookup; REFACTOR shape `OrderDetail` DTO.
      Tests (write first): `tests/unit/cashier-lookup.test.ts` → cashier-checkout AC-2.
      Acceptance: lookup returns order summary and validity flags for code or QR.
      Depends on: T7.1, T1.3.

- [ ] **T8.2** Service: `CashierService.confirmPayment(orderId, method, idempotencyKey)` with `SELECT … FOR UPDATE NOWAIT`.
      Files: `src/server/services/cashier.ts`.
      TDD: RED tests success, duplicate idempotency, already paid, lock race, audit, NOTIFY; GREEN implement transaction; REFACTOR extract state transition guard.
      Tests (write first): `tests/unit/cashier-confirm.test.ts`, `tests/integration/cashier-confirm-lock.test.ts` → cashier AC-3, AC-4.
      Acceptance: pending order atomically becomes `in_kitchen`, consumes QR, audits, and emits order status.
      Depends on: T8.1, T3.1, T4.1.

- [ ] **T8.3** Service: `CashierService.undo` + `cancel(reason)`.
      Files: `src/server/services/cashier.ts`.
      TDD: RED tests 2-min undo, delivered guard, cancel reason, audit, NOTIFY; GREEN implement undo/cancel; REFACTOR share audit payloads.
      Tests (write first): `tests/unit/cashier-undo-cancel.test.ts` → cashier AC-5, AC-6, AC-8.
      Acceptance: undo restores pending within window; cancel only affects pending and records reason.
      Depends on: T8.2.

- [ ] **T8.4** Server Actions for lookup, confirm, undo, cancel.
      Files: `src/server/actions/cashier.ts`, `src/app/(staff)/caja/actions.ts`.
      TDD: RED action envelope/error tests; GREEN wire actions to services; REFACTOR validate with Zod schemas.
      Tests (write first): `tests/integration/cashier-actions.test.ts`.
      Acceptance: actions enforce cashier/admin roles and return typed success/error unions.
      Depends on: T8.1, T8.2, T8.3, T4.3.

- [ ] **T8.5** `GET /api/sse/cashier-queue`.
      Files: `src/app/api/sse/cashier-queue/route.ts`.
      TDD: RED SSE snapshot/delta tests for pending queue; GREEN implement stream; REFACTOR use shared queue query.
      Tests (write first): `tests/integration/cashier-queue-sse.test.ts`.
      Acceptance: queue sends initial pending list and updates/removals with 25s keepalive.
      Depends on: T3.2, T8.2.

- [ ] **T8.6** UI `/caja` — two-column layout, QR scanner, keyboard hotkeys.
      Files: `src/app/(staff)/caja/page.tsx`, `src/components/cashier/*`, `package.json`.
      TDD: RED component tests for code entry, payment hotkeys, scanner denied, undo countdown; GREEN build console and install scanner lib; REFACTOR virtualize queue.
      Tests (write first): `tests/component/cashier-console.test.tsx`.
      Acceptance: cashier can scan/type, confirm cash/Yape, undo, cancel, and see live queue/summary.
      Depends on: T8.4, T8.5, T3.3, T0.6.

- [ ] **T8.7** E2E — AC-1 through AC-8 from cashier-checkout spec.
      Files: `tests/e2e/cashier-checkout.spec.ts`.
      TDD: RED add all eight scenarios; GREEN complete missing UI/server hooks; REFACTOR role login fixtures.
      Tests (write first): `tests/e2e/cashier-checkout.spec.ts` → cashier AC-1..AC-8.
      Acceptance: payment gate, undo, cancel, duplicate confirm, and lockout flows pass.
      Depends on: T8.6, T4.6.

## Phase 9 — Kitchen display

- [ ] **T9.1** Device pairing — `POST /api/kitchen/device-pair` + signed long-lived cookie.
      Files: `src/app/api/kitchen/device-pair/route.ts`, `src/lib/auth/kitchenDevice.ts`.
      TDD: RED tests valid/invalid device PIN, rate-limit, 30-day cookie; GREEN implement pairing; REFACTOR reuse PIN bucket logic.
      Tests (write first): `tests/integration/kitchen-device-pair.test.ts` → kitchen AC-6.
      Acceptance: valid device PIN creates kitchen role cookie; invalid attempts lock out without logging PIN.
      Depends on: T1.4, T4.1.

- [ ] **T9.2** `GET /api/sse/kitchen` snapshot + stream.
      Files: `src/app/api/sse/kitchen/route.ts`, `src/server/queries/kitchen.ts`.
      TDD: RED tests snapshot, add/remove, auth, reconnect snapshot; GREEN implement stream; REFACTOR DTO assembly query.
      Tests (write first): `tests/integration/kitchen-sse.test.ts` → kitchen AC-1, AC-2, AC-3.
      Acceptance: authenticated kitchen stream sends current `in_kitchen` tickets and live deltas.
      Depends on: T8.2, T3.2, T9.1.

- [ ] **T9.3** UI `/cocina` — dark board, big text, ticket grid, timer color shift, pagination >16.
      Files: `src/app/(staff)/cocina/page.tsx`, `src/components/kitchen/*`.
      TDD: RED component tests for layout, timer thresholds, pagination, reconnect overlay; GREEN build board; REFACTOR isolate ticket DTO types.
      Tests (write first): `tests/component/kitchen-board.test.tsx` → kitchen AC-4, AC-5.
      Acceptance: TV board renders 4-column dark grid, readable tickets, timers, and auto-pagination.
      Depends on: T9.2, T3.3.

- [ ] **T9.4** Audio chime + mute toggle persisted in localStorage.
      Files: `src/components/kitchen/KitchenChime.tsx`, `public/sounds/new-order.mp3`.
      TDD: RED tests chime trigger and persisted mute; GREEN implement audio with autoplay-safe activation; REFACTOR add graceful no-audio fallback.
      Tests (write first): `tests/component/kitchen-audio.test.tsx` → kitchen AC-1.
      Acceptance: new tickets chime when unmuted and mute survives refresh.
      Depends on: T9.3.

- [ ] **T9.5** E2E — AC-1 through AC-6 from kitchen-display spec.
      Files: `tests/e2e/kitchen-display.spec.ts`.
      TDD: RED add six Playwright scenarios; GREEN fill missing UI/auth hooks; REFACTOR add network-disconnect helpers.
      Tests (write first): `tests/e2e/kitchen-display.spec.ts` → kitchen AC-1..AC-6.
      Acceptance: kitchen board handles new tickets, delivery removals, reconnect, pagination, timers, and expired sessions.
      Depends on: T9.4.

## Phase 10 — Waiter console

- [ ] **T10.1** Service: `WaiterService.markDelivered(orderId)` with 409 on already delivered.
      Files: `src/server/services/waiter.ts`, `src/server/actions/waiter.ts`.
      TDD: RED tests delivered success, invalid transition, already delivered race, audit, NOTIFY; GREEN implement service/action; REFACTOR share order transition utility.
      Tests (write first): `tests/unit/waiter-deliver.test.ts` → waiter AC-3.
      Acceptance: only `in_kitchen` orders can be marked delivered by waiter role.
      Depends on: T8.2, T4.3.

- [ ] **T10.2** `GET /api/sse/floor` snapshot + stream.
      Files: `src/app/api/sse/floor/route.ts`, `src/server/queries/floor.ts`.
      TDD: RED tests snapshot orders/tables and order/table update frames; GREEN implement stream; REFACTOR merge table/order DTOs.
      Tests (write first): `tests/integration/floor-sse.test.ts` → waiter AC-2, table AC-3.
      Acceptance: floor stream sends active orders and table state updates with keepalive.
      Depends on: T6.3, T10.1, T3.2.

- [ ] **T10.3** UI `/mozo` — tabs active orders + tables, tablet-optimized.
      Files: `src/app/(staff)/mozo/page.tsx`, `src/components/waiter/*`.
      TDD: RED component tests for tabs, sorting, offline disabling, deliver optimistic UI; GREEN build tablet UI; REFACTOR reusable order card.
      Tests (write first): `tests/component/waiter-console.test.tsx` → waiter AC-1, AC-2, AC-3.
      Acceptance: waiter sees active orders sorted by `paid_at` and can mark delivered.
      Depends on: T10.1, T10.2, T6.6, T3.3.

- [ ] **T10.4** Floor map join/split/release UX — long-press on tablet.
      Files: `src/components/waiter/FloorMapActions.tsx`, `src/server/actions/table-groups.ts`.
      TDD: RED tests long-press mode, join selection, split guard, release confirm; GREEN wire actions; REFACTOR use shared TableGrid interaction adapters.
      Tests (write first): `tests/component/waiter-floor-actions.test.tsx` → waiter AC-4, AC-5, AC-6.
      Acceptance: waiter can join free tables, split safe groups, and gated-release tables with confirmations.
      Depends on: T6.2, T10.3.

- [ ] **T10.5** E2E — AC-1 through AC-6 from waiter-console spec.
      Files: `tests/e2e/waiter-console.spec.ts`.
      TDD: RED add six Playwright tablet scenarios; GREEN complete missing actions; REFACTOR tablet viewport fixtures.
      Tests (write first): `tests/e2e/waiter-console.spec.ts` → waiter AC-1..AC-6.
      Acceptance: login, realtime order, delivery, join/split, and release flows pass.
      Depends on: T10.4, T9.5.

## Phase 11 — Admin panel (reports, staff, audit)

- [ ] **T11.1** Service: `StaffService.create / patch / resetPin / forceLogout`.
      Files: `src/server/services/staff.ts`, `src/server/actions/staff.ts`, `src/lib/validation/staffSchemas.ts`.
      TDD: RED tests create, invalid PIN, self-deactivate, reset revokes sessions, force logout; GREEN implement service/actions; REFACTOR audit helper.
      Tests (write first): `tests/unit/staff-service.test.ts` → admin AC-1, AC-2, AC-3, AC-5.
      Acceptance: staff CRUD enforces PIN policy, role rules, session revocation, and audit logs.
      Depends on: T1.2, T2.2, T4.3.

- [ ] **T11.2** Service: `ReportService.daily(date)` aggregates.
      Files: `src/server/services/reports.ts`, `src/server/queries/reports.ts`.
      TDD: RED tests zero day, cash/Yape totals, top items, latency; GREEN implement aggregate queries; REFACTOR optimize with indexes.
      Tests (write first): `tests/integration/daily-report.test.ts` → admin AC-4.
      Acceptance: daily report metrics match orders and run under 500ms for target dataset.
      Depends on: T8.2, T10.1, T2.3.

- [ ] **T11.3** CSV export route handler.
      Files: `src/app/(staff)/admin/reports/daily.csv/route.ts`, `src/server/services/reportCsv.ts`.
      TDD: RED tests headers, filename, zero-data CSV, totals match service; GREEN implement stream; REFACTOR escape CSV cells.
      Tests (write first): `tests/integration/report-csv.test.ts` → admin AC-6.
      Acceptance: CSV downloads as UTF-8 and matches displayed report totals.
      Depends on: T11.2, T4.3.

- [ ] **T11.4** Audit log viewer query + pagination.
      Files: `src/server/queries/audit.ts`.
      TDD: RED tests pagination, actor/action/date filters, staff name resolution; GREEN implement query; REFACTOR typed filter DTO.
      Tests (write first): `tests/integration/audit-query.test.ts`.
      Acceptance: audit rows return newest first with filters and 25-row pagination.
      Depends on: T2.2, T2.3.

- [ ] **T11.5** UI — `/admin`, `/admin/staff`, `/admin/reports/daily`, `/admin/audit`.
      Files: `src/app/(staff)/admin/page.tsx`, `src/app/(staff)/admin/staff/page.tsx`, `src/app/(staff)/admin/reports/daily/page.tsx`, `src/app/(staff)/admin/audit/page.tsx`, `src/components/admin/*`.
      TDD: RED component tests for dashboard, staff forms, report cards, audit filters; GREEN build admin shell/pages; REFACTOR shared sidebar/layout.
      Tests (write first): `tests/component/admin-panel.test.tsx`.
      Acceptance: admin can navigate dashboard, staff, reports, CSV, and audit pages.
      Depends on: T11.1, T11.2, T11.3, T11.4, T5.7, T6.5.

- [ ] **T11.6** E2E — AC-1 through AC-6 from admin-panel spec.
      Files: `tests/e2e/admin-panel.spec.ts`.
      TDD: RED add six Playwright admin scenarios; GREEN complete UI/server gaps; REFACTOR staff/report fixtures.
      Tests (write first): `tests/e2e/admin-panel.spec.ts` → admin AC-1..AC-6.
      Acceptance: staff lifecycle, reports, invalid PIN, and CSV export pass.
      Depends on: T11.5.

## Phase 12 — Load & resilience tests

- [ ] **T12.1** Load test — 100 concurrent SSE menu subscribers, toggle availability, p95 < 2s.
      Files: `tests/load/menu-sse-load.ts`, `scripts/load-menu-sse.ts`.
      TDD: RED add threshold assertion harness; GREEN implement subscriber load and toggle driver; REFACTOR collect latency histogram.
      Tests (write first): `tests/load/menu-sse-load.ts` → realtime-sync AC-1.
      Acceptance: 100 subscribers receive menu toggle under 2s p95.
      Depends on: T5.9.

- [ ] **T12.2** Resilience — simulate `pg_terminate_backend` on listener, verify reconnect + snapshot.
      Files: `tests/resilience/pg-listener-reconnect.test.ts`, `scripts/kill-listener.ts`.
      TDD: RED test fails until listener exposes backend PID/status; GREEN implement termination and assertions; REFACTOR reusable resilience helpers.
      Tests (write first): `tests/resilience/pg-listener-reconnect.test.ts` → realtime-sync AC-2.
      Acceptance: listener reconnects within 30s and clients receive refreshed snapshot.
      Depends on: T3.5, T10.2, T9.2.

- [ ] **T12.3** Memory test — 12h synthetic churn, Node RSS < 300MB.
      Files: `tests/load/memory-churn.ts`, `scripts/memory-churn.ts`.
      TDD: RED add RSS threshold harness; GREEN implement synthetic SSE/order/menu churn; REFACTOR export sampled metrics.
      Tests (write first): `tests/load/memory-churn.ts` → kitchen NFR-4, realtime AC-4.
      Acceptance: sustained churn remains under 300MB RSS with no unbounded listener growth.
      Depends on: T9.5, T10.5, T12.1.

- [ ] **T12.4** Peak simulation — 60 concurrent orders end-to-end through cashier in <10min.
      Files: `tests/load/peak-order-flow.ts`, `scripts/peak-simulation.ts`.
      TDD: RED define full-flow SLA assertion; GREEN implement virtual customers/cashier worker; REFACTOR isolate seed data and cleanup.
      Tests (write first): `tests/load/peak-order-flow.ts` → proposal G4.
      Acceptance: 60 orders progress customer → cashier → kitchen in under 10 minutes.
      Depends on: T8.7, T10.5.

## Phase 13 — Production hardening & deploy

- [ ] **T13.1** nginx config — SSE-friendly proxy buffering off, HTTP/1.1, no Connection close.
      Files: `docker/nginx/nginx.conf`, `docker/nginx/conf.d/app.conf`.
      TDD: RED config test scans SSE location directives; GREEN update nginx config; REFACTOR split common/security headers.
      Tests (write first): `tests/tooling/nginx-config.test.ts` → realtime-sync nginx requirement.
      Acceptance: `/api/sse/` disables buffering/cache and preserves long-lived HTTP/1.1 connections.
      Depends on: T3.2, T0.8.

- [ ] **T13.2** `docker-compose.prod.yml` with restart policies, log rotation, volume backups.
      Files: `docker/docker-compose.prod.yml`, `.env.production.example`.
      TDD: RED compose-prod validation test; GREEN add prod services/volumes/log opts; REFACTOR share anchors with base compose.
      Tests (write first): `tests/tooling/docker-compose-prod.test.ts`.
      Acceptance: prod compose validates and defines app/nginx/db/backups with restart/log policies.
      Depends on: T13.1.

- [ ] **T13.3** Postgres backup cron in compose — `pg_dump` to mounted volume, retention 14 days.
      Files: `docker/backup/backup.sh`, `docker/docker-compose.prod.yml`.
      TDD: RED shell/unit test for retention and filename; GREEN implement backup sidecar/script; REFACTOR parameterize schedule/retention.
      Tests (write first): `tests/tooling/backup-script.test.ts`.
      Acceptance: daily gzipped dumps land in backup volume and old dumps over 14 days are pruned.
      Depends on: T13.2.

- [ ] **T13.4** Production secrets via `.env.production` (not committed); document rotation.
      Files: `.env.production.example`, `docs/ops/secrets.md`, `.gitignore`.
      TDD: RED docs/secret checklist test; GREEN document required vars and rotation; REFACTOR add emergency rotation steps.
      Tests (write first): `tests/tooling/secrets-docs.test.ts`.
      Acceptance: production secrets are documented by example only and real files are ignored.
      Depends on: T0.9, T13.2.

- [ ] **T13.5** Smoke test script for VPS first-deploy.
      Files: `scripts/smoke-vps.ts`, `package.json`, `docs/ops/deploy.md`.
      TDD: RED smoke harness tests health/menu/login endpoints; GREEN implement script; REFACTOR make base URL configurable.
      Tests (write first): `tests/tooling/smoke-script.test.ts`.
      Acceptance: smoke script validates health, DB, listener, seeded admin login, and public landing.
      Depends on: T13.2, T3.5, T4.5.

- [ ] **T13.6** README ops section — start, stop, restart, restore from backup.
      Files: `README.md`, `docs/ops/restore.md`.
      TDD: RED docs checklist test for ops commands; GREEN document operations; REFACTOR link backup/secrets docs.
      Tests (write first): `tests/tooling/readme-ops.test.ts`.
      Acceptance: operator can start/stop/restart, inspect logs, backup, and restore from README/docs.
      Depends on: T13.3, T13.5.

## Phase 14 — Pre-launch checklist (manual)

- [ ] **T14.1** Walk-through with restaurant owner on staging.
      Files: `docs/launch/prelaunch-checklist.md`.
      TDD: RED checklist item unsigned; GREEN run owner walkthrough and record findings; REFACTOR convert findings into follow-up tasks.
      Tests (write first): manual checklist row for owner sign-off.
      Acceptance: owner signs off or blockers are documented with owners.
      Depends on: T13.6.

- [ ] **T14.2** Print/post QR landing URL + table codes physically in restaurant.
      Files: `docs/launch/table-qr-print-list.md`.
      TDD: RED physical QR/code inventory incomplete; GREEN generate/print/post materials; REFACTOR record placement photos/notes.
      Tests (write first): manual inventory checklist for 30 tables and entrance QR.
      Acceptance: landing URL and all table codes are visible and scannable in the restaurant.
      Depends on: T13.5, T6.7.

- [ ] **T14.3** Train cashier + 4 waiters — 1 hour session each.
      Files: `docs/launch/training-log.md`.
      TDD: RED training log empty; GREEN run sessions with practice orders; REFACTOR capture confusing copy/UX fixes.
      Tests (write first): manual training checklist per role.
      Acceptance: cashier and four waiters complete happy-path, undo/cancel, deliver, join/split drills.
      Depends on: T8.7, T10.5.

- [ ] **T14.4** Set actual admin PINs and rotate the seed PIN.
      Files: `docs/launch/credential-rotation.md`.
      TDD: RED seed PIN still works; GREEN set real PINs and revoke seed/admin dev credentials; REFACTOR document rotation evidence without secrets.
      Tests (write first): manual credential checklist; verify seed PIN rejected.
      Acceptance: dev seed PIN no longer authenticates in staging/production.
      Depends on: T11.6, T13.4.

- [ ] **T14.5** Soft launch — 1 day with paper backup ready.
      Files: `docs/launch/soft-launch-report.md`.
      TDD: RED launch report has no observations; GREEN operate one service day with fallback paper flow; REFACTOR prioritize post-launch fixes.
      Tests (write first): manual service-day checklist covering customer, cashier, kitchen, waiter, admin flows.
      Acceptance: soft launch completes with incidents recorded, paper backup available, and go/no-go decision captured.
      Depends on: T14.1, T14.2, T14.3, T14.4.

## Effort estimate

| Phase | Hours | Notes |
|---|---:|---|
| Phase 0 — Project bootstrap | 24 | Tooling, CI, Docker, README foundation. |
| Phase 1 — Domain primitives | 18 | Pure functions and typed cross-cutting helpers. |
| Phase 2 — Database schema & migrations | 20 | Schema, indexes, migration, seed. |
| Phase 3 — Realtime infrastructure | 24 | Listener, SSE primitives, hook, health, integration test. |
| Phase 4 — Staff auth | 20 | PIN auth, sessions, middleware, login UI, lockout E2E. |
| Phase 5 — Daily menu | 30 | Services, routes, SSE, admin UI, realtime E2E. |
| Phase 6 — Table management | 22 | State derivation, services, routes, grid, E2E. |
| Phase 7 — Order builder | 34 | Customer flow, order transactions, QR, ticket, E2E matrix. |
| Phase 8 — Cashier checkout | 27 | Payment gate, locking, undo/cancel, scanner UI, E2E. |
| Phase 9 — Kitchen display | 20 | Device pairing, SSE board, audio, TV E2E. |
| Phase 10 — Waiter console | 22 | Delivery, floor stream, tablet UI, join/split/release E2E. |
| Phase 11 — Admin panel | 28 | Staff, reports, CSV, audit, dashboard E2E. |
| Phase 12 — Load & resilience tests | 18 | SSE/load/memory/peak simulations. |
| Phase 13 — Production hardening & deploy | 16 | nginx, prod compose, backups, secrets, smoke, ops docs. |
| Phase 14 — Pre-launch checklist | 5 | Manual rollout and training activities. |
| **Total** | **328** | Solo experienced full-stack estimate; assumes design remains stable. |
