'use client';

import { useTransition } from 'react';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { setComboConfigAction } from '@/server/actions/menu';

interface ComboFormProps {
  dailyMenuId: number;
  defaults?: {
    dineInPriceCents: number;
    takeawayPriceCents: number;
    tupperFullPriceCents: number;
    tupperPartialPriceCents: number;
    partialStarterPriceCents: number;
    partialMainPriceCents: number;
  };
}

const FIELDS = [
  { key: 'dineInPriceCents', label: 'Menú salón (S/)' },
  { key: 'takeawayPriceCents', label: 'Menú para llevar (S/)' },
  { key: 'tupperPartialPriceCents', label: 'Tupper por plato (S/)' },
  { key: 'partialStarterPriceCents', label: 'Solo entrada (S/)' },
  { key: 'partialMainPriceCents', label: 'Solo segundo (S/)' },
] as const;

type FieldKey = (typeof FIELDS)[number]['key'];

const DEFAULT_VALUES: Record<FieldKey, number> = {
  dineInPriceCents: 1300,
  takeawayPriceCents: 1500,
  tupperPartialPriceCents: 100,
  partialStarterPriceCents: 700,
  partialMainPriceCents: 900,
};

export function ComboForm({ dailyMenuId, defaults }: ComboFormProps) {
  const [pending, startTransition] = useTransition();

  const handleSubmit = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    // Inputs are in soles (with up to 2 decimals); convert to integer cents.
    const values = Object.fromEntries(
      FIELDS.map(({ key }) => [key, Math.round(Number(fd.get(key)) * 100)]),
    ) as Record<FieldKey, number>;
    // Full-combo tupper is always 2× the per-plate tupper (combo = 2 plates).
    const tupperFullPriceCents = (values.tupperPartialPriceCents ?? 0) * 2;
    startTransition(async () => {
      await setComboConfigAction({
        dailyMenuId,
        ...values,
        tupperFullPriceCents,
      });
    });
  };

  return (
    <form onSubmit={handleSubmit} className="grid grid-cols-2 gap-4 md:grid-cols-3">
      {FIELDS.map(({ key, label }) => (
        <div key={key} className="flex flex-col gap-1">
          <Label htmlFor={key}>{label}</Label>
          <Input
            id={key}
            name={key}
            type="number"
            min={0.01}
            step={0.01}
            required
            defaultValue={
              defaults ? defaults[key] / 100 : DEFAULT_VALUES[key] / 100
            }
          />
          {key === 'tupperPartialPriceCents' && (
            <p className="text-xs text-muted-foreground">
              Se suma automático a cada plato en pedidos para llevar.
            </p>
          )}
        </div>
      ))}
      <div className="col-span-full flex justify-end">
        <Button type="submit" disabled={pending} size="sm">
          Guardar precios
        </Button>
      </div>
    </form>
  );
}
