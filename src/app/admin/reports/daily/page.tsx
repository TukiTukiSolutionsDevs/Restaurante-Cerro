import { Download } from 'lucide-react';

import { db } from '@/db/client';
import { requireRoleOrRedirect } from '@/lib/auth/guards';
import { ReportService } from '@/server/services/report';

import { ReportView } from './_components/report-view';

interface Props {
  searchParams: Promise<{ date?: string }>;
}

export default async function DailyReportPage({ searchParams }: Props) {
  await requireRoleOrRedirect(['admin']);

  const params  = await searchParams;
  const today   = new Date().toISOString().slice(0, 10);
  const dateStr = params.date ?? today;

  const isValidDate = /^\d{4}-\d{2}-\d{2}$/.test(dateStr) && !isNaN(Date.parse(dateStr));
  const isFuture    = isValidDate && dateStr > today;

  if (!isValidDate || isFuture) {
    return (
      <div className="px-4 py-5">
        <h1 className="mb-4 font-display text-2xl font-bold text-neutral-800">
          Reportes diarios
        </h1>
        <p className="rounded-xl border border-danger-200 bg-danger-50 px-4 py-3 text-sm text-danger-700">
          {!isValidDate ? 'Fecha inválida.' : 'No se pueden consultar fechas futuras.'}
        </p>
      </div>
    );
  }

  const svc    = new ReportService(db);
  const report = await svc.daily(new Date(dateStr + 'T00:00:00.000Z'));

  return (
    <div className="px-4 py-5">
      <div className="mb-6 flex items-center justify-between">
        <h1 className="font-display text-2xl font-bold text-neutral-800">
          Reportes — {dateStr}
        </h1>
        <a
          href={`/admin/reports/daily.csv?date=${dateStr}`}
          className="flex items-center gap-2 rounded-xl border border-neutral-200 bg-white px-4 py-2 text-sm font-medium text-neutral-700 hover:bg-neutral-50"
        >
          <Download className="h-4 w-4" />
          Exportar CSV
        </a>
      </div>

      {/* Date picker */}
      <form method="GET" className="mb-6 flex items-center gap-3">
        <label htmlFor="date-picker" className="text-sm font-medium text-neutral-700">
          Fecha
        </label>
        <input
          id="date-picker"
          name="date"
          type="date"
          defaultValue={dateStr}
          max={today}
          className="rounded-xl border border-neutral-200 px-3 py-1.5 text-sm focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-100"
        />
        <button
          type="submit"
          className="rounded-xl border border-neutral-200 bg-white px-4 py-1.5 text-sm font-medium text-neutral-700 hover:bg-neutral-50"
        >
          Ver
        </button>
      </form>

      <ReportView report={report} />
    </div>
  );
}
