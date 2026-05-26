import { db } from '@/db/client';
import { nextCookies } from '@/lib/auth/next-adapter';
import { requireRole } from '@/lib/auth/session';
import type { OrderStatusChangedPayload, TableChangedPayload } from '@/lib/realtime/channels';
import { getRealtimeBus } from '@/lib/realtime/listener';
import { createSseResponse } from '@/lib/realtime/sse';
import type { TableWithState } from '@/server/services/table';
import { TableService } from '@/server/services/table';
import type { WaiterOrderView } from '@/server/services/waiter';
import { WaiterService } from '@/server/services/waiter';

export const dynamic = 'force-dynamic';

export interface WaiterFloorSnapshot {
  activeOrders: WaiterOrderView[];
  tables: TableWithState[];
}

export async function GET(req: Request) {
  const cookies = await nextCookies();
  const result = await requireRole(cookies, ['waiter', 'admin']);
  if (!result.ok) {
    return new Response('Unauthorized', { status: 401 });
  }

  const tableService = new TableService(db);
  const waiterService = new WaiterService(db);
  const bus = getRealtimeBus();

  return createSseResponse<WaiterFloorSnapshot, WaiterFloorSnapshot>(req, {
    snapshot: async () => {
      const [activeOrders, tables] = await Promise.all([
        waiterService.listActive(),
        tableService.listAllWithDerivedState(),
      ]);
      return { activeOrders, tables };
    },

    subscribe: (sendUpdate, sendReconnectHint) => {
      const refetch = () =>
        Promise.all([waiterService.listActive(), tableService.listAllWithDerivedState()])
          .then(([activeOrders, tables]) => sendUpdate({ activeOrders, tables }))
          .catch((err: unknown) => console.error('[sse/waiter-floor] refetch error', err));

      const unsubTable = bus.on('table_changed', (_payload: TableChangedPayload) => {
        void refetch();
      });

      const unsubOrder = bus.on('order_status_changed', (_payload: OrderStatusChangedPayload) => {
        void refetch();
      });

      const unsubReconnect = bus.onReconnect(() => {
        sendReconnectHint();
        void refetch();
      });

      return () => {
        unsubTable();
        unsubOrder();
        unsubReconnect();
      };
    },
  });
}
