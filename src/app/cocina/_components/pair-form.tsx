'use client';

import { ChefHat } from 'lucide-react';
import { useState } from 'react';

export function PairForm() {
  const [pin, setPin] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);

    try {
      const res = await fetch('/api/kitchen/device-pair', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ pin }),
      });

      if (res.ok) {
        window.location.reload();
        return;
      }

      const data = (await res.json()) as { error?: { code?: string } };
      if (res.status === 429) {
        setError('Demasiados intentos. Espera unos minutos.');
      } else if (data?.error?.code === 'INVALID_PIN') {
        setError('PIN incorrecto. Inténtalo de nuevo.');
      } else {
        setError('Error al conectar. Inténtalo de nuevo.');
      }
    } catch {
      setError('Error al conectar. Inténtalo de nuevo.');
    } finally {
      setLoading(false);
      setPin('');
    }
  }

  const disabled = pin.length < 6 || loading;

  return (
    <div
      className="dark min-h-screen flex items-center justify-center"
      style={{ background: 'var(--neutral-950)' }}
    >
      <div
        className="rounded-3xl p-10 w-full max-w-sm flex flex-col gap-6 border"
        style={{ background: 'var(--neutral-900)', borderColor: 'var(--neutral-700)' }}
      >
        <div className="flex flex-col items-center gap-3">
          <ChefHat size={40} style={{ color: 'var(--brand-400)' }} />
          <h1
            className="text-2xl font-bold text-center"
            style={{ fontFamily: 'var(--font-display)', color: 'var(--neutral-50)' }}
          >
            Vincular dispositivo
          </h1>
          <p className="text-sm text-center" style={{ color: 'var(--neutral-400)' }}>
            Ingresa el PIN de 6 dígitos
          </p>
        </div>

        <form onSubmit={handleSubmit} className="flex flex-col gap-4">
          <input
            type="password"
            inputMode="numeric"
            pattern="[0-9]*"
            maxLength={6}
            value={pin}
            onChange={(e) => setPin(e.target.value.replace(/\D/g, ''))}
            placeholder="······"
            className="rounded-xl text-center text-3xl tracking-widest px-4 py-4 focus:outline-none border"
            style={{
              background: 'var(--neutral-800)',
              borderColor: 'var(--neutral-600)',
              color: 'var(--neutral-50)',
              fontFamily: 'var(--font-mono)',
            }}
            autoFocus
            disabled={loading}
          />

          {error && (
            <p className="text-sm text-center" role="alert" style={{ color: 'var(--danger-400)' }}>
              {error}
            </p>
          )}

          <button
            type="submit"
            disabled={disabled}
            className="rounded-xl font-semibold py-3 transition-colors"
            style={{
              background: disabled ? 'var(--neutral-700)' : 'var(--brand-500)',
              color: disabled ? 'var(--neutral-500)' : 'var(--neutral-50)',
            }}
          >
            {loading ? 'Verificando…' : 'Ingresar'}
          </button>
        </form>
      </div>
    </div>
  );
}
