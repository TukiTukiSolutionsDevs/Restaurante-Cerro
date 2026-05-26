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
import { resetPinAction } from '@/server/actions/staff';

interface Props {
  staffUserId: number;
  displayName: string;
}

export function ResetPinDialog({ staffUserId, displayName }: Props) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const fd     = new FormData(e.currentTarget);
    const newPin = fd.get('newPin') as string;

    setError(null);
    startTransition(async () => {
      const result = await resetPinAction({ staffUserId, newPin });
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
          Restablecer PIN
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-sm">
        <DialogHeader>
          <DialogTitle>Restablecer PIN — {displayName}</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4 mt-2">
          <div className="space-y-1">
            <Label htmlFor="new-pin">Nuevo PIN (6 dígitos)</Label>
            <Input
              id="new-pin"
              name="newPin"
              type="password"
              inputMode="numeric"
              pattern="\d{6}"
              maxLength={6}
              required
              autoComplete="new-password"
            />
            <p className="text-xs text-gray-500">
              PIN inseguro: no usar secuencias ni todos iguales
            </p>
          </div>

          {error && <p className="text-sm text-red-600">{error}</p>}

          <div className="flex justify-end gap-2 pt-2">
            <Button type="button" variant="outline" onClick={() => setOpen(false)}>
              Cancelar
            </Button>
            <Button type="submit" disabled={isPending}>
              {isPending ? 'Guardando…' : 'Restablecer'}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
