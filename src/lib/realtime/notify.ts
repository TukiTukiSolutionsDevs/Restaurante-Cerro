/**
 * notifyAfterTx is the ONLY public API for emitting Postgres NOTIFY.
 * All callers MUST use this function — never call pg_notify directly.
 * Emitting inside the transaction makes the NOTIFY atomic: it fires only
 * on COMMIT and is suppressed on rollback.
 */

import { Channel, ChannelPayloadMap, ChannelSchemas, NOTIFY_PAYLOAD_MAX_BYTES } from './channels';

export type SqlExecutor = {
  execute: (raw: string, params: unknown[]) => Promise<unknown>;
};

export class NotifyPayloadTooLarge extends Error {
  constructor(channel: string, byteLength: number) {
    super(
      `NOTIFY payload exceeds ${NOTIFY_PAYLOAD_MAX_BYTES} bytes on channel "${channel}" (got ${byteLength})`,
    );
    this.name = 'NotifyPayloadTooLarge';
  }
}

export class UnknownChannel extends Error {
  constructor(channel: string) {
    super(`Unknown realtime channel: "${channel}"`);
    this.name = 'UnknownChannel';
  }
}

function stableStringify(value: unknown): string {
  if (value === null || typeof value !== 'object') {
    return JSON.stringify(value);
  }
  const obj = value as Record<string, unknown>;
  const parts = Object.keys(obj)
    .sort()
    .filter((k) => obj[k] !== undefined)
    .map((k) => `${JSON.stringify(k)}:${stableStringify(obj[k])}`);
  return `{${parts.join(',')}}`;
}

async function _guardAndExecute(
  tx: SqlExecutor,
  channel: string,
  json: string,
): Promise<void> {
  const byteLength = Buffer.byteLength(json, 'utf8');
  if (byteLength > NOTIFY_PAYLOAD_MAX_BYTES) {
    throw new NotifyPayloadTooLarge(channel, byteLength);
  }
  await tx.execute('SELECT pg_notify($1, $2)', [channel, json]);
}

export async function notifyAfterTx<C extends Channel>(
  tx: SqlExecutor,
  channel: C,
  payload: ChannelPayloadMap[C],
): Promise<void> {
  if (!(channel in ChannelSchemas)) {
    throw new UnknownChannel(channel as string);
  }
  ChannelSchemas[channel].parse(payload);
  await _guardAndExecute(tx, channel as string, stableStringify(payload));
}

// Exported only for unit-testing the byte-length guard — do not call in production code.
export async function __test_only_rawNotify(
  tx: SqlExecutor,
  channel: Channel,
  rawJson: string,
): Promise<void> {
  await _guardAndExecute(tx, channel as string, rawJson);
}
