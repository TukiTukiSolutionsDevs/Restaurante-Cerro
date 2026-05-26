'use client';

import { ChefHat } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';

import { useChime } from '@/lib/audio/use-chime';
import type { KitchenTicket } from '@/server/services/kitchen';

import { KitchenTicketCard } from './kitchen-ticket';
import { MuteToggle } from './mute-toggle';

const PAGE_SIZE = 16;
const PAGE_FLIP_MS = 10_000;
const BACKOFF_MS = [1_000, 2_000, 4_000, 8_000, 16_000, 30_000] as const;
const FLASH_DURATION_MS = 800;

export function KitchenBoard() {
  const [tickets, setTickets] = useState<KitchenTicket[]>([]);
  const [connected, setConnected] = useState(false);
  const [showOverlay, setShowOverlay] = useState(false);
  const [page, setPage] = useState(0);
  const [now, setNow] = useState(() => Date.now());
  const [flashingIds, setFlashingIds] = useState<Set<string>>(new Set());
  const seenRef = useRef<Set<string>>(new Set());
  const { play: playChime, muted, toggleMute } = useChime('/sounds/new-ticket.mp3');

  // Clock tick shared by all TimerBadge instances
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 1_000);
    return () => clearInterval(t);
  }, []);

  // SSE with exponential-backoff reconnect
  useEffect(() => {
    let es: EventSource | null = null;
    let timer: ReturnType<typeof setTimeout> | null = null;
    let attempt = 0;
    let destroyed = false;

    function connect() {
      if (destroyed) return;
      es = new EventSource('/api/sse/kitchen');

      es.addEventListener('snapshot', (ev) => {
        try {
          const snap = JSON.parse((ev as MessageEvent).data) as KitchenTicket[];
          setTickets(snap);
          setConnected(true);
          attempt = 0;
          seenRef.current = new Set(snap.map((t) => t.orderId));
        } catch { /* ignore malformed frame */ }
      });

      es.addEventListener('add', (ev) => {
        try {
          const ticket = JSON.parse((ev as MessageEvent).data) as KitchenTicket;
          setTickets((prev) => [...prev, ticket]);
          playChime();
          if (!seenRef.current.has(ticket.orderId)) {
            seenRef.current.add(ticket.orderId);
            setFlashingIds((prev) => new Set([...prev, ticket.orderId]));
            setTimeout(() => {
              setFlashingIds((prev) => {
                const next = new Set(prev);
                next.delete(ticket.orderId);
                return next;
              });
            }, FLASH_DURATION_MS);
          }
        } catch { /* ignore */ }
      });

      es.addEventListener('remove', (ev) => {
        try {
          const { orderId } = JSON.parse((ev as MessageEvent).data) as { orderId: string };
          setTickets((prev) => prev.filter((t) => t.orderId !== orderId));
          seenRef.current.delete(orderId);
        } catch { /* ignore */ }
      });

      es.onerror = () => {
        es?.close();
        es = null;
        setConnected(false);
        if (destroyed) return;
        const delay = BACKOFF_MS[Math.min(attempt, BACKOFF_MS.length - 1)]!;
        attempt++;
        timer = setTimeout(connect, delay);
      };
    }

    connect();

    return () => {
      destroyed = true;
      es?.close();
      if (timer !== null) clearTimeout(timer);
    };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Show reconnecting overlay after 5 s of disconnect
  useEffect(() => {
    const t = connected
      ? setTimeout(() => setShowOverlay(false), 0)
      : setTimeout(() => setShowOverlay(true), 5_000);
    return () => clearTimeout(t);
  }, [connected]);

  // Auto-pagination
  const pageCount = Math.max(1, Math.ceil(tickets.length / PAGE_SIZE));

  const prevCount = useRef(pageCount);
  useEffect(() => {
    if (prevCount.current !== pageCount) {
      setPage(0);
      prevCount.current = pageCount;
    }
  }, [pageCount]);

  useEffect(() => {
    if (pageCount <= 1) return;
    const t = setInterval(() => setPage((p) => (p + 1) % pageCount), PAGE_FLIP_MS);
    return () => clearInterval(t);
  }, [pageCount]);

  const safePage = Math.min(page, pageCount - 1);
  const visible = tickets.slice(safePage * PAGE_SIZE, (safePage + 1) * PAGE_SIZE);

  const timeStr = new Date(now).toLocaleTimeString('es-PE', {
    hour: '2-digit',
    minute: '2-digit',
  });

  return (
    <div
      className="dark min-h-screen flex flex-col"
      style={{ background: 'var(--neutral-950)', color: 'var(--neutral-50)' }}
    >
      {/* ── Header ── */}
      <header
        className="flex items-center justify-between px-6 py-4 shrink-0 border-b"
        style={{ borderColor: 'var(--neutral-800)' }}
      >
        <div className="flex items-center gap-3">
          <ChefHat size={24} style={{ color: 'var(--brand-400)' }} />
          <span
            className="font-semibold text-lg"
            style={{ fontFamily: 'var(--font-display)' }}
          >
            Cocina en vivo
          </span>
          <span
            className="h-2.5 w-2.5 rounded-full conn-dot"
            style={{ background: connected ? 'var(--success-400)' : 'var(--danger-400)' }}
            aria-label={connected ? 'Conectado' : 'Desconectado'}
          />
        </div>

        <div className="flex items-center gap-4">
          <span className="font-mono tabnum text-sm" style={{ color: 'var(--neutral-400)' }}>
            {timeStr}
          </span>
          {pageCount > 1 && (
            <span className="text-sm" style={{ color: 'var(--neutral-400)' }}>
              Pág. {safePage + 1}/{pageCount}
            </span>
          )}
          <MuteToggle muted={muted} onToggle={toggleMute} />
        </div>
      </header>

      {/* ── Ticket grid ── */}
      <main className="flex-1 p-4 overflow-hidden">
        {tickets.length === 0 ? (
          <div
            className="flex h-full items-center justify-center text-2xl"
            style={{ fontFamily: 'var(--font-display)', color: 'var(--neutral-600)' }}
          >
            Esperando pedidos…
          </div>
        ) : (
          <div className="grid grid-cols-2 gap-4 lg:grid-cols-3 2xl:grid-cols-4">
            {visible.map((ticket) => (
              <KitchenTicketCard
                key={ticket.orderId}
                ticket={ticket}
                flashing={flashingIds.has(ticket.orderId)}
                now={now}
              />
            ))}
          </div>
        )}
      </main>

      {/* ── Reconnecting overlay ── */}
      {showOverlay && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center"
          style={{ background: 'color-mix(in srgb, var(--neutral-950) 70%, transparent)' }}
          role="status"
          aria-live="polite"
        >
          <div
            className="rounded-2xl px-10 py-8 text-center shadow-2xl border"
            style={{ background: 'var(--neutral-800)', borderColor: 'var(--neutral-700)' }}
          >
            <p className="text-2xl font-semibold">Reconectando…</p>
            <p className="mt-1" style={{ color: 'var(--neutral-400)' }}>
              La conexión se restablecerá en breve
            </p>
          </div>
        </div>
      )}
    </div>
  );
}
