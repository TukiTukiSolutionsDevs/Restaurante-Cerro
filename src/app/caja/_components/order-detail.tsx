'use client';

import { Package, ShoppingBag, UtensilsCrossed, X } from 'lucide-react';
import { useState } from 'react';

import { formatSoles } from '@/lib/money/format';
import type { CashierOrderView } from '@/server/services/cashier';

interface Props {
  order: CashierOrderView;
  onCancel: (reason: string) => void;
  isCancelling: boolean;
}

const VARIANT_LABEL: Record<string, string> = {
  full_combo:     'Combo completo',
  only_starter:   'Solo entrada',
  only_main:      'Solo segundo',
  drink_extra:    'Bebida extra',
  dessert_extra:  'Postre extra',
};

export function OrderDetail({ order, onCancel, isCancelling }: Props) {
  const [showCancelDialog, setShowCancelDialog] = useState(false);
  const [cancelReason, setCancelReason] = useState('');

  const qrExpired = new Date(order.qrExpiresAt) < new Date();
  const isConfirmable = order.status === 'pending';
  const isTakeaway = order.orderType === 'takeaway';

  return (
    <div className="slide-up rounded-xl border border-neutral-200 bg-white p-6 flex flex-col gap-5">
      {/* QR expired banner */}
      {qrExpired && isConfirmable && (
        <div className="rounded-lg border border-danger-200 bg-danger-50 px-4 py-3 text-sm text-danger-800">
          QR vencido. Confirma con cliente antes de cobrar.
        </div>
      )}

      {/* Status banner for non-pending orders */}
      {!isConfirmable && (
        <div className="rounded-lg border border-warning-200 bg-warning-50 px-4 py-3 text-sm text-warning-800">
          Este pedido ya no está pendiente (estado: {order.status})
        </div>
      )}

      {/* Header: MESA grande primero + código pequeño + hora */}
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          {isTakeaway ? (
            <span className="flex items-center gap-2 rounded-xl bg-danger-50 px-3 py-2 text-base font-extrabold uppercase tracking-wide text-danger-700">
              <ShoppingBag className="h-5 w-5" />
              Para llevar
            </span>
          ) : (
            <div className="flex flex-col leading-none">
              <span className="text-[10px] font-bold uppercase tracking-widest text-neutral-400">
                Mesa
              </span>
              <span className="tabnum mt-0.5 font-mono text-3xl font-extrabold tracking-wider text-brand-700">
                {order.tableCode ?? '—'}
              </span>
            </div>
          )}
          <span className="tabnum font-mono text-xs font-semibold uppercase tracking-wider text-neutral-400">
            #{order.shortCode}
          </span>
        </div>
        <span className="text-xs text-neutral-400">
          {new Date(order.createdAt).toLocaleTimeString('es-PE', {
            hour: '2-digit',
            minute: '2-digit',
          })}
        </span>
      </div>

      {/* Items */}
      <div className="border-y border-neutral-100 py-3 flex flex-col gap-1.5">
        {order.items.map((item, idx) => (
          <div key={idx} className="flex items-center justify-between text-sm">
            <div className="flex items-center gap-2">
              <span className="tabnum font-mono font-bold text-brand-700">{item.quantity}×</span>
              <span className="text-neutral-800 font-medium">{item.name}</span>
              <span className="text-neutral-400">— {VARIANT_LABEL[item.variant] ?? item.variant}</span>
            </div>
            {item.withTupper && (
              <span className="flex items-center gap-1 text-xs text-brand-700">
                <Package className="h-3 w-3" /> Tupper
              </span>
            )}
          </div>
        ))}
      </div>

      {/* Total enorme */}
      <div className="flex items-baseline justify-between">
        <span className="text-sm font-semibold uppercase tracking-wide text-neutral-500">
          Total a cobrar
        </span>
        <span className="tabnum font-mono text-5xl font-bold leading-none text-neutral-900">
          {formatSoles(order.totalCents)}
        </span>
      </div>

      {/* Cancel button */}
      {isConfirmable && (
        <button
          type="button"
          onClick={() => setShowCancelDialog(true)}
          disabled={isCancelling}
          className="flex items-center justify-center gap-1.5 self-center text-sm text-danger-600 hover:underline disabled:opacity-40"
        >
          <X className="h-3.5 w-3.5" />
          Cancelar pedido
        </button>
      )}

      {/* Cancel dialog */}
      {showCancelDialog && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
          <div className="w-full max-w-sm rounded-2xl bg-white p-6 shadow-xl space-y-4">
            <h3 className="font-display font-bold text-neutral-900">Cancelar pedido</h3>
            <div className="space-y-1">
              <label className="block text-sm font-medium text-neutral-700">
                Motivo de cancelación
              </label>
              <textarea
                autoFocus
                rows={3}
                value={cancelReason}
                onChange={(e) => setCancelReason(e.target.value)}
                placeholder="Mínimo 5 caracteres"
                className="w-full rounded-xl border border-neutral-300 px-3 py-2 text-sm focus:border-danger-400 focus:outline-none focus:ring-2 focus:ring-danger-100"
              />
              <p className="text-xs text-neutral-400">{cancelReason.length}/200 — mínimo 5</p>
            </div>
            <div className="flex gap-3 justify-end">
              <button
                type="button"
                onClick={() => { setShowCancelDialog(false); setCancelReason(''); }}
                className="rounded-xl border border-neutral-200 px-4 py-2 text-sm font-semibold text-neutral-700 hover:bg-neutral-50"
              >
                Volver
              </button>
              <button
                type="button"
                disabled={cancelReason.trim().length < 5 || isCancelling}
                onClick={() => {
                  setShowCancelDialog(false);
                  onCancel(cancelReason.trim());
                  setCancelReason('');
                }}
                className="rounded-xl bg-danger-600 px-4 py-2 text-sm font-bold text-white hover:bg-danger-700 disabled:opacity-40"
              >
                Confirmar cancelación
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
