// Node runtime required: argon2 uses native bindings (not Edge-compatible).
export const runtime = 'nodejs';

import { and, eq } from 'drizzle-orm';
import { z } from 'zod';

import { db } from '@/db/client';
import { auditLog, staffUser } from '@/db/schema';
import { nextCookies } from '@/lib/auth/next-adapter';
import { verifyPin } from '@/lib/auth/pin';
import { getDefaultLoginLimiter } from '@/lib/auth/rate-limit';
import { setStaffSession } from '@/lib/auth/session';
import type { StaffRole } from '@/lib/auth/session.types';

const bodySchema = z.object({
  role: z.enum(['cashier', 'waiter', 'admin']),
  pin: z.string().min(1),
});

const redirectByRole: Record<StaffRole, string> = {
  cashier: '/caja',
  waiter: '/mozo',
  admin: '/admin',
};

function extractIp(req: Request): string {
  return (
    req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ??
    req.headers.get('x-real-ip') ??
    'unknown'
  );
}

export async function POST(req: Request): Promise<Response> {
  const limiter = getDefaultLoginLimiter();

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return Response.json({ error: 'invalid_body' }, { status: 400 });
  }

  const parsed = bodySchema.safeParse(body);
  if (!parsed.success) {
    return Response.json(
      { error: 'invalid_body', issues: parsed.error.issues },
      { status: 400 },
    );
  }

  const { role, pin } = parsed.data;
  const ip = extractIp(req);
  const ua = req.headers.get('user-agent') ?? '';
  const key = `${ip}:${role}`;

  const limitCheck = limiter.check(key);
  if (!limitCheck.allowed) {
    const retryAfterSec = Math.ceil(limitCheck.retryAfterMs / 1000);
    return Response.json(
      { error: 'rate_limited', retryAfterMs: limitCheck.retryAfterMs },
      {
        status: 429,
        headers: { 'Retry-After': String(retryAfterSec) },
      },
    );
  }

  const candidates = await db
    .select()
    .from(staffUser)
    .where(and(eq(staffUser.role, role), eq(staffUser.isActive, true)));

  let matched: (typeof candidates)[number] | undefined;
  for (const user of candidates) {
    if (await verifyPin(pin, user.pinHash)) {
      matched = user;
      break;
    }
  }

  if (matched) {
    limiter.reset(key);

    const cookies = await nextCookies();
    const now = Date.now();
    await setStaffSession(cookies, {
      staffUserId: matched.id,
      role: matched.role as StaffRole,
      displayName: matched.displayName,
      loggedInAt: now,
      lastSeenAt: now,
    });

    await db.insert(auditLog).values({
      actorType: 'staff',
      actorId: matched.id,
      action: 'login',
      entity: 'staff_session',
      entityId: String(matched.id),
      payload: { ip, ua },
    });

    return Response.json({
      ok: true,
      role: matched.role,
      displayName: matched.displayName,
      redirectTo: redirectByRole[matched.role as StaffRole],
    });
  }

  const hitResult = limiter.hit(key);

  await db.insert(auditLog).values({
    actorType: 'system',
    action: 'login_failed',
    entity: 'staff_login',
    entityId: role,
    payload: { ip, role, ua },
  });

  return Response.json(
    { error: 'invalid_credentials', remaining: hitResult.remaining },
    { status: 401 },
  );
}
