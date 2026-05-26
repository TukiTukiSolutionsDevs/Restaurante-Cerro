export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

import { db } from '@/db/client';
import type { MenuChangedPayload } from '@/lib/realtime/channels';
import { getRealtimeBus } from '@/lib/realtime/listener';
import { createSseResponse } from '@/lib/realtime/sse';
import type { PublicMenu } from '@/server/services/menu';
import { MenuService } from '@/server/services/menu';

export async function GET(req: Request) {
  const service = new MenuService(db);
  const bus = getRealtimeBus();

  return createSseResponse<PublicMenu | null, MenuChangedPayload>(req, {
    snapshot: () => service.getTodayPublicMenu(),
    subscribe: (sendUpdate, sendReconnectHint) => {
      const offMenu = bus.on('menu_changed', sendUpdate);
      const offReconnect = bus.onReconnect(sendReconnectHint);
      return () => {
        offMenu();
        offReconnect();
      };
    },
  });
}
