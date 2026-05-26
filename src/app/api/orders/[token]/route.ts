export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

import { db } from '@/db/client';
import { PatchItemsSchema } from '@/lib/validation/order-schemas';
import {
  OrderExpiredError,
  OrderImmutableError,
  OrderNotFoundError,
  OrderService,
} from '@/server/services/order';

function getQrSecret(): Uint8Array {
  const raw = process.env.QR_SECRET ?? '';
  return new TextEncoder().encode(raw.padEnd(32, '0'));
}

function makeService() {
  return new OrderService(db, getQrSecret());
}

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ token: string }> },
) {
  const { token } = await params;
  try {
    const order = await makeService().getByToken(token);
    if (!order) {
      return Response.json(
        { error: { code: 'NOT_FOUND', message: 'Pedido no encontrado' } },
        { status: 404 },
      );
    }
    return Response.json(order);
  } catch (err) {
    console.error('[GET /api/orders/:token]', err);
    return Response.json(
      { error: { code: 'INTERNAL_ERROR', message: 'Error interno' } },
      { status: 500 },
    );
  }
}

export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ token: string }> },
) {
  const { token } = await params;

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return Response.json(
      { error: { code: 'VALIDATION_ERROR', message: 'JSON inválido' } },
      { status: 400 },
    );
  }

  const parsed = PatchItemsSchema.safeParse(body);
  if (!parsed.success) {
    return Response.json(
      { error: { code: 'VALIDATION_ERROR', message: 'Datos inválidos', issues: parsed.error.issues } },
      { status: 400 },
    );
  }

  try {
    await makeService().patchItems(token, parsed.data.items);
    const order = await makeService().getByToken(token);
    return Response.json(order);
  } catch (err) {
    if (err instanceof OrderNotFoundError) {
      return Response.json(
        { error: { code: err.code, message: err.message } },
        { status: 404 },
      );
    }
    if (err instanceof OrderImmutableError || err instanceof OrderExpiredError) {
      return Response.json(
        { error: { code: err.code, message: err.message } },
        { status: 423 },
      );
    }
    console.error('[PATCH /api/orders/:token]', err);
    return Response.json(
      { error: { code: 'INTERNAL_ERROR', message: 'Error interno' } },
      { status: 500 },
    );
  }
}

export async function DELETE(
  _req: Request,
  { params }: { params: Promise<{ token: string }> },
) {
  const { token } = await params;
  try {
    await makeService().cancelByCustomer(token);
    return Response.json({ cancelled: true });
  } catch (err) {
    if (err instanceof OrderNotFoundError) {
      return Response.json(
        { error: { code: err.code, message: err.message } },
        { status: 404 },
      );
    }
    if (err instanceof OrderImmutableError) {
      return Response.json(
        { error: { code: err.code, message: err.message } },
        { status: 423 },
      );
    }
    console.error('[DELETE /api/orders/:token]', err);
    return Response.json(
      { error: { code: 'INTERNAL_ERROR', message: 'Error interno' } },
      { status: 500 },
    );
  }
}
