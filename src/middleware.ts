/*
 * Route-level auth guard for staff areas.
 *
 * MVP lightweight strategy:
 *   Checks only for cookie *presence* (Edge-compatible: no argon2, no iron-session unseal).
 *   Redirects to /login?role=X&redirect=Y when the session cookie is absent.
 *   Full role validation (iron-session unseal + role check) happens in Server Components
 *   via requireRoleOrRedirect() in src/lib/auth/guards.ts. This means a request with
 *   the wrong role's cookie reaches the page but is rejected there — an acceptable
 *   trade-off for Edge-runtime compatibility until Phase 13 adds Redis-backed sessions.
 */

import type { NextRequest } from 'next/server';
import { NextResponse } from 'next/server';

// Matches SESSION_COOKIE_NAME in src/lib/auth/session.ts — kept inline to avoid
// importing iron-session (Node-only) into the Edge middleware bundle.
const STAFF_COOKIE = 'cerro_staff';

export function inferRoleFromPath(
  pathname: string,
): 'admin' | 'cashier' | 'waiter' {
  if (pathname.startsWith('/admin')) return 'admin';
  if (pathname.startsWith('/caja')) return 'cashier';
  return 'waiter'; // /mozo and /cocina both use waiter-level session
}

export function middleware(request: NextRequest): NextResponse {
  const { pathname } = request.nextUrl;
  const hasCookie = request.cookies.has(STAFF_COOKIE);

  if (!hasCookie) {
    const role = inferRoleFromPath(pathname);
    const redirect = encodeURIComponent(pathname);
    const loginUrl = new URL(
      `/login?role=${role}&redirect=${redirect}`,
      request.url,
    );
    return NextResponse.redirect(loginUrl);
  }

  return NextResponse.next();
}

export const config = {
  matcher: ['/admin/:path*', '/caja/:path*', '/mozo/:path*', '/cocina/:path*'],
};
