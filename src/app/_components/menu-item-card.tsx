'use client';

import { Minus, Plus } from 'lucide-react';

import { formatSolesCompact } from '@/lib/money/format';
import type { ItemCategory } from '@/lib/money/types';

import { useCartStore } from './cart-store';

interface MenuItemCardProps {
  id: number;
  name: string;
  description?: string | null;
  category: ItemCategory;
  isAvailable: boolean;
  priceCents: number | null;
  imagePath?: string | null;
}

export function MenuItemCard({
  id,
  name,
  description,
  category,
  isAvailable,
  priceCents,
  imagePath,
}: MenuItemCardProps) {
  const addItem = useCartStore((s) => s.addItem);
  const updateQuantity = useCartStore((s) => s.updateQuantity);
  const items = useCartStore((s) => s.items);
  const qty = items.find((i) => i.menuItemId === id)?.quantity ?? 0;

  const isExtra = category === 'drink' || category === 'dessert';
  const priceLabel =
    isExtra && priceCents !== null ? formatSolesCompact(priceCents) : 'incluido en el menú';

  return (
    <div
      style={{
        display: 'flex',
        gap: 12,
        padding: 12,
        background: 'var(--neutral-0)',
        border: '1px solid var(--neutral-200)',
        borderRadius: 16,
        opacity: isAvailable ? 1 : 0.6,
      }}
    >
      {/* Image (or placeholder if none uploaded) */}
      {imagePath ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={`/api/images/${imagePath}`}
          alt={name}
          style={{
            width: 76,
            height: 76,
            flexShrink: 0,
            objectFit: 'cover',
            borderRadius: 12,
            background: 'var(--neutral-100)',
          }}
        />
      ) : (
        <div
          style={{
            width: 76,
            height: 76,
            flexShrink: 0,
            background: 'var(--neutral-100)',
            borderRadius: 12,
          }}
          aria-hidden="true"
        />
      )}

      {/* Content */}
      <div
        style={{
          flex: 1,
          minWidth: 0,
          display: 'flex',
          flexDirection: 'column',
          justifyContent: 'space-between',
        }}
      >
        <div>
          <div
            style={{
              fontSize: 15,
              fontWeight: 600,
              color: 'var(--neutral-800)',
              lineHeight: 1.25,
              textDecoration: isAvailable ? 'none' : 'line-through',
            }}
          >
            {name}
          </div>
          {description && (
            <div
              style={{
                fontSize: 12,
                color: 'var(--neutral-500)',
                lineHeight: 1.35,
                marginTop: 2,
              }}
            >
              {description}
            </div>
          )}
        </div>

        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            marginTop: 6,
          }}
        >
          <span
            style={{
              fontSize: 11,
              color: isAvailable ? 'var(--neutral-500)' : 'var(--danger-500)',
              fontWeight: 500,
            }}
          >
            {isAvailable ? priceLabel : 'Se acabó'}
          </span>

          {isAvailable &&
            (qty === 0 ? (
              <button
                type="button"
                onClick={() =>
                  addItem({ menuItemId: id, name, category, priceCents, isAvailable })
                }
                aria-label={`Agregar ${name}`}
                style={{
                  appearance: 'none',
                  border: 0,
                  padding: 0,
                  cursor: 'pointer',
                  width: 32,
                  height: 32,
                  borderRadius: '50%',
                  background: 'var(--brand-500)',
                  color: '#fff',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  boxShadow: '0 2px 6px rgba(217,119,6,0.35)',
                  flexShrink: 0,
                }}
              >
                <Plus size={18} />
              </button>
            ) : (
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <button
                  type="button"
                  onClick={() => updateQuantity(id, -1)}
                  aria-label={`Quitar ${name}`}
                  style={iconBtnSm()}
                >
                  <Minus size={14} />
                </button>
                <span
                  className="tabnum"
                  style={{ fontSize: 15, fontWeight: 700, minWidth: 16, textAlign: 'center' }}
                >
                  {qty}
                </span>
                <button
                  type="button"
                  onClick={() =>
                    addItem({ menuItemId: id, name, category, priceCents, isAvailable })
                  }
                  aria-label={`Agregar más ${name}`}
                  style={iconBtnSm('brand')}
                >
                  <Plus size={14} />
                </button>
              </div>
            ))}
        </div>
      </div>
    </div>
  );
}

function iconBtnSm(variant?: 'brand') {
  return {
    appearance: 'none' as const,
    border: 0,
    padding: 0,
    cursor: 'pointer',
    width: 26,
    height: 26,
    borderRadius: '50%',
    background: variant === 'brand' ? 'var(--brand-500)' : 'var(--neutral-200)',
    color: variant === 'brand' ? '#fff' : 'var(--neutral-700)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
  };
}
