'use client';

import { useCallback, useRef, useState } from 'react';

import { TableGrid } from '@/components/floor/table-grid';
import { joinTablesAction, splitGroupAction } from '@/server/actions/waiter';
import type { TableWithState } from '@/server/services/table';
import type { WaiterOrderView } from '@/server/services/waiter';

import { TableActionsSheet } from './table-actions-sheet';

interface FloorTabProps {
  tables: TableWithState[];
  orders: WaiterOrderView[];
  isOffline: boolean;
}

export function FloorTab({ tables, orders, isOffline }: FloorTabProps) {
  const [joinMode, setJoinMode] = useState(false);
  const [selectedTableIds, setSelectedTableIds] = useState<number[]>([]);
  const [sheetTableId, setSheetTableId] = useState<number | null>(null);
  const [joining, setJoining] = useState(false);
  const [toast, setToast] = useState<string | null>(null);

  const longPressTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const longPressTriggered = useRef(false);
  const longPressTableId = useRef<number | null>(null);

  const showToast = useCallback((msg: string) => {
    setToast(msg);
    setTimeout(() => setToast(null), 3500);
  }, []);

  const cancelLongPress = useCallback(() => {
    if (longPressTimer.current) {
      clearTimeout(longPressTimer.current);
      longPressTimer.current = null;
    }
  }, []);

  const enterJoinMode = useCallback((tableId: number) => {
    if ('vibrate' in navigator) navigator.vibrate([30, 20, 30]);
    setJoinMode(true);
    setSelectedTableIds([tableId]);
  }, []);

  const exitJoinMode = useCallback(() => {
    setJoinMode(false);
    setSelectedTableIds([]);
  }, []);

  const handleTableClick = useCallback(
    (tableId: number) => {
      if (longPressTriggered.current && longPressTableId.current === tableId) {
        longPressTriggered.current = false;
        longPressTableId.current = null;
        return;
      }
      if (joinMode) {
        setSelectedTableIds((prev) =>
          prev.includes(tableId) ? prev.filter((id) => id !== tableId) : [...prev, tableId],
        );
        return;
      }
      setSheetTableId(tableId);
    },
    [joinMode],
  );

  const handlePointerDown = useCallback(
    (e: React.PointerEvent<HTMLDivElement>) => {
      if (joinMode) return;
      const cell = (e.target as HTMLElement).closest<HTMLElement>('[data-table-id]');
      if (!cell) return;
      const tableId = Number(cell.dataset.tableId);
      if (isNaN(tableId)) return;

      longPressTableId.current = tableId;
      longPressTriggered.current = false;
      longPressTimer.current = setTimeout(() => {
        longPressTimer.current = null;
        longPressTriggered.current = true;
        enterJoinMode(tableId);
      }, 500);
    },
    [joinMode, enterJoinMode],
  );

  const handleJoin = useCallback(async () => {
    if (selectedTableIds.length < 2 || isOffline) return;
    setJoining(true);
    const result = await joinTablesAction({ tableIds: selectedTableIds });
    setJoining(false);
    if (result.ok) {
      exitJoinMode();
    } else {
      showToast(result.error.message);
    }
  }, [selectedTableIds, isOffline, exitJoinMode, showToast]);

  const handleSplitGroup = useCallback(
    async (groupId: number) => {
      const result = await splitGroupAction(groupId);
      if (!result.ok) {
        showToast(
          result.error.code === 'GROUP_HAS_ACTIVE_ORDER'
            ? 'No se puede separar: tiene pedido activo'
            : result.error.message,
        );
      }
    },
    [showToast],
  );

  const sheetTable = sheetTableId != null ? tables.find((t) => t.id === sheetTableId) ?? null : null;

  return (
    <div className="relative flex h-full flex-col">
      {joinMode && (
        <div className="sticky top-0 z-30 flex items-center justify-between bg-indigo-600 px-4 py-3 text-white shadow-md">
          <span className="text-sm font-medium">
            Modo unir — toca las mesas a unir
          </span>
          <div className="flex gap-2">
            {selectedTableIds.length >= 2 && (
              <button
                type="button"
                onClick={handleJoin}
                disabled={joining || isOffline}
                className="min-h-[48px] rounded-xl bg-white px-4 text-sm font-bold text-indigo-700 hover:bg-indigo-50 disabled:opacity-50"
              >
                {joining ? '…' : 'Unir mesas'}
              </button>
            )}
            <button
              type="button"
              onClick={exitJoinMode}
              className="min-h-[48px] rounded-xl bg-indigo-500 px-4 text-sm font-medium hover:bg-indigo-400"
            >
              Cancelar
            </button>
          </div>
        </div>
      )}

      <div
        className="flex-1 overflow-auto p-3"
        onPointerDown={handlePointerDown}
        onPointerUp={cancelLongPress}
        onPointerMove={cancelLongPress}
        onPointerCancel={cancelLongPress}
      >
        <TableGrid
          tables={tables}
          onTableClick={handleTableClick}
          selectedTableIds={joinMode ? selectedTableIds : []}
          selectableStates={
            joinMode
              ? ['free']
              : ['free', 'tentative', 'occupied', 'in_active_group']
          }
          variant="waiter"
          showCode
          showCapacity
        />
      </div>

      {sheetTable && (
        <TableActionsSheet
          table={sheetTable}
          orders={orders}
          isOffline={isOffline}
          onClose={() => setSheetTableId(null)}
          onEnterJoinMode={(tableId) => {
            setSheetTableId(null);
            enterJoinMode(tableId);
          }}
          onSplitGroup={handleSplitGroup}
        />
      )}

      {toast && (
        <div className="fixed bottom-20 left-1/2 z-50 -translate-x-1/2 rounded-xl bg-neutral-800 px-4 py-2.5 text-sm font-medium text-white shadow-lg">
          {toast}
        </div>
      )}
    </div>
  );
}
