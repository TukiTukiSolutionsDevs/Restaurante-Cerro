import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import type { RateLimiter } from '@/lib/auth/rate-limit';
import { createRateLimiter, getDefaultLoginLimiter } from '@/lib/auth/rate-limit';

const MAX = 5;
const WINDOW = 15 * 60 * 1000; // 15 min in ms

let clock = 0;
let limiter: RateLimiter;

beforeEach(() => {
  clock = 1_000_000;
  limiter = createRateLimiter({
    maxAttempts: MAX,
    windowMs: WINDOW,
    now: () => clock,
  });
});

afterEach(() => {
  limiter.clear();
});

// ─── check ────────────────────────────────────────────────────────────────────

describe('check — no prior hits', () => {
  it('returns allowed=true with full remaining', () => {
    const result = limiter.check('ip1:cashier');
    expect(result.allowed).toBe(true);
    expect(result.remaining).toBe(MAX);
    expect(result.retryAfterMs).toBe(0);
  });
});

// ─── hit ─────────────────────────────────────────────────────────────────────

describe('hit', () => {
  it('returns allowed=true and decrements remaining until maxAttempts', () => {
    for (let i = 1; i <= MAX - 1; i++) {
      const r = limiter.hit('k');
      expect(r.allowed).toBe(true);
      expect(r.remaining).toBe(MAX - i);
    }
  });

  it('returns allowed=false on the maxAttempts-th hit', () => {
    for (let i = 0; i < MAX; i++) limiter.hit('k');
    const r = limiter.check('k');
    expect(r.allowed).toBe(false);
    expect(r.remaining).toBe(0);
    expect(r.retryAfterMs).toBeGreaterThan(0);
  });
});

// ─── lockout then check ───────────────────────────────────────────────────────

describe('lockout: 5 hits → 6th check is blocked', () => {
  it('check returns allowed=false with retryAfterMs > 0', () => {
    for (let i = 0; i < MAX; i++) limiter.hit('locked');
    const r = limiter.check('locked');
    expect(r.allowed).toBe(false);
    expect(r.retryAfterMs).toBeGreaterThan(0);
    expect(r.remaining).toBe(0);
  });
});

// ─── window expiry ────────────────────────────────────────────────────────────

describe('window expiry', () => {
  it('check returns allowed=true after windowMs elapses', () => {
    for (let i = 0; i < MAX; i++) limiter.hit('expiry');
    expect(limiter.check('expiry').allowed).toBe(false);

    clock += WINDOW; // advance clock exactly one window

    const r = limiter.check('expiry');
    expect(r.allowed).toBe(true);
    expect(r.remaining).toBe(MAX);
    expect(r.retryAfterMs).toBe(0);
  });

  it('hit after window expiry resets count to 1', () => {
    for (let i = 0; i < MAX; i++) limiter.hit('exp2');
    clock += WINDOW;
    const r = limiter.hit('exp2');
    expect(r.allowed).toBe(true);
    expect(r.remaining).toBe(MAX - 1);
  });
});

// ─── reset ────────────────────────────────────────────────────────────────────

describe('reset', () => {
  it('clears the bucket so the next check is allowed', () => {
    for (let i = 0; i < MAX; i++) limiter.hit('reset-key');
    expect(limiter.check('reset-key').allowed).toBe(false);

    limiter.reset('reset-key');

    const r = limiter.check('reset-key');
    expect(r.allowed).toBe(true);
    expect(r.remaining).toBe(MAX);
  });

  it('is a no-op for an unknown key', () => {
    expect(() => limiter.reset('unknown')).not.toThrow();
  });
});

// ─── key isolation ────────────────────────────────────────────────────────────

describe('independent keys do not interact', () => {
  it('exhausting key A does not affect key B', () => {
    for (let i = 0; i < MAX; i++) limiter.hit('A');
    expect(limiter.check('A').allowed).toBe(false);
    expect(limiter.check('B').allowed).toBe(true);
  });

  it('resetting key A does not affect key B', () => {
    for (let i = 0; i < MAX; i++) limiter.hit('X');
    for (let i = 0; i < MAX; i++) limiter.hit('Y');

    limiter.reset('X');

    expect(limiter.check('X').allowed).toBe(true);
    expect(limiter.check('Y').allowed).toBe(false);
  });
});

// ─── getDefaultLoginLimiter singleton ────────────────────────────────────────

describe('getDefaultLoginLimiter', () => {
  it('returns a working RateLimiter', () => {
    const l = getDefaultLoginLimiter();
    expect(typeof l.check).toBe('function');
    expect(typeof l.hit).toBe('function');
    expect(typeof l.reset).toBe('function');
    expect(typeof l.clear).toBe('function');
  });

  it('returns the same instance on every call (singleton)', () => {
    expect(getDefaultLoginLimiter()).toBe(getDefaultLoginLimiter());
  });

  it('uses maxAttempts=5 and windowMs=15min', () => {
    const l = getDefaultLoginLimiter();
    l.clear(); // ensure clean state
    for (let i = 0; i < 5; i++) l.hit('singleton-test');
    expect(l.check('singleton-test').allowed).toBe(false);
    expect(l.check('singleton-test').retryAfterMs).toBeGreaterThan(0);
    l.clear();
  });
});

// ─── clear ────────────────────────────────────────────────────────────────────

describe('clear', () => {
  it('resets all buckets', () => {
    for (let i = 0; i < MAX; i++) {
      limiter.hit('a');
      limiter.hit('b');
    }
    expect(limiter.check('a').allowed).toBe(false);
    expect(limiter.check('b').allowed).toBe(false);

    limiter.clear();

    expect(limiter.check('a').allowed).toBe(true);
    expect(limiter.check('b').allowed).toBe(true);
  });
});
