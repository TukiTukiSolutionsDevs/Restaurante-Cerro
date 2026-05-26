'use client';

import { useRouter } from 'next/navigation';
import { useTransition } from 'react';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { deactivateStaffAction, forceLogoutAction } from '@/server/actions/staff';
import type { StaffUserView } from '@/server/services/staff';

import { ResetPinDialog } from './reset-pin-dialog';
import { StaffEditDialog } from './staff-edit-dialog';

const ROLE_LABELS: Record<string, string> = {
  cashier: 'Cajero',
  waiter:  'Mozo',
  admin:   'Admin',
};

function formatLastSeen(date: Date | null): string {
  if (!date) return '—';
  const diff = Date.now() - new Date(date).getTime();
  const minutes = Math.floor(diff / 60_000);
  if (minutes < 1) return 'ahora';
  if (minutes < 60) return `hace ${minutes} min`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `hace ${hours} h`;
  return `hace ${Math.floor(hours / 24)} d`;
}

interface Props {
  staff: StaffUserView[];
  currentUserId: number;
}

export function StaffTable({ staff, currentUserId }: Props) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  function handleForceLogout(id: number) {
    if (!confirm('¿Cerrar todas las sesiones de este usuario?')) return;
    startTransition(async () => {
      await forceLogoutAction(id);
      router.refresh();
    });
  }

  function handleDeactivate(id: number) {
    if (!confirm('¿Desactivar este usuario? No podrá iniciar sesión.')) return;
    startTransition(async () => {
      const result = await deactivateStaffAction(id);
      if (!result.ok) {
        alert(result.error.message);
        return;
      }
      router.refresh();
    });
  }

  return (
    <div className="rounded-lg border bg-white shadow-sm">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Nombre</TableHead>
            <TableHead>Rol</TableHead>
            <TableHead>Estado</TableHead>
            <TableHead>Última actividad</TableHead>
            <TableHead className="text-center">Sesiones</TableHead>
            <TableHead>Acciones</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {staff.length === 0 && (
            <TableRow>
              <TableCell colSpan={6} className="py-8 text-center text-sm text-gray-400">
                Sin usuarios registrados.
              </TableCell>
            </TableRow>
          )}
          {staff.map((user) => (
            <TableRow key={user.id}>
              <TableCell className="font-medium">{user.displayName}</TableCell>
              <TableCell>{ROLE_LABELS[user.role] ?? user.role}</TableCell>
              <TableCell>
                {user.isActive ? (
                  <Badge variant="default">Activo</Badge>
                ) : (
                  <Badge variant="secondary">Inactivo</Badge>
                )}
              </TableCell>
              <TableCell className="text-sm text-gray-500">
                {formatLastSeen(user.lastSeenAt)}
              </TableCell>
              <TableCell className="text-center">{user.activeSessionCount}</TableCell>
              <TableCell>
                <div className="flex items-center gap-2">
                  <StaffEditDialog user={user} />
                  <ResetPinDialog staffUserId={user.id} displayName={user.displayName} />
                  <Button
                    size="sm"
                    variant="outline"
                    disabled={isPending}
                    onClick={() => handleForceLogout(user.id)}
                  >
                    Cerrar sesión forzada
                  </Button>
                  {user.id !== currentUserId && user.isActive && (
                    <Button
                      size="sm"
                      variant="destructive"
                      disabled={isPending}
                      onClick={() => handleDeactivate(user.id)}
                    >
                      Desactivar
                    </Button>
                  )}
                </div>
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}
