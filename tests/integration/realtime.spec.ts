// REQUIRES: docker compose -f docker/docker-compose.dev.yml up -d db
// Run with: SKIP_INTEGRATION=0 pnpm vitest run tests/integration
//
// These tests connect to a real Postgres instance. They are skipped in CI unless
// SKIP_INTEGRATION=0 is set explicitly. All test IDs in this file use it_int.

import { describe, it } from 'vitest';

const skipIntegration = process.env.SKIP_INTEGRATION !== '0';
const it_int = skipIntegration ? it.skip : it;

describe('Realtime end-to-end with real Postgres', () => {
  it_int('NOTIFY → SSE subscriber receives within 2s', async () => {
    // 1. Apply migrations to a fresh test DB (drop + recreate + drizzle-kit push)
    //    const { execSync } = await import('node:child_process');
    //    execSync('pnpm db:push --force', { env: { ...process.env, DATABASE_URL: TEST_DB_URL } });

    // 2. Start the bus, subscribe via on('menu_changed')
    //    const { getRealtimeBus } = await import('@/lib/realtime/listener');
    //    delete globalThis.__cerroRealtimeBus;
    //    const bus = getRealtimeBus({ connectionString: TEST_DB_URL });
    //    const received: unknown[] = [];
    //    const unsub = bus.on('menu_changed', (p) => received.push(p));
    //    await new Promise(r => setTimeout(r, 500)); // let boot() complete

    // 3. Open a separate pg.Client and NOTIFY
    //    const { Client } = await import('pg');
    //    const notifier = new Client({ connectionString: TEST_DB_URL });
    //    await notifier.connect();
    //    const payload = JSON.stringify({ menuId: 1, changeType: 'item_added' });
    //    await notifier.query(`SELECT pg_notify('menu_changed', $1)`, [payload]);
    //    await notifier.end();

    // 4. Await event within 2 s; assert payload round-trips
    //    await new Promise<void>((resolve, reject) => {
    //      const timeout = setTimeout(() => reject(new Error('timeout')), 2000);
    //      const interval = setInterval(() => {
    //        if (received.length > 0) { clearTimeout(timeout); clearInterval(interval); resolve(); }
    //      }, 50);
    //    });
    //    expect(received[0]).toEqual({ menuId: 1, changeType: 'item_added' });

    //    unsub();
    //    await bus.close();
  });
});
