'use client';

import { Check } from 'lucide-react';
import { useEffect, useState } from 'react';

import { formatSoles } from '@/lib/money/format';
import type { CashierOrderView } from '@/server/services/cashier';

interface Props {
  orders: CashierOrderView[];
  onUndo: (orderId: string) => void;
}

const TWO_MIN_MS = 2 * 60 * 1000;

function canUndo(paidAt: Date | string | null): boolean {
  if (!paidAt) return false;
  return Date.now() - new Date(paidAt).getTime() < TWO_MIN_MS;
}

function fmt(d: Date | string | null) {
  if (!d) return '—';
  return new Date(d).toLocaleTimeString('es-PE', { hour: '2-digit', minute: '2-digit' });
}

const METHOD_LABEL: Record<string, string> = { cash: 'Efectivo', yape: 'Yape' };

export function RecentConfirmed({ orders, onUndo }: Props) {
  const [, setTick] = useState(0);
  useEffect(() => {
    const id = setInterval(() => setTick((n) => n + 1), 10_000);
    return () => clearInterval(id);
  }, []);

  if (orders.length === 0) return null;

  return (
    <div className="flex flex-col gap-2">
      <h2 className="text-sm font-semibold uppercase tracking-widest text-neutral-500">
        Confirmados recientes
      </h2>

      <ul className="flex flex-col gap-1.5">
        {orders.map((order) => {
          const undoable = canUndo(order.paidAt);
          return (
            <li
              key={order.orderId}
              className="flex items-center gap-3 rounded-lg bg-neutral-50 px-3 py-2 text-sm"
            >
              <Check className="h-3.5 w-3.5 shrink-0 text-success-500" />
              <span className="tabnum font-mono font-bold text-neutral-700">
                {order.shortCode}
              </span>
              <span className="flex-1 text-xs text-neutral-500">
                {METHOD_LABEL[order.paymentMethod ?? ''] ?? '—'} · {fmt(order.paidAt)}
              </span>
              <span className="tabnum font-mono text-xs font-semibold text-neutral-700">
                {formatSoles(order.totalCents)}
              </span>
              {undoable && (
                <button
                  type="button"
                  onClick={() => onUndo(order.orderId)}
                  className="text-xs font-semibold text-brand-700 hover:underline"
                >
                  Deshacer
                </button>
              )}
            </li>
          );
        })}
      </ul>
    </div>
  );
}
