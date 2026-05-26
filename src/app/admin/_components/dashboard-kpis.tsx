import type { DailyReport } from '@/server/services/report';

function formatCents(cents: number): string {
  return `S/ ${(cents / 100).toFixed(2)}`;
}

function formatMs(ms: number | null): string {
  if (ms === null) return '—';
  const minutes = Math.floor(ms / 60_000);
  const seconds = Math.floor((ms % 60_000) / 1000);
  return `${minutes}m ${seconds}s`;
}

interface Props {
  report: DailyReport;
  activeTablesCount: number;
}

export function DashboardKpis({ report, activeTablesCount }: Props) {
  const totalOrders =
    report.byStatus.pending +
    report.byStatus.paid +
    report.byStatus.in_kitchen +
    report.byStatus.delivered +
    report.byStatus.cancelled;

  const kpis = [
    {
      label: 'Ingresos hoy',
      value: formatCents(report.revenue.totalCents),
      sub: `${report.byStatus.delivered} pedidos cobrados`,
    },
    {
      label: 'Pedidos hoy',
      value: String(totalOrders),
      sub: `${report.byStatus.delivered} entregados · ${report.byStatus.cancelled} cancelados`,
    },
    {
      label: 'Mesas activas',
      value: String(activeTablesCount),
      sub: null,
    },
    {
      label: 'Tiempo promedio cocina',
      value: formatMs(report.avgKitchenServiceMs),
      sub: null,
    },
  ];

  return (
    <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
      {kpis.map((kpi) => (
        <div key={kpi.label} className="rounded-xl border border-neutral-200 bg-white p-4">
          <p className="text-xs font-semibold uppercase tracking-widest text-neutral-500">
            {kpi.label}
          </p>
          <p className="tabnum mt-1.5 font-mono text-2xl font-bold text-neutral-800">
            {kpi.value}
          </p>
          {kpi.sub && (
            <p className="mt-1 text-xs text-neutral-400">{kpi.sub}</p>
          )}
        </div>
      ))}
    </div>
  );
}
