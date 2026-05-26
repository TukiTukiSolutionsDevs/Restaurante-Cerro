'use client';

interface TabsProps {
  activeTab: 'orders' | 'tables';
  onTabChange: (tab: 'orders' | 'tables') => void;
}

const TAB_LABELS: Record<'orders' | 'tables', string> = {
  orders: 'Pedidos activos',
  tables: 'Mesas',
};

export function Tabs({ activeTab, onTabChange }: TabsProps) {
  return (
    <div
      role="tablist"
      aria-label="Navegación mozo"
      className="sticky top-0 z-40 flex border-b border-neutral-200 bg-white shadow-sm"
    >
      {(['orders', 'tables'] as const).map((tab) => {
        const isActive = activeTab === tab;
        return (
          <button
            key={tab}
            type="button"
            role="tab"
            aria-selected={isActive}
            aria-controls={`panel-${tab}`}
            onClick={() => onTabChange(tab)}
            className={[
              'relative min-h-[48px] flex-1 px-6 py-3 text-base font-semibold transition-colors',
              isActive
                ? 'text-neutral-800'
                : 'text-neutral-500 hover:text-neutral-700',
            ].join(' ')}
          >
            {TAB_LABELS[tab]}
            {isActive && (
              <span className="absolute inset-x-6 bottom-0 h-0.5 rounded-t-full bg-brand-500" />
            )}
          </button>
        );
      })}
    </div>
  );
}
