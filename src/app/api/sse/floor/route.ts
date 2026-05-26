import { db } from '@/db/client';
import type { OrderStatusChangedPayload,TableChangedPayload } from '@/lib/realtime/channels';
import { getRealtimeBus } from '@/lib/realtime/listener';
import { createSseResponse } from '@/lib/realtime/sse';
import type { TableWithState } from '@/server/services/table';
import { TableService } from '@/server/services/table';

export const dynamic = 'force-dynamic';

export async function GET(req: Request) {
  const service = new TableService(db);
  const bus = getRealtimeBus();

  return createSseResponse<TableWithState[], TableWithState[]>(req, {
    snapshot: () => service.listAllWithDerivedState(),

    subscribe: (sendUpdate, sendReconnectHint) => {
      const refetch = () =>
        service
          .listAllWithDerivedState()
          .then(sendUpdate)
          .catch((err: unknown) => console.error('[sse/floor] refetch error', err));

      const unsubTable = bus.on('table_changed', (_payload: TableChangedPayload) => {
        void refetch();
      });

      // Order status changes affect derived table state (occupancy is order-driven)
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
