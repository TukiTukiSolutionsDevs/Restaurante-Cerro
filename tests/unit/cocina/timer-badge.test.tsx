import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';

import { TimerBadge } from '@/app/cocina/_components/timer-badge';

afterEach(cleanup);

function makeProps(minutesElapsed: number) {
  const paidAt = new Date(Date.now() - minutesElapsed * 60 * 1000).toISOString();
  return { paidAt, now: Date.now() };
}

describe('TimerBadge', () => {
  it('renders elapsed time as mm:ss', () => {
    render(<TimerBadge {...makeProps(0)} />);
    const el = screen.getByLabelText(/tiempo transcurrido/i);
    expect(el.textContent).toMatch(/^\d{2}:\d{2}$/);
  });

  it('applies success color for elapsed < 5 min', () => {
    render(<TimerBadge {...makeProps(2)} />);
    const el = screen.getByLabelText(/tiempo transcurrido/i);
    expect(el.getAttribute('style')).toContain('--success-400');
  });

  it('applies warning color for elapsed 5–10 min', () => {
    render(<TimerBadge {...makeProps(7)} />);
    const el = screen.getByLabelText(/tiempo transcurrido/i);
    expect(el.getAttribute('style')).toContain('--warning-400');
  });

  it('applies danger color and pulse-soft for elapsed > 10 min', () => {
    render(<TimerBadge {...makeProps(12)} />);
    const el = screen.getByLabelText(/tiempo transcurrido/i);
    expect(el.getAttribute('style')).toContain('--danger-400');
    expect(el.className).toContain('pulse-soft');
  });

  it('formats time as mm:ss around 3–4 min', () => {
    render(<TimerBadge {...makeProps(3.5)} />);
    const el = screen.getByLabelText(/tiempo transcurrido/i);
    expect(el.textContent).toMatch(/^0[2-4]:\d{2}$/);
  });

  it('does not have pulse-soft for elapsed < 10 min', () => {
    render(<TimerBadge {...makeProps(4)} />);
    const el = screen.getByLabelText(/tiempo transcurrido/i);
    expect(el.className).not.toContain('pulse-soft');
  });
});
