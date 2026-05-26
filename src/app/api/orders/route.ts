export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

import { db } from '@/db/client';
import { createRateLimiter } from '@/lib/auth/rate-limit';
import { CreateOrderSchema } from '@/lib/validation/order-schemas';
import {
  ItemUnavailableError,
  MenuClosedError,
  OrderService,
  TableTakenError,
} from '@/server/services/order';

function getQrSecret(): Uint8Array {
  const raw = process.env.QR_SECRET ?? '';
  return new TextEncoder().encode(raw.padEnd(32, '0'));
}

const orderLimiter = createRateLimiter({ maxAttempts: 10, windowMs: 60_000 });

export async function POST(req: Request) {
  const ip =
    req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ?? 'unknown';

  const rl = orderLimiter.hit(ip);
  if (!rl.allowed) {
    return Response.json(
      {
        error: {
          code: 'RATE_LIMITED',
          message: 'Demasiados intentos. Espera un momento.',
        },
      },
      { status: 429 },
    );
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return Response.json(
      { error: { code: 'VALIDATION_ERROR', message: 'JSON inválido' } },
      { status: 400 },
    );
  }

  const parsed = CreateOrderSchema.safeParse(body);
  if (!parsed.success) {
    return Response.json(
      {
        error: {
          code: 'VALIDATION_ERROR',
          message: 'Datos inválidos',
          issues: parsed.error.issues,
        },
      },
      { status: 400 },
    );
  }

  try {
    const service = new OrderService(db, getQrSecret());
    const result = await service.createOrder(parsed.data);
    return Response.json(result, { status: 201 });
  } catch (err) {
    if (err instanceof MenuClosedError) {
      return Response.json(
        { error: { code: err.code, message: err.message } },
        { status: 400 },
      );
    }
    if (err instanceof ItemUnavailableError) {
      return Response.json(
        { error: { code: err.code, message: err.message } },
        { status: 400 },
      );
    }
    if (err instanceof TableTakenError) {
      return Response.json(
        { error: { code: err.code, message: err.message } },
        { status: 409 },
      );
    }
    console.error('[POST /api/orders]', err);
    return Response.json(
      { error: { code: 'INTERNAL_ERROR', message: 'Error interno del servidor' } },
      { status: 500 },
    );
  }
}
