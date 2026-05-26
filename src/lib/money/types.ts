export type OrderType = 'dine_in' | 'takeaway';
export type ItemVariant =
  | 'full_combo'
  | 'only_starter'
  | 'only_main'
  | 'drink_extra'
  | 'dessert_extra';
export type ItemCategory = 'starter' | 'main' | 'drink' | 'dessert';

export interface ComboConfig {
  dineInPriceCents: number;
  takeawayPriceCents: number;
  tupperFullPriceCents: number;
  tupperPartialPriceCents: number;
  partialStarterPriceCents: number;
  partialMainPriceCents: number;
}

export interface CartItem {
  menuItemId: number;
  category: ItemCategory;
  variant: ItemVariant;
  quantity: number;
  unitPriceCents?: number; // required for drink_extra / dessert_extra
}

export interface PriceOrderInput {
  items: CartItem[];
  orderType: OrderType;
  withTupper: boolean;
  combo: ComboConfig;
}

export interface PricingLine {
  menuItemId: number;
  variant: ItemVariant;
  quantity: number;
  unitPriceCents: number;
  totalCents: number;
}

export interface PricingResult {
  lines: PricingLine[];
  subtotalCents: number;
  tupperCents: number;
  totalCents: number;
  detectedCombo: boolean;
}
