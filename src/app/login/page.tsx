'use client';

import { Mountain } from 'lucide-react';
import { useRouter, useSearchParams } from 'next/navigation';
import { Suspense, useCallback, useEffect, useRef, useState } from 'react';

import { PinPad } from '@/components/auth/pin-pad';

type StaffRole = 'cashier' | 'waiter' | 'admin';

const VALID_ROLES: StaffRole[] = ['cashier', 'waiter', 'admin'];

const ROLE_LABELS: Record<StaffRole, string> = {
  cashier: 'Cajero',
  waiter:  'Mozo',
  admin:   'Administrador',
};

const DEFAULT_REDIRECT: Record<StaffRole, string> = {
  cashier: '/caja',
  waiter:  '/mozo',
  admin:   '/admin',
};

function isValidRole(value: string | null): value is StaffRole {
  return VALID_ROLES.includes(value as StaffRole);
}

function CerroLogo() {
  return (
    <div className="flex items-center gap-2">
      <Mountain className="h-8 w-8 text-brand-600" />
      <span className="font-display text-2xl font-bold text-neutral-800">Cerro</span>
    </div>
  );
}

// ─── Role picker ─────────────────────────────────────────────────────────────

function RolePicker() {
  const router = useRouter();
  return (
    <div className="flex flex-col items-center gap-6">
      <CerroLogo />
      <div className="text-center">
        <h1 className="font-display text-2xl font-bold text-neutral-800">Identifícate</h1>
        <p className="mt-1 text-sm text-neutral-500">Selecciona tu rol para continuar</p>
      </div>
      <div className="flex w-full flex-col gap-3">
        {VALID_ROLES.map((role) => (
          <button
            key={role}
            type="button"
            onClick={() => router.push(`/login?role=${role}`)}
            className="rounded-xl border border-neutral-200 bg-neutral-50 px-6 py-4 text-base font-semibold text-neutral-800 transition-all hover:bg-brand-50 hover:border-brand-300 hover:text-brand-700 active:scale-95"
          >
            {ROLE_LABELS[role]}
          </button>
        ))}
      </div>
    </div>
  );
}

// ─── Pin login form ───────────────────────────────────────────────────────────

function PinLoginForm({ role, redirectTo }: { role: StaffRole; redirectTo: string }) {
  const router = useRouter();
  const [error, setError] = useState<string | undefined>();
  const [locked, setLocked] = useState(false);
  const [loading, setLoading] = useState(false);
  const [countdownSec, setCountdownSec] = useState(0);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  function startCountdown(ms: number) {
    setCountdownSec(Math.ceil(ms / 1000));
    intervalRef.current = setInterval(() => {
      setCountdownSec((prev) => {
        if (prev <= 1) {
          if (intervalRef.current) clearInterval(intervalRef.current);
          setLocked(false);
          return 0;
        }
        return prev - 1;
      });
    }, 1000);
  }

  useEffect(() => {
    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, []);

  const handleSubmit = useCallback(
    async (pin: string) => {
      if (locked || loading) return;
      setLoading(true);
      setError(undefined);

      try {
        const res = await fetch('/api/staff/login', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ role, pin }),
        });

        if (res.ok) {
          const data = (await res.json()) as { redirectTo: string };
          router.push(redirectTo !== '' ? redirectTo : data.redirectTo);
          return;
        }

        if (res.status === 429) {
          const data = (await res.json()) as { retryAfterMs: number };
          setLocked(true);
          setError('Cuenta bloqueada 15 min por seguridad.');
          startCountdown(data.retryAfterMs);
          return;
        }

        if (res.status === 401) {
          const data = (await res.json()) as { remaining: number };
          setError(`PIN incorrecto. Te quedan ${data.remaining} intentos.`);
          return;
        }

        setError('Error inesperado. Intenta de nuevo.');
      } catch {
        setError('Error de conexión. Intenta de nuevo.');
      } finally {
        setLoading(false);
      }
    },
    [role, redirectTo, router, locked, loading],
  );

  return (
    <div className="flex flex-col items-center gap-6">
      <CerroLogo />
      <div className="text-center">
        <h1 className="font-display text-2xl font-bold text-neutral-800">Identifícate</h1>
      </div>

      {/* Role chip */}
      <div className="rounded-full bg-brand-50 px-4 py-1.5 text-sm font-semibold text-brand-700">
        {ROLE_LABELS[role]}
      </div>

      {locked && countdownSec > 0 && (
        <p className="text-sm text-neutral-500">Reintenta en {countdownSec}s</p>
      )}

      <PinPad
        onSubmit={handleSubmit}
        disabled={loading || locked}
        error={error}
      />

      <button
        type="button"
        onClick={() => router.push('/login')}
        className="text-sm text-neutral-500 underline-offset-2 hover:underline"
      >
        Cambiar rol
      </button>
    </div>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────

function LoginContent() {
  const searchParams = useSearchParams();
  const roleParam = searchParams.get('role');
  const redirectParam = searchParams.get('redirect') ?? '';

  if (!isValidRole(roleParam)) {
    return <RolePicker />;
  }

  const redirectTo = redirectParam !== '' ? redirectParam : DEFAULT_REDIRECT[roleParam];

  return <PinLoginForm role={roleParam} redirectTo={redirectTo} />;
}

export default function LoginPage() {
  return (
    <main className="flex min-h-screen items-center justify-center bg-neutral-50 px-4">
      <div className="w-full max-w-sm rounded-2xl border border-neutral-200 bg-white p-8 shadow-md">
        <Suspense
          fallback={<p className="text-center text-sm text-neutral-400">Cargando…</p>}
        >
          <LoginContent />
        </Suspense>
      </div>
    </main>
  );
}
