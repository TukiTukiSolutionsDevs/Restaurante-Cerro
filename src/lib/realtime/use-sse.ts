'use client';

import { useEffect, useRef, useState } from 'react';

export type SseStatus = 'connecting' | 'connected' | 'reconnecting' | 'closed';

export interface UseSseOptions<TSnapshot, TUpdate> {
  url: string;
  /** Override individual event names (defaults: 'snapshot', 'update', 'reconnected') */
  eventNames?: { snapshot?: string; update?: string; reconnected?: string };
  /** Initial backoff in ms (default 1000) */
  initialBackoffMs?: number;
  /** Max backoff in ms (default 30000) */
  maxBackoffMs?: number;
  onSnapshot?: (data: TSnapshot) => void;
  onUpdate?: (data: TUpdate) => void;
  /** Called when server hints its bus reconnected; callers should invalidate caches */
  onReconnect?: () => void;
  /** Inject a custom EventSource for tests */
  eventSourceFactory?: (url: string) => EventSourceLike;
}

export type SseEventCallback =
  | (() => void)
  | ((ev: { data: string }) => void)
  | ((ev: Event) => void);

export interface EventSourceLike {
  addEventListener(event: string, cb: (ev: { data: string }) => void): void;
  addEventListener(event: 'error', cb: (ev: Event) => void): void;
  addEventListener(event: 'open', cb: () => void): void;
  removeEventListener(event: string, cb: SseEventCallback): void;
  close(): void;
}

export interface UseSseResult<TSnapshot, TUpdate> {
  status: SseStatus;
  snapshot: TSnapshot | null;
  lastUpdate: TUpdate | null;
}

export function useSse<TSnapshot, TUpdate>(
  opts: UseSseOptions<TSnapshot, TUpdate>,
): UseSseResult<TSnapshot, TUpdate> {
  const {
    url,
    eventNames,
    initialBackoffMs = 1000,
    maxBackoffMs = 30000,
    onSnapshot,
    onUpdate,
    onReconnect,
    eventSourceFactory,
  } = opts;

  const snapshotEvent = eventNames?.snapshot ?? 'snapshot';
  const updateEvent = eventNames?.update ?? 'update';
  const reconnectedEvent = eventNames?.reconnected ?? 'reconnected';

  const [status, setStatus] = useState<SseStatus>('connecting');
  const [snapshot, setSnapshot] = useState<TSnapshot | null>(null);
  const [lastUpdate, setLastUpdate] = useState<TUpdate | null>(null);

  // Keep latest callbacks in refs so they don't need to be in the effect deps.
  const onSnapshotRef = useRef(onSnapshot);
  const onUpdateRef = useRef(onUpdate);
  const onReconnectRef = useRef(onReconnect);
  useEffect(() => { onSnapshotRef.current = onSnapshot; }, [onSnapshot]);
  useEffect(() => { onUpdateRef.current = onUpdate; }, [onUpdate]);
  useEffect(() => { onReconnectRef.current = onReconnect; }, [onReconnect]);

  const backoffRef = useRef(initialBackoffMs);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const esRef = useRef<EventSourceLike | null>(null);

  useEffect(() => {
    backoffRef.current = initialBackoffMs;

    function createEs(u: string): EventSourceLike {
      if (eventSourceFactory) return eventSourceFactory(u);
      return new window.EventSource(u) as unknown as EventSourceLike;
    }

    function connect() {
      const es = createEs(url);
      esRef.current = es;

      const handleOpen = () => {
        setStatus('connected');
        backoffRef.current = initialBackoffMs;
      };

      const handleSnapshot = (ev: { data: string }) => {
        try {
          const data = JSON.parse(ev.data) as TSnapshot;
          setSnapshot(data);
          onSnapshotRef.current?.(data);
        } catch {
          // ignore malformed JSON frames
        }
      };

      const handleUpdate = (ev: { data: string }) => {
        try {
          const data = JSON.parse(ev.data) as TUpdate;
          setLastUpdate(data);
          onUpdateRef.current?.(data);
        } catch {
          // ignore malformed JSON frames
        }
      };

      const handleReconnected = () => {
        onReconnectRef.current?.();
      };

      const handleError = () => {
        setStatus('reconnecting');
        es.removeEventListener('open', handleOpen);
        es.removeEventListener(snapshotEvent, handleSnapshot);
        es.removeEventListener(updateEvent, handleUpdate);
        es.removeEventListener(reconnectedEvent, handleReconnected);
        es.removeEventListener('error', handleError);
        es.close();
        esRef.current = null;

        // Full jitter: delay = random() * currentBackoff
        const delay = Math.floor(Math.random() * backoffRef.current);
        backoffRef.current = Math.min(backoffRef.current * 2, maxBackoffMs);
        timerRef.current = setTimeout(connect, delay);
      };

      es.addEventListener('open', handleOpen);
      es.addEventListener(snapshotEvent, handleSnapshot);
      es.addEventListener(updateEvent, handleUpdate);
      es.addEventListener(reconnectedEvent, handleReconnected);
      es.addEventListener('error', handleError);
    }

    connect();

    return () => {
      if (timerRef.current !== null) {
        clearTimeout(timerRef.current);
        timerRef.current = null;
      }
      if (esRef.current !== null) {
        esRef.current.close();
        esRef.current = null;
      }
    };
  }, [url, initialBackoffMs, maxBackoffMs, snapshotEvent, updateEvent, reconnectedEvent, eventSourceFactory]);

  return { status, snapshot, lastUpdate };
}
