import { db } from '@/db/client';
import { requireRoleOrRedirect } from '@/lib/auth/guards';
import { TableService } from '@/server/services/table';
import { WaiterService } from '@/server/services/waiter';

import { WaiterShell } from './_components/waiter-shell';

export const dynamic = 'force-dynamic';

export default async function MozoPage() {
  const session = await requireRoleOrRedirect(['waiter', 'admin']);

  const [initialOrders, initialTables] = await Promise.all([
    new WaiterService(db).listActive(),
    new TableService(db).listAllWithDerivedState(),
  ]);

  return (
    <WaiterShell
      initialOrders={initialOrders}
      initialTables={initialTables}
      staffName={session.displayName}
    />
  );
}
