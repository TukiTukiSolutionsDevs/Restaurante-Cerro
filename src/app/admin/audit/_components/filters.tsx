interface Params {
  from?: string;
  to?: string;
  actorType?: string;
  action?: string;
}

interface Props {
  params: Params;
}

export function AuditFilters({ params }: Props) {
  return (
    <form method="GET" className="flex flex-wrap items-end gap-3 rounded-lg border bg-white p-4 shadow-sm">
      <div className="flex flex-col gap-1">
        <label htmlFor="filter-from" className="text-xs font-medium text-gray-600">
          Desde
        </label>
        <input
          id="filter-from"
          name="from"
          type="date"
          defaultValue={params.from ?? ''}
          className="rounded-md border px-3 py-1.5 text-sm"
        />
      </div>

      <div className="flex flex-col gap-1">
        <label htmlFor="filter-to" className="text-xs font-medium text-gray-600">
          Hasta
        </label>
        <input
          id="filter-to"
          name="to"
          type="date"
          defaultValue={params.to ?? ''}
          className="rounded-md border px-3 py-1.5 text-sm"
        />
      </div>

      <div className="flex flex-col gap-1">
        <label htmlFor="filter-actor" className="text-xs font-medium text-gray-600">
          Tipo de actor
        </label>
        <select
          id="filter-actor"
          name="actorType"
          defaultValue={params.actorType ?? ''}
          className="rounded-md border px-3 py-1.5 text-sm"
        >
          <option value="">Todos</option>
          <option value="staff">Personal</option>
          <option value="system">Sistema</option>
          <option value="device">Dispositivo</option>
        </select>
      </div>

      <div className="flex flex-col gap-1">
        <label htmlFor="filter-action" className="text-xs font-medium text-gray-600">
          Acción (prefijo)
        </label>
        <input
          id="filter-action"
          name="action"
          type="text"
          defaultValue={params.action ?? ''}
          placeholder="staff.create…"
          className="rounded-md border px-3 py-1.5 text-sm"
        />
      </div>

      <button
        type="submit"
        className="rounded-md bg-primary px-4 py-1.5 text-sm font-medium text-primary-foreground hover:bg-primary/90"
      >
        Filtrar
      </button>

      <a
        href="/admin/audit"
        className="rounded-md border px-4 py-1.5 text-sm font-medium hover:bg-gray-100"
      >
        Limpiar
      </a>
    </form>
  );
}
