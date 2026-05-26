import { eq, sql } from 'drizzle-orm';

import type { DrizzleDb } from '@/db/client';
import { auditLog, staffSession, staffUser } from '@/db/schema';
import { hashPin, isInsecurePin } from '@/lib/auth/pin';
import type { StaffRole } from '@/lib/auth/session.types';

export class StaffServiceError extends Error {
  constructor(
    public readonly code: string,
    message: string,
  ) {
    super(message);
    this.name = 'StaffServiceError';
  }
}

export class CannotDeactivateSelfError extends Error {
  readonly code = 'SELF_DEACTIVATION_FORBIDDEN';
  constructor() {
    super('No puedes desactivar tu propia cuenta');
    this.name = 'CannotDeactivateSelfError';
  }
}

export interface StaffUserView {
  id: number;
  displayName: string;
  role: StaffRole;
  isActive: boolean;
  lastSeenAt: Date | null;
  activeSessionCount: number;
}

export class StaffService {
  constructor(private db: DrizzleDb) {}

  async list(): Promise<StaffUserView[]> {
    const result = await this.db.execute<{
      id: number;
      displayName: string;
      role: StaffRole;
      isActive: boolean;
      lastSeenAt: Date | null;
      activeSessionCount: string;
    }>(sql`
      SELECT
        u.id,
        u.display_name AS "displayName",
        u.role,
        u.is_active   AS "isActive",
        u.last_seen_at AS "lastSeenAt",
        COALESCE(COUNT(s.id) FILTER (WHERE s.expires_at > NOW()), 0) AS "activeSessionCount"
      FROM staff_user u
      LEFT JOIN staff_session s ON s.staff_user_id = u.id
      GROUP BY u.id
      ORDER BY u.display_name
    `);

    return result.rows.map((r) => ({
      id: r.id,
      displayName: r.displayName,
      role: r.role,
      isActive: r.isActive,
      lastSeenAt: r.lastSeenAt,
      activeSessionCount: Number(r.activeSessionCount),
    }));
  }

  async create(
    input: { displayName: string; role: StaffRole; pin: string },
    actorId: number,
  ): Promise<{ staffUserId: number }> {
    if (input.displayName.length < 1 || input.displayName.length > 80) {
      throw new StaffServiceError('VALIDATION_ERROR', 'El nombre debe tener entre 1 y 80 caracteres');
    }
    if (isInsecurePin(input.pin).insecure) {
      throw new StaffServiceError(
        'INVALID_PIN',
        'El PIN no es seguro. Evita patrones como 000000 o 123456.',
      );
    }
    const pinHash = await hashPin(input.pin);

    return this.db.transaction(async (tx) => {
      const txDb = tx as unknown as DrizzleDb;

      const [inserted] = await txDb
        .insert(staffUser)
        .values({ displayName: input.displayName, role: input.role, pinHash, isActive: true })
        .returning({ id: staffUser.id });

      await txDb.insert(auditLog).values({
        actorType: 'staff',
        actorId,
        action: 'staff.create',
        entity: 'staff_user',
        entityId: String(inserted!.id),
        payload: { displayName: input.displayName, role: input.role },
      });

      return { staffUserId: inserted!.id };
    });
  }

  async patch(
    staffUserId: number,
    patch: Partial<{ displayName: string; role: StaffRole; isActive: boolean }>,
    actorId: number,
  ): Promise<void> {
    if (patch.displayName !== undefined) {
      if (patch.displayName.length < 1 || patch.displayName.length > 80) {
        throw new StaffServiceError('VALIDATION_ERROR', 'El nombre debe tener entre 1 y 80 caracteres');
      }
    }

    await this.db.transaction(async (tx) => {
      const txDb = tx as unknown as DrizzleDb;

      const [existing] = await txDb
        .select({ id: staffUser.id })
        .from(staffUser)
        .where(eq(staffUser.id, staffUserId));

      if (!existing) {
        throw new StaffServiceError('NOT_FOUND', `Usuario ${staffUserId} no encontrado`);
      }

      const updateSet: Partial<{ displayName: string; role: StaffRole; isActive: boolean }> = {};
      if (patch.displayName !== undefined) updateSet.displayName = patch.displayName;
      if (patch.role !== undefined) updateSet.role = patch.role;
      if (patch.isActive !== undefined) updateSet.isActive = patch.isActive;

      if (Object.keys(updateSet).length > 0) {
        await txDb
          .update(staffUser)
          .set(updateSet)
          .where(eq(staffUser.id, staffUserId));
      }

      await txDb.insert(auditLog).values({
        actorType: 'staff',
        actorId,
        action: 'staff.patch',
        entity: 'staff_user',
        entityId: String(staffUserId),
        payload: patch as Record<string, unknown>,
      });
    });
  }

  async resetPin(staffUserId: number, newPin: string, actorId: number): Promise<void> {
    if (isInsecurePin(newPin).insecure) {
      throw new StaffServiceError(
        'INVALID_PIN',
        'El PIN no es seguro. Evita patrones como 000000 o 123456.',
      );
    }
    const pinHash = await hashPin(newPin);

    await this.db.transaction(async (tx) => {
      const txDb = tx as unknown as DrizzleDb;

      const [existing] = await txDb
        .select({ id: staffUser.id })
        .from(staffUser)
        .where(eq(staffUser.id, staffUserId));

      if (!existing) {
        throw new StaffServiceError('NOT_FOUND', `Usuario ${staffUserId} no encontrado`);
      }

      await txDb.update(staffUser).set({ pinHash }).where(eq(staffUser.id, staffUserId));
      await txDb.delete(staffSession).where(eq(staffSession.staffUserId, staffUserId));

      await txDb.insert(auditLog).values({
        actorType: 'staff',
        actorId,
        action: 'staff.reset_pin',
        entity: 'staff_user',
        entityId: String(staffUserId),
        payload: { target_id: staffUserId },
      });
    });
  }

  async forceLogout(staffUserId: number, actorId: number): Promise<void> {
    await this.db.transaction(async (tx) => {
      const txDb = tx as unknown as DrizzleDb;

      const [existing] = await txDb
        .select({ id: staffUser.id })
        .from(staffUser)
        .where(eq(staffUser.id, staffUserId));

      if (!existing) {
        throw new StaffServiceError('NOT_FOUND', `Usuario ${staffUserId} no encontrado`);
      }

      await txDb.delete(staffSession).where(eq(staffSession.staffUserId, staffUserId));

      await txDb.insert(auditLog).values({
        actorType: 'staff',
        actorId,
        action: 'staff.force_logout',
        entity: 'staff_user',
        entityId: String(staffUserId),
        payload: {},
      });
    });
  }

  async deactivate(staffUserId: number, actorId: number): Promise<void> {
    if (staffUserId === actorId) {
      throw new CannotDeactivateSelfError();
    }

    await this.db.transaction(async (tx) => {
      const txDb = tx as unknown as DrizzleDb;

      const [existing] = await txDb
        .select({ id: staffUser.id })
        .from(staffUser)
        .where(eq(staffUser.id, staffUserId));

      if (!existing) {
        throw new StaffServiceError('NOT_FOUND', `Usuario ${staffUserId} no encontrado`);
      }

      await txDb.update(staffUser).set({ isActive: false }).where(eq(staffUser.id, staffUserId));

      await txDb.insert(auditLog).values({
        actorType: 'staff',
        actorId,
        action: 'staff.deactivate',
        entity: 'staff_user',
        entityId: String(staffUserId),
        payload: {},
      });
    });
  }
}
