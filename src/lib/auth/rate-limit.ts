// In-memory token-bucket rate limiter per (ip, role) key.
// Production note (Phase 13): replace backing store with Redis for multi-process safety.

export interface RateLimitOptions {
  maxAttempts: number;
  windowMs: number;
  /** Override clock for tests */
  now?: () => number;
}

export interface RateLimitResult {
  allowed: boolean;
  remaining: number;
  /** 0 if allowed; otherwise ms until the current window expires */
  retryAfterMs: number;
}

export interface RateLimiter {
  check(key: string): RateLimitResult;
  hit(key: string): RateLimitResult;
  reset(key: string): void;
  /** For test cleanup */
  clear(): void;
}

interface Bucket {
  count: number;
  windowStart: number;
}

export function createRateLimiter(opts: RateLimitOptions): RateLimiter {
  const buckets = new Map<string, Bucket>();
  const getNow = opts.now ?? (() => Date.now());

  function isExpired(bucket: Bucket, now: number): boolean {
    return now - bucket.windowStart >= opts.windowMs;
  }

  function computeResult(bucket: Bucket, now: number): RateLimitResult {
    const allowed = bucket.count < opts.maxAttempts;
    const remaining = Math.max(0, opts.maxAttempts - bucket.count);
    const retryAfterMs = allowed
      ? 0
      : Math.max(0, opts.windowMs - (now - bucket.windowStart));
    return { allowed, remaining, retryAfterMs };
  }

  return {
    check(key: string): RateLimitResult {
      const now = getNow();
      const existing = buckets.get(key);
      if (!existing || isExpired(existing, now)) {
        return { allowed: true, remaining: opts.maxAttempts, retryAfterMs: 0 };
      }
      return computeResult(existing, now);
    },

    hit(key: string): RateLimitResult {
      const now = getNow();
      const existing = buckets.get(key);
      let bucket: Bucket;
      if (!existing || isExpired(existing, now)) {
        bucket = { count: 0, windowStart: now };
        buckets.set(key, bucket);
      } else {
        bucket = existing;
      }
      bucket.count += 1;
      return computeResult(bucket, now);
    },

    reset(key: string): void {
      buckets.delete(key);
    },

    clear(): void {
      buckets.clear();
    },
  };
}

let _defaultLoginLimiter: RateLimiter | null = null;

export function getDefaultLoginLimiter(): RateLimiter {
  if (!_defaultLoginLimiter) {
    _defaultLoginLimiter = createRateLimiter({
      maxAttempts: 5,
      windowMs: 15 * 60 * 1000,
    });
  }
  return _defaultLoginLimiter;
}
