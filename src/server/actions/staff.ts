'use server';

import { z } from 'zod';

import { db } from '@/db/client';
import { requireRoleOrRedirect } from '@/lib/auth/guards';
import { isInsecurePin } from '@/lib/auth/pin';
import {
  CannotDeactivateSelfError,
  StaffService,
  StaffServiceError,
} from '@/server/services/staff';

type ActionOk<T> = { ok: true; data: T };
type ActionErr = { ok: false; error: { code: string; message: string } };
type ActionResult<T> = ActionOk<T> | ActionErr;

function handleError(err: unknown): ActionErr {
  if (err instanceof CannotDeactivateSelfError) {
    return { ok: false, error: { code: err.code, message: err.message } };
  }
  if (err instanceof StaffServiceError) {
    return { ok: false, error: { code: err.code, message: err.message } };
  }
  console.error('[staff action]', err);
  return { ok: false, error: { code: 'INTERNAL_ERROR', message: 'Error interno del servidor' } };
}

const pinSchema = z
  .string()
  .length(6, 'El PIN debe ser de 6 dígitos numéricos')
  .regex(/^\d{6}$/, 'El PIN debe ser de 6 dígitos numéricos')
  .refine((pin) => !isInsecurePin(pin).insecure, {
    message: 'El PIN no es seguro. Evita patrones como 000000 o 123456.',
  });

const createSchema = z
  .object({
    displayName: z.string().min(1, 'El nombre es requerido').max(80),
    role: z.enum(['cashier', 'waiter', 'admin']),
    pin: pinSchema,
    confirmPin: z.string(),
  })
  .refine((d) => d.pin === d.confirmPin, {
    message: 'Los PINs no coinciden',
    path: ['confirmPin'],
  });

export async function createStaffAction(
  input: z.infer<typeof createSchema>,
): Promise<ActionResult<{ staffUserId: number }>> {
  const session = await requireRoleOrRedirect(['admin']);

  const parsed = createSchema.safeParse(input);
  if (!parsed.success) {
    return {
      ok: false,
      error: {
        code: 'VALIDATION_ERROR',
        message: parsed.error.issues[0]?.message ?? 'Datos inválidos',
      },
    };
  }

  try {
    const svc = new StaffService(db);
    const result = await svc.create(
      { displayName: parsed.data.displayName, role: parsed.data.role, pin: parsed.data.pin },
      session.staffUserId,
    );
    return { ok: true, data: result };
  } catch (err) {
    return handleError(err);
  }
}

const patchSchema = z.object({
  staffUserId: z.number().int().positive(),
  patch: z.object({
    displayName: z.string().min(1).max(80).optional(),
    role: z.enum(['cashier', 'waiter', 'admin']).optional(),
    isActive: z.boolean().optional(),
  }),
});

export async function patchStaffAction(
  input: z.infer<typeof patchSchema>,
): Promise<ActionResult<void>> {
  const session = await requireRoleOrRedirect(['admin']);

  const parsed = patchSchema.safeParse(input);
  if (!parsed.success) {
    return {
      ok: false,
      error: {
        code: 'VALIDATION_ERROR',
        message: parsed.error.issues[0]?.message ?? 'Datos inválidos',
      },
    };
  }

  if (
    parsed.data.patch.isActive === false &&
    parsed.data.staffUserId === session.staffUserId
  ) {
    return {
      ok: false,
      error: {
        code: 'SELF_DEACTIVATION_FORBIDDEN',
        message: 'No puedes desactivar tu propia cuenta',
      },
    };
  }

  try {
    const svc = new StaffService(db);
    await svc.patch(parsed.data.staffUserId, parsed.data.patch, session.staffUserId);
    return { ok: true, data: undefined };
  } catch (err) {
    return handleError(err);
  }
}

const resetPinSchema = z.object({
  staffUserId: z.number().int().positive(),
  newPin: pinSchema,
});

export async function resetPinAction(
  input: z.infer<typeof resetPinSchema>,
): Promise<ActionResult<void>> {
  const session = await requireRoleOrRedirect(['admin']);

  const parsed = resetPinSchema.safeParse(input);
  if (!parsed.success) {
    return {
      ok: false,
      error: {
        code: 'INVALID_PIN',
        message: parsed.error.issues[0]?.message ?? 'PIN inválido',
      },
    };
  }

  try {
    const svc = new StaffService(db);
    await svc.resetPin(parsed.data.staffUserId, parsed.data.newPin, session.staffUserId);
    return { ok: true, data: undefined };
  } catch (err) {
    return handleError(err);
  }
}

export async function forceLogoutAction(staffUserId: number): Promise<ActionResult<void>> {
  const session = await requireRoleOrRedirect(['admin']);

  if (!Number.isInteger(staffUserId) || staffUserId <= 0) {
    return { ok: false, error: { code: 'VALIDATION_ERROR', message: 'ID de usuario inválido' } };
  }

  try {
    const svc = new StaffService(db);
    await svc.forceLogout(staffUserId, session.staffUserId);
    return { ok: true, data: undefined };
  } catch (err) {
    return handleError(err);
  }
}

export async function deactivateStaffAction(staffUserId: number): Promise<ActionResult<void>> {
  const session = await requireRoleOrRedirect(['admin']);

  if (!Number.isInteger(staffUserId) || staffUserId <= 0) {
    return { ok: false, error: { code: 'VALIDATION_ERROR', message: 'ID de usuario inválido' } };
  }

  try {
    const svc = new StaffService(db);
    await svc.deactivate(staffUserId, session.staffUserId);
    return { ok: true, data: undefined };
  } catch (err) {
    return handleError(err);
  }
}
