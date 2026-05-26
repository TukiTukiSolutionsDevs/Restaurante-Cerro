'use client';

import { useRouter } from 'next/navigation';
import { useState, useTransition } from 'react';

import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { patchStaffAction } from '@/server/actions/staff';
import type { StaffUserView } from '@/server/services/staff';

interface Props {
  user: StaffUserView;
}

export function StaffEditDialog({ user }: Props) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    const displayName = fd.get('displayName') as string;
    const role        = fd.get('role')        as 'cashier' | 'waiter' | 'admin';

    setError(null);
    startTransition(async () => {
      const result = await patchStaffAction({
        staffUserId: user.id,
        patch: { displayName, role },
      });
      if (!result.ok) {
        setError(result.error.message);
        return;
      }
      setOpen(false);
      router.refresh();
    });
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="sm" variant="outline">
          Editar
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Editar usuario</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4 mt-2">
          <div className="space-y-1">
            <Label htmlFor="edit-name">Nombre</Label>
            <Input
              id="edit-name"
              name="displayName"
              defaultValue={user.displayName}
              required
              maxLength={80}
            />
          </div>

          <div className="space-y-1">
            <Label htmlFor="edit-role">Rol</Label>
            <select
              id="edit-role"
              name="role"
              defaultValue={user.role}
              required
              className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
            >
              <option value="cashier">Cajero</option>
              <option value="waiter">Mozo</option>
              <option value="admin">Admin</option>
            </select>
          </div>

          {error && <p className="text-sm text-red-600">{error}</p>}

          <div className="flex justify-end gap-2 pt-2">
            <Button type="button" variant="outline" onClick={() => setOpen(false)}>
              Cancelar
            </Button>
            <Button type="submit" disabled={isPending}>
              {isPending ? 'Guardando…' : 'Guardar'}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
