import { db } from '@/db/client';
import { requireRoleOrRedirect } from '@/lib/auth/guards';
import { StaffService } from '@/server/services/staff';

import { StaffCreateDialog } from './_components/staff-create-dialog';
import { StaffTable } from './_components/staff-table';

export default async function StaffPage() {
  const session = await requireRoleOrRedirect(['admin']);
  const svc = new StaffService(db);
  const staff = await svc.list();

  return (
    <main className="mx-auto max-w-5xl px-6 py-8">
      <div className="mb-6 flex items-center justify-between">
        <h1 className="font-display text-2xl font-bold text-neutral-800">Personal</h1>
        <StaffCreateDialog />
      </div>
      <div className="rounded-xl border border-neutral-200 bg-white">
        <StaffTable staff={staff} currentUserId={session.staffUserId} />
      </div>
    </main>
  );
}
