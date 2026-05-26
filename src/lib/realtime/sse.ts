/** SSE response builder: subscribe → snapshot → stream updates with keepalive. */

export interface SseSetup<TSnapshot, TUpdate> {
  /** Called once after subscription to compute the initial snapshot. */
  snapshot: () => Promise<TSnapshot>;
  /**
   * Subscribe to the bus. Call sendUpdate on each relevant event.
   * Call sendReconnectHint to push a 'reconnected' event to the client.
   * Must return an unsubscribe function.
   */
  subscribe: (sendUpdate: (data: TUpdate) => void, sendReconnectHint: () => void) => () => void;
  /** Optional overrides for SSE event names. */
  eventNames?: { snapshot?: string; update?: string; reconnected?: string };
}

/** Creates a Server-Sent Events Response with proper headers, keepalive, and cleanup. */
export function createSseResponse<TSnapshot, TUpdate>(
  req: Request,
  setup: SseSetup<TSnapshot, TUpdate>,
): Response {
  let eventCounter = 0;
  const encoder = new TextEncoder();

  function formatEvent(event: string, data: unknown): string {
    const id = ++eventCounter;
    return `event: ${event}\nid: ${id}\ndata: ${JSON.stringify(data)}\n\n`;
  }

  const names = {
    snapshot: setup.eventNames?.snapshot ?? 'snapshot',
    update: setup.eventNames?.update ?? 'update',
    reconnected: setup.eventNames?.reconnected ?? 'reconnected',
  };

  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      let closed = false;
      const pendingUpdates: TUpdate[] = [];
      let snapshotSent = false;
      let keepaliveInterval: ReturnType<typeof setInterval> | null = null;

      function enqueue(text: string): void {
        if (closed) return;
        try {
          controller.enqueue(encoder.encode(text));
        } catch {
          // Stream may have been closed already
        }
      }

      function closeStream(): void {
        if (closed) return;
        closed = true;
        if (keepaliveInterval !== null) {
          clearInterval(keepaliveInterval);
          keepaliveInterval = null;
        }
        try {
          controller.close();
        } catch {
          // Already closed
        }
      }

      // 1. Subscribe FIRST so no events are missed during snapshot computation
      const unsubscribe = setup.subscribe(
        (data) => {
          if (!snapshotSent) {
            // Buffer updates that arrive before snapshot is sent
            pendingUpdates.push(data);
          } else {
            enqueue(formatEvent(names.update, data));
          }
        },
        () => {
          enqueue(formatEvent(names.reconnected, {}));
        },
      );

      // 2. Compute snapshot, send it, then flush any buffered updates
      setup
        .snapshot()
        .then((data) => {
          enqueue(formatEvent(names.snapshot, data));
          snapshotSent = true;
          for (const update of pendingUpdates) {
            enqueue(formatEvent(names.update, update));
          }
          pendingUpdates.length = 0;
        })
        .catch((err: unknown) => {
          console.error('[sse] snapshot failed:', err);
          closeStream();
        });

      // 3. Keepalive comment every 25 s to prevent proxy idle-timeout
      keepaliveInterval = setInterval(() => {
        enqueue(': keepalive\n\n');
      }, 25_000);

      // 4. Cleanup on client disconnect
      req.signal.addEventListener(
        'abort',
        () => {
          unsubscribe();
          closeStream();
        },
        { once: true },
      );
    },
  });

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache, no-transform',
      'X-Accel-Buffering': 'no',
      Connection: 'keep-alive',
    },
  });
}
