'use client';

import { cn } from '@/lib/utils';

import { useCartStore } from './cart-store';

export function OrderTypeToggle() {
  const orderType = useCartStore((s) => s.orderType);
  const setOrderType = useCartStore((s) => s.setOrderType);

  return (
    <div className="flex rounded-lg border p-1">
      <button
        type="button"
        onClick={() => setOrderType('dine_in')}
        className={cn(
          'flex-1 rounded-md px-3 py-2 text-sm font-medium transition-colors',
          orderType === 'dine_in'
            ? 'bg-primary text-primary-foreground'
            : 'text-muted-foreground hover:text-foreground',
        )}
      >
        Para comer aquí
      </button>
      <button
        type="button"
        onClick={() => setOrderType('takeaway')}
        className={cn(
          'flex-1 rounded-md px-3 py-2 text-sm font-medium transition-colors',
          orderType === 'takeaway'
            ? 'bg-primary text-primary-foreground'
            : 'text-muted-foreground hover:text-foreground',
        )}
      >
        Para llevar
      </button>
    </div>
  );
}
