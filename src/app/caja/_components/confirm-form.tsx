'use client';

import { Banknote, Check } from 'lucide-react';
import { useEffect } from 'react';

import { formatSoles } from '@/lib/money/format';
import type { CashierOrderView } from '@/server/services/cashier';

interface Props {
  paymentMethod: 'cash' | 'yape' | null;
  yapeRef: string;
  isConfirming: boolean;
  order?: CashierOrderView | null;
  onMethodChange: (method: 'cash' | 'yape') => void;
  onYapeRefChange: (ref: string) => void;
  onConfirm: () => void;
}

function YapeMark() {
  return (
    <div className="flex h-6 w-6 items-center justify-center rounded-md bg-[#6a0dad] text-[11px] font-extrabold tracking-tight text-white">
      Y
    </div>
  );
}

export function ConfirmForm({
  paymentMethod,
  yapeRef,
  isConfirming,
  order,
  onMethodChange,
  onYapeRefChange,
  onConfirm,
}: Props) {
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement).tagName;
      if (tag === 'TEXTAREA') return;
      if (e.key === 'Enter' && paymentMethod) {
        e.preventDefault();
        onConfirm();
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [paymentMethod, onConfirm]);

  return (
    <div className="flex flex-col gap-4">
      {/* Payment method pills */}
      <div className="grid grid-cols-2 gap-3">
        {/* Efectivo */}
        <button
          type="button"
          onClick={() => onMethodChange('cash')}
          className={[
            'flex items-center gap-2.5 rounded-xl border-2 px-4 py-3.5 text-sm font-semibold transition-colors',
            paymentMethod === 'cash'
              ? 'border-success-500 bg-success-50 text-success-700'
              : 'border-neutral-200 bg-white text-neutral-700 hover:border-neutral-300',
          ].join(' ')}
        >
          <Banknote className="h-5 w-5" />
          Efectivo
          <span className="ml-auto text-[10px] opacity-50 font-normal">[1]</span>
        </button>

        {/* Yape */}
        <button
          type="button"
          onClick={() => onMethodChange('yape')}
          className={[
            'flex items-center gap-2.5 rounded-xl border-2 px-4 py-3.5 text-sm font-semibold transition-colors',
            paymentMethod === 'yape'
              ? 'border-[#6a0dad] bg-[#FAF0FC] text-[#6a0dad]'
              : 'border-neutral-200 bg-white text-neutral-700 hover:border-neutral-300',
          ].join(' ')}
        >
          <YapeMark />
          Yape
          <span className="ml-auto text-[10px] opacity-50 font-normal">[2]</span>
        </button>
      </div>

      {/* Yape reference */}
      {paymentMethod === 'yape' && (
        <div className="space-y-1">
          <label className="text-xs font-semibold text-neutral-500">
            N° de operación (opcional)
          </label>
          <input
            type="text"
            value={yapeRef}
            onChange={(e) => onYapeRefChange(e.target.value)}
            placeholder="0000000000"
            maxLength={12}
            className="w-full rounded-xl border border-neutral-300 bg-white px-3 py-2.5 font-mono text-base focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-100"
          />
        </div>
      )}

      {/* Confirm button */}
      <button
        type="button"
        onClick={onConfirm}
        disabled={!paymentMethod || isConfirming}
        className="flex h-16 w-full items-center justify-center gap-2.5 rounded-2xl bg-success-500 font-display text-lg font-bold text-white shadow-md transition-colors hover:bg-success-600 active:bg-success-700 disabled:cursor-not-allowed disabled:opacity-40"
        style={{ boxShadow: '0 4px 12px rgba(22, 163, 74, 0.3)' }}
      >
        {isConfirming ? (
          'Procesando…'
        ) : (
          <>
            <Check className="h-5 w-5" />
            Confirmar cobro
            {order && (
              <span className="tabnum font-mono">· {formatSoles(order.totalCents)}</span>
            )}
            <span className="ml-1 rounded bg-white/20 px-2 py-0.5 text-xs font-normal">
              Enter
            </span>
          </>
        )}
      </button>
    </div>
  );
}
