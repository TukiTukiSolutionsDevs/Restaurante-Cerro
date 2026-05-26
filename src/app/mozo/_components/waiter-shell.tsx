'use client';

import { HandPlatter } from 'lucide-react';
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

export function WaiterShell({ initialOrders, initialTables }: WaiterShellProps) {
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
    <div className="flex h-dvh flex-col bg-neutral-50">
      {isOffline && (
        <div
          role="alert"
          className="sticky top-0 z-50 bg-warning-400 px-4 py-2 text-center text-sm font-medium text-warning-900"
        >
          Sin conexión — reconectando…
        </div>
      )}

      <Tabs activeTab={activeTab} onTabChange={setActiveTab} />

      <div
        id={`panel-${activeTab}`}
        role="tabpanel"
        className="flex-1 overflow-auto p-4 md:p-5"
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
            <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
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
      </div>

      {/* Toast stack */}
      <div className="fixed bottom-20 left-1/2 z-50 -translate-x-1/2 space-y-2 text-center">
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

      <form action={logoutAction} className="fixed bottom-3 right-3 z-40">
        <button
          type="submit"
          className="min-h-[48px] rounded-xl px-4 py-2 text-sm font-medium text-neutral-400 hover:bg-neutral-100 hover:text-neutral-600"
        >
          Cerrar sesión
        </button>
      </form>
    </div>
  );
}
