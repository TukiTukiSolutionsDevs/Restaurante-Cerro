import { db } from '@/db/client';
import { nextCookies } from '@/lib/auth/next-adapter';
import { requireRole } from '@/lib/auth/session';
import { getRealtimeBus } from '@/lib/realtime/listener';
import { createSseResponse } from '@/lib/realtime/sse';
import { type CashierOrderView,CashierService } from '@/server/services/cashier';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export interface CashierQueuePayload {
  pending: CashierOrderView[];
  summary: { paidCount: number; cashCents: number; yapeCents: number };
}

export async function GET(req: Request) {
  const cookies = await nextCookies();
  const auth = await requireRole(cookies, ['cashier', 'admin']);
  if (!auth.ok) {
    return new Response('Unauthorized', { status: 401 });
  }

  const svc = new CashierService(db);
  const bus = getRealtimeBus();

  return createSseResponse<CashierQueuePayload, CashierQueuePayload>(req, {
    snapshot: async () => {
      const [pending, summary] = await Promise.all([
        svc.listPendingToday(),
        svc.dailySummary(),
      ]);
      return { pending, summary };
    },

    subscribe: (sendUpdate, sendReconnectHint) => {
      const refetch = () =>
        Promise.all([svc.listPendingToday(), svc.dailySummary()])
          .then(([pending, summary]) => sendUpdate({ pending, summary }))
          .catch((err: unknown) => console.error('[sse/cashier-queue] refetch error', err));

      const unsub1 = bus.on('order_status_changed', () => void refetch());
      const unsub2 = bus.onReconnect(() => {
        sendReconnectHint();
        void refetch();
      });

      return () => {
        unsub1();
        unsub2();
      };
    },
  });
}
