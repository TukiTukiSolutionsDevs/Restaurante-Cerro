import { db } from '@/db/client';
import { requireRoleOrRedirect } from '@/lib/auth/guards';
import { TableService } from '@/server/services/table';

import { AdminTablesClient } from './_components/admin-tables-client';

export const dynamic = 'force-dynamic';

export default async function AdminTablesPage() {
  const session = await requireRoleOrRedirect(['admin']);

  const service = new TableService(db);
  const tables = await service.listAllWithDerivedState();

  return (
    <div className="px-4 py-5">
      <div className="mb-6 flex items-center justify-between">
        <h1 className="font-display text-2xl font-bold text-neutral-800">
          Mesas del restaurante
        </h1>
        <span className="tabnum rounded-full bg-neutral-100 px-3 py-1 text-sm font-semibold text-neutral-600">
          {tables.length} mesas
        </span>
      </div>

      <AdminTablesClient
        initialTables={tables}
        actorId={session.staffUserId}
      />
    </div>
  );
}
