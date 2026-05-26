'use client';

import { X } from 'lucide-react';
import { useState } from 'react';

import { releaseTableAction } from '@/server/actions/waiter';
import type { TableWithState } from '@/server/services/table';
import type { WaiterOrderView } from '@/server/services/waiter';

interface TableActionsSheetProps {
  table: TableWithState;
  orders: WaiterOrderView[];
  isOffline: boolean;
  onClose: () => void;
  onEnterJoinMode: (tableId: number) => void;
  onSplitGroup: (groupId: number) => Promise<void>;
}

export function TableActionsSheet({
  table,
  orders,
  isOffline,
  onClose,
  onEnterJoinMode,
  onSplitGroup,
}: TableActionsSheetProps) {
  const [confirmRelease, setConfirmRelease] = useState(false);
  const [releasing, setReleasing] = useState(false);
  const [splitting, setSplitting] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const activeOrder = orders.find(
    (o) => o.tableGroupId != null && o.tableGroupId === table.activeGroupId,
  ) ?? null;

  const handleRelease = async () => {
    if (releasing || isOffline) return;
    setReleasing(true);
    setErrorMsg(null);
    const result = await releaseTableAction(table.id);
    setReleasing(false);
    if (result.ok) {
      onClose();
    } else {
      setErrorMsg(result.error.message);
      setConfirmRelease(false);
    }
  };

  const handleSplit = async () => {
    if (!table.activeGroupId || splitting || isOffline) return;
    setSplitting(true);
    await onSplitGroup(table.activeGroupId);
    setSplitting(false);
    onClose();
  };

  const tableStateLabel: Record<string, string> = {
    free:           'Mesa libre',
    occupied:       'Mesa ocupada',
    tentative:      'Esperando pago',
    in_active_group:'En grupo',
    inactive:       'Desactivada',
  };

  return (
    <>
      <div
        className="fixed inset-0 z-40 bg-black/40"
        aria-hidden="true"
        onClick={onClose}
      />
      <div
        role="dialog"
        aria-label={`Acciones mesa ${table.code}`}
        className="fixed inset-x-0 bottom-0 z-50 rounded-t-2xl bg-white p-6 shadow-2xl"
      >
        <div className="mb-5 flex items-center justify-between">
          <div>
            <h2 className="font-display text-2xl font-bold text-neutral-800">
              Mesa {table.code}
            </h2>
            <p className="text-sm text-neutral-500">
              {tableStateLabel[table.state] ?? table.state}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Cerrar"
            className="flex min-h-[48px] min-w-[48px] items-center justify-center rounded-full text-neutral-400 hover:bg-neutral-100 hover:text-neutral-600"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {errorMsg && (
          <p className="mb-4 rounded-xl bg-danger-50 px-4 py-2.5 text-sm text-danger-700">
            {errorMsg}
          </p>
        )}

        <div className="flex flex-col gap-3">
          {table.state === 'free' && (
            <button
              type="button"
              onClick={() => { onClose(); onEnterJoinMode(table.id); }}
              className="min-h-[48px] w-full rounded-xl bg-indigo-600 px-4 py-3 text-base font-semibold text-white hover:bg-indigo-700"
            >
              Unir mesas
            </button>
          )}

          {table.state === 'in_active_group' && table.activeGroupId != null && (
            <button
              type="button"
              onClick={handleSplit}
              disabled={splitting || isOffline || activeOrder != null}
              title={activeOrder != null ? 'No se puede separar: tiene pedido activo' : undefined}
              className="min-h-[48px] w-full rounded-xl bg-brand-600 px-4 py-3 text-base font-semibold text-white hover:bg-brand-700 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {splitting ? '…' : 'Separar grupo'}
            </button>
          )}

          {activeOrder != null && (
            <div className="rounded-xl border border-neutral-200 p-4">
              <p className="mb-1 text-xs font-semibold uppercase tracking-widest text-neutral-500">
                Pedido activo
              </p>
              <p className="tabnum font-mono text-2xl font-bold text-neutral-800">
                {activeOrder.shortCode}
              </p>
              <ul className="mt-2 space-y-0.5 text-sm text-neutral-600">
                {activeOrder.items.slice(0, 3).map((item, idx) => (
                  <li key={idx} className="truncate">
                    {item.quantity}× {item.name}
                  </li>
                ))}
                {activeOrder.items.length > 3 && (
                  <li className="text-neutral-400">+{activeOrder.items.length - 3} más</li>
                )}
              </ul>
            </div>
          )}

          {(table.state === 'occupied' || table.state === 'tentative') && (
            <>
              {!confirmRelease ? (
                <button
                  type="button"
                  onClick={() => setConfirmRelease(true)}
                  disabled={isOffline}
                  className="min-h-[48px] w-full rounded-xl bg-danger-600 px-4 py-3 text-base font-semibold text-white hover:bg-danger-700 disabled:opacity-50"
                >
                  Liberar mesa
                </button>
              ) : (
                <div className="rounded-xl border border-danger-200 bg-danger-50 p-4">
                  <p className="mb-3 text-sm text-danger-800">
                    ¿Seguro? Esto no cobra el pedido si hay uno activo.
                  </p>
                  <div className="flex gap-2">
                    <button
                      type="button"
                      onClick={() => setConfirmRelease(false)}
                      className="min-h-[48px] flex-1 rounded-xl border border-neutral-300 bg-white px-3 text-sm font-semibold text-neutral-700"
                    >
                      Cancelar
                    </button>
                    <button
                      type="button"
                      onClick={handleRelease}
                      disabled={releasing}
                      className="min-h-[48px] flex-1 rounded-xl bg-danger-600 px-3 text-sm font-bold text-white disabled:opacity-50"
                    >
                      {releasing ? '…' : 'Liberar'}
                    </button>
                  </div>
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </>
  );
}
