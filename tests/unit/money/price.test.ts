import { describe, expect, it } from 'vitest';

import { priceOrder } from '@/lib/money/price';
import type { ComboConfig, PriceOrderInput } from '@/lib/money/types';

const combo: ComboConfig = {
  dineInPriceCents: 1300,
  takeawayPriceCents: 1500,
  tupperFullPriceCents: 200,
  tupperPartialPriceCents: 100,
  partialStarterPriceCents: 700,
  partialMainPriceCents: 800,
};

// ---------------------------------------------------------------------------
// Combo detection
// ---------------------------------------------------------------------------

describe('priceOrder — combo detection', () => {
  it('1 starter + 1 main (full_combo), dine_in, no tupper → combo price, detectedCombo true', () => {
    const input: PriceOrderInput = {
      orderType: 'dine_in',
      withTupper: false,
      combo,
      items: [
        { menuItemId: 1, category: 'starter', variant: 'full_combo', quantity: 1 },
        { menuItemId: 2, category: 'main', variant: 'full_combo', quantity: 1 },
      ],
    };
    const result = priceOrder(input);
    expect(result.detectedCombo).toBe(true);
    expect(result.tupperCents).toBe(0);
    expect(result.subtotalCents).toBe(1300);
    expect(result.totalCents).toBe(1300);
  });

  it('1 starter + 1 main (full_combo), takeaway, no tupper → takeaway price', () => {
    const input: PriceOrderInput = {
      orderType: 'takeaway',
      withTupper: false,
      combo,
      items: [
        { menuItemId: 1, category: 'starter', variant: 'full_combo', quantity: 1 },
        { menuItemId: 2, category: 'main', variant: 'full_combo', quantity: 1 },
      ],
    };
    const result = priceOrder(input);
    expect(result.detectedCombo).toBe(true);
    expect(result.totalCents).toBe(1500);
  });

  it('combo takeaway → takeaway combo price (tuppers already baked in)', () => {
    const input: PriceOrderInput = {
      orderType: 'takeaway',
      withTupper: true, // ignored; tuppers always included for takeaway
      combo,
      items: [
        { menuItemId: 1, category: 'starter', variant: 'full_combo', quantity: 1 },
        { menuItemId: 2, category: 'main', variant: 'full_combo', quantity: 1 },
      ],
    };
    const result = priceOrder(input);
    expect(result.detectedCombo).toBe(true);
    expect(result.tupperCents).toBe(0);
    expect(result.totalCents).toBe(1500);
  });

  it('3 combos takeaway → 3 × takeawayPriceCents (no double-charged tupper line)', () => {
    const input: PriceOrderInput = {
      orderType: 'takeaway',
      withTupper: true,
      combo,
      items: [
        { menuItemId: 1, category: 'starter', variant: 'full_combo', quantity: 3 },
        { menuItemId: 2, category: 'main', variant: 'full_combo', quantity: 3 },
      ],
    };
    const result = priceOrder(input);
    expect(result.detectedCombo).toBe(true);
    expect(result.tupperCents).toBe(0);
    expect(result.totalCents).toBe(4500); // 3 × 1500
  });
});

// ---------------------------------------------------------------------------
// Partial orders
// ---------------------------------------------------------------------------

describe('priceOrder — partial orders', () => {
  it('1 starter only (only_starter), dine_in → partialStarterPriceCents, no combo', () => {
    const input: PriceOrderInput = {
      orderType: 'dine_in',
      withTupper: false,
      combo,
      items: [{ menuItemId: 1, category: 'starter', variant: 'only_starter', quantity: 1 }],
    };
    const result = priceOrder(input);
    expect(result.detectedCombo).toBe(false);
    expect(result.tupperCents).toBe(0);
    expect(result.totalCents).toBe(700);
  });

  it('1 main only (only_main), takeaway → partialMain + tupperPartial baked into the line', () => {
    const input: PriceOrderInput = {
      orderType: 'takeaway',
      withTupper: true,
      combo,
      items: [{ menuItemId: 2, category: 'main', variant: 'only_main', quantity: 1 }],
    };
    const result = priceOrder(input);
    expect(result.detectedCombo).toBe(false);
    expect(result.tupperCents).toBe(0);
    // 800 (partial main) + 100 (tupper) = 900
    expect(result.totalCents).toBe(900);
  });
});

// ---------------------------------------------------------------------------
// Mixed / extras
// ---------------------------------------------------------------------------

describe('priceOrder — mixed / extras', () => {
  it('combo dine_in + drink_extra → comboPrice + drinkPrice', () => {
    const input: PriceOrderInput = {
      orderType: 'dine_in',
      withTupper: false,
      combo,
      items: [
        { menuItemId: 1, category: 'starter', variant: 'full_combo', quantity: 1 },
        { menuItemId: 2, category: 'main', variant: 'full_combo', quantity: 1 },
        { menuItemId: 3, category: 'drink', variant: 'drink_extra', quantity: 1, unitPriceCents: 300 },
      ],
    };
    const result = priceOrder(input);
    expect(result.detectedCombo).toBe(true);
    expect(result.totalCents).toBe(1600); // 1300 + 300
  });

  it('1 item with quantity 2 (only_starter) → 2 × partialStarterPriceCents, no combo', () => {
    const input: PriceOrderInput = {
      orderType: 'dine_in',
      withTupper: false,
      combo,
      items: [{ menuItemId: 1, category: 'starter', variant: 'only_starter', quantity: 2 }],
    };
    const result = priceOrder(input);
    expect(result.detectedCombo).toBe(false);
    expect(result.totalCents).toBe(1400); // 2 × 700
  });

  it('1 starter + 2 mains → 1 combo + 1 extra main', () => {
    const input: PriceOrderInput = {
      orderType: 'dine_in',
      withTupper: false,
      combo,
      items: [
        { menuItemId: 1, category: 'starter', variant: 'full_combo', quantity: 1 },
        { menuItemId: 2, category: 'main', variant: 'full_combo', quantity: 1 },
        { menuItemId: 3, category: 'main', variant: 'only_main', quantity: 1 },
      ],
    };
    const result = priceOrder(input);
    expect(result.detectedCombo).toBe(true);
    // 1 combo (1300) + 1 extra main (800)
    expect(result.totalCents).toBe(2100);
  });

  it('2 starters + 2 mains → 2 combos (multi-combo pairing)', () => {
    const input: PriceOrderInput = {
      orderType: 'dine_in',
      withTupper: false,
      combo,
      items: [
        { menuItemId: 1, category: 'starter', variant: 'full_combo', quantity: 1 },
        { menuItemId: 2, category: 'starter', variant: 'full_combo', quantity: 1 },
        { menuItemId: 3, category: 'main', variant: 'full_combo', quantity: 1 },
        { menuItemId: 4, category: 'main', variant: 'full_combo', quantity: 1 },
      ],
    };
    const result = priceOrder(input);
    expect(result.detectedCombo).toBe(true);
    // 2 combos at 1300 each
    expect(result.totalCents).toBe(2600);
  });

  it('1 starter line of qty 2 + 1 main line of qty 2 → 2 combos', () => {
    const input: PriceOrderInput = {
      orderType: 'dine_in',
      withTupper: false,
      combo,
      items: [
        { menuItemId: 1, category: 'starter', variant: 'full_combo', quantity: 2 },
        { menuItemId: 2, category: 'main', variant: 'full_combo', quantity: 2 },
      ],
    };
    const result = priceOrder(input);
    expect(result.detectedCombo).toBe(true);
    expect(result.totalCents).toBe(2600);
  });

  it('3 starters + 1 main → 1 combo + 2 extra starters', () => {
    const input: PriceOrderInput = {
      orderType: 'dine_in',
      withTupper: false,
      combo,
      items: [
        { menuItemId: 1, category: 'starter', variant: 'full_combo', quantity: 3 },
        { menuItemId: 2, category: 'main', variant: 'full_combo', quantity: 1 },
      ],
    };
    const result = priceOrder(input);
    expect(result.detectedCombo).toBe(true);
    // 1 combo (1300) + 2 extra starters at 700
    expect(result.totalCents).toBe(2700);
  });
});

// ---------------------------------------------------------------------------
// Validation errors
// ---------------------------------------------------------------------------

describe('priceOrder — validation', () => {
  it('throws on empty items array', () => {
    expect(() =>
      priceOrder({ orderType: 'dine_in', withTupper: false, combo, items: [] }),
    ).toThrow();
  });

  it('throws on quantity 0', () => {
    expect(() =>
      priceOrder({
        orderType: 'dine_in',
        withTupper: false,
        combo,
        items: [{ menuItemId: 1, category: 'starter', variant: 'only_starter', quantity: 0 }],
      }),
    ).toThrow();
  });

  it('throws on negative quantity', () => {
    expect(() =>
      priceOrder({
        orderType: 'dine_in',
        withTupper: false,
        combo,
        items: [{ menuItemId: 1, category: 'starter', variant: 'only_starter', quantity: -1 }],
      }),
    ).toThrow();
  });

  it('throws on drink_extra without unitPriceCents', () => {
    expect(() =>
      priceOrder({
        orderType: 'dine_in',
        withTupper: false,
        combo,
        items: [{ menuItemId: 3, category: 'drink', variant: 'drink_extra', quantity: 1 }],
      }),
    ).toThrow();
  });

  it('throws on dessert_extra without unitPriceCents', () => {
    expect(() =>
      priceOrder({
        orderType: 'dine_in',
        withTupper: false,
        combo,
        items: [{ menuItemId: 4, category: 'dessert', variant: 'dessert_extra', quantity: 1 }],
      }),
    ).toThrow();
  });

  it('tupper with dine_in is silently ignored (tupperCents = 0)', () => {
    const result = priceOrder({
      orderType: 'dine_in',
      withTupper: true,
      combo,
      items: [{ menuItemId: 1, category: 'starter', variant: 'only_starter', quantity: 1 }],
    });
    expect(result.tupperCents).toBe(0);
    expect(result.totalCents).toBe(700);
  });
});

// ---------------------------------------------------------------------------
// Edge: mixing variants
// ---------------------------------------------------------------------------

describe('priceOrder — variant is informational', () => {
  it('input variant is ignored: 1 starter + 1 main always pairs as combo', () => {
    // Combo allocation is derived from category quantities, not from input variant.
    const input: PriceOrderInput = {
      orderType: 'dine_in',
      withTupper: false,
      combo,
      items: [
        { menuItemId: 1, category: 'starter', variant: 'full_combo', quantity: 1 },
        { menuItemId: 2, category: 'main', variant: 'only_main', quantity: 1 },
      ],
    };
    const result = priceOrder(input);
    expect(result.detectedCombo).toBe(true);
    expect(result.totalCents).toBe(1300);
  });
});
