'use client';

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
import { addItemAction } from '@/server/actions/menu';

interface AddItemDialogProps {
  dailyMenuId: number;
  defaultCategory?: 'starter' | 'main' | 'drink' | 'dessert';
}

const CATEGORIES = [
  { value: 'starter', label: 'Entrada' },
  { value: 'main', label: 'Segundo' },
  { value: 'drink', label: 'Bebida' },
  { value: 'dessert', label: 'Postre' },
] as const;

export function AddItemDialog({ dailyMenuId, defaultCategory = 'starter' }: AddItemDialogProps) {
  const [open, setOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const handleSubmit = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setError(null);
    const fd = new FormData(e.currentTarget);
    const name = fd.get('name') as string;
    const description = (fd.get('description') as string) || undefined;
    const category = fd.get('category') as string;
    const priceCentsRaw = fd.get('priceCents') as string;
    const priceCents = priceCentsRaw ? Math.round(Number(priceCentsRaw) * 100) : undefined;

    if (!name || name.length < 1) {
      setError('El nombre es requerido');
      return;
    }
    if (name.length > 80) {
      setError('El nombre no puede superar 80 caracteres');
      return;
    }

    startTransition(async () => {
      const result = await addItemAction({ dailyMenuId, name, description, category, priceCents });
      if (!result.ok) {
        setError(result.error.message);
        return;
      }
      setOpen(false);
    });
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="sm" variant="outline">
          Agregar plato
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Agregar plato</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="flex flex-col gap-4">
          <div className="flex flex-col gap-1">
            <Label htmlFor="name">Nombre *</Label>
            <Input id="name" name="name" maxLength={80} required placeholder="Ej: Caldo de gallina" />
          </div>
          <div className="flex flex-col gap-1">
            <Label htmlFor="description">Descripción</Label>
            <Input id="description" name="description" maxLength={200} placeholder="Opcional" />
          </div>
          <div className="flex flex-col gap-1">
            <Label htmlFor="category">Categoría *</Label>
            <select
              id="category"
              name="category"
              defaultValue={defaultCategory}
              required
              className="h-10 rounded-md border border-input bg-background px-3 py-2 text-sm"
            >
              {CATEGORIES.map(({ value, label }) => (
                <option key={value} value={value}>
                  {label}
                </option>
              ))}
            </select>
          </div>
          <div className="flex flex-col gap-1">
            <Label htmlFor="priceCents">Precio (S/) — solo bebidas/postres</Label>
            <Input
              id="priceCents"
              name="priceCents"
              type="number"
              min={0.01}
              step={0.01}
              placeholder="Ej: 5.00"
            />
          </div>
          {error && <p className="text-sm text-destructive">{error}</p>}
          <div className="flex justify-end gap-2">
            <Button type="button" variant="outline" onClick={() => setOpen(false)}>
              Cancelar
            </Button>
            <Button type="submit" disabled={pending}>
              Guardar
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
