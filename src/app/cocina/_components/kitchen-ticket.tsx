'use client';

import type { KitchenTicket } from '@/server/services/kitchen';

import { TimerBadge } from './timer-badge';

const VARIANT_LABELS: Record<string, string | undefined> = {
  only_starter: 'solo entrada',
  only_main: 'solo segundo',
  drink_extra: 'extra bebida',
  dessert_extra: 'extra postre',
};

const CATEGORY_ORDER = ['starter', 'main', 'drink', 'dessert'] as const;

interface Props {
  ticket: KitchenTicket;
  flashing: boolean;
  now: number;
}

export function KitchenTicketCard({ ticket, flashing, now }: Props) {
  const grouped = CATEGORY_ORDER.map((cat) => ({
    category: cat,
    items: ticket.items.filter((i) => i.category === cat),
  })).filter((g) => g.items.length > 0);

  return (
    <article
      className={`rounded-2xl border p-4 flex flex-col gap-3${flashing ? ' flash-in' : ''}`}
      style={{
        background: 'var(--neutral-900)',
        borderColor: 'var(--neutral-700)',
      }}
    >
      {/* Short code */}
      <div
        className="font-mono font-bold leading-none tabnum"
        style={{ fontSize: 'var(--shortcode-cocina)', color: 'var(--neutral-50)' }}
      >
        {ticket.shortCode}
      </div>

      {/* Table / takeaway / tupper chips */}
      <div className="flex items-center gap-2 flex-wrap">
        {ticket.orderType === 'dine_in' && ticket.tableCode ? (
          <span
            className="rounded-md px-3 py-1 text-sm font-semibold uppercase tracking-wide border"
            style={{
              background: 'var(--info-50)',
              borderColor: 'var(--info-500)',
              color: 'var(--info-700)',
            }}
          >
            Mesa {ticket.tableCode}
          </span>
        ) : (
          <span
            className="rounded-md px-3 py-1 text-sm font-semibold uppercase tracking-wide border"
            style={{
              background: 'var(--warning-50)',
              borderColor: 'var(--warning-500)',
              color: 'var(--warning-700)',
            }}
          >
            Para llevar
          </span>
        )}

        {ticket.withTupper && (
          <span
            className="rounded-md px-3 py-1 text-sm font-semibold border"
            style={{
              background: 'var(--brand-50)',
              borderColor: 'var(--brand-200)',
              color: 'var(--brand-700)',
            }}
          >
            Con tupper
          </span>
        )}
      </div>

      {/* Item list */}
      <ul className="flex flex-col gap-1 flex-1">
        {grouped.map(({ category, items }) => (
          <li key={category}>
            <ul>
              {items.map((item, idx) => {
                const variantLabel = VARIANT_LABELS[item.variant];
                return (
                  <li key={idx} className="text-2xl" style={{ color: 'var(--neutral-100)' }}>
                    {item.name}
                    {variantLabel && (
                      <span className="text-xl" style={{ color: 'var(--neutral-400)' }}>
                        {' '}({variantLabel})
                      </span>
                    )}
                    {item.quantity > 1 && (
                      <span className="text-xl" style={{ color: 'var(--neutral-300)' }}>
                        {' '}× {item.quantity}
                      </span>
                    )}
                  </li>
                );
              })}
            </ul>
          </li>
        ))}
      </ul>

      {/* Elapsed timer */}
      <div className="mt-auto">
        <TimerBadge paidAt={ticket.paidAt} now={now} />
      </div>
    </article>
  );
}
