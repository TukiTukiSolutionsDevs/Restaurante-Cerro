'use client';

import { useState } from 'react';

import type { ItemCategory } from '@/lib/money/types';

const LABELS: Record<ItemCategory, string> = {
  starter: 'Entradas',
  main: 'Segundos',
  drink: 'Bebidas',
  dessert: 'Postres',
};

interface MenuCategoryTabsProps {
  categories: ItemCategory[];
}

export function MenuCategoryTabs({ categories }: MenuCategoryTabsProps) {
  const [active, setActive] = useState<ItemCategory>(categories[0] ?? 'starter');

  function scrollTo(cat: ItemCategory) {
    setActive(cat);
    const el = document.getElementById(`cat-${cat}`);
    if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  return (
    <div
      role="tablist"
      aria-label="Categorías del menú"
      style={{
        position: 'sticky',
        top: 0,
        zIndex: 10,
        background: 'var(--neutral-50)',
        borderBottom: '1px solid var(--neutral-200)',
      }}
    >
      <div
        style={{
          display: 'flex',
          overflowX: 'auto',
          padding: '0 8px',
          scrollbarWidth: 'none',
        }}
      >
        {categories.map((cat) => {
          const isActive = active === cat;
          return (
            <button
              key={cat}
              type="button"
              role="tab"
              aria-selected={isActive}
              onClick={() => scrollTo(cat)}
              style={{
                appearance: 'none',
                border: 0,
                background: 'transparent',
                padding: '14px 14px 12px',
                fontSize: 14,
                fontWeight: isActive ? 700 : 500,
                cursor: 'pointer',
                color: isActive ? 'var(--neutral-800)' : 'var(--neutral-500)',
                borderBottom: isActive
                  ? '2px solid var(--brand-500)'
                  : '2px solid transparent',
                whiteSpace: 'nowrap',
                flexShrink: 0,
                transition: 'color 0.15s, border-color 0.15s',
              }}
            >
              {LABELS[cat]}
            </button>
          );
        })}
      </div>
    </div>
  );
}
