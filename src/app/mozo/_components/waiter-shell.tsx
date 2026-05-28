'use client';

import { HandPlatter, LogOut } from 'lucide-react';
import { useCallback, useState } from 'react';

import { useSse } from '@/lib/realtime/use-sse';
import { logoutAction, markDeliveredAction } from '@/server/actions/waiter';
import type { TableWithState } from '@/server/services/table';
import type { WaiterOrderView } from '@/server/services/waiter';

import { FloorTab } from './floor-tab';
import { OrderCard } from './order-card';
import { Tabs } from './tabs';

interface WaiterShellProps {
  initialOrders: WaiterOrderView[];
  initialTables: TableWithState[];
  staffName: string;
}

interface WaiterFloorSnapshot {
  activeOrders: WaiterOrderView[];
  tables: TableWithState[];
}

interface Toast {
  id: number;
  message: string;
  type: 'error' | 'success';
}

let nextToastId = 0;

function initials(name: string): string {
  const parts = name.trim().split(/\s+/);
  if (parts.length === 0 || !parts[0]) return '··';
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0]! + parts[parts.length - 1]![0]!).toUpperCase();
}

export function WaiterShell({ initialOrders, initialTables, staffName }: WaiterShellProps) {
  const [activeTab, setActiveTab] = useState<'orders' | 'tables'>('orders');
  const [orders, setOrders] = useState<WaiterOrderView[]>(initialOrders);
  const [tables, setTables] = useState<TableWithState[]>(initialTables);
  const [hiddenOrderIds, setHiddenOrderIds] = useState<Set<string>>(new Set());
  const [toasts, setToasts] = useState<Toast[]>([]);

  const showToast = useCallback((message: string, type: Toast['type'] = 'error') => {
    const id = ++nextToastId;
    setToasts((prev) => [...prev, { id, message, type }]);
    setTimeout(() => setToasts((prev) => prev.filter((t) => t.id !== id)), 4000);
  }, []);

  const { status } = useSse<WaiterFloorSnapshot, WaiterFloorSnapshot>({
    url: '/api/sse/waiter-floor',
    onSnapshot: (data) => {
      setOrders(data.activeOrders);
      setTables(data.tables);
    },
    onUpdate: (data) => {
      setOrders(data.activeOrders);
      setTables(data.tables);
    },
  });

  const isOffline = status === 'reconnecting';

  const handleDeliver = useCallback(
    async (orderId: string) => {
      setHiddenOrderIds((prev) => new Set(prev).add(orderId));
      const result = await markDeliveredAction(orderId);
      if (!result.ok) {
        setHiddenOrderIds((prev) => {
          const next = new Set(prev);
          next.delete(orderId);
          return next;
        });
        showToast(
          result.error.code === 'ALREADY_DELIVERED'
            ? 'Ya fue entregado por otro mozo'
            : result.error.message,
        );
      }
    },
    [showToast],
  );

  const visibleOrders = orders.filter((o) => !hiddenOrderIds.has(o.orderId));

  return (
    <div className="mx-auto flex h-dvh max-w-md flex-col bg-neutral-50">
      {isOffline && (
        <div
          role="alert"
          className="sticky top-0 z-50 bg-warning-400 px-4 py-2 text-center text-sm font-medium text-warning-900"
        >
          Sin conexión — reconectando…
        </div>
      )}

      {/* Mobile header: avatar + role + name + logout */}
      <header className="flex items-center justify-between gap-2 border-b border-neutral-200 bg-white px-4 py-3">
        <div className="flex items-center gap-3 min-w-0">
          <div
            aria-hidden="true"
            className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-full bg-brand-500 text-sm font-bold text-white"
          >
            {initials(staffName)}
          </div>
          <div className="min-w-0">
            <div className="text-[11px] font-semibold uppercase tracking-wider text-neutral-500">
              Mozo
            </div>
            <div className="truncate text-sm font-bold text-neutral-800">{staffName}</div>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <span
            className={[
              'flex items-center gap-1.5 rounded-full px-2 py-1 text-[11px] font-bold',
              isOffline
                ? 'bg-warning-50 text-warning-700'
                : 'bg-success-50 text-success-700',
            ].join(' ')}
          >
            <span
              className="conn-dot inline-block h-1.5 w-1.5 rounded-full"
              style={{ background: isOffline ? 'var(--warning-500)' : 'var(--success-500)' }}
            />
            {isOffline ? 'Sin conexión' : 'En línea'}
          </span>
          <form action={logoutAction}>
            <button
              type="submit"
              aria-label="Cerrar sesión"
              className="flex h-9 w-9 items-center justify-center rounded-full text-neutral-500 hover:bg-neutral-100 hover:text-neutral-700"
            >
              <LogOut size={18} />
            </button>
          </form>
        </div>
      </header>

      {/* Main panel */}
      <main
        id={`panel-${activeTab}`}
        role="tabpanel"
        className="flex-1 overflow-auto p-4"
      >
        {activeTab === 'orders' ? (
          visibleOrders.length === 0 ? (
            <div className="flex h-full flex-col items-center justify-center gap-3 text-neutral-400">
              <HandPlatter className="h-20 w-20 text-neutral-300" />
              <p className="font-display text-xl font-bold text-neutral-500">
                No hay pedidos activos
              </p>
              <p className="text-sm">Tómate un respiro.</p>
            </div>
          ) : (
            <div className="flex flex-col gap-4">
              {visibleOrders.map((o) => (
                <OrderCard
                  key={o.orderId}
                  order={o}
                  isOffline={isOffline}
                  onDeliver={handleDeliver}
                />
              ))}
            </div>
          )
        ) : (
          <FloorTab tables={tables} orders={orders} isOffline={isOffline} />
        )}
      </main>

      {/* Toast stack */}
      <div className="fixed bottom-24 left-1/2 z-50 -translate-x-1/2 space-y-2 text-center">
        {toasts.map((t) => (
          <div
            key={t.id}
            role="status"
            aria-live="polite"
            className="slide-up rounded-xl px-5 py-3 text-sm font-semibold text-white shadow-lg"
            style={{ background: t.type === 'error' ? 'var(--danger-500)' : 'var(--success-500)' }}
          >
            {t.message}
          </div>
        ))}
      </div>

      {/* Bottom nav */}
      <Tabs
        activeTab={activeTab}
        onTabChange={setActiveTab}
        activeOrdersCount={visibleOrders.length}
      />
    </div>
  );
}
