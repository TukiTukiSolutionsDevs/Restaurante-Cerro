export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

import { randomUUID } from 'node:crypto';

import { z } from 'zod';

import { db } from '@/db/client';
import { auditLog } from '@/db/schema/audit';
import { setDeviceSession } from '@/lib/auth/device-session';
import { nextCookies } from '@/lib/auth/next-adapter';
import { createRateLimiter } from '@/lib/auth/rate-limit';
import { KitchenDeviceService } from '@/server/services/kitchen-device';

const bodySchema = z.object({
  pin: z.string().min(1),
});

const devicePairLimiter = createRateLimiter({
  maxAttempts: 5,
  windowMs: 15 * 60 * 1000,
});

export async function POST(req: Request): Promise<Response> {
  const ip =
    req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ?? 'unknown';
  const ua = req.headers.get('user-agent') ?? '';

  const rl = devicePairLimiter.hit(`device-pair:${ip}`);
  if (!rl.allowed) {
    return Response.json(
      { ok: false, error: { code: 'RATE_LIMITED' } },
      {
        status: 429,
        headers: { 'Retry-After': String(Math.ceil(rl.retryAfterMs / 1000)) },
      },
    );
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return Response.json({ ok: false, error: { code: 'INVALID_BODY' } }, { status: 400 });
  }

  const parsed = bodySchema.safeParse(body);
  if (!parsed.success) {
    return Response.json({ ok: false, error: { code: 'INVALID_BODY' } }, { status: 400 });
  }

  const service = new KitchenDeviceService(db);
  const valid = await service.verifyDevicePin(parsed.data.pin);

  if (!valid) {
    await db.insert(auditLog).values({
      actorType: 'device',
      actorId: null,
      action: 'kitchen_device_pair_failed',
      entity: 'kitchen_device',
      payload: { ip, ua },
    });
    return Response.json(
      { ok: false, error: { code: 'INVALID_PIN' } },
      { status: 401 },
    );
  }

  const cookies = await nextCookies();
  await setDeviceSession(cookies, {
    pairedAt: Date.now(),
    deviceNonce: randomUUID(),
  });

  await db.insert(auditLog).values({
    actorType: 'device',
    actorId: null,
    action: 'kitchen_device_paired',
    entity: 'kitchen_device',
    payload: { ip, ua },
  });

  return Response.json({ ok: true });
}
