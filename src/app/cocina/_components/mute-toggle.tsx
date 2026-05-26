'use client';

import { Volume2, VolumeX } from 'lucide-react';

interface Props {
  muted: boolean;
  onToggle: () => void;
}

export function MuteToggle({ muted, onToggle }: Props) {
  return (
    <button
      onClick={onToggle}
      className="rounded-lg border px-3 py-1.5 text-sm flex items-center gap-1.5 transition-colors"
      style={{
        borderColor: 'var(--neutral-700)',
        color: muted ? 'var(--neutral-500)' : 'var(--neutral-300)',
      }}
      aria-label={muted ? 'Activar sonido' : 'Silenciar'}
    >
      {muted ? <VolumeX size={14} /> : <Volume2 size={14} />}
      {muted ? 'Sin sonido' : 'Con sonido'}
    </button>
  );
}
