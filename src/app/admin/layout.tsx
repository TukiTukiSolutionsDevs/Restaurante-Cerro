import {
  BarChart3,
  Home,
  LayoutGrid,
  Mountain,
  ShieldCheck,
  Users,
  UtensilsCrossed,
} from 'lucide-react';
import Link from 'next/link';
import type { ReactNode } from 'react';

import { requireRoleOrRedirect } from '@/lib/auth/guards';

const navItems = [
  { href: '/admin',               label: 'Panel',     icon: Home            },
  { href: '/admin/menu',          label: 'Menú',      icon: UtensilsCrossed },
  { href: '/admin/tables',        label: 'Mesas',     icon: LayoutGrid      },
  { href: '/admin/staff',         label: 'Personal',  icon: Users           },
  { href: '/admin/reports/daily', label: 'Reportes',  icon: BarChart3       },
  { href: '/admin/audit',         label: 'Auditoría', icon: ShieldCheck     },
];

export default async function AdminLayout({ children }: { children: ReactNode }) {
  await requireRoleOrRedirect(['admin']);

  return (
    <div className="flex min-h-screen bg-neutral-100">
      {/* Sidebar — fixed 240px on lg */}
      <aside className="hidden w-60 shrink-0 flex-col border-r border-neutral-200 bg-neutral-100 lg:flex">
        {/* Logo */}
        <div className="flex items-center gap-2.5 border-b border-neutral-200 px-5 py-5">
          <Mountain className="h-7 w-7 text-brand-600" />
          <span className="font-display text-xl font-bold text-neutral-800">Cerro</span>
          <span className="ml-1 rounded bg-brand-50 px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-widest text-brand-700">
            Admin
          </span>
        </div>

        {/* Nav */}
        <nav className="flex-1 px-3 py-4">
          <ul className="space-y-0.5">
            {navItems.map((item) => {
              const Icon = item.icon;
              return (
                <li key={item.href}>
                  <Link
                    href={item.href}
                    className="flex items-center gap-3 rounded-lg px-4 py-2.5 text-sm font-medium text-neutral-600 transition-colors hover:bg-brand-50 hover:text-brand-700"
                  >
                    <Icon className="h-4 w-4 shrink-0" />
                    {item.label}
                  </Link>
                </li>
              );
            })}
          </ul>
        </nav>

        {/* Footer */}
        <div className="border-t border-neutral-200 px-4 py-4">
          <Link
            href="/login"
            className="flex w-full items-center gap-2 text-xs font-medium text-neutral-400 hover:text-neutral-600"
          >
            Cerrar sesión
          </Link>
        </div>
      </aside>

      {/* Main content */}
      <div className="flex-1 overflow-auto">{children}</div>
    </div>
  );
}
