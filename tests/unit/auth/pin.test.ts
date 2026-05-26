import { describe, expect, it } from 'vitest';

import { hashPin, isInsecurePin, randomPin, verifyPin } from '@/lib/auth';

// ─── hashPin ────────────────────────────────────────────────────────────────

describe('hashPin', () => {
  it('returns a string starting with $argon2id$', async () => {
    const hash = await hashPin('123459');
    expect(hash).toMatch(/^\$argon2id\$/);
  });

  it('produces different hashes for the same PIN (argon2 salt)', async () => {
    const hash1 = await hashPin('123459');
    const hash2 = await hashPin('123459');
    expect(hash1).not.toBe(hash2);
  });

  it('throws synchronously for input shorter than 6 digits', () => {
    expect(() => hashPin('1234')).toThrow(Error);
  });

  it('throws synchronously for empty input', () => {
    expect(() => hashPin('')).toThrow(Error);
  });

  it('throws synchronously for non-numeric 6-char input', () => {
    expect(() => hashPin('12345a')).toThrow(Error);
  });

  it('throws synchronously for input longer than 6 digits', () => {
    expect(() => hashPin('1234567')).toThrow(Error);
  });
});

// ─── verifyPin ──────────────────────────────────────────────────────────────

describe('verifyPin', () => {
  it('returns true for the correct PIN against its hash', async () => {
    const hash = await hashPin('123459');
    expect(await verifyPin('123459', hash)).toBe(true);
  });

  it('returns false for the wrong PIN against a valid hash', async () => {
    const hash = await hashPin('123459');
    expect(await verifyPin('999999', hash)).toBe(false);
  });

  it('returns false for empty pin (does not throw)', async () => {
    const hash = await hashPin('123459');
    expect(await verifyPin('', hash)).toBe(false);
  });

  it('returns false for a malformed hash (does not throw)', async () => {
    expect(await verifyPin('123459', 'not-a-valid-hash')).toBe(false);
  });

  it('returns false for empty hash string (does not throw)', async () => {
    expect(await verifyPin('123459', '')).toBe(false);
  });
});

// ─── isInsecurePin ──────────────────────────────────────────────────────────

describe('isInsecurePin', () => {
  it('empty string → too_short', () => {
    expect(isInsecurePin('')).toEqual({ insecure: true, reason: 'too_short' });
  });

  it('"1234" → too_short', () => {
    expect(isInsecurePin('1234')).toEqual({ insecure: true, reason: 'too_short' });
  });

  it('"12345a" → non_numeric', () => {
    expect(isInsecurePin('12345a')).toEqual({ insecure: true, reason: 'non_numeric' });
  });

  it('"111111" → all_same', () => {
    expect(isInsecurePin('111111')).toEqual({ insecure: true, reason: 'all_same' });
  });

  it('"000000" → all_same', () => {
    expect(isInsecurePin('000000')).toEqual({ insecure: true, reason: 'all_same' });
  });

  it('"123456" → sequence (ascending)', () => {
    expect(isInsecurePin('123456')).toEqual({ insecure: true, reason: 'sequence' });
  });

  it('"654321" → sequence (descending)', () => {
    expect(isInsecurePin('654321')).toEqual({ insecure: true, reason: 'sequence' });
  });

  it('"234567" → sequence (ascending, offset)', () => {
    expect(isInsecurePin('234567')).toEqual({ insecure: true, reason: 'sequence' });
  });

  it('"987654" → sequence (descending, offset)', () => {
    expect(isInsecurePin('987654')).toEqual({ insecure: true, reason: 'sequence' });
  });

  it('"314159" → not insecure', () => {
    expect(isInsecurePin('314159')).toEqual({ insecure: false });
  });

  it('"854207" → not insecure', () => {
    expect(isInsecurePin('854207')).toEqual({ insecure: false });
  });
});

// ─── randomPin ──────────────────────────────────────────────────────────────

describe('randomPin', () => {
  it('returns exactly 6 digits', () => {
    const pin = randomPin();
    expect(pin).toMatch(/^[0-9]{6}$/);
  });

  it('100 consecutive calls all produce secure PINs', () => {
    for (let i = 0; i < 100; i++) {
      const pin = randomPin();
      expect(isInsecurePin(pin).insecure, `PIN ${pin} should be secure`).toBe(false);
    }
  });

  it('100 calls produce more than 50 unique values (randomness sanity check)', () => {
    const pins = new Set(Array.from({ length: 100 }, () => randomPin()));
    expect(pins.size).toBeGreaterThan(50);
  });
});
