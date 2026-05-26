'use client';

import { useCallback, useEffect, useRef, useState } from 'react';

const STORAGE_KEY = 'cerro_kitchen_muted';

export interface UseChimeResult {
  play: () => void;
  muted: boolean;
  toggleMute: () => void;
}

export function useChime(
  src: string,
  opts?: { volume?: number },
): UseChimeResult {
  const [muted, setMuted] = useState(() => {
    if (typeof window === 'undefined') return false;
    return localStorage.getItem(STORAGE_KEY) === 'true';
  });
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const volume = opts?.volume ?? 1;

  useEffect(() => {
    const audio = new Audio(src);
    audio.volume = volume;
    audioRef.current = audio;
    return () => {
      audioRef.current = null;
    };
  }, [src, volume]);

  const play = useCallback(() => {
    if (muted || !audioRef.current) return;
    const audio = audioRef.current;
    audio.currentTime = 0;
    audio.play().catch(() => {
      // Autoplay policy — silently ignore
    });
  }, [muted]);

  const toggleMute = useCallback(() => {
    setMuted((prev) => {
      const next = !prev;
      localStorage.setItem(STORAGE_KEY, String(next));
      return next;
    });
  }, []);

  return { play, muted, toggleMute };
}
