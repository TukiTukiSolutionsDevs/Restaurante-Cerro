'use client';

import { formatSoles } from '@/lib/money/format';

interface CartBarProps {
  count: number;
  totalCents: number;
  onClick: () => void;
}

export function CartBar({ count, totalCents, onClick }: CartBarProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={`Ver pedido: ${count} ${count === 1 ? 'plato' : 'platos'}, total ${formatSoles(totalCents)}`}
      style={{
        position: 'fixed',
        left: '50%',
        transform: 'translateX(-50%)',
        bottom: 28,
        zIndex: 20,
        width: 'calc(100% - 32px)',
        maxWidth: 448,
        background: 'var(--neutral-800)',
        color: '#fff',
        borderRadius: 16,
        padding: '14px 18px',
        display: 'flex',
        alignItems: 'center',
        gap: 12,
        boxShadow: '0 16px 32px rgba(28,24,16,0.3)',
        cursor: 'pointer',
        border: 0,
      }}
    >
      <div
        style={{
          width: 32,
          height: 32,
          borderRadius: 10,
          background: 'var(--brand-500)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          fontWeight: 700,
          fontSize: 14,
          flexShrink: 0,
        }}
      >
        {count}
      </div>
      <div style={{ flex: 1, textAlign: 'left' }}>
        <div style={{ fontSize: 13, fontWeight: 600, lineHeight: 1.2 }}>Ver tu pedido</div>
        <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.6)', marginTop: 2 }}>
          {count} {count === 1 ? 'plato' : 'platos'}
        </div>
      </div>
      <div
        className="tabnum"
        style={{ fontFamily: 'var(--font-mono)', fontSize: 18, fontWeight: 700 }}
      >
        {formatSoles(totalCents)}
      </div>
      <div style={{ fontSize: 16, opacity: 0.7 }}>→</div>
    </button>
  );
}
