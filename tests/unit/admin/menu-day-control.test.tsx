import { fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const { mockOpenDay, mockCloseDay } = vi.hoisted(() => ({
  mockOpenDay: vi.fn().mockResolvedValue({ ok: true, data: undefined }),
  mockCloseDay: vi.fn().mockResolvedValue({ ok: true, data: undefined }),
}));

vi.mock('@/server/actions/menu', () => ({
  openDayAction: mockOpenDay,
  closeDayAction: mockCloseDay,
}));

import { DayControl } from '@/app/admin/menu/_components/day-control';

beforeEach(() => vi.clearAllMocks());

describe('DayControl', () => {
  it('shows Borrador badge and disabled open button when draft without combo', () => {
    render(
      <DayControl menuId={1} status="draft" hasCombo={false} shiftNumber={0} />,
    );
    expect(screen.getByText(/borrador/i)).toBeInTheDocument();
    const btn = screen.getByRole('button', { name: /abrir día/i });
    expect(btn).toBeDisabled();
    expect(screen.getByText(/configura los precios/i)).toBeInTheDocument();
  });

  it('shows enabled open button when draft with combo', () => {
    render(
      <DayControl menuId={1} status="draft" hasCombo={true} shiftNumber={0} />,
    );
    const btn = screen.getByRole('button', { name: /abrir día/i });
    expect(btn).not.toBeDisabled();
    expect(screen.queryByText(/configura los precios/i)).not.toBeInTheDocument();
  });

  it('calls openDayAction with menuId when open button clicked', async () => {
    render(
      <DayControl menuId={42} status="draft" hasCombo={true} shiftNumber={0} />,
    );
    fireEvent.click(screen.getByRole('button', { name: /abrir día/i }));
    expect(mockOpenDay).toHaveBeenCalledWith(42);
  });

  it('shows Abierto badge and Cerrar día button when opened on first shift', () => {
    render(
      <DayControl menuId={1} status="opened" hasCombo={true} shiftNumber={1} />,
    );
    expect(screen.getByText(/^abierto$/i)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /cerrar día/i })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /abrir día/i })).not.toBeInTheDocument();
  });

  it('shows Turno N badge when reopened beyond first shift', () => {
    render(
      <DayControl menuId={1} status="opened" hasCombo={true} shiftNumber={2} />,
    );
    expect(screen.getByText(/turno 2 abierto/i)).toBeInTheDocument();
  });

  it('calls closeDayAction with menuId when close button clicked', async () => {
    render(
      <DayControl menuId={7} status="opened" hasCombo={true} shiftNumber={1} />,
    );
    fireEvent.click(screen.getByRole('button', { name: /cerrar día/i }));
    expect(mockCloseDay).toHaveBeenCalledWith(7);
  });

  it('shows reopen-as-next-shift button when closed', () => {
    render(
      <DayControl menuId={1} status="closed" hasCombo={true} shiftNumber={1} />,
    );
    expect(screen.getByText(/turno 1 cerrado/i)).toBeInTheDocument();
    const reopen = screen.getByRole('button', { name: /reabrir como turno 2/i });
    expect(reopen).toBeInTheDocument();
    expect(reopen).not.toBeDisabled();
  });

  it('reopen button calls openDayAction with menuId', async () => {
    render(
      <DayControl menuId={9} status="closed" hasCombo={true} shiftNumber={2} />,
    );
    fireEvent.click(screen.getByRole('button', { name: /reabrir como turno 3/i }));
    expect(mockOpenDay).toHaveBeenCalledWith(9);
  });

  it('reopen button is disabled when no combo configured', () => {
    render(
      <DayControl menuId={1} status="closed" hasCombo={false} shiftNumber={1} />,
    );
    const reopen = screen.getByRole('button', { name: /reabrir como turno 2/i });
    expect(reopen).toBeDisabled();
  });
});
