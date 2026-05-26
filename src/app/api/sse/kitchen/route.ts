export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

import { db } from '@/db/client';
import { getDeviceSession } from '@/lib/auth/device-session';
import { nextCookies } from '@/lib/auth/next-adapter';
import type { OrderStatusChangedPayload } from '@/lib/realtime/channels';
import { getRealtimeBus } from '@/lib/realtime/listener';
import type { KitchenTicket } from '@/server/services/kitchen';
import { KitchenService } from '@/server/services/kitchen';

type PendingEvent =
  | { event: 'add'; data: KitchenTicket }
  | { event: 'remove'; data: { orderId: string; status: 'delivered' | 'cancelled' } };

export async function GET(req: Request): Promise<Response> {
  const cookies = await nextCookies();
  const session = await getDeviceSession(cookies);
  if (!session) {
    return new Response(JSON.stringify({ error: 'Unauthorized' }), {
      status: 401,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  const service = new KitchenService(db);
  const bus = getRealtimeBus();
  const encoder = new TextEncoder();

  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      let closed = false;
      let snapshotSent = false;
      let eventId = 0;
      const pending: PendingEvent[] = [];

      function enqueue(text: string): void {
        if (closed) return;
        try {
          controller.enqueue(encoder.encode(text));
        } catch {
          // stream already closed
        }
      }

      function sendEvent(event: string, data: unknown): void {
        const id = ++eventId;
        enqueue(`event: ${event}\nid: ${id}\ndata: ${JSON.stringify(data)}\n\n`);
      }

      function closeStream(): void {
        if (closed) return;
        closed = true;
        clearInterval(keepalive);
        try {
          controller.close();
        } catch {
          // already closed
        }
      }

      // 1. Subscribe before snapshot to avoid race conditions
      const offStatus = bus.on(
        'order_status_changed',
        (payload: OrderStatusChangedPayload) => {
          if (payload.to === 'in_kitchen') {
            void service.getTicket(payload.orderId).then((ticket) => {
              if (!ticket) return;
              if (!snapshotSent) {
                pending.push({ event: 'add', data: ticket });
              } else {
                sendEvent('add', ticket);
              }
            });
          } else if (payload.from === 'in_kitchen') {
            const status =
              payload.to === 'delivered' ? 'delivered' : 'cancelled';
            const ev: PendingEvent = {
              event: 'remove',
              data: { orderId: payload.orderId, status },
            };
            if (!snapshotSent) {
              pending.push(ev);
            } else {
              sendEvent('remove', ev.data);
            }
          }
        },
      );

      const offReconnect = bus.onReconnect(() => {
        void service.listInKitchen().then((tickets) => {
          sendEvent('snapshot', tickets);
        });
      });

      // 2. Send initial snapshot
      void service
        .listInKitchen()
        .then((tickets) => {
          sendEvent('snapshot', tickets);
          snapshotSent = true;
          for (const ev of pending) {
            sendEvent(ev.event, ev.data);
          }
          pending.length = 0;
        })
        .catch((err: unknown) => {
          console.error('[sse/kitchen] snapshot failed:', err);
          closeStream();
        });

      // 3. Keepalive every 25 s
      const keepalive = setInterval(() => {
        enqueue(': keepalive\n\n');
      }, 25_000);

      // 4. Cleanup on client disconnect
      req.signal.addEventListener(
        'abort',
        () => {
          offStatus();
          offReconnect();
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
