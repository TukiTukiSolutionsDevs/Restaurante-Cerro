import { redirect } from 'next/navigation';

import { nextCookies } from './next-adapter';
import { requireRole } from './session';
import type { StaffRole, StaffSessionData } from './session.types';

/**
 * Server Component guard. Calls requireRole; on failure redirects to /login.
 * Usage: const session = await requireRoleOrRedirect(['cashier', 'admin']);
 */
export async function requireRoleOrRedirect(
  allowed: StaffRole[],
): Promise<StaffSessionData> {
  const cookies = await nextCookies();
  const result = await requireRole(cookies, allowed);

  if (!result.ok) {
    const role = allowed[0] ?? 'cashier';
    redirect(`/login?role=${role}`);
  }

  return result.session;
}
