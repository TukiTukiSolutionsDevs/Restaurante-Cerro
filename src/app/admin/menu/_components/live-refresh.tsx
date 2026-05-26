'use client';

import { useRouter } from 'next/navigation';

import type { MenuChangedPayload } from '@/lib/realtime/channels';
import { useSse } from '@/lib/realtime/client';
import type { PublicMenu } from '@/server/services/menu';

export function LiveRefresh() {
  const router = useRouter();

  useSse<PublicMenu | null, MenuChangedPayload>({
    url: '/api/sse/menu',
    onUpdate: () => {
      router.refresh();
    },
    onReconnect: () => {
      router.refresh();
    },
  });

  return null;
}
