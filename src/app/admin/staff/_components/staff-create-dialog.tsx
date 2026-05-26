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
import { createStaffAction } from '@/server/actions/staff';

export function StaffCreateDialog() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    const displayName = fd.get('displayName') as string;
    const role       = fd.get('role')        as 'cashier' | 'waiter' | 'admin';
    const pin        = fd.get('pin')         as string;
    const confirmPin = fd.get('confirmPin')  as string;

    setError(null);
    startTransition(async () => {
      const result = await createStaffAction({ displayName, role, pin, confirmPin });
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
        <Button>Crear usuario</Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Crear usuario</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4 mt-2">
          <div className="space-y-1">
            <Label htmlFor="create-name">Nombre</Label>
            <Input id="create-name" name="displayName" required maxLength={80} />
          </div>

          <div className="space-y-1">
            <Label htmlFor="create-role">Rol</Label>
            <select
              id="create-role"
              name="role"
              required
              className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
            >
              <option value="cashier">Cajero</option>
              <option value="waiter">Mozo</option>
              <option value="admin">Admin</option>
            </select>
          </div>

          <div className="space-y-1">
            <Label htmlFor="create-pin">PIN (6 dígitos)</Label>
            <Input
              id="create-pin"
              name="pin"
              type="password"
              inputMode="numeric"
              pattern="\d{6}"
              maxLength={6}
              required
            />
            <p className="text-xs text-gray-500">
              PIN inseguro: no usar secuencias ni todos iguales
            </p>
          </div>

          <div className="space-y-1">
            <Label htmlFor="create-confirm-pin">Confirmar PIN</Label>
            <Input
              id="create-confirm-pin"
              name="confirmPin"
              type="password"
              inputMode="numeric"
              pattern="\d{6}"
              maxLength={6}
              required
            />
          </div>

          {error && <p className="text-sm text-red-600">{error}</p>}

          <div className="flex justify-end gap-2 pt-2">
            <Button type="button" variant="outline" onClick={() => setOpen(false)}>
              Cancelar
            </Button>
            <Button type="submit" disabled={isPending}>
              {isPending ? 'Creando…' : 'Crear'}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
