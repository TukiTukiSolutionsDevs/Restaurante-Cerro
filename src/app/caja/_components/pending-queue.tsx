'use client';

import { ShoppingBag } from 'lucide-react';

import { formatSoles } from '@/lib/money/format';
import type { CashierOrderView } from '@/server/services/cashier';

interface Props {
  orders: CashierOrderView[];
  currentOrderId?: string;
  onSelect: (order: CashierOrderView) => void;
}

function timeAgoCompact(d: Date | string): string {
  const ms = Date.now() - new Date(d).getTime();
  const m = Math.floor(ms / 60_000);
  if (m < 1) return '<1m';
  if (m < 60) return `${m}m`;
  return `${Math.floor(m / 60)}h`;
}

export function PendingQueue({ orders, currentOrderId, onSelect }: Props) {
  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-baseline justify-between">
        <h2 className="font-display text-base font-bold text-neutral-800">
          Pendientes
        </h2>
        <span
          className={`rounded-full px-2.5 py-0.5 text-xs font-bold ${
            orders.length > 0
              ? 'bg-warning-50 text-warning-700'
              : 'bg-neutral-100 text-neutral-500'
          }`}
        >
          {orders.length} esperando pago
        </span>
      </div>

      {orders.length === 0 ? (
        <p className="rounded-xl border border-dashed border-neutral-200 py-8 text-center text-sm text-neutral-400">
          Sin pedidos pendientes
        </p>
      ) : (
        <ul className="flex flex-col gap-1.5">
          {orders.map((order) => {
            const isLoaded = order.orderId === currentOrderId;
            return (
              <li key={order.orderId}>
                <button
                  type="button"
                  onClick={() => onSelect(order)}
                  className={[
                    'w-full rounded-lg border-l-[3px] px-3 py-2.5 text-left transition-colors',
                    'flex items-center gap-3 shadow-sm',
                    isLoaded
                      ? 'border-brand-500 bg-brand-50'
                      : 'border-transparent bg-white hover:bg-brand-50 hover:border-brand-500',
                  ].join(' ')}
                >
                  {/* Mesa / Llevar — identidad principal */}
                  {order.orderType === 'takeaway' ? (
                    <span className="flex min-w-[58px] items-center gap-1 rounded-md bg-neutral-100 px-2 py-1 text-xs font-bold uppercase text-neutral-700">
                      <ShoppingBag className="h-3 w-3" /> Llevar
                    </span>
                  ) : (
                    <span className="tabnum min-w-[58px] rounded-md bg-brand-100 px-2 py-1 text-center font-mono text-base font-extrabold tracking-wider text-brand-800">
                      {order.tableCode ?? '—'}
                    </span>
                  )}

                  {/* Code + qty */}
                  <span className="flex flex-1 flex-col">
                    <span className="text-xs text-neutral-500">
                      {order.items.reduce((a, b) => a + b.quantity, 0)} platos
                    </span>
                    <span className="tabnum font-mono text-[11px] uppercase tracking-wider text-neutral-400">
                      #{order.shortCode}
                    </span>
                  </span>

                  <span className="tabnum font-mono text-sm font-bold text-neutral-800">
                    {formatSoles(order.totalCents)}
                  </span>
                  <span className="min-w-[28px] text-right text-[10px] text-neutral-400">
                    {timeAgoCompact(order.createdAt)}
                  </span>
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
