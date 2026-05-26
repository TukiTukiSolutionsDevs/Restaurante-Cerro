import { NextRequest } from 'next/server';
import { describe, expect, it } from 'vitest';

import { config, inferRoleFromPath, middleware } from '@/middleware';

// ---------------------------------------------------------------------------
// Matcher config
// ---------------------------------------------------------------------------

describe('config.matcher', () => {
  const patterns = config.matcher;

  // Helper: check if a pathname matches any of the Next.js path patterns
  // (simplified regex-equivalent of Next.js :path* expansion)
  function matchesAny(pathname: string): boolean {
    return patterns.some((pattern) => {
      const regex = new RegExp(
        '^' + pattern.replace(/\/:path\*$/, '(/.*)?').replace(/\/:path\+$/, '(/.+)') + '$',
      );
      return regex.test(pathname);
    });
  }

  it('matches /admin', () => expect(matchesAny('/admin')).toBe(true));
  it('matches /admin/staff', () => expect(matchesAny('/admin/staff')).toBe(true));
  it('matches /admin/reports/daily', () => expect(matchesAny('/admin/reports/daily')).toBe(true));
  it('matches /caja', () => expect(matchesAny('/caja')).toBe(true));
  it('matches /caja/scan', () => expect(matchesAny('/caja/scan')).toBe(true));
  it('matches /mozo', () => expect(matchesAny('/mozo')).toBe(true));
  it('matches /mozo/orders', () => expect(matchesAny('/mozo/orders')).toBe(true));
  it('matches /cocina', () => expect(matchesAny('/cocina')).toBe(true));
  it('matches /cocina/board', () => expect(matchesAny('/cocina/board')).toBe(true));

  it('does NOT match /', () => expect(matchesAny('/')).toBe(false));
  it('does NOT match /login', () => expect(matchesAny('/login')).toBe(false));
  it('does NOT match /api/health', () => expect(matchesAny('/api/health')).toBe(false));
  it('does NOT match /api/staff/login', () => expect(matchesAny('/api/staff/login')).toBe(false));
  it('does NOT match /pedido/abc', () => expect(matchesAny('/pedido/abc')).toBe(false));
});

// ---------------------------------------------------------------------------
// inferRoleFromPath
// ---------------------------------------------------------------------------

describe('inferRoleFromPath', () => {
  it('infers admin for /admin paths', () => {
    expect(inferRoleFromPath('/admin')).toBe('admin');
    expect(inferRoleFromPath('/admin/staff')).toBe('admin');
  });

  it('infers cashier for /caja paths', () => {
    expect(inferRoleFromPath('/caja')).toBe('cashier');
    expect(inferRoleFromPath('/caja/scan')).toBe('cashier');
  });

  it('infers waiter for /mozo paths', () => {
    expect(inferRoleFromPath('/mozo')).toBe('waiter');
    expect(inferRoleFromPath('/mozo/orders')).toBe('waiter');
  });

  it('infers waiter for /cocina paths (kitchen device)', () => {
    expect(inferRoleFromPath('/cocina')).toBe('waiter');
    expect(inferRoleFromPath('/cocina/board')).toBe('waiter');
  });
});

// ---------------------------------------------------------------------------
// middleware function
// ---------------------------------------------------------------------------

function makeRequest(pathname: string, hasCookie = false): NextRequest {
  const req = new NextRequest(new URL(`http://localhost${pathname}`));
  if (hasCookie) {
    req.cookies.set('cerro_staff', 'sealed-value');
  }
  return req;
}

describe('middleware', () => {
  it('redirects to /login with role and redirect params when no cookie present', () => {
    const req = makeRequest('/caja', false);
    const res = middleware(req);

    expect(res.status).toBe(307);
    const location = res.headers.get('location') ?? '';
    expect(location).toContain('/login');
    expect(location).toContain('role=cashier');
    expect(location).toContain('redirect=');
  });

  it('passes through when cookie is present', () => {
    const req = makeRequest('/caja', true);
    const res = middleware(req);

    expect(res.status).toBe(200); // NextResponse.next() → 200
  });

  it('redirects /admin to role=admin when unauthenticated', () => {
    const req = makeRequest('/admin/staff', false);
    const res = middleware(req);

    const location = res.headers.get('location') ?? '';
    expect(location).toContain('role=admin');
  });

  it('redirects /mozo to role=waiter when unauthenticated', () => {
    const req = makeRequest('/mozo', false);
    const res = middleware(req);

    const location = res.headers.get('location') ?? '';
    expect(location).toContain('role=waiter');
  });

  it('encodes the original pathname as redirect param', () => {
    const req = makeRequest('/caja', false);
    const res = middleware(req);

    const location = res.headers.get('location') ?? '';
    expect(location).toContain(encodeURIComponent('/caja'));
  });
});
