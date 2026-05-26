export const runtime = 'nodejs';

import { db } from '@/db/client';
import { auditLog } from '@/db/schema';
import { nextCookies } from '@/lib/auth/next-adapter';
import { destroyStaffSession, getStaffSession } from '@/lib/auth/session';

export async function POST(): Promise<Response> {
  const cookies = await nextCookies();
  const session = await getStaffSession(cookies);

  if (session) {
    await db.insert(auditLog).values({
      actorType: 'staff',
      actorId: session.staffUserId,
      action: 'logout',
      entity: 'staff_session',
      entityId: String(session.staffUserId),
      payload: {},
    });
  }

  await destroyStaffSession(cookies);

  return Response.json({ ok: true });
}
