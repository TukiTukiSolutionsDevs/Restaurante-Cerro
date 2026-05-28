'use client';

import { Flame, LayoutGrid } from 'lucide-react';

interface TabsProps {
  activeTab: 'orders' | 'tables';
  onTabChange: (tab: 'orders' | 'tables') => void;
  activeOrdersCount: number;
}

const TABS = [
  { key: 'orders' as const, label: 'Activos', Icon: Flame },
  { key: 'tables' as const, label: 'Mesas', Icon: LayoutGrid },
];

export function Tabs({ activeTab, onTabChange, activeOrdersCount }: TabsProps) {
  return (
    <nav
      role="tablist"
      aria-label="Navegación mozo"
      className="sticky bottom-0 z-40 flex border-t border-neutral-200 bg-white"
      style={{ paddingBottom: 'env(safe-area-inset-bottom, 8px)' }}
    >
      {TABS.map(({ key, label, Icon }) => {
        const isActive = activeTab === key;
        const showBadge = key === 'orders' && activeOrdersCount > 0;
        return (
          <button
            key={key}
            type="button"
            role="tab"
            aria-selected={isActive}
            aria-controls={`panel-${key}`}
            onClick={() => onTabChange(key)}
            className={[
              'relative flex flex-1 flex-col items-center justify-center gap-1 py-2 text-xs font-semibold transition-colors',
              isActive ? 'text-brand-700' : 'text-neutral-500 hover:text-neutral-700',
            ].join(' ')}
            style={{ minHeight: 56 }}
          >
            <span className="relative">
              <Icon size={22} />
              {showBadge && (
                <span
                  aria-hidden="true"
                  className="absolute -right-2 -top-1 inline-flex h-4 min-w-[16px] items-center justify-center rounded-full bg-brand-500 px-1 text-[10px] font-bold text-white"
                >
                  {activeOrdersCount > 99 ? '99+' : activeOrdersCount}
                </span>
              )}
            </span>
            {label}
          </button>
        );
      })}
    </nav>
  );
}
