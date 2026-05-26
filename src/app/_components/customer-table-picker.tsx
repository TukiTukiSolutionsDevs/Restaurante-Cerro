'use client';

import { Check } from 'lucide-react';
import { useEffect, useState } from 'react';

import { useCartStore } from './cart-store';

interface FreeTable {
  id: number;
  code: string;
  capacity: number;
}

export function CustomerTablePicker() {
  const selectedTableId = useCartStore((s) => s.selectedTableId);
  const setSelectedTable = useCartStore((s) => s.setSelectedTable);
  const [tables, setTables] = useState<FreeTable[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch('/api/tables/free')
      .then((r) => r.json())
      .then((data: FreeTable[]) => {
        setTables(data);
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, []);

  if (loading) {
    return (
      <p style={{ fontSize: 13, color: 'var(--neutral-500)', marginBottom: 16 }}>
        Cargando mesas…
      </p>
    );
  }

  if (tables.length === 0) {
    return (
      <p
        style={{
          fontSize: 13,
          color: 'var(--warning-700)',
          marginBottom: 16,
          padding: '10px 12px',
          background: 'var(--warning-50)',
          borderRadius: 10,
          border: '1px solid var(--warning-500)',
        }}
      >
        No hay mesas disponibles en este momento.
      </p>
    );
  }

  return (
    <div style={{ marginBottom: 16 }}>
      <div
        style={{ display: 'flex', gap: 12, marginBottom: 12, fontSize: 11, color: 'var(--neutral-500)' }}
      >
        <span style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
          <span
            style={{
              width: 9,
              height: 9,
              borderRadius: 2,
              background: 'var(--success-500)',
              display: 'inline-block',
            }}
          />
          Libre
        </span>
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: 8 }}>
        {tables.map((t) => {
          const isSelected = selectedTableId === t.id;
          return (
            <button
              key={t.id}
              type="button"
              onClick={() => setSelectedTable(isSelected ? null : t.id)}
              aria-label={`Mesa ${t.code}`}
              aria-pressed={isSelected}
              style={{
                appearance: 'none',
                aspectRatio: '1',
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                justifyContent: 'center',
                cursor: 'pointer',
                border: isSelected
                  ? '2.5px solid var(--brand-500)'
                  : '1.5px solid var(--success-500)',
                background: isSelected ? 'var(--brand-50)' : 'var(--success-50)',
                color: isSelected ? 'var(--brand-700)' : 'var(--success-700)',
                borderRadius: 10,
                fontFamily: 'var(--font-mono)',
                fontSize: 13,
                fontWeight: 700,
                position: 'relative',
              }}
            >
              {t.code.replace(/^M0?/, '')}
              {isSelected && (
                <span
                  style={{
                    position: 'absolute',
                    top: 3,
                    right: 3,
                    background: 'var(--brand-500)',
                    color: '#fff',
                    borderRadius: '50%',
                    width: 14,
                    height: 14,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                  }}
                >
                  <Check size={10} />
                </span>
              )}
            </button>
          );
        })}
      </div>
    </div>
  );
}
