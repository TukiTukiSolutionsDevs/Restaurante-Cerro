'use client';

import { useCallback, useState, useTransition } from 'react';

import { TableGrid } from '@/components/floor/table-grid';
import { useSse } from '@/lib/realtime/use-sse';
import {
  activateTableAction,
  bulkCreateTablesAction,
  createTableAction,
  deactivateTableAction,
  patchTableAction,
  releaseTableAction,
} from '@/server/actions/table-actions';
import type { TableState, TableWithState } from '@/server/services/table';

interface Props {
  initialTables: TableWithState[];
  actorId: number;
}

const EMPTY_FORM = { code: '', capacity: 1, positionX: 0, positionY: 0 };

export function AdminTablesClient({ initialTables, actorId }: Props) {
  const [tables, setTables] = useState<TableWithState[]>(initialTables);
  const [isPending, startTransition] = useTransition();

  // Dialog state
  const [createOpen, setCreateOpen] = useState(false);
  const [editTable, setEditTable] = useState<TableWithState | null>(null);
  const [releaseReason, setReleaseReason] = useState('');
  const [releaseOpen, setReleaseOpen] = useState(false);
  const [releaseTarget, setReleaseTarget] = useState<number | null>(null);
  const [form, setForm] = useState(EMPTY_FORM);
  const [toast, setToast] = useState<string | null>(null);

  // Live updates from SSE
  useSse<TableWithState[], TableWithState[]>({
    url: '/api/sse/floor',
    onSnapshot: (data) => setTables(data),
    onUpdate: (data) => setTables(data),
    onReconnect: () => {
      // Full snapshot arrives after reconnect
    },
  });

  function showToast(msg: string) {
    setToast(msg);
    setTimeout(() => setToast(null), 4000);
  }

  const handleCreate = useCallback(() => {
    startTransition(async () => {
      const res = await createTableAction(
        { code: form.code.toUpperCase(), capacity: form.capacity, positionX: form.positionX, positionY: form.positionY },
        actorId,
      );
      if (res.ok) {
        setCreateOpen(false);
        setForm(EMPTY_FORM);
        showToast('Mesa creada.');
      } else {
        showToast(res.error.message);
      }
    });
  }, [form, actorId]);

  const handlePatch = useCallback(() => {
    if (!editTable) return;
    startTransition(async () => {
      const res = await patchTableAction(
        editTable.id,
        { code: form.code.toUpperCase(), capacity: form.capacity, positionX: form.positionX, positionY: form.positionY },
        actorId,
      );
      if (res.ok) {
        setEditTable(null);
        showToast('Mesa actualizada.');
      } else {
        showToast(res.error.message);
      }
    });
  }, [editTable, form, actorId]);

  const handleDeactivate = useCallback((tableId: number) => {
    startTransition(async () => {
      const res = await deactivateTableAction(tableId, actorId);
      if (res.ok) {
        setEditTable(null);
        if (res.data.hasActiveOrder) {
          showToast('Mesa desactivada. Mesa tiene un pedido activo — permanecerá visible hasta que el pedido cierre.');
        } else {
          showToast('Mesa desactivada.');
        }
      } else {
        showToast(res.error.message);
      }
    });
  }, [actorId]);

  const handleActivate = useCallback((tableId: number) => {
    startTransition(async () => {
      const res = await activateTableAction(tableId, actorId);
      if (res.ok) {
        setEditTable(null);
        showToast('Mesa activada.');
      } else {
        showToast(res.error.message);
      }
    });
  }, [actorId]);

  const handleRelease = useCallback(() => {
    if (releaseTarget === null) return;
    startTransition(async () => {
      const res = await releaseTableAction(releaseTarget, actorId, releaseReason);
      if (res.ok) {
        setReleaseOpen(false);
        setReleaseTarget(null);
        setReleaseReason('');
        setEditTable(null);
        showToast('Mesa liberada.');
      } else {
        showToast(res.error.message);
      }
    });
  }, [releaseTarget, releaseReason, actorId]);

  const handleBulkCreate = useCallback(() => {
    if (!confirm('¿Crear 30 mesas M01–M30 en grilla 5×6? Las mesas existentes serán omitidas.')) return;
    startTransition(async () => {
      const res = await bulkCreateTablesAction(actorId);
      if (res.ok) {
        showToast(`${res.data.count} mesas creadas.`);
      } else {
        showToast(res.error.message);
      }
    });
  }, [actorId]);

  const openEdit = (table: TableWithState) => {
    setEditTable(table);
    setForm({ code: table.code, capacity: table.capacity, positionX: table.positionX, positionY: table.positionY });
  };

  const openRelease = (tableId: number) => {
    setReleaseTarget(tableId);
    setReleaseReason('');
    setReleaseOpen(true);
  };

  const selectableStates: TableState[] = ['free', 'tentative', 'occupied', 'in_active_group', 'inactive'];

  return (
    <div className="space-y-6">
      {/* Toolbar */}
      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          onClick={() => { setCreateOpen(true); setForm(EMPTY_FORM); }}
          className="rounded bg-blue-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-60"
          disabled={isPending}
        >
          Crear mesa
        </button>
        <button
          type="button"
          onClick={handleBulkCreate}
          className="rounded border border-slate-300 bg-white px-3 py-1.5 text-sm font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-60"
          disabled={isPending}
        >
          Crear M01–M30 en grilla 5×6
        </button>
      </div>

      {/* Grid */}
      <div className="overflow-x-auto">
        <TableGrid
          tables={tables}
          variant="admin"
          selectableStates={selectableStates}
          onTableClick={(id) => {
            const t = tables.find((t) => t.id === id);
            if (t) openEdit(t);
          }}
        />
      </div>

      {/* Legend */}
      <div className="flex flex-wrap gap-3 text-xs">
        {([['free', 'Libre'], ['tentative', 'Reservada'], ['occupied', 'Ocupada'], ['in_active_group', 'En grupo'], ['inactive', 'Desactivada']] as [TableState, string][]).map(([state, label]) => (
          <span key={state} className="flex items-center gap-1">
            <span className={`inline-block h-3 w-3 rounded-sm ${state === 'free' ? 'bg-green-500' : state === 'tentative' ? 'bg-amber-400' : state === 'occupied' ? 'bg-red-500' : state === 'in_active_group' ? 'bg-indigo-400' : 'bg-slate-300'}`} />
            {label}
          </span>
        ))}
      </div>

      {/* Toast */}
      {toast && (
        <div className="fixed bottom-4 right-4 z-50 max-w-xs rounded-lg bg-slate-800 px-4 py-2 text-sm text-white shadow-lg">
          {toast}
        </div>
      )}

      {/* Create dialog */}
      {createOpen && (
        <Dialog title="Crear mesa" onClose={() => setCreateOpen(false)}>
          <TableForm form={form} onChange={setForm} />
          <DialogFooter>
            <button type="button" onClick={() => setCreateOpen(false)} className="btn-secondary">Cancelar</button>
            <button type="button" onClick={handleCreate} disabled={isPending} className="btn-primary">
              {isPending ? 'Creando…' : 'Crear mesa'}
            </button>
          </DialogFooter>
        </Dialog>
      )}

      {/* Edit sheet */}
      {editTable && (
        <Dialog title={`Editar mesa ${editTable.code}`} onClose={() => setEditTable(null)}>
          <TableForm form={form} onChange={setForm} />
          <div className="mt-4 flex flex-wrap gap-2">
            {editTable.isActive ? (
              <button type="button" onClick={() => handleDeactivate(editTable.id)} disabled={isPending} className="btn-danger">
                Desactivar
              </button>
            ) : (
              <button type="button" onClick={() => handleActivate(editTable.id)} disabled={isPending} className="btn-secondary">
                Activar
              </button>
            )}
            {(editTable.state === 'occupied' || editTable.state === 'tentative') && (
              <button
                type="button"
                onClick={() => openRelease(editTable.id)}
                disabled={isPending}
                className="btn-danger"
              >
                Liberar mesa (con razón)
              </button>
            )}
          </div>
          <DialogFooter>
            <button type="button" onClick={() => setEditTable(null)} className="btn-secondary">Cancelar</button>
            <button type="button" onClick={handlePatch} disabled={isPending} className="btn-primary">
              {isPending ? 'Guardando…' : 'Guardar'}
            </button>
          </DialogFooter>
        </Dialog>
      )}

      {/* Release dialog */}
      {releaseOpen && (
        <Dialog title="Liberar mesa" onClose={() => setReleaseOpen(false)}>
          <p className="text-sm text-slate-600">
            ¿Seguro que deseas liberar esta mesa? El pedido asociado no será cancelado.
          </p>
          <label className="mt-3 block text-sm font-medium text-slate-700">
            Motivo <span className="text-slate-400">(mín. 5 caracteres)</span>
          </label>
          <input
            type="text"
            className="mt-1 w-full rounded border border-slate-300 px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            value={releaseReason}
            onChange={(e) => setReleaseReason(e.target.value)}
            placeholder="Escribe el motivo…"
          />
          <DialogFooter>
            <button type="button" onClick={() => setReleaseOpen(false)} className="btn-secondary">Cancelar</button>
            <button
              type="button"
              onClick={handleRelease}
              disabled={isPending || releaseReason.length < 5}
              className="btn-danger"
            >
              {isPending ? 'Liberando…' : 'Liberar mesa'}
            </button>
          </DialogFooter>
        </Dialog>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Local sub-components (no shadcn dependency to keep Phase 6 self-contained)
// ---------------------------------------------------------------------------

function Dialog({ title, children, onClose }: { title: string; children: React.ReactNode; onClose: () => void }) {
  return (
    <div className="fixed inset-0 z-40 flex items-center justify-center bg-black/40" onClick={onClose}>
      <div
        className="relative w-full max-w-md rounded-xl bg-white p-6 shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <h2 className="mb-4 text-base font-semibold text-slate-800">{title}</h2>
        {children}
      </div>
    </div>
  );
}

function DialogFooter({ children }: { children: React.ReactNode }) {
  return <div className="mt-5 flex justify-end gap-2">{children}</div>;
}

function TableForm({
  form,
  onChange,
}: {
  form: { code: string; capacity: number; positionX: number; positionY: number };
  onChange: (f: typeof form) => void;
}) {
  return (
    <div className="space-y-3">
      <Field label="Código (ej: M01, S5, BAR1)">
        <input
          type="text"
          className="input"
          value={form.code}
          onChange={(e) => onChange({ ...form, code: e.target.value.toUpperCase() })}
          placeholder="M01"
          maxLength={6}
        />
      </Field>
      <Field label="Capacidad">
        <input
          type="number"
          className="input"
          min={1}
          value={form.capacity}
          onChange={(e) => onChange({ ...form, capacity: Math.max(1, Number(e.target.value)) })}
        />
      </Field>
      <div className="flex gap-3">
        <Field label="Pos. X (columna)">
          <input
            type="number"
            className="input"
            min={0}
            max={9}
            value={form.positionX}
            onChange={(e) => onChange({ ...form, positionX: Number(e.target.value) })}
          />
        </Field>
        <Field label="Pos. Y (fila)">
          <input
            type="number"
            className="input"
            min={0}
            max={9}
            value={form.positionY}
            onChange={(e) => onChange({ ...form, positionY: Number(e.target.value) })}
          />
        </Field>
      </div>
      {/* Drag-and-drop de reposicionamiento diferido a post-MVP */}
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block text-sm font-medium text-slate-700">
      {label}
      <div className="mt-1">{children}</div>
    </label>
  );
}
