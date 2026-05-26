import { db } from '@/db/client';
import { OrderService } from '@/server/services/order';

function getQrSecret(): Uint8Array {
  const raw = process.env.QR_SECRET ?? '';
  return new TextEncoder().encode(raw.padEnd(32, '0'));
}

export function startOrderExpirationCron(opts?: {
  intervalMs?: number;
  logger?: (msg: string) => void;
}): () => void {
  const intervalMs = opts?.intervalMs ?? 60_000;
  const log =
    opts?.logger ?? ((msg: string) => console.log('[cron/expire-orders]', msg));

  const tick = async (): Promise<void> => {
    try {
      const service = new OrderService(db, getQrSecret());
      const result = await service.expirePendingOrders();
      if (result.cancelled > 0) {
        log(`Expirados ${result.cancelled} pedidos vencidos`);
      }
    } catch (err) {
      log(`Error: ${err instanceof Error ? err.message : String(err)}`);
    }
  };

  const timer = setInterval(() => {
    void tick();
  }, intervalMs);

  return () => clearInterval(timer);
}
