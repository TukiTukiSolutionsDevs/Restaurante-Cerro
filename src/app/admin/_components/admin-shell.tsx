'use client';

import {
  BarChart3,
  Home,
  LayoutGrid,
  LogOut,
  Menu as MenuIcon,
  ShieldCheck,
  Users,
  UtensilsCrossed,
  X,
} from 'lucide-react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useState, type ReactNode } from 'react';

import { logoutAction } from '@/server/actions/waiter';

const PRIMARY_NAV = [
  { href: '/admin',               label: 'Inicio',    Icon: Home            },
  { href: '/admin/menu',          label: 'Menú',      Icon: UtensilsCrossed },
  { href: '/admin/tables',        label: 'Mesas',     Icon: LayoutGrid      },
  { href: '/admin/reports/daily', label: 'Reportes',  Icon: BarChart3       },
] as const;

const SECONDARY_NAV = [
  { href: '/admin/staff', label: 'Personal',  Icon: Users        },
  { href: '/admin/audit', label: 'Auditoría', Icon: ShieldCheck  },
] as const;

interface AdminShellProps {
  displayName: string;
  children: ReactNode;
}

function isActive(pathname: string, href: string): boolean {
  if (href === '/admin') return pathname === '/admin';
  return pathname.startsWith(href);
}

function initials(name: string): string {
  const parts = name.trim().split(/\s+/);
  if (parts.length === 0 || !parts[0]) return '··';
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0]! + parts[parts.length - 1]![0]!).toUpperCase();
}

export function AdminShell({ displayName, children }: AdminShellProps) {
  const pathname = usePathname();
  const [drawerOpen, setDrawerOpen] = useState(false);

  return (
    <div className="mx-auto flex min-h-dvh max-w-md flex-col bg-neutral-50">
      {/* Mobile header */}
      <header className="sticky top-0 z-30 flex items-center justify-between gap-2 border-b border-neutral-200 bg-white px-4 py-3">
        <div className="flex items-center gap-3 min-w-0">
          <div
            aria-hidden="true"
            className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-full bg-brand-500 text-sm font-bold text-white"
          >
            {initials(displayName)}
          </div>
          <div className="min-w-0">
            <div className="text-[11px] font-semibold uppercase tracking-wider text-neutral-500">
              Admin
            </div>
            <div className="truncate text-sm font-bold text-neutral-800">{displayName}</div>
          </div>
        </div>
        <button
          type="button"
          aria-label="Abrir menú"
          aria-expanded={drawerOpen}
          onClick={() => setDrawerOpen(true)}
          className="flex h-10 w-10 items-center justify-center rounded-full text-neutral-600 hover:bg-neutral-100"
        >
          <MenuIcon size={20} />
        </button>
      </header>

      {/* Main content */}
      <main className="flex-1 overflow-auto pb-16">{children}</main>

      {/* Bottom nav */}
      <nav
        aria-label="Navegación admin"
        className="sticky bottom-0 z-30 flex border-t border-neutral-200 bg-white"
        style={{ paddingBottom: 'env(safe-area-inset-bottom, 8px)' }}
      >
        {PRIMARY_NAV.map(({ href, label, Icon }) => {
          const active = isActive(pathname, href);
          return (
            <Link
              key={href}
              href={href}
              aria-current={active ? 'page' : undefined}
              className={[
                'flex flex-1 flex-col items-center justify-center gap-1 py-2 text-xs font-semibold transition-colors',
                active ? 'text-brand-700' : 'text-neutral-500 hover:text-neutral-700',
              ].join(' ')}
              style={{ minHeight: 56 }}
            >
              <Icon size={20} />
              {label}
            </Link>
          );
        })}
      </nav>

      {/* Drawer for secondary items + logout */}
      {drawerOpen && (
        <>
          <button
            type="button"
            aria-label="Cerrar menú"
            onClick={() => setDrawerOpen(false)}
            className="fixed inset-0 z-40 bg-black/40"
          />
          <aside
            role="dialog"
            aria-modal="true"
            className="fixed right-0 top-0 z-50 flex h-dvh w-72 max-w-[80vw] flex-col bg-white shadow-2xl"
          >
            <div className="flex items-center justify-between border-b border-neutral-200 px-4 py-3">
              <span className="font-display text-lg font-bold text-neutral-800">Más</span>
              <button
                type="button"
                aria-label="Cerrar"
                onClick={() => setDrawerOpen(false)}
                className="flex h-9 w-9 items-center justify-center rounded-full text-neutral-500 hover:bg-neutral-100"
              >
                <X size={18} />
              </button>
            </div>
            <nav className="flex-1 px-3 py-3">
              <ul className="space-y-1">
                {SECONDARY_NAV.map(({ href, label, Icon }) => {
                  const active = isActive(pathname, href);
                  return (
                    <li key={href}>
                      <Link
                        href={href}
                        onClick={() => setDrawerOpen(false)}
                        className={[
                          'flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium',
                          active
                            ? 'bg-brand-50 text-brand-700'
                            : 'text-neutral-700 hover:bg-neutral-100',
                        ].join(' ')}
                      >
                        <Icon size={18} />
                        {label}
                      </Link>
                    </li>
                  );
                })}
              </ul>
            </nav>
            <div className="border-t border-neutral-200 px-3 py-3">
              <form action={logoutAction}>
                <button
                  type="submit"
                  className="flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium text-neutral-700 hover:bg-neutral-100"
                >
                  <LogOut size={18} />
                  Cerrar sesión
                </button>
              </form>
            </div>
          </aside>
        </>
      )}
    </div>
  );
}
