'use server';

import { revalidatePath } from 'next/cache';
import { z } from 'zod';

import { db } from '@/db/client';
import { requireRoleOrRedirect } from '@/lib/auth/guards';
import type { ComboConfigInput, ItemCategory } from '@/server/services/menu';
import { MenuService, MenuServiceError } from '@/server/services/menu';

type ActionResult<T = void> =
  | { ok: true; data: T }
  | { ok: false; error: { code: string; message: string } };

function handleServiceError(err: unknown): ActionResult<never> {
  if (err instanceof MenuServiceError) {
    return { ok: false, error: { code: err.code, message: err.message } };
  }
  throw err;
}

const CreateMenuSchema = z.object({
  serviceDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  cloneFromDate: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .optional(),
});

const AddItemSchema = z.object({
  dailyMenuId: z.number().int().positive(),
  name: z.string().min(1).max(80),
  description: z.string().max(200).optional(),
  category: z.enum(['starter', 'main', 'drink', 'dessert']),
  sortOrder: z.number().int().nonnegative().optional(),
  priceCents: z.number().int().positive().optional(),
});

const PatchItemSchema = z
  .object({
    name: z.string().min(1).max(80).optional(),
    description: z.string().max(200).nullable().optional(),
    sortOrder: z.number().int().nonnegative().optional(),
    priceCents: z.number().int().positive().nullable().optional(),
  })
  .refine((v) => Object.keys(v).length > 0, {
    message: 'Se requiere al menos un campo para actualizar',
  });

const ToggleAvailabilitySchema = z.object({
  itemId: z.number().int().positive(),
  isAvailable: z.boolean(),
});

const ComboConfigSchema = z.object({
  dailyMenuId: z.number().int().positive(),
  dineInPriceCents: z.number().int().positive(),
  takeawayPriceCents: z.number().int().positive(),
  tupperFullPriceCents: z.number().int().positive(),
  tupperPartialPriceCents: z.number().int().positive(),
  partialStarterPriceCents: z.number().int().positive(),
  partialMainPriceCents: z.number().int().positive(),
});

export async function createMenuAction(
  input: unknown,
): Promise<ActionResult<{ menuId: number; itemsCloned: number }>> {
  const session = await requireRoleOrRedirect(['admin']);
  const parsed = CreateMenuSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: { code: 'VALIDATION_ERROR', message: parsed.error.message } };
  }
  const service = new MenuService(db);
  try {
    const result = await service.createForDate({
      serviceDate: new Date(parsed.data.serviceDate),
      cloneFromDate: parsed.data.cloneFromDate
        ? new Date(parsed.data.cloneFromDate)
        : undefined,
      actorId: session.staffUserId,
    });
    revalidatePath('/admin/menu');
    return { ok: true, data: result };
  } catch (err) {
    return handleServiceError(err);
  }
}

export async function addItemAction(
  input: unknown,
): Promise<ActionResult<{ itemId: number }>> {
  const session = await requireRoleOrRedirect(['admin']);
  const parsed = AddItemSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: { code: 'VALIDATION_ERROR', message: parsed.error.message } };
  }
  const service = new MenuService(db);
  try {
    const result = await service.addItem({
      dailyMenuId: parsed.data.dailyMenuId,
      category: parsed.data.category as ItemCategory,
      name: parsed.data.name,
      description: parsed.data.description,
      sortOrder: parsed.data.sortOrder,
      priceCents: parsed.data.priceCents,
      actorId: session.staffUserId,
    });
    revalidatePath('/admin/menu');
    return { ok: true, data: result };
  } catch (err) {
    return handleServiceError(err);
  }
}

export async function patchItemAction(
  itemId: number,
  input: unknown,
): Promise<ActionResult<void>> {
  const session = await requireRoleOrRedirect(['admin']);
  const parsed = PatchItemSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: { code: 'VALIDATION_ERROR', message: parsed.error.message } };
  }
  const service = new MenuService(db);
  try {
    await service.patchItem(
      itemId,
      {
        name: parsed.data.name,
        description: parsed.data.description ?? undefined,
        sortOrder: parsed.data.sortOrder,
        priceCents: parsed.data.priceCents,
      },
      session.staffUserId,
    );
    revalidatePath('/admin/menu');
    return { ok: true, data: undefined };
  } catch (err) {
    return handleServiceError(err);
  }
}

export async function toggleAvailabilityAction(
  input: unknown,
): Promise<ActionResult<void>> {
  const session = await requireRoleOrRedirect(['admin']);
  const parsed = ToggleAvailabilitySchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: { code: 'VALIDATION_ERROR', message: parsed.error.message } };
  }
  const service = new MenuService(db);
  try {
    await service.toggleAvailability(
      parsed.data.itemId,
      parsed.data.isAvailable,
      session.staffUserId,
    );
    revalidatePath('/admin/menu');
    return { ok: true, data: undefined };
  } catch (err) {
    return handleServiceError(err);
  }
}

export async function setComboConfigAction(
  input: unknown,
): Promise<ActionResult<void>> {
  const session = await requireRoleOrRedirect(['admin']);
  const parsed = ComboConfigSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: { code: 'VALIDATION_ERROR', message: parsed.error.message } };
  }
  const service = new MenuService(db);
  const { dailyMenuId, ...cfg } = parsed.data;
  try {
    await service.setComboConfig(dailyMenuId, cfg as ComboConfigInput, session.staffUserId);
    revalidatePath('/admin/menu');
    return { ok: true, data: undefined };
  } catch (err) {
    return handleServiceError(err);
  }
}

export async function openDayAction(
  dailyMenuId: number,
): Promise<ActionResult<{ shiftNumber: number }>> {
  const session = await requireRoleOrRedirect(['admin']);
  const service = new MenuService(db);
  try {
    const result = await service.openDay(dailyMenuId, session.staffUserId);
    revalidatePath('/admin/menu');
    return { ok: true, data: result };
  } catch (err) {
    return handleServiceError(err);
  }
}

export async function closeDayAction(
  dailyMenuId: number,
): Promise<ActionResult<{ shiftNumber: number }>> {
  const session = await requireRoleOrRedirect(['admin']);
  const service = new MenuService(db);
  try {
    const result = await service.closeDay(dailyMenuId, session.staffUserId);
    revalidatePath('/admin/menu');
    return { ok: true, data: result };
  } catch (err) {
    return handleServiceError(err);
  }
}
