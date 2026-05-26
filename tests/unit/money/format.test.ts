import { describe, expect, it } from 'vitest';

import { formatSoles } from '@/lib/money/format';

describe('formatSoles', () => {
  it('formats 0 cents', () => {
    expect(formatSoles(0)).toBe('S/0.00');
  });

  it('formats 1 cent', () => {
    expect(formatSoles(1)).toBe('S/0.01');
  });

  it('formats 1300 cents as S/13.00', () => {
    expect(formatSoles(1300)).toBe('S/13.00');
  });

  it('formats 1500 cents as S/15.00', () => {
    expect(formatSoles(1500)).toBe('S/15.00');
  });

  it('formats large amount with comma thousands separator', () => {
    expect(formatSoles(1234567)).toBe('S/12,345.67');
  });

  it('throws RangeError on negative input', () => {
    expect(() => formatSoles(-1)).toThrow(RangeError);
    expect(() => formatSoles(-100)).toThrow(RangeError);
  });

  it('throws TypeError on non-integer input', () => {
    expect(() => formatSoles(1.5)).toThrow(TypeError);
    expect(() => formatSoles(13.99)).toThrow(TypeError);
  });
});
