import { act, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { useChime } from '@/lib/audio/use-chime';

// ─── localStorage mock ────────────────────────────────────────────────────────

function makeLocalStorage() {
  const store: Record<string, string> = {};
  return {
    getItem: (key: string) => store[key] ?? null,
    setItem: (key: string, value: string) => { store[key] = value; },
    removeItem: (key: string) => { delete store[key]; },
    clear: () => { Object.keys(store).forEach((k) => delete store[k]); },
  };
}

let ls: ReturnType<typeof makeLocalStorage>;

// ─── HTMLAudioElement mock ─────────────────────────────────────────────────────

let mockAudio: {
  play: ReturnType<typeof vi.fn>;
  volume: number;
  currentTime: number;
};

beforeEach(() => {
  ls = makeLocalStorage();
  vi.stubGlobal('localStorage', ls);
  mockAudio = { play: vi.fn().mockResolvedValue(undefined), volume: 1, currentTime: 0 };
  // Regular function (not arrow) so it works as a constructor with `new`
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  vi.stubGlobal('Audio', vi.fn(function (this: any) { return mockAudio; }));
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('useChime', () => {
  it('returns play, muted, toggleMute', () => {
    const { result } = renderHook(() => useChime('/sounds/new-ticket.mp3'));
    expect(typeof result.current.play).toBe('function');
    expect(typeof result.current.muted).toBe('boolean');
    expect(typeof result.current.toggleMute).toBe('function');
  });

  it('muted starts as false when localStorage is empty', () => {
    const { result } = renderHook(() => useChime('/sounds/new-ticket.mp3'));
    // After mount effect: localStorage has no value → stays false
    expect(result.current.muted).toBe(false);
  });

  it('muted starts as true when localStorage has cerro_kitchen_muted=true', () => {
    ls.setItem('cerro_kitchen_muted', 'true');
    const { result } = renderHook(() => useChime('/sounds/new-ticket.mp3'));
    // After mount useEffect runs and updates state to true
    expect(result.current.muted).toBe(true);
  });

  it('play() calls audio.play when not muted', () => {
    const { result } = renderHook(() => useChime('/sounds/new-ticket.mp3'));
    act(() => { result.current.play(); });
    expect(mockAudio.play).toHaveBeenCalledOnce();
  });

  it('play() is a no-op when muted', () => {
    ls.setItem('cerro_kitchen_muted', 'true');
    const { result } = renderHook(() => useChime('/sounds/new-ticket.mp3'));
    act(() => { result.current.play(); });
    expect(mockAudio.play).not.toHaveBeenCalled();
  });

  it('toggleMute flips muted from false to true', () => {
    const { result } = renderHook(() => useChime('/sounds/new-ticket.mp3'));
    expect(result.current.muted).toBe(false);
    act(() => { result.current.toggleMute(); });
    expect(result.current.muted).toBe(true);
    expect(ls.getItem('cerro_kitchen_muted')).toBe('true');
  });

  it('toggleMute flips muted from true to false', () => {
    ls.setItem('cerro_kitchen_muted', 'true');
    const { result } = renderHook(() => useChime('/sounds/new-ticket.mp3'));
    act(() => { result.current.toggleMute(); });
    expect(result.current.muted).toBe(false);
    expect(ls.getItem('cerro_kitchen_muted')).toBe('false');
  });

  it('persists mute state to localStorage after toggle', () => {
    const { result } = renderHook(() => useChime('/sounds/new-ticket.mp3'));
    act(() => { result.current.toggleMute(); });
    expect(ls.getItem('cerro_kitchen_muted')).toBe('true');
    act(() => { result.current.toggleMute(); });
    expect(ls.getItem('cerro_kitchen_muted')).toBe('false');
  });

  it('creates Audio with correct src', () => {
    renderHook(() => useChime('/sounds/custom.mp3'));
    expect(vi.mocked(Audio)).toHaveBeenCalledWith('/sounds/custom.mp3');
  });

  it('sets audio volume from opts', () => {
    renderHook(() => useChime('/sounds/new-ticket.mp3', { volume: 0.5 }));
    expect(mockAudio.volume).toBe(0.5);
  });

  it('play() resets currentTime before calling play', () => {
    const { result } = renderHook(() => useChime('/sounds/new-ticket.mp3'));
    mockAudio.currentTime = 5;
    act(() => { result.current.play(); });
    expect(mockAudio.currentTime).toBe(0);
    expect(mockAudio.play).toHaveBeenCalledOnce();
  });
});
