'use client';

import { Clock } from 'lucide-react';

interface Props {
  paidAt: string;
  now: number;
}

function formatElapsed(seconds: number): string {
  const mm = String(Math.floor(seconds / 60)).padStart(2, '0');
  const ss = String(Math.floor(seconds % 60)).padStart(2, '0');
  return `${mm}:${ss}`;
}

export function TimerBadge({ paidAt, now }: Props) {
  const elapsed = Math.max(0, (now - new Date(paidAt).getTime()) / 1000);
  const minutes = elapsed / 60;

  let color: string;
  let pulse = false;

  if (minutes < 5) {
    color = 'var(--success-400)';
  } else if (minutes < 10) {
    color = 'var(--warning-400)';
  } else {
    color = 'var(--danger-400)';
    pulse = true;
  }

  return (
    <span
      className={`flex items-center gap-1 font-mono text-sm tabnum${pulse ? ' pulse-soft' : ''}`}
      style={{ color }}
      aria-label={`Tiempo transcurrido: ${formatElapsed(elapsed)}`}
    >
      <Clock size={12} />
      {formatElapsed(elapsed)}
    </span>
  );
}
