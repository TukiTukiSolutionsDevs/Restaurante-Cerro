import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { MenuChangedPayload, OrderStatusChangedPayload } from '@/lib/realtime/channels';
import type { BusOpts, PgLikeClient } from '@/lib/realtime/listener';
import { getRealtimeBus } from '@/lib/realtime/listener';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

interface FakeClientHandlers {
  notification?: (msg: { channel: string; payload?: string }) => void;
  error?: (err: Error) => void;
  end?: () => void;
}

type FakeClient = PgLikeClient & {
  connect: ReturnType<typeof vi.fn>;
  query: ReturnType<typeof vi.fn>;
  end: ReturnType<typeof vi.fn>;
  trigger: {
    notification(channel: string, payload: string): void;
    error(err: Error): void;
    end(): void;
  };
};

function createFakeClient({ fail = false } = {}): FakeClient {
  const handlers: FakeClientHandlers = {};

  // Build the on() implementation separately to satisfy PgLikeClient's overloads
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  function onImpl(event: string, cb: (...args: any[]) => void) {
    (handlers as Record<string, unknown>)[event] = cb;
  }

  return {
    connect: fail
      ? vi.fn().mockRejectedValue(new Error('connection refused'))
      : vi.fn().mockResolvedValue(undefined),
    query: vi.fn().mockResolvedValue({}),
    end: vi.fn().mockResolvedValue(undefined),
    on: onImpl as PgLikeClient['on'],
    trigger: {
      notification: (channel: string, payload: string) =>
        handlers.notification?.({ channel, payload }),
      error: (err: Error) => handlers.error?.(err),
      end: () => handlers.end?.(),
    },
  };
}

interface FakeTimer {
  id: number;
  delay: number;
  callback: () => void | Promise<void>;
}

type FakeScheduler = Required<BusOpts>['scheduler'] & {
  pending: FakeTimer[];
  runNext(): Promise<void>;
};

function createFakeScheduler(): FakeScheduler {
  let nextId = 1;
  const pending: FakeTimer[] = [];

  return {
    pending,
    setTimeout(cb: () => void, delay: number): unknown {
      const id = nextId++;
      pending.push({ id, delay, callback: cb });
      return id;
    },
    clearTimeout(id: unknown): void {
      const numId = id as number;
      const idx = pending.findIndex((t) => t.id === numId);
      if (idx >= 0) pending.splice(idx, 1);
    },
    async runNext() {
      const timer = pending.shift();
      if (timer) await timer.callback();
    },
  };
}

/** Flush the microtask queue so async boot() steps resolve. */
const tick = () => new Promise<void>((r) => setTimeout(r, 0));

// ---------------------------------------------------------------------------
// Suite
// ---------------------------------------------------------------------------

describe('getRealtimeBus / listener singleton', () => {
  beforeEach(() => {
    delete globalThis.__cerroRealtimeBus;
    vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
  });

  afterEach(async () => {
    const bus = globalThis.__cerroRealtimeBus;
    if (bus) {
      await bus.close();
      delete globalThis.__cerroRealtimeBus;
    }
    vi.restoreAllMocks();
  });

  // -------------------------------------------------------------------------
  // T1: first call connects and issues 3 LISTEN statements
  // -------------------------------------------------------------------------
  it('first call connects and issues 3 LISTEN statements', async () => {
    const client = createFakeClient();
    const scheduler = createFakeScheduler();

    getRealtimeBus({ clientFactory: () => client, scheduler });
    await tick();

    expect(client.connect).toHaveBeenCalledOnce();
    expect(client.query).toHaveBeenCalledOnce();

    const sql = (client.query.mock.calls[0] as string[])[0];
    expect(sql).toContain('LISTEN menu_changed');
    expect(sql).toContain('LISTEN order_status_changed');
    expect(sql).toContain('LISTEN table_changed');
    expect(globalThis.__cerroRealtimeBus?.state()).toBe('connected');
  });

  // -------------------------------------------------------------------------
  // T2: notification fires the typed listener
  // -------------------------------------------------------------------------
  it('subscribing then emitting a notification fires the typed listener', async () => {
    const client = createFakeClient();
    const scheduler = createFakeScheduler();
    const bus = getRealtimeBus({ clientFactory: () => client, scheduler });
    await tick();

    const received: MenuChangedPayload[] = [];
    bus.on('menu_changed', (p) => received.push(p));

    client.trigger.notification(
      'menu_changed',
      JSON.stringify({ menuId: 1, changeType: 'item_added' }),
    );

    expect(received).toHaveLength(1);
    expect(received[0]).toEqual({ menuId: 1, changeType: 'item_added' });
  });

  // -------------------------------------------------------------------------
  // T3: invalid JSON payload does not crash; listener not invoked
  // -------------------------------------------------------------------------
  it('invalid JSON payload does not crash and listener is not invoked', async () => {
    const client = createFakeClient();
    const scheduler = createFakeScheduler();
    const bus = getRealtimeBus({ clientFactory: () => client, scheduler });
    await tick();

    const received: unknown[] = [];
    bus.on('menu_changed', (p) => received.push(p));

    expect(() => {
      client.trigger.notification('menu_changed', 'not-valid-json{{{');
    }).not.toThrow();

    expect(received).toHaveLength(0);
  });

  // -------------------------------------------------------------------------
  // T4: schema-invalid payload does not fire
  // -------------------------------------------------------------------------
  it('schema-invalid payload does not fire the listener', async () => {
    const client = createFakeClient();
    const scheduler = createFakeScheduler();
    const bus = getRealtimeBus({ clientFactory: () => client, scheduler });
    await tick();

    const received: unknown[] = [];
    bus.on('menu_changed', (p) => received.push(p));

    // menuId must be a positive integer — 'not-a-number' fails schema
    client.trigger.notification(
      'menu_changed',
      JSON.stringify({ menuId: 'not-a-number', changeType: 'item_added' }),
    );

    expect(received).toHaveLength(0);
  });

  // -------------------------------------------------------------------------
  // T5: on 'end', state goes to 'reconnecting'; after backoff connects again
  // -------------------------------------------------------------------------
  it("on 'end' state goes to reconnecting; after backoff connects again", async () => {
    const clients = [createFakeClient(), createFakeClient()];
    let idx = 0;
    const scheduler = createFakeScheduler();

    const bus = getRealtimeBus({ clientFactory: () => clients[idx++]!, scheduler });
    await tick();
    expect(bus.state()).toBe('connected');

    clients[0]!.trigger.end();
    expect(bus.state()).toBe('reconnecting');

    await scheduler.runNext(); // fire reconnect timer
    await tick(); // let second boot() complete

    expect(bus.state()).toBe('connected');
    expect(clients[1]!.connect).toHaveBeenCalledOnce();
  });

  // -------------------------------------------------------------------------
  // T6: onReconnect listeners fire after reconnect
  // -------------------------------------------------------------------------
  it('onReconnect listeners fire after successful reconnect', async () => {
    const clients = [createFakeClient(), createFakeClient()];
    let idx = 0;
    const scheduler = createFakeScheduler();

    const bus = getRealtimeBus({ clientFactory: () => clients[idx++]!, scheduler });
    await tick();

    const fired: number[] = [];
    bus.onReconnect(() => fired.push(1));

    clients[0]!.trigger.end();
    await scheduler.runNext();
    await tick();

    expect(fired).toHaveLength(1);
  });

  // -------------------------------------------------------------------------
  // T7: listeners registered before disconnect still receive events after reconnect
  // -------------------------------------------------------------------------
  it('listeners receive notifications after reconnect', async () => {
    const clients = [createFakeClient(), createFakeClient()];
    let idx = 0;
    const scheduler = createFakeScheduler();

    const bus = getRealtimeBus({ clientFactory: () => clients[idx++]!, scheduler });
    await tick();

    const received: OrderStatusChangedPayload[] = [];
    bus.on('order_status_changed', (p) => received.push(p));

    // Disconnect and reconnect
    clients[0]!.trigger.end();
    await scheduler.runNext();
    await tick();
    expect(bus.state()).toBe('connected');

    // Emit on new client — listener should still fire
    clients[1]!.trigger.notification(
      'order_status_changed',
      JSON.stringify({
        orderId: '018f1a2b-0000-7000-8000-000000000001',
        from: 'pending',
        to: 'paid',
        shortCode: 'A3F7',
        tableId: null,
      }),
    );

    expect(received).toHaveLength(1);
    expect(received[0]!.shortCode).toBe('A3F7');
  });

  // -------------------------------------------------------------------------
  // T8: backoff sequence with ±20% jitter
  // -------------------------------------------------------------------------
  it('backoff sequence: 1000, 2000, 4000, 8000, 16000, 30000, 30000 ms ±20%', async () => {
    const scheduler = createFakeScheduler();

    // All connect attempts fail
    getRealtimeBus({ clientFactory: () => createFakeClient({ fail: true }), scheduler });

    const expected = [1000, 2000, 4000, 8000, 16000, 30000, 30000];
    const delays: number[] = [];

    for (let i = 0; i < 7; i++) {
      await tick(); // let current boot() fail → scheduleReconnect → push timer
      expect(scheduler.pending).toHaveLength(1);
      delays.push(scheduler.pending[0]!.delay);
      await scheduler.runNext(); // fire timer → next boot() starts (async)
    }

    for (let i = 0; i < 7; i++) {
      const exp = expected[i]!;
      expect(delays[i]).toBeGreaterThanOrEqual(Math.floor(exp * 0.8));
      expect(delays[i]).toBeLessThanOrEqual(Math.ceil(exp * 1.2));
    }
  });

  // -------------------------------------------------------------------------
  // T9: close() cancels pending reconnect timer
  // -------------------------------------------------------------------------
  it('close() cancels a pending reconnect timer', async () => {
    const client = createFakeClient();
    const scheduler = createFakeScheduler();

    const bus = getRealtimeBus({ clientFactory: () => client, scheduler });
    await tick();
    expect(bus.state()).toBe('connected');

    client.trigger.end(); // schedules reconnect timer
    expect(scheduler.pending).toHaveLength(1);

    await bus.close();
    expect(scheduler.pending).toHaveLength(0);
    expect(bus.state()).toBe('closed');
  });

  // -------------------------------------------------------------------------
  // T10: second getRealtimeBus() call returns same instance
  // -------------------------------------------------------------------------
  it('second getRealtimeBus() call returns the same instance', async () => {
    const client = createFakeClient();
    const scheduler = createFakeScheduler();

    const bus1 = getRealtimeBus({ clientFactory: () => client, scheduler });
    const bus2 = getRealtimeBus(); // opts ignored — cached instance returned

    expect(bus1).toBe(bus2);
  });
});
