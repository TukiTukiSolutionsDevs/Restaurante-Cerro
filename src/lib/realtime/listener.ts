import { EventEmitter } from 'node:events';

import type { Channel, ChannelPayloadMap } from './channels';
import { ChannelSchemas } from './channels';

export type ListenerState = 'idle' | 'connecting' | 'connected' | 'reconnecting' | 'closed';

export interface PgLikeClient {
  connect(): Promise<void>;
  query(sql: string): Promise<unknown>;
  on(event: 'notification', cb: (msg: { channel: string; payload?: string }) => void): void;
  on(event: 'error', cb: (err: Error) => void): void;
  on(event: 'end', cb: () => void): void;
  /** Broad overload — satisfies test stubs that use (...args: unknown[]) signatures. */
  on(event: string, cb: (...args: unknown[]) => void): void;
  end(): Promise<void>;
}

/** Public realtime bus API. All methods are stable across reconnects. */
export interface RealtimeBus {
  /** Returns the current connection state. */
  state(): ListenerState;
  /** Subscribe to a typed channel. Returns an unsubscribe function. */
  on<C extends Channel>(channel: C, listener: (payload: ChannelPayloadMap[C]) => void): () => void;
  /** Subscribe to reconnect events. Returns an unsubscribe function. */
  onReconnect(listener: () => void): () => void;
  /** Gracefully shut down the bus. Idempotent. */
  close(): Promise<void>;
}

export interface BusOpts {
  connectionString?: string;
  /** Override pg.Client factory — inject a fake in tests. */
  clientFactory?: () => PgLikeClient;
  /** Override timer functions — control reconnect timing in tests. */
  scheduler?: {
    setTimeout(fn: () => void, ms: number): unknown;
    clearTimeout(id: unknown): void;
  };
}

declare global {
   
  var __cerroRealtimeBus: RealtimeBus | undefined;
}

const CHANNELS: Channel[] = ['menu_changed', 'order_status_changed', 'table_changed'];
const BACKOFF_MS = [1000, 2000, 4000, 8000, 16000, 30000] as const;

function backoffWithJitter(attempt: number): number {
  const base = BACKOFF_MS[Math.min(attempt, BACKOFF_MS.length - 1)];
  return Math.floor(base * (0.8 + Math.random() * 0.4));
}

function createBus(opts: BusOpts = {}): RealtimeBus {
  const emitter = new EventEmitter();
  emitter.setMaxListeners(500);

  const scheduler = opts.scheduler ?? {
    setTimeout: globalThis.setTimeout.bind(globalThis),
    clearTimeout: globalThis.clearTimeout.bind(globalThis),
  };

  let _state: ListenerState = 'idle';
  let _reconnectAttempt = 0;
  let _reconnectTimer: unknown = null;
  let _currentClient: PgLikeClient | null = null;

  function makeClient(): PgLikeClient {
    if (opts.clientFactory) return opts.clientFactory();
    // Dynamic require keeps pg out of edge runtime bundles
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { Client } = require('pg') as typeof import('pg');
    return new Client({ connectionString: opts.connectionString ?? process.env.DATABASE_URL }) as unknown as PgLikeClient;
  }

  function scheduleReconnect(reason: string): void {
    if (_state === 'closed' || _state === 'reconnecting') return;
    _state = 'reconnecting';
    _currentClient = null;

    const backoffMs = backoffWithJitter(_reconnectAttempt);
    _reconnectAttempt++;

    console.warn('[realtime] scheduling reconnect', { reason, attempt: _reconnectAttempt, backoffMs });

    _reconnectTimer = scheduler.setTimeout(() => {
      _reconnectTimer = null;
      if (_state !== 'closed') void boot();
    }, backoffMs);
  }

  async function boot(): Promise<void> {
    if (_state === 'closed') return;
    _state = 'connecting';

    const wasReconnecting = _reconnectAttempt > 0;
    const client = makeClient();
    _currentClient = client;

    try {
      await client.connect();

      if ((_state as ListenerState) === 'closed') {
        await client.end().catch(() => undefined);
        return;
      }

      await client.query(CHANNELS.map((ch) => `LISTEN ${ch}`).join('; '));

      _state = 'connected';
      _reconnectAttempt = 0;

      client.on('notification', (msg) => {
        const ch = msg.channel as Channel;
        if (!(ch in ChannelSchemas)) {
          console.warn('[realtime] notification on unknown channel:', ch);
          return;
        }
        let parsed: unknown;
        try {
          parsed = JSON.parse(msg.payload ?? '{}');
        } catch {
          console.warn('[realtime] invalid JSON payload on channel:', ch);
          return;
        }
        const result = ChannelSchemas[ch].safeParse(parsed);
        if (!result.success) {
          console.warn('[realtime] schema-invalid payload on channel:', ch);
          return;
        }
        emitter.emit(ch, result.data);
      });

      client.on('error', (err) => {
        console.warn('[realtime] pg client error:', err.message);
        scheduleReconnect('error');
      });

      client.on('end', () => {
        scheduleReconnect('end');
      });

      if (wasReconnecting) {
        emitter.emit('__reconnected__');
      }
    } catch (err) {
      console.warn('[realtime] boot failed:', err);
      _currentClient = null;
      scheduleReconnect('error');
    }
  }

  void boot();

  return {
    state: () => _state,

    on<C extends Channel>(
      channel: C,
      listener: (payload: ChannelPayloadMap[C]) => void,
    ): () => void {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const handler = listener as (...args: any[]) => void;
      emitter.on(channel as string, handler);
      return () => emitter.off(channel as string, handler);
    },

    onReconnect(listener: () => void): () => void {
      emitter.on('__reconnected__', listener);
      return () => emitter.off('__reconnected__', listener);
    },

    async close(): Promise<void> {
      if (_state === 'closed') return;
      _state = 'closed';
      if (_reconnectTimer !== null) {
        scheduler.clearTimeout(_reconnectTimer);
        _reconnectTimer = null;
      }
      if (_currentClient) {
        await _currentClient.end().catch(() => undefined);
        _currentClient = null;
      }
    },
  };
}

/** Returns the singleton realtime bus, creating it on first call. Cached on globalThis to survive HMR. */
export function getRealtimeBus(opts?: BusOpts): RealtimeBus {
  if (globalThis.__cerroRealtimeBus) return globalThis.__cerroRealtimeBus;
  const bus = createBus(opts);
  globalThis.__cerroRealtimeBus = bus;
  return bus;
}
