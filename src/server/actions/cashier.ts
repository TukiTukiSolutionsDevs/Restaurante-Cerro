'use server';

import { z } from 'zod';

import { db } from '@/db/client';
import { requireRoleOrRedirect } from '@/lib/auth/guards';
import {
  type CashierOrderView,
  CashierService,
  OrderImmutableError,
  OrderLockedError,
  ReasonTooShortError,
  UndoExpiredError,
} from '@/server/services/cashier';

// ─── Shared result type ───────────────────────────────────────────────────────

type ActionOk<T> = { ok: true; data: T };
type ActionErr = { ok: false; error: { code: string; message: string } };
type ActionResult<T> = ActionOk<T> | ActionErr;

function handleError(err: unknown): ActionErr {
  if (
    err instanceof OrderLockedError ||
    err instanceof OrderImmutableError ||
    err instanceof UndoExpiredError ||
    err instanceof ReasonTooShortError
  ) {
    return { ok: false, error: { code: err.code, message: err.message } };
  }
  console.error('[cashier action]', err);
  return { ok: false, error: { code: 'INTERNAL_ERROR', message: 'Error interno del servidor' } };
}

// ─── lookupAction ─────────────────────────────────────────────────────────────

export async function lookupAction(
  code: string,
): Promise<ActionResult<CashierOrderView | null>> {
  await requireRoleOrRedirect(['cashier', 'admin']);

  const trimmed = code.trim();
  if (!trimmed) return { ok: true, data: null };

  try {
    const svc = new CashierService(db);
    const view = await svc.lookup(trimmed);
    return { ok: true, data: view };
  } catch (err) {
    return handleError(err);
  }
}

// ─── confirmAction ────────────────────────────────────────────────────────────

const confirmSchema = z.object({
  orderId: z.string().uuid(),
  paymentMethod: z.enum(['cash', 'yape']),
  yapeReference: z.string().min(4).max(12).optional(),
  idempotencyKey: z.string().uuid(),
  qrWasExpiredAtConfirm: z.boolean(),
});

export async function confirmAction(
  input: z.infer<typeof confirmSchema>,
): Promise<ActionResult<{ orderId: string; status: 'in_kitchen' }>> {
  const session = await requireRoleOrRedirect(['cashier', 'admin']);

  const parsed = confirmSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: { code: 'VALIDATION_ERROR', message: 'Datos de confirmación inválidos' } };
  }

  try {
    const svc = new CashierService(db);
    await svc.confirmPayment({ ...parsed.data, actorId: session.staffUserId });
    return { ok: true, data: { orderId: parsed.data.orderId, status: 'in_kitchen' } };
  } catch (err) {
    return handleError(err);
  }
}

// ─── undoAction ───────────────────────────────────────────────────────────────

export async function undoAction(
  orderId: string,
): Promise<ActionResult<{ orderId: string; status: 'pending' }>> {
  const session = await requireRoleOrRedirect(['cashier', 'admin']);

  try {
    const svc = new CashierService(db);
    await svc.undo(orderId, session.staffUserId);
    return { ok: true, data: { orderId, status: 'pending' } };
  } catch (err) {
    return handleError(err);
  }
}

// ─── cancelAction ─────────────────────────────────────────────────────────────

const cancelSchema = z.object({
  orderId: z.string().uuid(),
  reason: z.string().min(5, 'El motivo debe tener al menos 5 caracteres'),
});

export async function cancelAction(
  input: z.infer<typeof cancelSchema>,
): Promise<ActionResult<{ orderId: string; status: 'cancelled' }>> {
  const session = await requireRoleOrRedirect(['cashier', 'admin']);

  const parsed = cancelSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: { code: 'REASON_TOO_SHORT', message: 'El motivo debe tener al menos 5 caracteres' } };
  }

  try {
    const svc = new CashierService(db);
    await svc.cancel(parsed.data.orderId, parsed.data.reason, session.staffUserId);
    return { ok: true, data: { orderId: parsed.data.orderId, status: 'cancelled' } };
  } catch (err) {
    return handleError(err);
  }
}
