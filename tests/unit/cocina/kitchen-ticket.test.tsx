import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';

import { KitchenTicketCard } from '@/app/cocina/_components/kitchen-ticket';
import type { KitchenTicket } from '@/server/services/kitchen';

afterEach(cleanup);

// ─── Fixtures ─────────────────────────────────────────────────────────────────

function makeTicket(overrides: Partial<KitchenTicket> = {}): KitchenTicket {
  return {
    orderId: 'order-uuid-1',
    shortCode: 'A3F7',
    tableCode: 'M14',
    orderType: 'dine_in',
    withTupper: false,
    paidAt: new Date().toISOString(),
    items: [
      { name: 'Arroz con pollo', category: 'main', variant: 'full_combo', quantity: 1 },
    ],
    ...overrides,
  };
}

const BASE_PROPS = { flashing: false, now: Date.now() };

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('KitchenTicketCard', () => {
  it('renders short code in large bold mono font', () => {
    render(<KitchenTicketCard ticket={makeTicket()} {...BASE_PROPS} />);
    const el = screen.getByText('A3F7');
    expect(el.className).toContain('font-bold');
    expect(el.className).toContain('font-mono');
  });

  it('shows "Mesa M14" chip for dine_in orders', () => {
    render(<KitchenTicketCard ticket={makeTicket({ orderType: 'dine_in', tableCode: 'M14' })} {...BASE_PROPS} />);
    expect(screen.getByText('Mesa M14')).toBeDefined();
  });

  it('shows "Para llevar" chip for takeaway orders', () => {
    render(
      <KitchenTicketCard ticket={makeTicket({ orderType: 'takeaway', tableCode: null })} {...BASE_PROPS} />,
    );
    expect(screen.getByText(/para llevar/i)).toBeDefined();
  });

  it('shows tupper indicator when withTupper=true', () => {
    render(<KitchenTicketCard ticket={makeTicket({ withTupper: true })} {...BASE_PROPS} />);
    expect(screen.getByText(/con tupper/i)).toBeDefined();
  });

  it('does not show tupper indicator when withTupper=false', () => {
    render(<KitchenTicketCard ticket={makeTicket({ withTupper: false })} {...BASE_PROPS} />);
    expect(screen.queryByText(/con tupper/i)).toBeNull();
  });

  it('renders item name', () => {
    render(<KitchenTicketCard ticket={makeTicket()} {...BASE_PROPS} />);
    expect(screen.getByText('Arroz con pollo')).toBeDefined();
  });

  it('omits variant label for full_combo', () => {
    render(<KitchenTicketCard ticket={makeTicket()} {...BASE_PROPS} />);
    expect(screen.queryByText(/solo entrada/i)).toBeNull();
    expect(screen.queryByText(/solo segundo/i)).toBeNull();
  });

  it('shows variant label for only_starter', () => {
    render(
      <KitchenTicketCard
        ticket={makeTicket({
          items: [{ name: 'Caldo', category: 'starter', variant: 'only_starter', quantity: 1 }],
        })}
        {...BASE_PROPS}
      />,
    );
    expect(screen.getByText(/solo entrada/i)).toBeDefined();
  });

  it('shows variant label for only_main', () => {
    render(
      <KitchenTicketCard
        ticket={makeTicket({
          items: [{ name: 'Lomo', category: 'main', variant: 'only_main', quantity: 1 }],
        })}
        {...BASE_PROPS}
      />,
    );
    expect(screen.getByText(/solo segundo/i)).toBeDefined();
  });

  it('shows quantity suffix when quantity > 1', () => {
    render(
      <KitchenTicketCard
        ticket={makeTicket({
          items: [{ name: 'Jugo', category: 'drink', variant: 'drink_extra', quantity: 3 }],
        })}
        {...BASE_PROPS}
      />,
    );
    expect(screen.getByText(/× 3/)).toBeDefined();
  });

  it('does not show quantity suffix when quantity = 1', () => {
    render(<KitchenTicketCard ticket={makeTicket()} {...BASE_PROPS} />);
    expect(screen.queryByText(/× 1/)).toBeNull();
  });

  it('renders multiple items from different categories', () => {
    render(
      <KitchenTicketCard
        ticket={makeTicket({
          items: [
            { name: 'Sopa', category: 'starter', variant: 'only_starter', quantity: 1 },
            { name: 'Pollo', category: 'main', variant: 'full_combo', quantity: 1 },
            { name: 'Limonada', category: 'drink', variant: 'drink_extra', quantity: 2 },
          ],
        })}
        {...BASE_PROPS}
      />,
    );
    expect(screen.getByText('Sopa')).toBeDefined();
    expect(screen.getByText('Pollo')).toBeDefined();
    expect(screen.getByText('Limonada')).toBeDefined();
  });
});
