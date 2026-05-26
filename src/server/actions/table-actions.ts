'use server';

import { revalidatePath } from 'next/cache';

import { db } from '@/db/client';
import { TableService } from '@/server/services/table';
import { TableGroupService } from '@/server/services/table-group';

type ActionResult<T = undefined> =
  | { ok: true; data: T }
  | { ok: false; error: { code: string; message: string } };

function toError(err: unknown): { code: string; message: string } {
  if (err instanceof Error) {
    const e = err as Error & { code?: string };
    return { code: e.code ?? 'UNKNOWN', message: e.message };
  }
  return { code: 'UNKNOWN', message: 'Error inesperado.' };
}

// ---------------------------------------------------------------------------
// Tables
// ---------------------------------------------------------------------------

export async function createTableAction(
  input: { code: string; capacity?: number; positionX?: number; positionY?: number },
  actorId: number,
): Promise<ActionResult<{ tableId: number }>> {
  try {
    const service = new TableService(db);
    const data = await service.create(input, actorId);
    revalidatePath('/admin/tables');
    return { ok: true, data };
  } catch (err) {
    return { ok: false, error: toError(err) };
  }
}

export async function patchTableAction(
  tableId: number,
  patch: Partial<{ code: string; capacity: number; positionX: number; positionY: number }>,
  actorId: number,
): Promise<ActionResult> {
  try {
    const service = new TableService(db);
    await service.patch(tableId, patch, actorId);
    revalidatePath('/admin/tables');
    return { ok: true, data: undefined };
  } catch (err) {
    return { ok: false, error: toError(err) };
  }
}

export async function deactivateTableAction(
  tableId: number,
  actorId: number,
): Promise<ActionResult<{ hasActiveOrder: boolean }>> {
  try {
    const service = new TableService(db);
    const data = await service.deactivate(tableId, actorId);
    revalidatePath('/admin/tables');
    return { ok: true, data };
  } catch (err) {
    return { ok: false, error: toError(err) };
  }
}

export async function activateTableAction(
  tableId: number,
  actorId: number,
): Promise<ActionResult> {
  try {
    const service = new TableService(db);
    await service.activate(tableId, actorId);
    revalidatePath('/admin/tables');
    return { ok: true, data: undefined };
  } catch (err) {
    return { ok: false, error: toError(err) };
  }
}

export async function releaseTableAction(
  tableId: number,
  actorId: number,
  confirmReason: string,
): Promise<ActionResult> {
  try {
    const service = new TableService(db);
    await service.release(tableId, actorId, confirmReason);
    revalidatePath('/admin/tables');
    return { ok: true, data: undefined };
  } catch (err) {
    return { ok: false, error: toError(err) };
  }
}

// Bulk: crea M01-M30 en grilla 5 columnas × 6 filas
export async function bulkCreateTablesAction(actorId: number): Promise<ActionResult<{ count: number }>> {
  try {
    const service = new TableService(db);
    let count = 0;
    for (let i = 1; i <= 30; i++) {
      const code = `M${String(i).padStart(2, '0')}`;
      const positionX = (i - 1) % 5;
      const positionY = Math.floor((i - 1) / 5);
      try {
        await service.create({ code, capacity: 1, positionX, positionY }, actorId);
        count++;
      } catch {
        // Skip duplicate codes (idempotent)
      }
    }
    revalidatePath('/admin/tables');
    return { ok: true, data: { count } };
  } catch (err) {
    return { ok: false, error: toError(err) };
  }
}

// ---------------------------------------------------------------------------
// Groups
// ---------------------------------------------------------------------------

export async function joinTablesAction(
  tableIds: number[],
  name: string | null,
  actorId: number,
): Promise<ActionResult<{ groupId: number; code: string }>> {
  try {
    const service = new TableGroupService(db);
    const data = await service.join(tableIds, name, actorId);
    revalidatePath('/admin/tables');
    return { ok: true, data };
  } catch (err) {
    return { ok: false, error: toError(err) };
  }
}

export async function splitGroupAction(
  groupId: number,
  actorId: number,
): Promise<ActionResult> {
  try {
    const service = new TableGroupService(db);
    await service.split(groupId, actorId);
    revalidatePath('/admin/tables');
    return { ok: true, data: undefined };
  } catch (err) {
    return { ok: false, error: toError(err) };
  }
}
