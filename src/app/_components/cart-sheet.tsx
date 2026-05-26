'use client';

import { ArrowLeft, Minus, Package, Plus, ShoppingBag, UtensilsCrossed } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useState } from 'react';

import { Sheet, SheetContent, SheetTitle } from '@/components/ui/sheet';
import { formatSoles } from '@/lib/money/format';
import { priceOrder } from '@/lib/money/price';
import type { ComboConfig } from '@/lib/money/types';

import { CartBar } from './cart-bar';
import { useCartStore } from './cart-store';
import { CustomerTablePicker } from './customer-table-picker';

interface CartSheetProps {
  comboConfig: ComboConfig;
}

export function CartSheet({ comboConfig }: CartSheetProps) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const items = useCartStore((s) => s.items);
  const orderType = useCartStore((s) => s.orderType);
  const selectedTableId = useCartStore((s) => s.selectedTableId);
  const withTupper = useCartStore((s) => s.withTupper);
  const hasUnavailable = useCartStore((s) => s.hasUnavailable);
  const updateQuantity = useCartStore((s) => s.updateQuantity);
  const setOrderType = useCartStore((s) => s.setOrderType);
  const clear = useCartStore((s) => s.clear);
  const totalItems = useCartStore((s) => s.totalItems);

  const pricing =
    items.length > 0
      ? priceOrder({
          items: items.map((i) => ({
            menuItemId: i.menuItemId,
            category: i.category,
            variant: i.variant,
            quantity: i.quantity,
            unitPriceCents: i.priceCents ?? undefined,
          })),
          orderType,
          withTupper,
          combo: comboConfig,
        })
      : null;

  const count = totalItems();

  const canSubmit =
    items.length > 0 &&
    !hasUnavailable() &&
    !submitting &&
    (orderType === 'takeaway' || selectedTableId !== null);

  async function handleSubmit() {
    setError(null);
    setSubmitting(true);
    try {
      // Use pricing.lines as source of truth — a single cart line may split into
      // a combo line and a partial line, and the backend stores one order_item per
      // (menuItemId, variant) pair.
      const lines = pricing?.lines ?? [];
      const body = {
        orderType,
        tableId: orderType === 'dine_in' ? selectedTableId : null,
        items: lines.map((l) => ({
          menuItemId: l.menuItemId,
          variant: l.variant,
          quantity: l.quantity,
          withTupper: orderType === 'takeaway' ? withTupper : false,
        })),
      };

      const res = await fetch('/api/orders', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'X-Requested-With': 'rc-app' },
        body: JSON.stringify(body),
      });

      const data = (await res.json()) as {
        qrToken?: string;
        error?: { code: string; message: string };
      };

      if (!res.ok) {
        const code = data.error?.code;
        if (code === 'TABLE_TAKEN') setError('Mesa no disponible, elige otra.');
        else if (code === 'RATE_LIMITED') setError('Demasiados intentos. Espera un momento.');
        else setError(data.error?.message ?? 'Error al enviar el pedido');
        return;
      }

      clear();
      setOpen(false);
      router.push(`/pedido/${data.qrToken}`);
    } catch {
      setError('Error de conexión. Intenta de nuevo.');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <>
      {count > 0 && (
        <CartBar
          count={count}
          totalCents={pricing?.totalCents ?? 0}
          onClick={() => setOpen(true)}
        />
      )}

      <Sheet open={open} onOpenChange={setOpen}>
        <SheetContent
          side="bottom"
          className="flex flex-col gap-0 rounded-t-2xl p-0"
          style={{ maxHeight: '90dvh' }}
        >
          <SheetTitle className="sr-only">Tu pedido</SheetTitle>

          {/* Header */}
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              padding: '14px 12px',
              borderBottom: '1px solid var(--neutral-200)',
              background: 'var(--neutral-0)',
              flexShrink: 0,
            }}
          >
            <button
              type="button"
              onClick={() => setOpen(false)}
              aria-label="Cerrar pedido"
              style={{
                appearance: 'none',
                border: 0,
                padding: 8,
                background: 'transparent',
                cursor: 'pointer',
                color: 'var(--neutral-700)',
                display: 'flex',
                alignItems: 'center',
              }}
            >
              <ArrowLeft size={22} />
            </button>
            <h2
              style={{
                flex: 1,
                margin: 0,
                textAlign: 'center',
                fontFamily: 'var(--font-display)',
                fontSize: 17,
                fontWeight: 700,
                color: 'var(--neutral-800)',
              }}
            >
              Tu pedido
            </h2>
            <div style={{ width: 38 }} />
          </div>

          {/* Scrollable body */}
          <div style={{ flex: 1, overflowY: 'auto', padding: '16px 16px 24px' }}>
            {/* Composition summary — explains how items pair into combos */}
            {(() => {
              const totalStarters = items
                .filter((i) => i.category === 'starter')
                .reduce((a, i) => a + i.quantity, 0);
              const totalMains = items
                .filter((i) => i.category === 'main')
                .reduce((a, i) => a + i.quantity, 0);
              const comboCount = Math.min(totalStarters, totalMains);
              const looseStarters = totalStarters - comboCount;
              const looseMains = totalMains - comboCount;

              if (comboCount === 0 && looseStarters === 0 && looseMains === 0) {
                return null;
              }

              const parts: string[] = [];
              if (comboCount > 0) {
                parts.push(
                  `${comboCount} ${comboCount === 1 ? 'menú completo' : 'menús completos'}`,
                );
              }
              if (looseStarters > 0) {
                parts.push(
                  `${looseStarters} ${looseStarters === 1 ? 'entrada suelta' : 'entradas sueltas'}`,
                );
              }
              if (looseMains > 0) {
                parts.push(
                  `${looseMains} ${looseMains === 1 ? 'segundo suelto' : 'segundos sueltos'}`,
                );
              }

              return (
                <div
                  style={{
                    padding: '12px 14px',
                    background: 'var(--brand-50)',
                    border: '1px solid var(--brand-100)',
                    borderRadius: 12,
                    marginBottom: 16,
                  }}
                >
                  <div
                    style={{
                      fontSize: 11,
                      fontWeight: 600,
                      color: 'var(--neutral-500)',
                      textTransform: 'uppercase',
                      letterSpacing: '0.05em',
                      marginBottom: 4,
                    }}
                  >
                    Estás armando
                  </div>
                  <div
                    style={{
                      fontSize: 14,
                      fontWeight: 600,
                      color: 'var(--neutral-800)',
                    }}
                  >
                    {parts.join(' + ')}
                  </div>
                  {comboCount > 0 && looseStarters === 0 && looseMains === 0 && (
                    <div
                      style={{
                        fontSize: 11,
                        color: 'var(--neutral-500)',
                        marginTop: 4,
                      }}
                    >
                      Cada menú es 1 entrada + 1 segundo al precio promocional.
                    </div>
                  )}
                  {(looseStarters > 0 || looseMains > 0) && (
                    <div
                      style={{
                        fontSize: 11,
                        color: 'var(--neutral-500)',
                        marginTop: 4,
                      }}
                    >
                      {looseStarters > 0 && looseMains > 0
                        ? 'Agrega más entradas o segundos para sumarlos en otro menú.'
                        : looseStarters > 0
                          ? 'Agrega un segundo para convertir una entrada en menú completo.'
                          : 'Agrega una entrada para convertir un segundo en menú completo.'}
                    </div>
                  )}
                </div>
              );
            })()}

            {/* Items */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginBottom: 20 }}>
              {items.map((item) => {
                const itemLines =
                  pricing?.lines.filter((l) => l.menuItemId === item.menuItemId) ?? [];
                const itemTotalCents = itemLines.reduce(
                  (a, l) => a + l.totalCents,
                  0,
                );
                const comboQty = itemLines
                  .filter((l) => l.variant === 'full_combo')
                  .reduce((a, l) => a + l.quantity, 0);
                const partialQty = itemLines
                  .filter(
                    (l) => l.variant === 'only_starter' || l.variant === 'only_main',
                  )
                  .reduce((a, l) => a + l.quantity, 0);

                const isTakeaway = orderType === 'takeaway';
                const tupperSoles = formatSoles(comboConfig.tupperPartialPriceCents);
                const partialPriceCents =
                  item.category === 'starter'
                    ? comboConfig.partialStarterPriceCents
                    : item.category === 'main'
                      ? comboConfig.partialMainPriceCents
                      : null;

                let breakdown = '';
                if (item.category === 'drink' || item.category === 'dessert') {
                  breakdown =
                    item.priceCents != null
                      ? `${formatSoles(item.priceCents)} c/u`
                      : '';
                } else if (comboQty > 0 && partialQty === 0) {
                  breakdown = isTakeaway
                    ? 'Incluido en el menú (con tupper)'
                    : 'Incluido en el menú';
                } else if (comboQty === 0 && partialQty > 0 && partialPriceCents != null) {
                  breakdown = isTakeaway
                    ? `${formatSoles(partialPriceCents)} + ${tupperSoles} tupper c/u`
                    : `${formatSoles(partialPriceCents)} c/u`;
                } else if (comboQty > 0 && partialQty > 0 && partialPriceCents != null) {
                  const partialUnit = isTakeaway
                    ? partialPriceCents + comboConfig.tupperPartialPriceCents
                    : partialPriceCents;
                  breakdown = `${comboQty} en menú · ${partialQty} suelto a ${formatSoles(partialUnit)}`;
                }

                return (
                <div
                  key={item.menuItemId}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 12,
                    padding: '10px 12px',
                    background: 'var(--neutral-0)',
                    border: '1px solid var(--neutral-200)',
                    borderRadius: 12,
                  }}
                >
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--neutral-800)' }}>
                      {item.name}
                    </div>
                    {breakdown && (
                      <div
                        style={{
                          fontSize: 11,
                          color: 'var(--neutral-500)',
                          marginTop: 2,
                        }}
                      >
                        {breakdown}
                      </div>
                    )}
                    {itemTotalCents > 0 && (
                      <div
                        style={{
                          fontSize: 12,
                          fontWeight: 600,
                          color: 'var(--neutral-700)',
                          marginTop: 2,
                        }}
                        className="tabnum"
                      >
                        {formatSoles(itemTotalCents)}
                      </div>
                    )}
                    {!item.isAvailable && (
                      <div style={{ fontSize: 11, color: 'var(--danger-500)', marginTop: 2 }}>
                        Ya no disponible
                      </div>
                    )}
                  </div>
                  <button
                    type="button"
                    onClick={() => updateQuantity(item.menuItemId, -1)}
                    aria-label={`Quitar ${item.name}`}
                    style={iconBtnSm()}
                  >
                    <Minus size={14} />
                  </button>
                  <span
                    className="tabnum"
                    style={{ minWidth: 16, textAlign: 'center', fontWeight: 700, fontSize: 14 }}
                  >
                    {item.quantity}
                  </span>
                  <button
                    type="button"
                    onClick={() => updateQuantity(item.menuItemId, 1)}
                    aria-label={`Agregar ${item.name}`}
                    style={iconBtnSm('brand')}
                  >
                    <Plus size={14} />
                  </button>
                </div>
                );
              })}
            </div>

            {/* ¿Dónde lo comes? */}
            <div
              style={{
                fontSize: 12,
                fontWeight: 600,
                color: 'var(--neutral-500)',
                textTransform: 'uppercase',
                letterSpacing: '0.05em',
                margin: '0 4px 10px',
              }}
            >
              ¿Dónde lo comes?
            </div>
            <div
              style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 20 }}
            >
              <button
                type="button"
                onClick={() => setOrderType('dine_in')}
                style={dineToggleBtn(orderType === 'dine_in')}
              >
                <UtensilsCrossed size={18} />
                <span>Comer aquí</span>
                <small style={{ fontSize: 11, opacity: 0.7 }}>
                  {formatSoles(comboConfig.dineInPriceCents)} c/menú
                </small>
              </button>
              <button
                type="button"
                onClick={() => setOrderType('takeaway')}
                style={dineToggleBtn(orderType === 'takeaway')}
              >
                <ShoppingBag size={18} />
                <span>Para llevar</span>
                <small style={{ fontSize: 11, opacity: 0.7 }}>
                  {formatSoles(comboConfig.takeawayPriceCents)} c/menú
                </small>
              </button>
            </div>

            {/* Tupper note (takeaway always includes tuppers, no toggle needed) */}
            {orderType === 'takeaway' && (
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 12,
                  padding: '12px 14px',
                  background: 'var(--brand-50)',
                  border: '1px solid var(--brand-100)',
                  borderRadius: 12,
                  marginBottom: 20,
                }}
              >
                <Package size={20} style={{ color: 'var(--brand-700)', flexShrink: 0 }} />
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--neutral-800)' }}>
                    Tuppers incluidos
                  </div>
                  <div style={{ fontSize: 11, color: 'var(--neutral-500)', marginTop: 2 }}>
                    Cada menú o plato suelto ya viene con su tupper.
                  </div>
                </div>
              </div>
            )}

            {/* Mesa picker */}
            {orderType === 'dine_in' && (
              <>
                <div
                  style={{
                    fontSize: 12,
                    fontWeight: 600,
                    color: 'var(--neutral-500)',
                    textTransform: 'uppercase',
                    letterSpacing: '0.05em',
                    margin: '0 4px 10px',
                  }}
                >
                  ¿En qué mesa?
                </div>
                <CustomerTablePicker />
              </>
            )}

            {/* Breakdown */}
            {pricing && (
              <div
                style={{
                  padding: '14px 16px',
                  background: 'var(--neutral-0)',
                  border: '1px solid var(--neutral-200)',
                  borderRadius: 12,
                  fontSize: 13,
                  color: 'var(--neutral-600)',
                  marginTop: 16,
                }}
              >
                {pricing.subtotalCents > 0 && (
                  <div style={{ display: 'flex', justifyContent: 'space-between', padding: '3px 0' }}>
                    <span>Subtotal</span>
                    <span className="tabnum">{formatSoles(pricing.subtotalCents)}</span>
                  </div>
                )}
                {pricing.tupperCents > 0 && (
                  <div style={{ display: 'flex', justifyContent: 'space-between', padding: '3px 0' }}>
                    <span>Tupper</span>
                    <span className="tabnum">+{formatSoles(pricing.tupperCents)}</span>
                  </div>
                )}
                <div style={{ height: 1, background: 'var(--neutral-200)', margin: '10px 0' }} />
                <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between' }}>
                  <span style={{ fontSize: 14, fontWeight: 600, color: 'var(--neutral-700)' }}>
                    Total
                  </span>
                  <span
                    className="tabnum"
                    style={{
                      fontFamily: 'var(--font-mono)',
                      fontSize: 28,
                      fontWeight: 700,
                      color: 'var(--neutral-800)',
                    }}
                  >
                    {formatSoles(pricing.totalCents)}
                  </span>
                </div>
              </div>
            )}

            {/* Error */}
            {error && (
              <p
                role="alert"
                style={{
                  marginTop: 12,
                  padding: '8px 12px',
                  background: 'var(--danger-50)',
                  border: '1px solid var(--danger-400)',
                  borderRadius: 8,
                  fontSize: 13,
                  color: 'var(--danger-700)',
                }}
              >
                {error}
              </p>
            )}
          </div>

          {/* Sticky CTA */}
          <div
            style={{
              padding: '14px 16px 26px',
              background: 'var(--neutral-0)',
              borderTop: '1px solid var(--neutral-200)',
              flexShrink: 0,
            }}
          >
            <button
              type="button"
              onClick={() => void handleSubmit()}
              disabled={!canSubmit}
              style={{
                appearance: 'none',
                border: 0,
                width: '100%',
                padding: '16px 20px',
                background: canSubmit ? 'var(--brand-500)' : 'var(--neutral-300)',
                color: '#fff',
                borderRadius: 14,
                fontFamily: 'var(--font-display)',
                fontSize: 16,
                fontWeight: 700,
                cursor: canSubmit ? 'pointer' : 'not-allowed',
                boxShadow: canSubmit ? '0 4px 12px rgba(217,119,6,0.3)' : 'none',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: 8,
              }}
            >
              {submitting ? 'Enviando…' : 'Pedir → ahora pagas en caja'}
            </button>
            <div
              style={{
                fontSize: 11,
                color: 'var(--neutral-500)',
                textAlign: 'center',
                marginTop: 8,
              }}
            >
              Pago en caja con efectivo o Yape
            </div>
          </div>
        </SheetContent>
      </Sheet>
    </>
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

function dineToggleBtn(active: boolean) {
  return {
    appearance: 'none' as const,
    border: '1px solid ' + (active ? 'var(--brand-500)' : 'var(--neutral-200)'),
    padding: '14px 12px',
    cursor: 'pointer',
    borderRadius: 12,
    background: active ? 'var(--brand-50)' : 'var(--neutral-0)',
    color: active ? 'var(--brand-700)' : 'var(--neutral-600)',
    display: 'flex',
    flexDirection: 'column' as const,
    alignItems: 'center',
    gap: 4,
    fontSize: 14,
    fontWeight: 600,
  };
}
