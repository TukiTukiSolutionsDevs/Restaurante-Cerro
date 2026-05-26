import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { createSseResponse } from '@/lib/realtime/sse';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const decoder = new TextDecoder();

async function readChunk(reader: ReadableStreamDefaultReader<Uint8Array>): Promise<string> {
  const { value } = await reader.read();
  return decoder.decode(value);
}

function parseEventFrame(raw: string): { event?: string; id?: string; data?: string; comment?: string } {
  const result: { event?: string; id?: string; data?: string; comment?: string } = {};
  for (const line of raw.split('\n')) {
    if (line.startsWith('event: ')) result.event = line.slice(7);
    else if (line.startsWith('id: ')) result.id = line.slice(4);
    else if (line.startsWith('data: ')) result.data = line.slice(6);
    else if (line.startsWith(': ')) result.comment = line.slice(2);
  }
  return result;
}

function makeRequest(signal?: AbortSignal): Request {
  return new Request('http://localhost/api/sse/test', { signal });
}

// ---------------------------------------------------------------------------
// Suite
// ---------------------------------------------------------------------------

describe('createSseResponse', () => {
  beforeEach(() => {
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  // -------------------------------------------------------------------------
  // Response headers
  // -------------------------------------------------------------------------
  it('returns correct SSE headers', () => {
    const ac = new AbortController();
    const res = createSseResponse(makeRequest(ac.signal), {
      snapshot: async () => ({}),
      subscribe: () => () => undefined,
    });

    expect(res.headers.get('Content-Type')).toBe('text/event-stream');
    expect(res.headers.get('Cache-Control')).toBe('no-cache, no-transform');
    expect(res.headers.get('X-Accel-Buffering')).toBe('no');
    expect(res.headers.get('Connection')).toBe('keep-alive');

    ac.abort();
  });

  // -------------------------------------------------------------------------
  // Snapshot is first frame
  // -------------------------------------------------------------------------
  it('first chunk is the snapshot event', async () => {
    const ac = new AbortController();
    const res = createSseResponse<{ items: number[] }, never>(makeRequest(ac.signal), {
      snapshot: async () => ({ items: [1, 2, 3] }),
      subscribe: () => () => undefined,
    });

    const reader = res.body!.getReader();
    const raw = await readChunk(reader);
    const frame = parseEventFrame(raw);

    expect(frame.event).toBe('snapshot');
    expect(frame.id).toBeDefined();
    expect(JSON.parse(frame.data!)).toEqual({ items: [1, 2, 3] });

    ac.abort();
    await reader.cancel();
  });

  // -------------------------------------------------------------------------
  // Update event after snapshot
  // -------------------------------------------------------------------------
  it('update events appear after snapshot with monotonically incrementing IDs', async () => {
    let sendUpdate!: (data: { value: number }) => void;
    const ac = new AbortController();

    const res = createSseResponse<{ initial: true }, { value: number }>(makeRequest(ac.signal), {
      snapshot: async () => ({ initial: true }),
      subscribe: (su) => {
        sendUpdate = su;
        return () => undefined;
      },
    });

    const reader = res.body!.getReader();

    // Read snapshot
    const snapshotRaw = await readChunk(reader);
    const snapshotFrame = parseEventFrame(snapshotRaw);
    expect(snapshotFrame.event).toBe('snapshot');
    const snapshotId = Number(snapshotFrame.id);

    // Send an update
    sendUpdate({ value: 42 });

    const updateRaw = await readChunk(reader);
    const updateFrame = parseEventFrame(updateRaw);
    expect(updateFrame.event).toBe('update');
    expect(JSON.parse(updateFrame.data!)).toEqual({ value: 42 });
    expect(Number(updateFrame.id)).toBeGreaterThan(snapshotId);

    // Send a second update — ID must keep incrementing
    sendUpdate({ value: 99 });
    const update2Raw = await readChunk(reader);
    expect(Number(parseEventFrame(update2Raw).id)).toBeGreaterThan(Number(updateFrame.id));

    ac.abort();
    await reader.cancel();
  });

  // -------------------------------------------------------------------------
  // Updates buffered during snapshot are flushed after snapshot
  // -------------------------------------------------------------------------
  it('updates received during snapshot computation are buffered and flushed after snapshot', async () => {
    let resolveSnapshot!: (data: { ready: true }) => void;
    let sendUpdate!: (data: { buffered: boolean }) => void;
    const ac = new AbortController();

    const res = createSseResponse<{ ready: true }, { buffered: boolean }>(makeRequest(ac.signal), {
      snapshot: () =>
        new Promise<{ ready: true }>((r) => {
          resolveSnapshot = r;
        }),
      subscribe: (su) => {
        sendUpdate = su;
        return () => undefined;
      },
    });

    const reader = res.body!.getReader();

    // Trigger update BEFORE snapshot resolves
    sendUpdate({ buffered: true });

    // Now resolve the snapshot
    resolveSnapshot({ ready: true });

    // First chunk must be the snapshot
    const snapshotRaw = await readChunk(reader);
    expect(parseEventFrame(snapshotRaw).event).toBe('snapshot');

    // Second chunk must be the buffered update
    const updateRaw = await readChunk(reader);
    const frame = parseEventFrame(updateRaw);
    expect(frame.event).toBe('update');
    expect(JSON.parse(frame.data!)).toEqual({ buffered: true });

    ac.abort();
    await reader.cancel();
  });

  // -------------------------------------------------------------------------
  // Abort calls unsubscribe
  // -------------------------------------------------------------------------
  it('aborting the request calls unsubscribe', async () => {
    const unsubscribe = vi.fn();
    const ac = new AbortController();

    const res = createSseResponse(makeRequest(ac.signal), {
      snapshot: async () => ({}),
      subscribe: () => unsubscribe,
    });

    const reader = res.body!.getReader();
    await readChunk(reader); // consume snapshot

    ac.abort();
    // Give the abort event listener a tick to fire
    await new Promise<void>((r) => setTimeout(r, 0));

    expect(unsubscribe).toHaveBeenCalledOnce();
    await reader.cancel();
  });

  // -------------------------------------------------------------------------
  // Keepalive comment after 25 s
  // -------------------------------------------------------------------------
  it('sends a keepalive comment line after 25 seconds', async () => {
    // Use fake timers from the start and keep them throughout.
    // Promises/microtasks are NOT affected by vi.useFakeTimers(), so
    // await readChunk() resolves normally via the snapshot microtask.
    vi.useFakeTimers();

    const ac = new AbortController();
    const res = createSseResponse(makeRequest(ac.signal), {
      snapshot: async () => ({}),
      subscribe: () => () => undefined,
    });

    const reader = res.body!.getReader();

    // snapshot() resolves via microtask — unaffected by fake timers
    const snapshotRaw = await readChunk(reader);
    expect(parseEventFrame(snapshotRaw).event).toBe('snapshot');

    // Queue the next read, then fire the interval synchronously
    const keepalivePromise = reader.read();
    vi.advanceTimersByTime(25_000);
    const { value } = await keepalivePromise;
    const raw = decoder.decode(value);

    expect(raw).toContain(': keepalive');

    ac.abort();
    await reader.cancel();
  });

  // -------------------------------------------------------------------------
  // Custom event names
  // -------------------------------------------------------------------------
  it('respects custom eventNames overrides', async () => {
    const ac = new AbortController();
    const res = createSseResponse<{ x: number }, never>(makeRequest(ac.signal), {
      snapshot: async () => ({ x: 1 }),
      subscribe: () => () => undefined,
      eventNames: { snapshot: 'init', update: 'patch' },
    });

    const reader = res.body!.getReader();
    const raw = await readChunk(reader);
    expect(parseEventFrame(raw).event).toBe('init');

    ac.abort();
    await reader.cancel();
  });
});
