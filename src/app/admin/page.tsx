import { count, eq } from 'drizzle-orm';
import {
  BarChart3,
  LayoutGrid,
  ShieldCheck,
  Users,
  UtensilsCrossed,
} from 'lucide-react';
import Link from 'next/link';

import { db } from '@/db/client';
import { restaurantTable } from '@/db/schema';
import { requireRoleOrRedirect } from '@/lib/auth/guards';
import { ReportService } from '@/server/services/report';

import { DashboardKpis } from './_components/dashboard-kpis';

const navCards = [
  { href: '/admin/menu',          label: 'Menú',      desc: 'Gestiona los platos y precios del día',   icon: UtensilsCrossed },
  { href: '/admin/tables',        label: 'Mesas',     desc: 'Configura el plano del salón',             icon: LayoutGrid      },
  { href: '/admin/staff',         label: 'Personal',  desc: 'Usuarios, roles y PINs',                   icon: Users           },
  { href: '/admin/reports/daily', label: 'Reportes',  desc: 'Ingresos y estadísticas del día',          icon: BarChart3       },
  { href: '/admin/audit',         label: 'Auditoría', desc: 'Registro de acciones del sistema',         icon: ShieldCheck     },
];

export default async function AdminDashboardPage() {
  await requireRoleOrRedirect(['admin']);

  const svc = new ReportService(db);
  const [report, [activeTablesRow]] = await Promise.all([
    svc.daily(new Date()),
    db.select({ total: count() }).from(restaurantTable).where(eq(restaurantTable.isActive, true)),
  ]);

  const activeTablesCount = Number(activeTablesRow?.total ?? 0);

  return (
    <div className="px-4 py-5">
      <h1 className="mb-4 font-display text-xl font-bold text-neutral-800">Panel</h1>

      <DashboardKpis report={report} activeTablesCount={activeTablesCount} />

      <div className="mt-6 flex flex-col gap-3">
        {navCards.map((item) => {
          const Icon = item.icon;
          return (
            <Link key={item.href} href={item.href}>
              <div className="group flex items-center gap-4 rounded-xl border border-neutral-200 bg-white p-4 transition-shadow hover:shadow-md">
                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-brand-50 text-brand-600 group-hover:bg-brand-100">
                  <Icon className="h-5 w-5" />
                </div>
                <div className="min-w-0 flex-1">
                  <p className="font-display font-bold text-neutral-800">{item.label}</p>
                  <p className="mt-0.5 text-sm text-neutral-500">{item.desc}</p>
                </div>
              </div>
            </Link>
          );
        })}
      </div>
    </div>
  );
}
