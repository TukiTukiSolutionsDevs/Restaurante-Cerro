import type { CartItem, ComboConfig, ItemCategory, PriceOrderInput, PricingLine, PricingResult } from './types';

function validate(items: CartItem[]): void {
  if (items.length === 0) {
    throw new Error('priceOrder: items must not be empty');
  }
  for (const item of items) {
    if (!Number.isInteger(item.quantity) || item.quantity < 1) {
      throw new RangeError(
        `priceOrder: quantity must be a positive integer, got ${item.quantity} for menuItemId ${item.menuItemId}`,
      );
    }
    if (
      (item.variant === 'drink_extra' || item.variant === 'dessert_extra') &&
      item.unitPriceCents === undefined
    ) {
      throw new Error(
        `priceOrder: unitPriceCents is required for ${item.variant} (menuItemId ${item.menuItemId})`,
      );
    }
  }
}

function totalQty(items: readonly CartItem[], cat: ItemCategory): number {
  return items.filter((i) => i.category === cat).reduce((a, i) => a + i.quantity, 0);
}

/**
 * Pricing model:
 *
 *   - Starters and mains pair into combos: comboCount = min(totalStarters, totalMains).
 *     Unpaired starters/mains are charged at their partial price.
 *   - Combo price is attributed to the starter combo units; main combo units are 0.
 *
 *   - Takeaway baskets always include tuppers:
 *       combo unit  -> takeawayPriceCents (already covers 2 tuppers per combo)
 *       extra starter -> partialStarter + tupperPartial (1 tupper per loose item)
 *       extra main    -> partialMain    + tupperPartial
 *     `withTupper` input is ignored for takeaway (always on). `tupperCents` in the
 *     result is always 0 — tuppers are baked into the line prices, no separate row.
 *
 *   - Dine-in: no tuppers, no extras.
 *
 *   Input `variant` on items is informational only — pairing is derived from quantities.
 */
export function priceOrder(input: Readonly<PriceOrderInput>): PricingResult {
  const { items, orderType, combo } = input;
  validate(items);

  const isTakeaway = orderType === 'takeaway';
  const comboPrice = isTakeaway ? combo.takeawayPriceCents : combo.dineInPriceCents;
  const tupperPerLoose = isTakeaway ? combo.tupperPartialPriceCents : 0;

  const comboCount = Math.min(totalQty(items, 'starter'), totalQty(items, 'main'));
  const detectedCombo = comboCount > 0;

  let starterComboBudget = comboCount;
  let mainComboBudget = comboCount;
  const lines: PricingLine[] = [];

  for (const item of items) {
    if (item.category === 'starter') {
      const comboUnits = Math.min(item.quantity, starterComboBudget);
      starterComboBudget -= comboUnits;
      const partialUnits = item.quantity - comboUnits;

      if (comboUnits > 0) {
        lines.push({
          menuItemId: item.menuItemId,
          variant: 'full_combo',
          quantity: comboUnits,
          unitPriceCents: comboPrice,
          totalCents: comboPrice * comboUnits,
        });
      }
      if (partialUnits > 0) {
        const unit = combo.partialStarterPriceCents + tupperPerLoose;
        lines.push({
          menuItemId: item.menuItemId,
          variant: 'only_starter',
          quantity: partialUnits,
          unitPriceCents: unit,
          totalCents: unit * partialUnits,
        });
      }
      continue;
    }

    if (item.category === 'main') {
      const comboUnits = Math.min(item.quantity, mainComboBudget);
      mainComboBudget -= comboUnits;
      const partialUnits = item.quantity - comboUnits;

      if (comboUnits > 0) {
        lines.push({
          menuItemId: item.menuItemId,
          variant: 'full_combo',
          quantity: comboUnits,
          unitPriceCents: 0,
          totalCents: 0,
        });
      }
      if (partialUnits > 0) {
        const unit = combo.partialMainPriceCents + tupperPerLoose;
        lines.push({
          menuItemId: item.menuItemId,
          variant: 'only_main',
          quantity: partialUnits,
          unitPriceCents: unit,
          totalCents: unit * partialUnits,
        });
      }
      continue;
    }

    // drink_extra / dessert_extra — unit price comes from cart
    const unit = item.unitPriceCents!;
    lines.push({
      menuItemId: item.menuItemId,
      variant: item.variant,
      quantity: item.quantity,
      unitPriceCents: unit,
      totalCents: unit * item.quantity,
    });
  }

  const subtotalCents = lines.reduce((acc, l) => acc + l.totalCents, 0);

  return {
    lines,
    subtotalCents,
    tupperCents: 0,
    totalCents: subtotalCents,
    detectedCombo,
  };
}
