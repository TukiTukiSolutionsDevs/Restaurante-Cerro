import { and, count, desc, eq, gte, lte, sql } from 'drizzle-orm';

import type { DrizzleDb } from '@/db/client';
import { auditLog, staffUser } from '@/db/schema';

export type AuditActorType = 'staff' | 'system' | 'device';

export interface AuditLogView {
  id: number;
  actorType: AuditActorType;
  actorId: number | null;
  actorName: string | null;
  action: string;
  entity: string;
  entityId: string | null;
  payload: Record<string, unknown>;
  createdAt: Date;
}

export class AuditService {
  constructor(private db: DrizzleDb) {}

  async list(query: {
    from?: Date;
    to?: Date;
    actorType?: AuditActorType;
    action?: string;
    limit?: number;
    offset?: number;
  }): Promise<{ rows: AuditLogView[]; total: number }> {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const conditions: any[] = [];
    if (query.from)       conditions.push(gte(auditLog.createdAt, query.from));
    if (query.to)         conditions.push(lte(auditLog.createdAt, query.to));
    if (query.actorType)  conditions.push(eq(auditLog.actorType, query.actorType));
    if (query.action)     conditions.push(sql`${auditLog.action} ILIKE ${query.action + '%'}`);

    const whereClause = conditions.length > 0 ? and(...conditions) : undefined;
    const limit  = query.limit  ?? 20;
    const offset = query.offset ?? 0;

    const [rows, totalResult] = await Promise.all([
      this.db
        .select({
          id:        auditLog.id,
          actorType: auditLog.actorType,
          actorId:   auditLog.actorId,
          actorName: staffUser.displayName,
          action:    auditLog.action,
          entity:    auditLog.entity,
          entityId:  auditLog.entityId,
          payload:   auditLog.payload,
          createdAt: auditLog.createdAt,
        })
        .from(auditLog)
        .leftJoin(staffUser, eq(auditLog.actorId, staffUser.id))
        .where(whereClause)
        .orderBy(desc(auditLog.createdAt))
        .limit(limit)
        .offset(offset),
      this.db
        .select({ total: count() })
        .from(auditLog)
        .where(whereClause),
    ]);

    return {
      rows: rows.map((r) => ({
        id:        r.id,
        actorType: r.actorType as AuditActorType,
        actorId:   r.actorId,
        actorName: r.actorName ?? null,
        action:    r.action,
        entity:    r.entity,
        entityId:  r.entityId,
        payload:   r.payload as Record<string, unknown>,
        createdAt: r.createdAt,
      })),
      total: Number(totalResult[0]?.total ?? 0),
    };
  }
}
