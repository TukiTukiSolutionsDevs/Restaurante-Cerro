'use client';

import { Receipt } from 'lucide-react';
import { useCallback, useEffect, useRef, useState } from 'react';
import { toast } from 'sonner';

import type { CashierQueuePayload } from '@/app/api/sse/cashier-queue/route';
import { useSse } from '@/lib/realtime/use-sse';
import {
  cancelAction,
  confirmAction,
  lookupAction,
  undoAction,
} from '@/server/actions/cashier';
import type { CashierOrderView } from '@/server/services/cashier';

import { ConfirmForm } from './confirm-form';
import { LookupForm } from './lookup-form';
import { OrderDetail } from './order-detail';
import { PendingQueue } from './pending-queue';
import { RecentConfirmed } from './recent-confirmed';
import { SummaryWidget } from './summary-widget';

interface Props {
  initialPending: CashierOrderView[];
  initialConfirmed: CashierOrderView[];
  initialSummary: { paidCount: number; cashCents: number; yapeCents: number };
  displayName: string;
}

function HotkeyHint({ k, label }: { k: string; label: string }) {
  return (
    <div className="flex items-center gap-1.5">
      <kbd className="rounded border border-neutral-300 bg-white px-1.5 py-0.5 font-mono text-[10px] font-semibold text-neutral-600">
        {k}
      </kbd>
      <span>{label}</span>
    </div>
  );
}

export function CashierShell({ initialPending, initialConfirmed, initialSummary, displayName }: Props) {
  const [currentOrder, setCurrentOrder] = useState<CashierOrderView | null>(null);
  const [paymentMethod, setPaymentMethod] = useState<'cash' | 'yape' | null>(null);
  const [yapeRef, setYapeRef] = useState('');
  const [idempotencyKey, setIdempotencyKey] = useState(() => crypto.randomUUID());
  const [isLooking, setIsLooking] = useState(false);
  const [isConfirming, setIsConfirming] = useState(false);
  const [isCancelling, setIsCancelling] = useState(false);
  const [pending, setPending] = useState<CashierOrderView[]>(initialPending);
  const [confirmed, setConfirmed] = useState<CashierOrderView[]>(initialConfirmed);
  const [summary, setSummary] = useState(initialSummary);
  const [soundEnabled, setSoundEnabled] = useState(() => {
    if (typeof window === 'undefined') return true;
    return localStorage.getItem('caja-sound-enabled') !== 'false';
  });

  const prevPendingLenRef = useRef(initialPending.length);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const lookupInputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    audioRef.current = new Audio('/sounds/new-order.mp3');
  }, []);

  useEffect(() => {
    if (pending.length > prevPendingLenRef.current && soundEnabled && audioRef.current) {
      audioRef.current.play().catch(() => undefined);
    }
    prevPendingLenRef.current = pending.length;
  }, [pending.length, soundEnabled]);

  useSse<CashierQueuePayload, CashierQueuePayload>({
    url: '/api/sse/cashier-queue',
    onSnapshot: (data) => {
      setPending(data.pending as CashierOrderView[]);
      setSummary(data.summary);
    },
    onUpdate: (data) => {
      setPending(data.pending as CashierOrderView[]);
      setSummary(data.summary);
    },
  });

  const clearOrder = useCallback(() => {
    setCurrentOrder(null);
    setPaymentMethod(null);
    setYapeRef('');
    setTimeout(() => lookupInputRef.current?.focus(), 50);
  }, []);

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement).tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA') return;
      if (e.key === '1') setPaymentMethod('cash');
      if (e.key === '2') setPaymentMethod('yape');
      if (e.key === 'Escape') clearOrder();
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [clearOrder]);

  const handleLookup = useCallback(async (code: string) => {
    setIsLooking(true);
    try {
      const result = await lookupAction(code);
      if (!result.ok) { toast.error(result.error.message); return; }
      if (!result.data) { toast.error('Pedido no encontrado'); return; }
      setCurrentOrder(result.data as CashierOrderView);
      setPaymentMethod(null);
      setYapeRef('');
      setIdempotencyKey(crypto.randomUUID());
    } finally {
      setIsLooking(false);
    }
  }, []);

  const handleConfirm = useCallback(async () => {
    if (!currentOrder || !paymentMethod) return;
    setIsConfirming(true);
    try {
      const result = await confirmAction({
        orderId: currentOrder.orderId,
        paymentMethod,
        yapeReference: paymentMethod === 'yape' && yapeRef ? yapeRef : undefined,
        idempotencyKey,
        qrWasExpiredAtConfirm: new Date(currentOrder.qrExpiresAt) < new Date(),
      });
      if (!result.ok) { toast.error(result.error.message); return; }
      toast.success('Pedido enviado a cocina');
      clearOrder();
    } finally {
      setIsConfirming(false);
    }
  }, [currentOrder, paymentMethod, yapeRef, idempotencyKey, clearOrder]);

  const handleUndo = useCallback(async (orderId: string) => {
    const result = await undoAction(orderId);
    if (!result.ok) { toast.error(result.error.message); return; }
    toast.success('Pago revertido — pedido vuelve a la cola');
  }, []);

  const handleCancel = useCallback(async (orderId: string, reason: string) => {
    setIsCancelling(true);
    try {
      const result = await cancelAction({ orderId, reason });
      if (!result.ok) { toast.error(result.error.message); return; }
      toast.success('Pedido cancelado');
      if (currentOrder?.orderId === orderId) clearOrder();
    } finally {
      setIsCancelling(false);
    }
  }, [currentOrder, clearOrder]);

  const toggleSound = useCallback(() => {
    setSoundEnabled((prev) => {
      const next = !prev;
      localStorage.setItem('caja-sound-enabled', String(next));
      return next;
    });
  }, []);

  const initials = displayName
    .split(' ')
    .slice(0, 2)
    .map((w) => w[0]?.toUpperCase() ?? '')
    .join('');

  return (
    <div className="grid min-h-screen grid-cols-1 bg-neutral-100 lg:grid-cols-[3fr_2fr]">
      {/* IZQUIERDA — 60% */}
      <div className="flex flex-col gap-5 overflow-y-auto border-r border-neutral-200 bg-white p-6 lg:p-7">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-neutral-200 pb-4">
          <div>
            <div className="text-[11px] font-semibold uppercase tracking-widest text-neutral-500">
              Caja
            </div>
            <h1 className="font-display text-2xl font-extrabold text-neutral-800">
              Cobrar pedido
            </h1>
          </div>
          <div className="flex items-center gap-2.5 text-sm text-neutral-600">
            <div className="flex h-8 w-8 items-center justify-center rounded-full bg-brand-500 text-xs font-bold text-white">
              {initials}
            </div>
            {displayName}
          </div>
        </div>

        {/* Lookup */}
        <LookupForm
          inputRef={lookupInputRef}
          isLoading={isLooking}
          onLookup={handleLookup}
        />

        {/* Order detail + confirm, or empty state */}
        {currentOrder ? (
          <div className="flex flex-col gap-4">
            <OrderDetail
              order={currentOrder}
              onCancel={(reason) => handleCancel(currentOrder.orderId, reason)}
              isCancelling={isCancelling}
            />
            <ConfirmForm
              paymentMethod={paymentMethod}
              yapeRef={yapeRef}
              isConfirming={isConfirming}
              order={currentOrder}
              onMethodChange={setPaymentMethod}
              onYapeRefChange={setYapeRef}
              onConfirm={handleConfirm}
            />
          </div>
        ) : (
          <div className="flex min-h-[260px] flex-1 flex-col items-center justify-center gap-3 rounded-xl border border-dashed border-neutral-200 bg-white p-6 text-center">
            <Receipt className="h-11 w-11 text-neutral-300" />
            <p className="text-sm font-semibold text-neutral-500">
              Escanea el QR o pide el código
            </p>
            <p className="max-w-xs text-xs text-neutral-400">
              El cliente lo lleva en su celular. Si no lo trae, dile el código de 4 letras.
            </p>
          </div>
        )}

        {/* Hotkeys footer */}
        <div className="mt-auto flex gap-4 border-t border-neutral-200 pt-3 text-[11px] text-neutral-400">
          <HotkeyHint k="Enter" label="buscar/confirmar" />
          <HotkeyHint k="1" label="efectivo" />
          <HotkeyHint k="2" label="Yape" />
          <HotkeyHint k="Esc" label="limpiar" />
        </div>
      </div>

      {/* DERECHA — 40% */}
      <div className="flex flex-col gap-4 overflow-y-auto bg-neutral-50 p-6">
        <SummaryWidget
          summary={summary}
          soundEnabled={soundEnabled}
          onToggleSound={toggleSound}
        />

        <PendingQueue
          orders={pending}
          currentOrderId={currentOrder?.orderId}
          onSelect={(order) => {
            setCurrentOrder(order as CashierOrderView);
            setPaymentMethod(null);
            setYapeRef('');
            setIdempotencyKey(crypto.randomUUID());
          }}
        />

        <RecentConfirmed orders={confirmed} onUndo={handleUndo} />
      </div>
    </div>
  );
}
