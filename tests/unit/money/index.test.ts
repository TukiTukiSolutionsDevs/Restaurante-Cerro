import { describe, expect, it } from 'vitest';

import { formatSoles, priceOrder } from '@/lib/money';

describe('money index re-exports', () => {
  it('exports formatSoles as a function', () => {
    expect(typeof formatSoles).toBe('function');
  });

  it('exports priceOrder as a function', () => {
    expect(typeof priceOrder).toBe('function');
  });

  it('formatSoles works via index import', () => {
    expect(formatSoles(1300)).toBe('S/13.00');
  });

  it('priceOrder works via index import', () => {
    const result = priceOrder({
      orderType: 'dine_in',
      withTupper: false,
      combo: {
        dineInPriceCents: 1300,
        takeawayPriceCents: 1500,
        tupperFullPriceCents: 200,
        tupperPartialPriceCents: 100,
        partialStarterPriceCents: 700,
        partialMainPriceCents: 800,
      },
      items: [{ menuItemId: 1, category: 'starter', variant: 'only_starter', quantity: 1 }],
    });
    expect(result.totalCents).toBe(700);
  });
});
