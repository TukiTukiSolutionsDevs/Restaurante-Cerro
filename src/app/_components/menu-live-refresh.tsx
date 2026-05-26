'use client';

import { useRouter } from 'next/navigation';

import type { MenuChangedPayload } from '@/lib/realtime/channels';
import { useSse } from '@/lib/realtime/client';

import { useCartStore } from './cart-store';

export function MenuLiveRefresh() {
  const router = useRouter();
  const markUnavailable = useCartStore((s) => s.markUnavailable);

  useSse<null, MenuChangedPayload>({
    url: '/api/sse/menu',
    onUpdate: (payload) => {
      if (payload.changeType === 'availability_toggled' && payload.entityId) {
        markUnavailable(payload.entityId);
      }
      router.refresh();
    },
    onReconnect: () => {
      router.refresh();
    },
  });

  return null;
}
