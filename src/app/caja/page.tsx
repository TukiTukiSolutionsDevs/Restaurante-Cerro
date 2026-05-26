import { db } from '@/db/client';
import { requireRoleOrRedirect } from '@/lib/auth/guards';
import { CashierService } from '@/server/services/cashier';

import { CashierShell } from './_components/cashier-shell';

export const dynamic = 'force-dynamic';

export default async function CajaPage() {
  const session = await requireRoleOrRedirect(['cashier', 'admin']);
  const svc = new CashierService(db);

  const [pending, confirmed, summary] = await Promise.all([
    svc.listPendingToday(),
    svc.listRecentConfirmed(5),
    svc.dailySummary(),
  ]);

  return (
    <CashierShell
      initialPending={pending}
      initialConfirmed={confirmed}
      initialSummary={summary}
      displayName={session.displayName}
    />
  );
}
