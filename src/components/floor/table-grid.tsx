'use client';

import type { TableState, TableWithState } from '@/server/services/table';

export interface TableGridProps {
  tables: TableWithState[];
  onTableClick?: (tableId: number) => void;
  selectableStates?: TableState[];
  selectedTableIds?: number[];
  showCode?: boolean;
  showCapacity?: boolean;
  variant: 'admin' | 'waiter' | 'customer';
}

const STATE_COLORS: Record<TableState, string> = {
  free:           'bg-success-50 border-success-500 text-success-700',
  tentative:      'bg-warning-50 border-warning-500 text-warning-700',
  occupied:       'bg-danger-50 border-danger-500 text-danger-700',
  in_active_group:'bg-info-50 border-info-500 text-info-700',
  inactive:       'bg-neutral-100 border-neutral-300 text-neutral-400',
};

const STATE_LABELS: Record<TableState, string> = {
  free:           'Libre',
  tentative:      'Reservada',
  occupied:       'Ocupada',
  in_active_group:'En grupo',
  inactive:       'Desactivada',
};

function gridSize(tables: TableWithState[]): { cols: number; rows: number } {
  let maxX = 0;
  let maxY = 0;
  for (const t of tables) {
    if (t.positionX > maxX) maxX = t.positionX;
    if (t.positionY > maxY) maxY = t.positionY;
  }
  return { cols: maxX + 1, rows: maxY + 1 };
}

function TableCell({
  table,
  selectable,
  selected,
  showCode,
  showCapacity,
  onClick,
}: {
  table: TableWithState;
  selectable: boolean;
  selected: boolean;
  showCode: boolean;
  showCapacity: boolean;
  onClick?: () => void;
}) {
  const colorClass = STATE_COLORS[table.state];
  const label = STATE_LABELS[table.state];

  return (
    <button
      type="button"
      aria-label={`Mesa ${table.code} — ${label}`}
      aria-pressed={selected}
      disabled={!selectable}
      onClick={selectable ? onClick : undefined}
      data-table-id={table.id}
      className={[
        'flex flex-col items-center justify-center rounded-xl border-2 p-1 text-xs font-semibold transition-all',
        colorClass,
        selectable
          ? 'cursor-pointer hover:opacity-90 active:scale-95'
          : 'cursor-default opacity-70',
        selected ? 'ring-2 ring-brand-500 ring-offset-1 scale-105' : '',
        !table.isActive ? 'line-through' : '',
      ]
        .filter(Boolean)
        .join(' ')}
    >
      {showCode && <span>{table.code}</span>}
      {showCapacity && (
        <span className="text-[10px] opacity-70">{table.capacity}p</span>
      )}
    </button>
  );
}

export function TableGrid({
  tables,
  onTableClick,
  selectableStates,
  selectedTableIds = [],
  showCode = true,
  showCapacity = true,
  variant,
}: TableGridProps) {
  const { cols, rows } = gridSize(tables);

  const byPos = new Map<string, TableWithState>();
  for (const t of tables) {
    byPos.set(`${t.positionX},${t.positionY}`, t);
  }

  const defaultSelectableStates: TableState[] =
    variant === 'customer' ? ['free'] : ['free', 'tentative', 'occupied', 'in_active_group'];

  const selectable = selectableStates ?? defaultSelectableStates;

  return (
    <div
      role="grid"
      aria-label="Mapa de sala"
      className="inline-grid gap-1.5"
      style={{
        gridTemplateColumns: `repeat(${Math.max(cols, 1)}, minmax(52px, 1fr))`,
        gridTemplateRows: `repeat(${Math.max(rows, 1)}, 52px)`,
      }}
    >
      {Array.from({ length: rows }, (_, y) =>
        Array.from({ length: cols }, (_, x) => {
          const table = byPos.get(`${x},${y}`);
          if (!table) {
            return (
              <div
                key={`empty-${x}-${y}`}
                className="rounded-xl border border-dashed border-neutral-200 bg-neutral-50"
                aria-hidden="true"
              />
            );
          }
          const isSelectable = selectable.includes(table.state);
          const isSelected = selectedTableIds.includes(table.id);
          return (
            <TableCell
              key={table.id}
              table={table}
              selectable={isSelectable}
              selected={isSelected}
              showCode={showCode}
              showCapacity={showCapacity}
              onClick={() => onTableClick?.(table.id)}
            />
          );
        }),
      )}
    </div>
  );
}
