'use client';

import { Check, Flame, ShoppingBag } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';

import type { WaiterOrderView } from '@/server/services/waiter';

interface OrderCardProps {
  order: WaiterOrderView;
  isOffline: boolean;
  onDeliver: (orderId: string) => Promise<void>;
}

const MAX_ITEMS_VISIBLE = 4;
const LATE_THRESHOLD_MS = 8 * 60 * 1000;

function useElapsed(since: Date | string): { text: string; ms: number } {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 10_000);
    return () => clearInterval(id);
  }, []);
  const sinceMs = typeof since === 'string' ? Date.parse(since) : since.getTime();
  const ms = Math.max(0, now - sinceMs);
  const totalSecs = Math.floor(ms / 1000);
  const m = Math.floor(totalSecs / 60);
  const s = totalSecs % 60;
  return { text: `hace ${m}m ${s}s`, ms };
}

export function OrderCard({ order, isOffline, onDeliver }: OrderCardProps) {
  const [delivering, setDelivering] = useState(false);
  const { text: elapsed, ms: elapsedMs } = useElapsed(order.paidAt);
  const isLate = order.status === 'in_kitchen' && elapsedMs > LATE_THRESHOLD_MS;
  const mountedRef = useRef(true);

  useEffect(() => {
    mountedRef.current = true;
    return () => { mountedRef.current = false; };
  }, []);

  const isPaidNotKitchen = order.status === 'paid';

  const visibleItems = order.items.slice(0, MAX_ITEMS_VISIBLE);
  const extraCount = order.items.length - MAX_ITEMS_VISIBLE;

  const handleDeliver = async () => {
    if (delivering || isOffline) return;
    setDelivering(true);
    if ('vibrate' in navigator) navigator.vibrate(50);
    await onDeliver(order.orderId);
    if (mountedRef.current) setDelivering(false);
  };

  return (
    <article
      aria-label={`Pedido ${order.shortCode}`}
      className={`flex flex-col gap-3 rounded-2xl border border-neutral-200 bg-white p-5 shadow-sm ${isLate ? 'pulse-soft' : ''}`}
    >
      {/* Top row: MESA grande (lo que el mozo busca) + estado + código pequeño */}
      <div className="flex items-start gap-3">
        {order.tableCode ? (
          <div className="flex flex-col leading-none">
            <span className="text-[10px] font-bold uppercase tracking-widest text-neutral-400">
              Mesa
            </span>
            <span className="tabnum mt-0.5 font-mono text-5xl font-extrabold tracking-wider text-brand-700">
              {order.tableCode}
            </span>
          </div>
        ) : (
          <div className="flex flex-col leading-none">
            <span className="text-[10px] font-bold uppercase tracking-widest text-neutral-400">
              Pedido
            </span>
            <span className="mt-0.5 flex items-center gap-1.5 text-2xl font-extrabold text-danger-700">
              <ShoppingBag className="h-5 w-5" />
              Para llevar
            </span>
          </div>
        )}

        <div className="flex flex-1 flex-col items-end gap-1.5">
          {isPaidNotKitchen ? (
            <span className="rounded-full bg-info-50 px-2.5 py-0.5 text-xs font-bold uppercase tracking-wide text-info-700">
              Esperando cocina
            </span>
          ) : isLate ? (
            <span className="rounded-full bg-success-50 px-2.5 py-0.5 text-xs font-bold uppercase tracking-wide text-success-700">
              Listo para llevar
            </span>
          ) : (
            <span className="flex items-center gap-1 rounded-full bg-warning-50 px-2.5 py-0.5 text-xs font-bold uppercase tracking-wide text-warning-700">
              <Flame className="h-3 w-3" />
              En cocina
            </span>
          )}
          <span className="tabnum font-mono text-xs font-semibold tracking-wider text-neutral-400">
            #{order.shortCode}
          </span>
        </div>
      </div>

      {/* Items */}
      <ul className="flex-1 space-y-1 text-sm text-neutral-700" aria-label="Ítems del pedido">
        {visibleItems.map((item, idx) => (
          <li key={idx} className="flex gap-2 truncate">
            <span className="tabnum font-mono font-bold text-brand-700">{item.quantity}×</span>
            <span className="truncate">
              {item.name}
              {item.withTupper ? ' (tupper)' : ''}
            </span>
          </li>
        ))}
        {extraCount > 0 && (
          <li className="text-neutral-400">+{extraCount} más</li>
        )}
      </ul>

      <p className="text-xs text-neutral-400">{elapsed}</p>

      {/* Entregado button — ≥64dp */}
      <button
        type="button"
        onClick={handleDeliver}
        disabled={delivering || isOffline}
        aria-label={`Marcar pedido ${order.shortCode} como entregado`}
        aria-disabled={delivering || isOffline}
        title={isOffline ? 'Sin conexión' : undefined}
        className="flex min-h-16 w-full items-center justify-center gap-2 rounded-xl bg-success-500 font-display text-lg font-bold text-white shadow-sm transition-all hover:bg-success-600 active:scale-95 disabled:cursor-not-allowed disabled:opacity-50"
        style={{ boxShadow: '0 3px 8px rgba(22,163,74,0.25)' }}
      >
        {delivering ? (
          '…'
        ) : (
          <>
            <Check className="h-5 w-5" />
            Entregado
          </>
        )}
      </button>
    </article>
  );
}
