'use client';

import { formatSoles } from '@/lib/money/format';

interface Props {
  summary: { paidCount: number; cashCents: number; yapeCents: number };
  soundEnabled: boolean;
  onToggleSound: () => void;
}

export function SummaryWidget({ summary, soundEnabled, onToggleSound }: Props) {
  const total = summary.cashCents + summary.yapeCents;

  return (
    <div className="rounded-xl border border-neutral-200 bg-white p-4">
      <div className="mb-3 flex items-center justify-between">
        <span className="text-xs font-semibold uppercase tracking-widest text-neutral-500">
          Hoy
        </span>
        <button
          type="button"
          onClick={onToggleSound}
          title={soundEnabled ? 'Silenciar alertas' : 'Activar alertas'}
          className="flex items-center gap-1 rounded-lg border border-neutral-200 px-2.5 py-1 text-xs text-neutral-500 hover:bg-neutral-50"
        >
          {soundEnabled ? '🔔 Sonido' : '🔕 Silencio'}
        </button>
      </div>

      <div className="grid grid-cols-3 gap-3">
        <div>
          <div className="text-[10px] font-semibold uppercase tracking-wider text-neutral-500">
            Pedidos
          </div>
          <div className="tabnum mt-0.5 font-display text-xl font-bold text-neutral-800">
            {summary.paidCount}
          </div>
        </div>
        <div>
          <div className="text-[10px] font-semibold uppercase tracking-wider text-neutral-500">
            Efectivo
          </div>
          <div className="tabnum mt-0.5 font-mono text-xl font-bold text-neutral-800">
            {formatSoles(summary.cashCents)}
          </div>
        </div>
        <div>
          <div className="text-[10px] font-semibold uppercase tracking-wider text-neutral-500">
            Yape
          </div>
          <div className="tabnum mt-0.5 font-mono text-xl font-bold text-neutral-800">
            {formatSoles(summary.yapeCents)}
          </div>
        </div>
      </div>

      <div className="mt-3 flex items-baseline justify-between border-t border-neutral-100 pt-3">
        <span className="text-sm text-neutral-600">Total caja</span>
        <span className="tabnum font-mono text-2xl font-bold text-neutral-800">
          {formatSoles(total)}
        </span>
      </div>
    </div>
  );
}
