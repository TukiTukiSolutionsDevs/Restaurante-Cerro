import { eq } from 'drizzle-orm';

import type { DrizzleDb } from '@/db/client';
import { auditLog } from '@/db/schema/audit';
import { appSettings } from '@/db/schema/settings';
import { staffUser } from '@/db/schema/staff';
import { hashPin, isInsecurePin, verifyPin } from '@/lib/auth/pin';

export class NotAdminError extends Error {
  code = 'NOT_ADMIN' as const;
  constructor() {
    super('Solo administradores pueden configurar el PIN del dispositivo de cocina');
    this.name = 'NotAdminError';
  }
}

export class InsecurePinError extends Error {
  code = 'INSECURE_PIN' as const;
  reason: string;
  constructor(reason: string) {
    super(`PIN inseguro: ${reason}`);
    this.name = 'InsecurePinError';
    this.reason = reason;
  }
}

export class KitchenDeviceService {
  constructor(private db: DrizzleDb) {}

  async setDevicePin(rawPin: string, actorId: number): Promise<void> {
    const [actor] = await this.db
      .select({ role: staffUser.role })
      .from(staffUser)
      .where(eq(staffUser.id, actorId));

    if (!actor || actor.role !== 'admin') {
      throw new NotAdminError();
    }

    const check = isInsecurePin(rawPin);
    if (check.insecure) throw new InsecurePinError(check.reason!);

    const hash = await hashPin(rawPin);
    const now = new Date();

    await this.db
      .insert(appSettings)
      .values({ id: 1, kitchenDevicePinHash: hash, updatedAt: now })
      .onConflictDoUpdate({
        target: appSettings.id,
        set: { kitchenDevicePinHash: hash, updatedAt: now },
      });

    await this.db.insert(auditLog).values({
      actorType: 'staff',
      actorId,
      action: 'kitchen_device_pin_set',
      entity: 'app_settings',
      entityId: '1',
      payload: {},
    });
  }

  async verifyDevicePin(rawPin: string): Promise<boolean> {
    const [row] = await this.db
      .select({ hash: appSettings.kitchenDevicePinHash })
      .from(appSettings)
      .where(eq(appSettings.id, 1));

    if (!row?.hash) return false;
    return verifyPin(rawPin, row.hash);
  }

  async isDevicePinSet(): Promise<boolean> {
    const [row] = await this.db
      .select({ hash: appSettings.kitchenDevicePinHash })
      .from(appSettings)
      .where(eq(appSettings.id, 1));

    return !!row?.hash;
  }
}
