import { describe, expect, it } from 'vitest';

import { NOTIFY_PAYLOAD_MAX_BYTES } from '@/lib/realtime/channels';
import {
  __test_only_rawNotify,
  notifyAfterTx,
  NotifyPayloadTooLarge,
  SqlExecutor,
  UnknownChannel,
} from '@/lib/realtime/notify';

const VALID_UUID = '550e8400-e29b-41d4-a716-446655440000';

function makeTx() {
  const calls: Array<{ raw: string; params: unknown[] }> = [];
  const tx: SqlExecutor = {
    execute: async (raw, params) => {
      calls.push({ raw, params });
    },
  };
  return { tx, calls };
}

describe('notifyAfterTx', () => {
  it('calls execute with parameterized pg_notify and stable-sorted json', async () => {
    const { tx, calls } = makeTx();
    await notifyAfterTx(tx, 'menu_changed', { menuId: 1, changeType: 'item_added' });

    expect(calls).toHaveLength(1);
    expect(calls[0].raw).toBe('SELECT pg_notify($1, $2)');
    expect(calls[0].params).toEqual([
      'menu_changed',
      '{"changeType":"item_added","menuId":1}',
    ]);
  });

  it('sorts keys of a nested-ish payload stably', async () => {
    const { tx, calls } = makeTx();
    await notifyAfterTx(tx, 'order_status_changed', {
      orderId: VALID_UUID,
      from: 'pending',
      to: 'paid',
      shortCode: 'A3F7',
      tableId: 7,
    });

    expect(calls).toHaveLength(1);
    const json = calls[0].params[1] as string;
    const keys = Object.keys(JSON.parse(json));
    expect(keys).toEqual([...keys].sort());
  });

  it('throws before calling execute when zod validation fails', async () => {
    const { tx, calls } = makeTx();
    await expect(
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      notifyAfterTx(tx, 'menu_changed', { menuId: -1, changeType: 'item_added' } as any),
    ).rejects.toThrow();
    expect(calls).toHaveLength(0);
  });

  it('throws UnknownChannel and never calls execute for unregistered channel', async () => {
    const { tx, calls } = makeTx();
    await expect(
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      notifyAfterTx(tx, 'unknown_channel' as any, {} as any),
    ).rejects.toBeInstanceOf(UnknownChannel);
    expect(calls).toHaveLength(0);
  });

  it('passes for a valid order_status_changed payload with null tableId', async () => {
    const { tx, calls } = makeTx();
    await notifyAfterTx(tx, 'order_status_changed', {
      orderId: VALID_UUID,
      from: 'pending',
      to: 'paid',
      shortCode: 'A3F7',
      tableId: null,
    });
    expect(calls).toHaveLength(1);
    expect(calls[0].params[0]).toBe('order_status_changed');
  });

  it('passes for a valid table_changed payload', async () => {
    const { tx, calls } = makeTx();
    await notifyAfterTx(tx, 'table_changed', { change: 'state_changed', tableId: 1 });
    expect(calls).toHaveLength(1);
    expect(calls[0].params[0]).toBe('table_changed');
  });
});

describe('__test_only_rawNotify (byte-length guard)', () => {
  it('throws NotifyPayloadTooLarge when payload exceeds NOTIFY_PAYLOAD_MAX_BYTES', async () => {
    const { tx, calls } = makeTx();
    const oversizedJson = '"' + 'x'.repeat(NOTIFY_PAYLOAD_MAX_BYTES) + '"';
    await expect(
      __test_only_rawNotify(tx, 'menu_changed', oversizedJson),
    ).rejects.toBeInstanceOf(NotifyPayloadTooLarge);
    expect(calls).toHaveLength(0);
  });

  it('calls execute when payload is within the byte limit', async () => {
    const { tx, calls } = makeTx();
    await __test_only_rawNotify(tx, 'menu_changed', '{"menuId":1}');
    expect(calls).toHaveLength(1);
  });

  it('NotifyPayloadTooLarge error message includes the channel name', async () => {
    const { tx } = makeTx();
    const oversizedJson = '"' + 'x'.repeat(NOTIFY_PAYLOAD_MAX_BYTES) + '"';
    const err = await __test_only_rawNotify(tx, 'menu_changed', oversizedJson).catch((e) => e);
    expect(err.message).toContain('menu_changed');
  });
});

describe('NOTIFY_PAYLOAD_MAX_BYTES constant', () => {
  it('equals 7900', () => {
    expect(NOTIFY_PAYLOAD_MAX_BYTES).toBe(7900);
  });
});
