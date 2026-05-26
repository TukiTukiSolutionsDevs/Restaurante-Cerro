import { eq } from 'drizzle-orm';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Table,
  TableBody,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from '@/components/ui/tabs';
import { db } from '@/db/client';
import { comboConfig, dailyMenu, menuItem } from '@/db/schema';
import { requireRoleOrRedirect } from '@/lib/auth/guards';
import { createMenuAction } from '@/server/actions/menu';
import { MenuService } from '@/server/services/menu';

import { AddItemDialog } from './_components/add-item-dialog';
import { ComboForm } from './_components/combo-form';
import { DayControl } from './_components/day-control';
import { ItemRow } from './_components/item-row';
import { LiveRefresh } from './_components/live-refresh';

function getMenuStatus(menu: {
  openedAt: Date | null;
  closedAt: Date | null;
}): 'draft' | 'opened' | 'closed' {
  if (!menu.openedAt) return 'draft';
  if (!menu.closedAt) return 'opened';
  return 'closed';
}

const CATEGORY_LABELS: Record<string, string> = {
  starter: 'Entradas',
  main:    'Segundos',
  drink:   'Bebidas',
  dessert: 'Postres',
};

const CATEGORY_ORDER = ['starter', 'main', 'drink', 'dessert'] as const;

export default async function AdminMenuPage() {
  await requireRoleOrRedirect(['admin']);

  const today = new Date().toISOString().slice(0, 10);

  const [todayMenu] = await db
    .select()
    .from(dailyMenu)
    .where(eq(dailyMenu.serviceDate, today));

  if (!todayMenu) {
    return (
      <main className="mx-auto max-w-4xl px-6 py-8">
        <div className="mb-6 flex items-center justify-between">
          <h1 className="font-display text-2xl font-bold text-neutral-800">Menú de hoy</h1>
          <span className="rounded-full bg-neutral-100 px-3 py-1 text-xs font-semibold uppercase tracking-widest text-neutral-500">
            Sin menú
          </span>
        </div>
        <div className="rounded-xl border border-neutral-200 bg-white p-8 text-center">
          <p className="mb-5 text-neutral-500">
            No hay menú creado para hoy ({today}).
          </p>
          <div className="flex flex-col items-center gap-2">
            <form
              action={async () => {
                'use server';
                await createMenuAction({ serviceDate: today });
              }}
            >
              <Button type="submit">Crear menú de hoy</Button>
            </form>
            <form
              action={async () => {
                'use server';
                const yesterday = new Date();
                yesterday.setDate(yesterday.getDate() - 1);
                await createMenuAction({
                  serviceDate: today,
                  cloneFromDate: yesterday.toISOString().slice(0, 10),
                });
              }}
            >
              <Button type="submit" variant="outline" className="mt-1">
                Clonar menú de ayer
              </Button>
            </form>
          </div>
        </div>
      </main>
    );
  }

  const menuService = new MenuService(db);
  const [combo, allItems, currentShift] = await Promise.all([
    db
      .select()
      .from(comboConfig)
      .where(eq(comboConfig.dailyMenuId, todayMenu.id))
      .then((rows) => rows[0] ?? null),
    db
      .select()
      .from(menuItem)
      .where(eq(menuItem.dailyMenuId, todayMenu.id))
      .orderBy(menuItem.sortOrder),
    menuService.getCurrentShift(todayMenu.id),
  ]);

  const status = getMenuStatus(todayMenu);
  const hasCombo = combo !== null;
  // Legacy menus closed before menu_session existed have no session rows;
  // treat their first open/close as shift 1 so the UI counter stays consistent.
  const legacyShift =
    todayMenu.openedAt !== null && todayMenu.closedAt !== null ? 1 : 0;
  const shiftNumber = currentShift?.shiftNumber ?? legacyShift;

  const itemsByCategory = CATEGORY_ORDER.reduce<Record<string, typeof allItems>>(
    (acc, cat) => {
      acc[cat] = allItems.filter((i) => i.category === cat);
      return acc;
    },
    {} as Record<string, typeof allItems>,
  );

  return (
    <main className="mx-auto max-w-4xl px-6 py-8">
      <LiveRefresh />

      <div className="mb-6 flex items-center justify-between">
        <h1 className="font-display text-2xl font-bold text-neutral-800">Menú de hoy</h1>
        <DayControl
          menuId={todayMenu.id}
          status={status}
          hasCombo={hasCombo}
          shiftNumber={shiftNumber}
        />
      </div>

      <div className="flex flex-col gap-5">
        {/* Combo prices */}
        <div className="rounded-xl border border-neutral-200 bg-white p-5">
          <h2 className="mb-4 font-display text-base font-bold text-neutral-800">
            Precios del combo
          </h2>
          <ComboForm
            dailyMenuId={todayMenu.id}
            defaults={
              combo
                ? {
                    dineInPriceCents:        combo.dineInPriceCents,
                    takeawayPriceCents:      combo.takeawayPriceCents,
                    tupperFullPriceCents:    combo.tupperFullPriceCents,
                    tupperPartialPriceCents: combo.tupperPartialPriceCents,
                    partialStarterPriceCents:combo.partialStarterPriceCents,
                    partialMainPriceCents:   combo.partialMainPriceCents,
                  }
                : undefined
            }
          />
        </div>

        {/* Items by category */}
        <div className="rounded-xl border border-neutral-200 bg-white p-5">
          <h2 className="mb-4 font-display text-base font-bold text-neutral-800">
            Platos del día
          </h2>
          <Tabs defaultValue="starter">
            <TabsList className="mb-4">
              {CATEGORY_ORDER.map((cat) => (
                <TabsTrigger key={cat} value={cat}>
                  {CATEGORY_LABELS[cat]}
                  {itemsByCategory[cat]!.length > 0 && (
                    <span className="ml-1 text-xs opacity-60">
                      ({itemsByCategory[cat]!.length})
                    </span>
                  )}
                </TabsTrigger>
              ))}
            </TabsList>

            {CATEGORY_ORDER.map((cat) => (
              <TabsContent key={cat} value={cat}>
                <div className="mb-3 flex justify-end">
                  <AddItemDialog dailyMenuId={todayMenu.id} defaultCategory={cat} />
                </div>
                {itemsByCategory[cat]!.length === 0 ? (
                  <p className="py-6 text-center text-sm text-neutral-400">
                    Sin platos en esta categoría.
                  </p>
                ) : (
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Plato</TableHead>
                        <TableHead>Precio</TableHead>
                        <TableHead>Disponible</TableHead>
                        <TableHead />
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {itemsByCategory[cat]!.map((item) => (
                        <ItemRow
                          key={item.id}
                          item={{
                            id:          item.id,
                            name:        item.name,
                            description: item.description ?? null,
                            category:    item.category,
                            isAvailable: item.isAvailable,
                            sortOrder:   item.sortOrder,
                            priceCents:  item.priceCents ?? null,
                            imagePath:   item.imagePath ?? null,
                          }}
                          menuId={todayMenu.id}
                          comboPartialStarterCents={combo?.partialStarterPriceCents ?? null}
                          comboPartialMainCents={combo?.partialMainPriceCents ?? null}
                        />
                      ))}
                    </TableBody>
                  </Table>
                )}
              </TabsContent>
            ))}
          </Tabs>
        </div>
      </div>
    </main>
  );
}
