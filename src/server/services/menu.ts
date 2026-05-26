import { and, eq, isNotNull, isNull, max, sql } from 'drizzle-orm';

import type { DrizzleDb } from '@/db/client';
import { auditLog, comboConfig, dailyMenu, menuItem, menuSession } from '@/db/schema';
import { notifyAfterTx, type SqlExecutor } from '@/lib/realtime/notify';

export type ItemCategory = 'starter' | 'main' | 'drink' | 'dessert';

export interface ComboConfigInput {
  dineInPriceCents: number;
  takeawayPriceCents: number;
  tupperFullPriceCents: number;
  tupperPartialPriceCents: number;
  partialStarterPriceCents: number;
  partialMainPriceCents: number;
}

export type ComboConfig = ComboConfigInput;

export interface PublicMenu {
  menuId: number;
  serviceDate: string;
  comboConfig: ComboConfig;
  items: Array<{
    id: number;
    name: string;
    description: string | null;
    category: ItemCategory;
    isAvailable: boolean;
    sortOrder: number;
    priceCents: number | null;
    imagePath: string | null;
  }>;
}

export class MenuServiceError extends Error {
  constructor(
    public code: string,
    message: string,
  ) {
    super(message);
    this.name = 'MenuServiceError';
  }
}

export interface CreateMenuOptions {
  serviceDate: Date;
  cloneFromDate?: Date;
  actorId: number;
}

function toIsoDate(d: Date): string {
  return d.toISOString().slice(0, 10);
}

function makeSqlExecutor(db: DrizzleDb): SqlExecutor {
  return {
    execute: (_raw: string, params: unknown[]) => {
      const ch = params[0] as string;
      const pl = params[1] as string;
      return db.execute(sql`SELECT pg_notify(${ch}, ${pl})`);
    },
  };
}

export class MenuService {
  constructor(private db: DrizzleDb) {}

  async createForDate(
    opts: CreateMenuOptions,
  ): Promise<{ menuId: number; itemsCloned: number }> {
    const serviceDateStr = toIsoDate(opts.serviceDate);

    return this.db.transaction(async (tx) => {
      const txDb = tx as unknown as DrizzleDb;

      let menuId: number;
      try {
        const [inserted] = await txDb
          .insert(dailyMenu)
          .values({ serviceDate: serviceDateStr, status: 'draft' })
          .returning({ id: dailyMenu.id });
        menuId = inserted!.id;
      } catch (err) {
        if ((err as { code?: string }).code === '23505') {
          throw new MenuServiceError(
            'MENU_DATE_CONFLICT',
            `Ya existe un menú para ${serviceDateStr}`,
          );
        }
        throw err;
      }

      let itemsCloned = 0;

      if (opts.cloneFromDate) {
        const cloneDateStr = toIsoDate(opts.cloneFromDate);
        const [sourceMenu] = await txDb
          .select()
          .from(dailyMenu)
          .where(eq(dailyMenu.serviceDate, cloneDateStr));

        if (!sourceMenu) {
          throw new MenuServiceError(
            'CLONE_SOURCE_NOT_FOUND',
            `No se encontró menú para ${cloneDateStr}`,
          );
        }

        const sourceItems = await txDb
          .select()
          .from(menuItem)
          .where(eq(menuItem.dailyMenuId, sourceMenu.id));

        if (sourceItems.length > 0) {
          await txDb.insert(menuItem).values(
            sourceItems.map((item) => ({
              dailyMenuId: menuId,
              name: item.name,
              description: item.description,
              category: item.category,
              sortOrder: item.sortOrder,
              priceCents: item.priceCents,
              isAvailable: true,
            })),
          );
          itemsCloned = sourceItems.length;
        }

        const [sourceCombo] = await txDb
          .select()
          .from(comboConfig)
          .where(eq(comboConfig.dailyMenuId, sourceMenu.id));

        if (sourceCombo) {
          await txDb.insert(comboConfig).values({
            dailyMenuId: menuId,
            dineInPriceCents: sourceCombo.dineInPriceCents,
            takeawayPriceCents: sourceCombo.takeawayPriceCents,
            tupperFullPriceCents: sourceCombo.tupperFullPriceCents,
            tupperPartialPriceCents: sourceCombo.tupperPartialPriceCents,
            partialStarterPriceCents: sourceCombo.partialStarterPriceCents,
            partialMainPriceCents: sourceCombo.partialMainPriceCents,
          });
        }

        await notifyAfterTx(makeSqlExecutor(txDb), 'menu_changed', {
          menuId,
          changeType: 'menu_opened',
        });
      }

      await txDb.insert(auditLog).values({
        actorType: 'staff',
        actorId: opts.actorId,
        action: 'menu.create',
        entity: 'daily_menu',
        entityId: String(menuId),
        payload: { serviceDate: serviceDateStr, itemsCloned },
      });

      return { menuId, itemsCloned };
    });
  }

  async addItem(input: {
    dailyMenuId: number;
    category: ItemCategory;
    name: string;
    description?: string;
    sortOrder?: number;
    priceCents?: number;
    actorId: number;
  }): Promise<{ itemId: number }> {
    if (input.name.length < 1 || input.name.length > 80) {
      throw new MenuServiceError(
        'VALIDATION_ERROR',
        'El nombre debe tener entre 1 y 80 caracteres',
      );
    }
    if (input.description !== undefined && input.description.length > 200) {
      throw new MenuServiceError(
        'VALIDATION_ERROR',
        'La descripción no puede superar 200 caracteres',
      );
    }

    return this.db.transaction(async (tx) => {
      const txDb = tx as unknown as DrizzleDb;

      let sortOrder = input.sortOrder;
      if (sortOrder === undefined) {
        const [maxResult] = await txDb
          .select({ maxSort: max(menuItem.sortOrder) })
          .from(menuItem)
          .where(
            and(
              eq(menuItem.dailyMenuId, input.dailyMenuId),
              eq(menuItem.category, input.category),
            ),
          );
        sortOrder = (maxResult?.maxSort ?? 0) + 10;
      }

      const [inserted] = await txDb
        .insert(menuItem)
        .values({
          dailyMenuId: input.dailyMenuId,
          category: input.category,
          name: input.name,
          description: input.description ?? null,
          sortOrder,
          priceCents: input.priceCents ?? null,
          isAvailable: true,
        })
        .returning({ id: menuItem.id });

      const itemId = inserted!.id;

      await txDb.insert(auditLog).values({
        actorType: 'staff',
        actorId: input.actorId,
        action: 'menu_item.add',
        entity: 'menu_item',
        entityId: String(itemId),
        payload: {
          dailyMenuId: input.dailyMenuId,
          name: input.name,
          category: input.category,
        },
      });

      await notifyAfterTx(makeSqlExecutor(txDb), 'menu_changed', {
        menuId: input.dailyMenuId,
        changeType: 'item_added',
        entityId: itemId,
      });

      return { itemId };
    });
  }

  async patchItem(
    itemId: number,
    patch: Partial<{
      name: string;
      description: string;
      sortOrder: number;
      priceCents: number | null;
    }>,
    actorId: number,
  ): Promise<void> {
    await this.db.transaction(async (tx) => {
      const txDb = tx as unknown as DrizzleDb;

      const [existing] = await txDb
        .select()
        .from(menuItem)
        .where(eq(menuItem.id, itemId));

      if (!existing) {
        throw new MenuServiceError('ITEM_NOT_FOUND', `Plato ${itemId} no encontrado`);
      }

      const updateSet: {
        name?: string;
        description?: string | null;
        sortOrder?: number;
        priceCents?: number | null;
      } = {};
      if (patch.name !== undefined) updateSet.name = patch.name;
      if ('description' in patch) updateSet.description = patch.description ?? null;
      if (patch.sortOrder !== undefined) updateSet.sortOrder = patch.sortOrder;
      if ('priceCents' in patch) updateSet.priceCents = patch.priceCents ?? null;

      await txDb.update(menuItem).set(updateSet).where(eq(menuItem.id, itemId));

      await txDb.insert(auditLog).values({
        actorType: 'staff',
        actorId,
        action: 'menu_item.patch',
        entity: 'menu_item',
        entityId: String(itemId),
        payload: { prev: existing as unknown as Record<string, unknown>, next: patch as Record<string, unknown> },
      });

      await notifyAfterTx(makeSqlExecutor(txDb), 'menu_changed', {
        menuId: existing.dailyMenuId,
        changeType: 'item_updated',
        entityId: itemId,
      });
    });
  }

  async toggleAvailability(
    itemId: number,
    isAvailable: boolean,
    actorId: number,
  ): Promise<void> {
    await this.db.transaction(async (tx) => {
      const txDb = tx as unknown as DrizzleDb;

      const [existing] = await txDb
        .select()
        .from(menuItem)
        .where(eq(menuItem.id, itemId));

      if (!existing) {
        throw new MenuServiceError('ITEM_NOT_FOUND', `Plato ${itemId} no encontrado`);
      }

      await txDb.update(menuItem).set({ isAvailable }).where(eq(menuItem.id, itemId));

      await txDb.insert(auditLog).values({
        actorType: 'staff',
        actorId,
        action: 'menu_item.toggle_availability',
        entity: 'menu_item',
        entityId: String(itemId),
        payload: { isAvailable },
      });

      await notifyAfterTx(makeSqlExecutor(txDb), 'menu_changed', {
        menuId: existing.dailyMenuId,
        changeType: 'availability_toggled',
        entityId: itemId,
      });
    });
  }

  async setComboConfig(
    dailyMenuId: number,
    cfg: ComboConfigInput,
    actorId: number,
  ): Promise<void> {
    const prices = Object.values(cfg);
    if (prices.some((v) => !Number.isInteger(v) || v <= 0)) {
      throw new MenuServiceError(
        'VALIDATION_ERROR',
        'Todos los precios del combo deben ser enteros positivos',
      );
    }

    await this.db.transaction(async (tx) => {
      const txDb = tx as unknown as DrizzleDb;

      await txDb
        .insert(comboConfig)
        .values({ dailyMenuId, ...cfg })
        .onConflictDoUpdate({
          target: comboConfig.dailyMenuId,
          set: {
            dineInPriceCents: cfg.dineInPriceCents,
            takeawayPriceCents: cfg.takeawayPriceCents,
            tupperFullPriceCents: cfg.tupperFullPriceCents,
            tupperPartialPriceCents: cfg.tupperPartialPriceCents,
            partialStarterPriceCents: cfg.partialStarterPriceCents,
            partialMainPriceCents: cfg.partialMainPriceCents,
          },
        });

      await txDb.insert(auditLog).values({
        actorType: 'staff',
        actorId,
        action: 'combo_config.set',
        entity: 'combo_config',
        entityId: String(dailyMenuId),
        payload: cfg as unknown as Record<string, unknown>,
      });

      await notifyAfterTx(makeSqlExecutor(txDb), 'menu_changed', {
        menuId: dailyMenuId,
        changeType: 'combo_updated',
      });
    });
  }

  async openDay(
    dailyMenuId: number,
    actorId: number,
  ): Promise<{ shiftNumber: number }> {
    return this.db.transaction(async (tx) => {
      const txDb = tx as unknown as DrizzleDb;

      const [menu] = await txDb
        .select()
        .from(dailyMenu)
        .where(eq(dailyMenu.id, dailyMenuId));

      if (!menu) {
        throw new MenuServiceError('MENU_NOT_FOUND', `Menú ${dailyMenuId} no encontrado`);
      }

      if (menu.status === 'opened') {
        throw new MenuServiceError('ALREADY_OPENED', 'El menú ya está abierto');
      }

      const [combo] = await txDb
        .select({ id: comboConfig.id })
        .from(comboConfig)
        .where(eq(comboConfig.dailyMenuId, dailyMenuId));

      if (!combo) {
        throw new MenuServiceError(
          'MISSING_COMBO_CONFIG',
          'Debes configurar los precios del combo antes de abrir el día',
        );
      }

      const [{ maxShift } = { maxShift: null as number | null }] = await txDb
        .select({ maxShift: max(menuSession.shiftNumber) })
        .from(menuSession)
        .where(eq(menuSession.dailyMenuId, dailyMenuId));

      // Legacy backfill: a closed menu predating menu_session has no rows.
      // Count its first open/close as shift 1 so the reopen starts at shift 2.
      const legacyClosedShift =
        maxShift === null && menu.openedAt !== null && menu.closedAt !== null
          ? 1
          : 0;
      const shiftNumber = (maxShift ?? legacyClosedShift) + 1;
      const now = new Date();

      await txDb.insert(menuSession).values({
        dailyMenuId,
        shiftNumber,
        openedAt: now,
        openedByActorId: actorId,
      });

      await txDb
        .update(dailyMenu)
        .set({ status: 'opened', openedAt: now, closedAt: null })
        .where(eq(dailyMenu.id, dailyMenuId));

      await txDb.insert(auditLog).values({
        actorType: 'staff',
        actorId,
        action: 'daily_menu.open',
        entity: 'daily_menu',
        entityId: String(dailyMenuId),
        payload: { openedAt: now.toISOString(), shiftNumber },
      });

      await notifyAfterTx(makeSqlExecutor(txDb), 'menu_changed', {
        menuId: dailyMenuId,
        changeType: 'menu_opened',
        shiftNumber,
      });

      return { shiftNumber };
    });
  }

  async closeDay(
    dailyMenuId: number,
    actorId: number,
  ): Promise<{ shiftNumber: number }> {
    return this.db.transaction(async (tx) => {
      const txDb = tx as unknown as DrizzleDb;

      const [menu] = await txDb
        .select()
        .from(dailyMenu)
        .where(eq(dailyMenu.id, dailyMenuId));

      if (!menu) {
        throw new MenuServiceError('MENU_NOT_FOUND', `Menú ${dailyMenuId} no encontrado`);
      }

      if (menu.status !== 'opened') {
        throw new MenuServiceError('MENU_NOT_OPEN', 'El menú no está abierto actualmente');
      }

      const [openSession] = await txDb
        .select()
        .from(menuSession)
        .where(
          and(
            eq(menuSession.dailyMenuId, dailyMenuId),
            isNull(menuSession.closedAt),
          ),
        )
        .orderBy(sql`${menuSession.shiftNumber} desc`)
        .limit(1);

      const now = new Date();

      if (openSession) {
        await txDb
          .update(menuSession)
          .set({ closedAt: now, closedByActorId: actorId })
          .where(eq(menuSession.id, openSession.id));
      }

      await txDb
        .update(dailyMenu)
        .set({ status: 'closed', closedAt: now })
        .where(eq(dailyMenu.id, dailyMenuId));

      const shiftNumber = openSession?.shiftNumber ?? 1;

      await txDb.insert(auditLog).values({
        actorType: 'staff',
        actorId,
        action: 'daily_menu.close',
        entity: 'daily_menu',
        entityId: String(dailyMenuId),
        payload: { closedAt: now.toISOString(), shiftNumber },
      });

      await notifyAfterTx(makeSqlExecutor(txDb), 'menu_changed', {
        menuId: dailyMenuId,
        changeType: 'menu_closed',
        shiftNumber,
      });

      return { shiftNumber };
    });
  }

  async getCurrentShift(dailyMenuId: number): Promise<{
    shiftNumber: number;
    openedAt: Date;
    closedAt: Date | null;
  } | null> {
    const [row] = await this.db
      .select({
        shiftNumber: menuSession.shiftNumber,
        openedAt: menuSession.openedAt,
        closedAt: menuSession.closedAt,
      })
      .from(menuSession)
      .where(eq(menuSession.dailyMenuId, dailyMenuId))
      .orderBy(sql`${menuSession.shiftNumber} desc`)
      .limit(1);

    return row ?? null;
  }

  async getTodayPublicMenu(): Promise<PublicMenu | null> {
    const today = toIsoDate(new Date());

    const [menu] = await this.db
      .select()
      .from(dailyMenu)
      .where(
        and(
          eq(dailyMenu.serviceDate, today),
          isNotNull(dailyMenu.openedAt),
          isNull(dailyMenu.closedAt),
        ),
      );

    if (!menu) return null;

    const [combo] = await this.db
      .select()
      .from(comboConfig)
      .where(eq(comboConfig.dailyMenuId, menu.id));

    if (!combo) return null;

    const items = await this.db
      .select()
      .from(menuItem)
      .where(and(eq(menuItem.dailyMenuId, menu.id), eq(menuItem.isAvailable, true)))
      .orderBy(menuItem.category, menuItem.sortOrder);

    return {
      menuId: menu.id,
      serviceDate: menu.serviceDate,
      comboConfig: {
        dineInPriceCents: combo.dineInPriceCents,
        takeawayPriceCents: combo.takeawayPriceCents,
        tupperFullPriceCents: combo.tupperFullPriceCents,
        tupperPartialPriceCents: combo.tupperPartialPriceCents,
        partialStarterPriceCents: combo.partialStarterPriceCents,
        partialMainPriceCents: combo.partialMainPriceCents,
      },
      items: items.map((item) => ({
        id: item.id,
        name: item.name,
        description: item.description ?? null,
        category: item.category as ItemCategory,
        isAvailable: item.isAvailable,
        sortOrder: item.sortOrder,
        priceCents: item.priceCents ?? null,
        imagePath: item.imagePath ?? null,
      })),
    };
  }
}
