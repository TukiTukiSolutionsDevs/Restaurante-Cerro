import { act, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { EventSourceLike, SseEventCallback } from '@/lib/realtime/use-sse';
import { useSse } from '@/lib/realtime/use-sse';

// ---------------------------------------------------------------------------
// Stub EventSource
// ---------------------------------------------------------------------------

class StubEventSource implements EventSourceLike {
  listeners = new Map<string, SseEventCallback[]>();
  closed = false;

  addEventListener(event: string, cb: SseEventCallback): void {
    const list = this.listeners.get(event) ?? [];
    list.push(cb);
    this.listeners.set(event, list);
  }

  removeEventListener(event: string, cb: SseEventCallback): void {
    const list = this.listeners.get(event) ?? [];
    this.listeners.set(event, list.filter((fn) => fn !== cb));
  }

  close(): void {
    this.closed = true;
  }

  /** Fire an event on all registered listeners. Snapshots the list for safe iteration. */
  emit(event: string, payload?: unknown): void {
    const cbs = [...(this.listeners.get(event) ?? [])];
    if (event === 'open') {
      cbs.forEach((cb) => (cb as () => void)());
    } else {
      cbs.forEach((cb) =>
        (cb as (ev: { data: string }) => void)({
          data: JSON.stringify(payload ?? null),
        }),
      );
    }
  }
}

// ---------------------------------------------------------------------------
// Shared factory helpers — reset before each test
// ---------------------------------------------------------------------------

let stubs: StubEventSource[];
let factory: () => StubEventSource;

beforeEach(() => {
  stubs = [];
  factory = () => {
    const stub = new StubEventSource();
    stubs.push(stub);
    return stub;
  };
});

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('useSse', () => {
  it('1. initial status is connecting', () => {
    const { result } = renderHook(() =>
      useSse({ url: '/api/sse/test', eventSourceFactory: factory }),
    );
    expect(result.current.status).toBe('connecting');
  });

  it('2. open event transitions status to connected', async () => {
    const { result } = renderHook(() =>
      useSse({ url: '/api/sse/test', eventSourceFactory: factory }),
    );
    await act(async () => {
      stubs[0].emit('open');
    });
    expect(result.current.status).toBe('connected');
  });

  it('3. snapshot event updates snapshot state and calls onSnapshot', async () => {
    const onSnapshot = vi.fn();
    const { result } = renderHook(() =>
      useSse({ url: '/api/sse/test', eventSourceFactory: factory, onSnapshot }),
    );
    const data = { items: [1, 2, 3] };
    await act(async () => {
      stubs[0].emit('snapshot', data);
    });
    expect(result.current.snapshot).toEqual(data);
    expect(onSnapshot).toHaveBeenCalledWith(data);
  });

  it('4. update event updates lastUpdate state and calls onUpdate', async () => {
    const onUpdate = vi.fn();
    const { result } = renderHook(() =>
      useSse({ url: '/api/sse/test', eventSourceFactory: factory, onUpdate }),
    );
    const data = { orderId: 'abc-123', status: 'delivered' };
    await act(async () => {
      stubs[0].emit('update', data);
    });
    expect(result.current.lastUpdate).toEqual(data);
    expect(onUpdate).toHaveBeenCalledWith(data);
  });

  it('5. reconnected event calls onReconnect', async () => {
    const onReconnect = vi.fn();
    renderHook(() =>
      useSse({ url: '/api/sse/test', eventSourceFactory: factory, onReconnect }),
    );
    await act(async () => {
      stubs[0].emit('reconnected');
    });
    expect(onReconnect).toHaveBeenCalledTimes(1);
  });

  it('6. error sets status reconnecting and creates a new ES after backoff', async () => {
    vi.useFakeTimers();
    // random()=1 → delay = floor(1 * 1000) = 1000 ms
    vi.spyOn(Math, 'random').mockReturnValue(1);

    const { result } = renderHook(() =>
      useSse({ url: '/api/sse/test', initialBackoffMs: 1000, eventSourceFactory: factory }),
    );

    await act(async () => {
      stubs[0].emit('error');
    });
    expect(result.current.status).toBe('reconnecting');
    expect(stubs).toHaveLength(1);

    await act(async () => {
      vi.advanceTimersByTime(1000);
    });
    expect(stubs).toHaveLength(2);
  });

  it('7. consecutive errors double the backoff up to maxBackoffMs', async () => {
    vi.useFakeTimers();
    vi.spyOn(Math, 'random').mockReturnValue(1);

    renderHook(() =>
      useSse({
        url: '/api/sse/test',
        initialBackoffMs: 1000,
        maxBackoffMs: 4000,
        eventSourceFactory: factory,
      }),
    );

    // Error 1 at T=0: delay=1000 ms, backoff→2000
    await act(async () => { stubs[0].emit('error'); });
    await act(async () => { vi.advanceTimersByTime(1000); }); // T=1000
    expect(stubs).toHaveLength(2);

    // Error 2 at T=1000: delay=2000 ms, backoff→4000
    await act(async () => { stubs[1].emit('error'); });
    await act(async () => { vi.advanceTimersByTime(1999); }); // T=2999 — not yet
    expect(stubs).toHaveLength(2);
    await act(async () => { vi.advanceTimersByTime(1); });    // T=3000 — fires
    expect(stubs).toHaveLength(3);

    // Error 3 at T=3000: delay=4000 ms (capped), backoff stays 4000
    await act(async () => { stubs[2].emit('error'); });
    await act(async () => { vi.advanceTimersByTime(4000); }); // T=7000
    expect(stubs).toHaveLength(4);

    // Error 4 at T=7000: delay still 4000 ms (cap holds)
    await act(async () => { stubs[3].emit('error'); });
    await act(async () => { vi.advanceTimersByTime(3999); }); // T=10999 — not yet
    expect(stubs).toHaveLength(4);
    await act(async () => { vi.advanceTimersByTime(1); });    // T=11000 — fires
    expect(stubs).toHaveLength(5);
  });

  it('8. successful open after errors resets backoff to initialBackoffMs', async () => {
    vi.useFakeTimers();
    vi.spyOn(Math, 'random').mockReturnValue(1);

    renderHook(() =>
      useSse({
        url: '/api/sse/test',
        initialBackoffMs: 1000,
        maxBackoffMs: 30000,
        eventSourceFactory: factory,
      }),
    );

    // Error 1 at T=0: delay=1000 ms, backoff→2000
    await act(async () => { stubs[0].emit('error'); });
    await act(async () => { vi.advanceTimersByTime(1000); }); // T=1000, stubs[1] created

    // Error 2 at T=1000: delay=2000 ms, backoff→4000
    await act(async () => { stubs[1].emit('error'); });
    await act(async () => { vi.advanceTimersByTime(2000); }); // T=3000, stubs[2] created

    // Successful open resets backoff to 1000
    await act(async () => { stubs[2].emit('open'); });

    // Error 3 at T=3000: should use initial backoff (1000 ms), not 4000 ms
    await act(async () => { stubs[2].emit('error'); });
    await act(async () => { vi.advanceTimersByTime(999); });  // T=3999 — not yet
    expect(stubs).toHaveLength(3);
    await act(async () => { vi.advanceTimersByTime(1); });    // T=4000 — fires at 1000 ms
    expect(stubs).toHaveLength(4);
  });

  it('9. unmount closes the ES and clears the pending reconnect timer', async () => {
    vi.useFakeTimers();
    vi.spyOn(Math, 'random').mockReturnValue(1);

    const { unmount } = renderHook(() =>
      useSse({ url: '/api/sse/test', initialBackoffMs: 1000, eventSourceFactory: factory }),
    );

    await act(async () => { stubs[0].emit('error'); });
    expect(stubs[0].closed).toBe(true);

    unmount();

    // Timer was cleared in cleanup — no new ES should appear
    await act(async () => { vi.advanceTimersByTime(5000); });
    expect(stubs).toHaveLength(1);
  });

  it('11. uses window.EventSource when no eventSourceFactory is provided', () => {
    const mockEs = new StubEventSource();
    // vi.stubGlobal sets globalThis.EventSource; a plain function returning an
    // object works as a constructor (JavaScript returns the object on `new`).
    vi.stubGlobal('EventSource', function MockEventSource() { return mockEs; });
    try {
      const { unmount } = renderHook(() => useSse({ url: '/api/sse/native' }));
      unmount();
    } finally {
      vi.unstubAllGlobals();
    }
  });

  it('10. changing the url prop creates a new ES and closes the previous one', async () => {
    const { rerender } = renderHook(
      ({ url }: { url: string }) => useSse({ url, eventSourceFactory: factory }),
      { initialProps: { url: '/api/sse/a' } },
    );
    expect(stubs).toHaveLength(1);

    await act(async () => { rerender({ url: '/api/sse/b' }); });
    expect(stubs).toHaveLength(2);
    expect(stubs[0].closed).toBe(true);
  });
});
