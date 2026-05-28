import { Moon } from 'lucide-react';

import { db } from '@/db/client';
import { formatSolesCompact } from '@/lib/money/format';
import type { ItemCategory } from '@/lib/money/types';
import { MenuService } from '@/server/services/menu';

import { CartSheet } from './_components/cart-sheet';
import { CerroLogo } from './_components/cerro-logo';
import { MenuCategoryTabs } from './_components/menu-category-tabs';
import { MenuItemCard } from './_components/menu-item-card';
import { MenuLiveRefresh } from './_components/menu-live-refresh';

export const dynamic = 'force-dynamic';

const CATEGORY_LABELS: Record<ItemCategory, string> = {
  starter: 'Entradas',
  main: 'Segundos',
  drink: 'Bebidas',
  dessert: 'Postres',
};

const CATEGORY_ORDER: ItemCategory[] = ['starter', 'main', 'drink', 'dessert'];

function fmtDateLong(): string {
  const d = new Date();
  const weekday = d.toLocaleDateString('es-PE', { weekday: 'long' });
  const day = d.getDate();
  // Node ICU sentence-cases month when queried alone; force lowercase to match es-PE convention.
  const month = d.toLocaleDateString('es-PE', { month: 'long' }).toLowerCase();
  const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);
  return `${cap(weekday)} ${day} de ${month}`;
}

export default async function CustomerPage() {
  const service = new MenuService(db);
  const menu = await service.getTodayPublicMenu();

  if (!menu) {
    return (
      <div
        style={{
          minHeight: '100dvh',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          background: 'var(--neutral-50)',
          padding: 32,
          textAlign: 'center',
        }}
      >
        <Moon size={60} style={{ color: 'var(--neutral-400)' }} aria-hidden="true" />
        <h1
          style={{
            margin: '20px 0 8px',
            fontFamily: 'var(--font-display)',
            fontSize: 22,
            fontWeight: 700,
            color: 'var(--neutral-700)',
          }}
        >
          Hoy ya cerramos
        </h1>
        <p style={{ margin: 0, fontSize: 14, color: 'var(--neutral-500)' }}>
          Regresa mañana, te esperamos con un menú nuevo.
        </p>
        <div style={{ marginTop: 28 }}>
          <CerroLogo size={16} color="var(--brand-600)" />
        </div>
      </div>
    );
  }

  const grouped = CATEGORY_ORDER.reduce<Record<ItemCategory, typeof menu.items>>(
    (acc, cat) => {
      acc[cat] = menu.items.filter((i) => i.category === cat);
      return acc;
    },
    { starter: [], main: [], drink: [], dessert: [] },
  );

  const categoriesWithItems = CATEGORY_ORDER.filter((cat) => grouped[cat].length > 0);

  return (
    <>
      <MenuLiveRefresh />

      <div
        style={{
          background: 'var(--neutral-50)',
          minHeight: '100dvh',
          maxWidth: 448,
          margin: '0 auto',
          paddingBottom: 120,
        }}
      >
        {/* Hero */}
        <div
          style={{
            background: 'var(--brand-50)',
            padding: '24px 20px 18px',
            borderBottom: '1px solid var(--brand-100)',
          }}
        >
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              marginBottom: 14,
            }}
          >
            <CerroLogo size={18} color="var(--brand-700)" />
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 5,
                fontSize: 11,
                color: 'var(--brand-700)',
                fontWeight: 600,
                padding: '4px 9px',
                background: 'rgba(217,119,6,0.1)',
                borderRadius: 999,
              }}
            >
              <span
                className="conn-dot"
                style={{
                  width: 5,
                  height: 5,
                  borderRadius: '50%',
                  background: 'var(--success-500)',
                  display: 'inline-block',
                  flexShrink: 0,
                }}
              />
              En vivo
            </div>
          </div>

          <h1
            style={{
              margin: 0,
              fontFamily: 'var(--font-display)',
              fontSize: 26,
              fontWeight: 800,
              letterSpacing: '-0.02em',
              color: 'var(--neutral-800)',
              lineHeight: 1.15,
            }}
          >
            Menú de hoy
          </h1>
          <p style={{ margin: '4px 0 0', fontSize: 14, color: 'var(--neutral-600)' }}>
            {fmtDateLong()}
          </p>
          <p style={{ margin: '12px 0 0', fontSize: 12, color: 'var(--brand-700)', fontWeight: 500 }}>
            Menú completo{' '}
            <b className="tabnum">{formatSolesCompact(menu.comboConfig.dineInPriceCents)}</b> aquí
            {' · '}
            <b className="tabnum">{formatSolesCompact(menu.comboConfig.takeawayPriceCents)}</b> para llevar
          </p>
        </div>

        {/* Sticky category tabs */}
        <MenuCategoryTabs categories={categoriesWithItems} />

        {/* Menu sections */}
        {categoriesWithItems.map((cat) => (
          <section key={cat} id={`cat-${cat}`} style={{ padding: '20px 16px 8px' }}>
            <h2
              style={{
                margin: '0 0 14px 4px',
                fontFamily: 'var(--font-display)',
                fontSize: 20,
                fontWeight: 700,
                color: 'var(--neutral-800)',
                letterSpacing: '-0.01em',
              }}
            >
              {CATEGORY_LABELS[cat]}
            </h2>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              {grouped[cat].map((item) => (
                <MenuItemCard
                  key={item.id}
                  id={item.id}
                  name={item.name}
                  description={item.description}
                  category={item.category}
                  isAvailable={item.isAvailable}
                  priceCents={item.priceCents}
                  imagePath={item.imagePath}
                />
              ))}
            </div>
          </section>
        ))}
      </div>

      {/* Cart: floating bar + sheet */}
      <CartSheet comboConfig={menu.comboConfig} />

      <noscript>
        <p
          style={{
            position: 'fixed',
            bottom: 0,
            left: 0,
            right: 0,
            background: 'var(--warning-50)',
            padding: '12px 16px',
            textAlign: 'center',
            fontSize: 13,
            color: 'var(--warning-700)',
          }}
        >
          Para hacer tu pedido, activa JavaScript o habla con un mozo.
        </p>
      </noscript>
    </>
  );
}
