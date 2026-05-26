'use client';

import { create } from 'zustand';

import type { ItemCategory, ItemVariant } from '@/lib/money/types';

export interface CartItem {
  menuItemId: number;
  name: string;
  category: ItemCategory;
  variant: ItemVariant;
  quantity: number;
  priceCents: number | null; // required for drink/dessert, null for starter/main
  isAvailable: boolean;
}

// Auto-detect combo: exactly 1 starter (qty 1) + 1 main (qty 1)
function resolveVariants(items: CartItem[]): CartItem[] {
  const starters = items.filter((i) => i.category === 'starter');
  const mains = items.filter((i) => i.category === 'main');
  const isCombo =
    starters.length === 1 &&
    starters[0]!.quantity === 1 &&
    mains.length === 1 &&
    mains[0]!.quantity === 1;

  return items.map((item) => {
    if (item.category === 'starter') {
      return { ...item, variant: isCombo ? 'full_combo' : ('only_starter' as const) };
    }
    if (item.category === 'main') {
      return { ...item, variant: isCombo ? 'full_combo' : ('only_main' as const) };
    }
    if (item.category === 'drink') {
      return { ...item, variant: 'drink_extra' as const };
    }
    if (item.category === 'dessert') {
      return { ...item, variant: 'dessert_extra' as const };
    }
    return item;
  });
}

interface CartStore {
  items: CartItem[];
  orderType: 'dine_in' | 'takeaway';
  selectedTableId: number | null;
  withTupper: boolean;

  addItem: (item: Omit<CartItem, 'quantity' | 'variant'>) => void;
  removeItem: (menuItemId: number) => void;
  updateQuantity: (menuItemId: number, delta: number) => void;
  setOrderType: (type: 'dine_in' | 'takeaway') => void;
  setSelectedTable: (id: number | null) => void;
  setWithTupper: (v: boolean) => void;
  markUnavailable: (menuItemId: number) => void;
  clear: () => void;

  totalItems: () => number;
  hasUnavailable: () => boolean;
}

export const useCartStore = create<CartStore>((set, get) => ({
  items: [],
  orderType: 'dine_in',
  selectedTableId: null,
  withTupper: false,

  addItem: (itemData) =>
    set((state) => {
      const existing = state.items.find((i) => i.menuItemId === itemData.menuItemId);
      let next: CartItem[];
      if (existing) {
        next = state.items.map((i) =>
          i.menuItemId === itemData.menuItemId ? { ...i, quantity: i.quantity + 1 } : i,
        );
      } else {
        const newItem: CartItem = {
          ...itemData,
          variant: 'only_starter', // placeholder; resolveVariants will fix it
          quantity: 1,
        };
        next = [...state.items, newItem];
      }
      return { items: resolveVariants(next) };
    }),

  removeItem: (menuItemId) =>
    set((state) => ({
      items: resolveVariants(state.items.filter((i) => i.menuItemId !== menuItemId)),
    })),

  updateQuantity: (menuItemId, delta) =>
    set((state) => {
      const next = state.items
        .map((i) =>
          i.menuItemId === menuItemId ? { ...i, quantity: i.quantity + delta } : i,
        )
        .filter((i) => i.quantity > 0);
      return { items: resolveVariants(next) };
    }),

  setOrderType: (orderType) =>
    set({ orderType, selectedTableId: null, withTupper: false }),

  setSelectedTable: (selectedTableId) => set({ selectedTableId }),

  setWithTupper: (withTupper) => set({ withTupper }),

  markUnavailable: (menuItemId) =>
    set((state) => ({
      items: state.items.map((i) =>
        i.menuItemId === menuItemId ? { ...i, isAvailable: false } : i,
      ),
    })),

  clear: () => set({ items: [], selectedTableId: null, withTupper: false }),

  totalItems: () => get().items.reduce((acc, i) => acc + i.quantity, 0),

  hasUnavailable: () => get().items.some((i) => !i.isAvailable),
}));
