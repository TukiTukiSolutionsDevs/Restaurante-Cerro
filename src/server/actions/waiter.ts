'use server';

import { and, eq, inArray } from 'drizzle-orm';
import { redirect } from 'next/navigation';
import { z } from 'zod';

import { db } from '@/db/client';
import { order } from '@/db/schema/orders';
import { tableGroupMember } from '@/db/schema/tables';
import { requireRoleOrRedirect } from '@/lib/auth/guards';
import { nextCookies } from '@/lib/auth/next-adapter';
import { destroyStaffSession } from '@/lib/auth/session';
import { TableService } from '@/server/services/table';
import { TableGroupService } from '@/server/services/table-group';
import {
  OrderAlreadyDeliveredError,
  WaiterOrderNotFoundError,
  WaiterService,
} from '@/server/services/waiter';

type ActionResult<T = void> =
  | { ok: true; data: T }
  | { ok: false; error: { code: string; message: string } };

export async function markDeliveredAction(orderId: string): Promise<ActionResult> {
  const parsed = z.string().uuid().safeParse(orderId);
  if (!parsed.success) {
    return { ok: false, error: { code: 'VALIDATION', message: 'ID de pedido inválido' } };
  }
  const session = await requireRoleOrRedirect(['waiter', 'admin']);
  const service = new WaiterService(db);
  try {
    await service.markDelivered(parsed.data, session.staffUserId);
    return { ok: true, data: undefined };
  } catch (err) {
    if (err instanceof OrderAlreadyDeliveredError || err instanceof WaiterOrderNotFoundError) {
      return { ok: false, error: { code: err.code, message: err.message } };
    }
    throw err;
  }
}

const JoinTablesSchema = z.object({
  tableIds: z.array(z.number().int().positive()).min(2),
  name: z.string().max(32).optional(),
});

export async function joinTablesAction(
  input: { tableIds: number[]; name?: string },
): Promise<ActionResult<{ groupId: number; code: string }>> {
  const session = await requireRoleOrRedirect(['waiter', 'admin']);
  const parsed = JoinTablesSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: { code: 'VALIDATION', message: 'Selecciona al menos 2 mesas' } };
  }
  const service = new TableGroupService(db);
  try {
    const result = await service.join(
      parsed.data.tableIds,
      parsed.data.name ?? null,
      session.staffUserId,
    );
    return { ok: true, data: result };
  } catch (err) {
    if (err instanceof Error && 'code' in err) {
      return {
        ok: false,
        error: { code: (err as Error & { code: string }).code, message: err.message },
      };
    }
    throw err;
  }
}

export async function splitGroupAction(groupId: number): Promise<ActionResult> {
  const parsed = z.number().int().positive().safeParse(groupId);
  if (!parsed.success) {
    return { ok: false, error: { code: 'VALIDATION', message: 'Grupo inválido' } };
  }
  const session = await requireRoleOrRedirect(['waiter', 'admin']);
  const service = new TableGroupService(db);
  try {
    await service.split(parsed.data, session.staffUserId);
    return { ok: true, data: undefined };
  } catch (err) {
    if (err instanceof Error && 'code' in err) {
      return {
        ok: false,
        error: { code: (err as Error & { code: string }).code, message: err.message },
      };
    }
    throw err;
  }
}

export async function releaseTableAction(tableId: number): Promise<ActionResult> {
  const parsed = z.number().int().positive().safeParse(tableId);
  if (!parsed.success) {
    return { ok: false, error: { code: 'VALIDATION', message: 'Mesa inválida' } };
  }
  const session = await requireRoleOrRedirect(['waiter', 'admin']);

  const inKitchenRows = await db
    .select({ id: order.id })
    .from(order)
    .innerJoin(tableGroupMember, eq(tableGroupMember.tableGroupId, order.tableGroupId!))
    .where(
      and(eq(tableGroupMember.tableId, parsed.data), inArray(order.status, ['in_kitchen'])),
    )
    .limit(1);

  if (inKitchenRows.length > 0) {
    return {
      ok: false,
      error: {
        code: 'IN_KITCHEN_ACTIVE',
        message: 'No se puede liberar: el pedido está en cocina',
      },
    };
  }

  const service = new TableService(db);
  try {
    await service.release(parsed.data, session.staffUserId, 'waiter_force_release');
    return { ok: true, data: undefined };
  } catch (err) {
    if (err instanceof Error && 'code' in err) {
      return {
        ok: false,
        error: { code: (err as Error & { code: string }).code, message: err.message },
      };
    }
    throw err;
  }
}

export async function logoutAction(): Promise<never> {
  const cookies = await nextCookies();
  await destroyStaffSession(cookies);
  redirect('/login?role=waiter');
}
