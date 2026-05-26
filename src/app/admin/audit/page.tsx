import { db } from '@/db/client';
import { requireRoleOrRedirect } from '@/lib/auth/guards';
import { type AuditActorType, AuditService } from '@/server/services/audit';

import { AuditTable } from './_components/audit-table';
import { AuditFilters } from './_components/filters';

const PAGE_SIZE = 20;

interface Props {
  searchParams: Promise<{
    from?: string;
    to?: string;
    actorType?: string;
    action?: string;
    page?: string;
  }>;
}

export default async function AuditPage({ searchParams }: Props) {
  await requireRoleOrRedirect(['admin']);

  const params = await searchParams;
  const page   = Math.max(1, Number(params.page ?? 1));
  const offset = (page - 1) * PAGE_SIZE;

  const validActorTypes: AuditActorType[] = ['staff', 'system', 'device'];
  const actorType = validActorTypes.includes(params.actorType as AuditActorType)
    ? (params.actorType as AuditActorType)
    : undefined;

  const svc = new AuditService(db);
  const { rows, total } = await svc.list({
    from:      params.from  ? new Date(params.from  + 'T00:00:00.000Z') : undefined,
    to:        params.to    ? new Date(params.to    + 'T23:59:59.999Z') : undefined,
    actorType,
    action:    params.action || undefined,
    limit:     PAGE_SIZE,
    offset,
  });

  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  return (
    <main className="mx-auto max-w-6xl px-6 py-8">
      <h1 className="mb-6 font-display text-2xl font-bold text-neutral-800">Auditoría</h1>

      {/* Filters card */}
      <div className="mb-4 rounded-xl border border-neutral-200 bg-white p-4">
        <AuditFilters params={params} />
      </div>

      {/* Table */}
      <div className="rounded-xl border border-neutral-200 bg-white">
        <AuditTable rows={rows} />
      </div>

      {/* Pagination */}
      <div className="mt-4 flex items-center justify-between text-sm text-neutral-500">
        <span>
          {total === 0
            ? 'Sin resultados'
            : `${offset + 1}–${Math.min(offset + PAGE_SIZE, total)} de ${total}`}
        </span>
        <div className="flex gap-2">
          {page > 1 && (
            <a
              href={`?${new URLSearchParams({ ...params, page: String(page - 1) })}`}
              className="rounded-xl border border-neutral-200 bg-white px-3 py-1.5 font-medium hover:bg-neutral-50"
            >
              ← Anterior
            </a>
          )}
          {page < totalPages && (
            <a
              href={`?${new URLSearchParams({ ...params, page: String(page + 1) })}`}
              className="rounded-xl border border-neutral-200 bg-white px-3 py-1.5 font-medium hover:bg-neutral-50"
            >
              Siguiente →
            </a>
          )}
        </div>
      </div>
    </main>
  );
}
