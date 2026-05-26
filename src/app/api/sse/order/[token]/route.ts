export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

import { db } from '@/db/client';
import { verifyQrToken } from '@/lib/qr/token';
import type { OrderStatusChangedPayload } from '@/lib/realtime/channels';
import { getRealtimeBus } from '@/lib/realtime/listener';
import { createSseResponse } from '@/lib/realtime/sse';
import type { PublicOrder } from '@/server/services/order';
import { OrderService } from '@/server/services/order';

function getQrSecret(): Uint8Array {
  const raw = process.env.QR_SECRET ?? '';
  return new TextEncoder().encode(raw.padEnd(32, '0'));
}

export async function GET(
  req: Request,
  { params }: { params: Promise<{ token: string }> },
) {
  const { token } = await params;
  const secret = getQrSecret();

  const verification = await verifyQrToken(token, secret);
  if (!verification.ok && verification.reason !== 'expired') {
    return Response.json(
      { error: { code: 'NOT_FOUND', message: 'Token inválido' } },
      { status: 404 },
    );
  }

  // Extract orderId: from valid token payload, or look up from DB
  let orderId: string;
  if (verification.ok) {
    orderId = verification.payload.orderId;
  } else {
    // Token expired — fetch orderId from DB by token
    const service = new OrderService(db, secret);
    const existing = await service.getByToken(token);
    if (!existing) {
      return Response.json(
        { error: { code: 'NOT_FOUND', message: 'Pedido no encontrado' } },
        { status: 404 },
      );
    }
    orderId = existing.orderId;
  }

  const service = new OrderService(db, secret);
  const bus = getRealtimeBus();

  return createSseResponse<PublicOrder | null, OrderStatusChangedPayload>(req, {
    snapshot: () => service.getByToken(token),
    subscribe: (sendUpdate, sendReconnectHint) => {
      const unsub = bus.on('order_status_changed', (payload) => {
        if (payload.orderId === orderId) {
          sendUpdate(payload);
        }
      });
      const unsubReconnect = bus.onReconnect(sendReconnectHint);
      return () => {
        unsub();
        unsubReconnect();
      };
    },
    eventNames: { update: 'status' },
  });
}
