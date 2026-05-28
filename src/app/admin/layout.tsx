import type { ReactNode } from 'react';

import { requireRoleOrRedirect } from '@/lib/auth/guards';

import { AdminShell } from './_components/admin-shell';

export default async function AdminLayout({ children }: { children: ReactNode }) {
  const session = await requireRoleOrRedirect(['admin']);

  return <AdminShell displayName={session.displayName}>{children}</AdminShell>;
}
