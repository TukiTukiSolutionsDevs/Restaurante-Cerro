'use client';

import { useRouter } from 'next/navigation';
import { useRef, useState, useTransition } from 'react';

import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { patchItemAction, toggleAvailabilityAction } from '@/server/actions/menu';

interface ItemRowProps {
  item: {
    id: number;
    name: string;
    description: string | null;
    category: string;
    isAvailable: boolean;
    sortOrder: number;
    priceCents: number | null;
    imagePath: string | null;
  };
  menuId: number;
  /** Live partial-combo prices from combo_config. Used to show a dynamic price
   *  for starters/mains, which don't have their own price_cents (they're combo). */
  comboPartialStarterCents?: number | null;
  comboPartialMainCents?: number | null;
}

function formatPrice(cents: number): string {
  return `S/ ${(cents / 100).toFixed(2)}`;
}

function getDisplayPrice(
  category: string,
  priceCents: number | null,
  partialStarter: number | null | undefined,
  partialMain: number | null | undefined,
): { value: string; isCombo: boolean } {
  if (priceCents != null) return { value: formatPrice(priceCents), isCombo: false };
  if (category === 'starter' && partialStarter != null) {
    return { value: formatPrice(partialStarter), isCombo: true };
  }
  if (category === 'main' && partialMain != null) {
    return { value: formatPrice(partialMain), isCombo: true };
  }
  return { value: '—', isCombo: false };
}

export function ItemRow({
  item,
  menuId,
  comboPartialStarterCents,
  comboPartialMainCents,
}: ItemRowProps) {
  const router = useRouter();
  const [editOpen, setEditOpen] = useState(false);
  const [editError, setEditError] = useState<string | null>(null);
  const [imageError, setImageError] = useState<string | null>(null);
  const [imageBusy, setImageBusy] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [pending, startTransition] = useTransition();

  void menuId;

  const handleToggle = (checked: boolean) => {
    startTransition(async () => {
      await toggleAvailabilityAction({ itemId: item.id, isAvailable: checked });
    });
  };

  const handleImageUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setImageError(null);
    setImageBusy(true);
    try {
      const fd = new FormData();
      fd.append('image', file);
      const res = await fetch(`/api/admin/menu-items/${item.id}/image`, {
        method: 'POST',
        body: fd,
      });
      if (!res.ok) {
        const data = (await res.json().catch(() => ({}))) as { error?: string };
        setImageError(data.error ?? 'No se pudo subir la imagen');
        return;
      }
      router.refresh();
    } catch {
      setImageError('Error de red al subir la imagen');
    } finally {
      setImageBusy(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  const handleImageDelete = async () => {
    setImageError(null);
    setImageBusy(true);
    try {
      const res = await fetch(`/api/admin/menu-items/${item.id}/image`, {
        method: 'DELETE',
      });
      if (!res.ok) {
        setImageError('No se pudo quitar la imagen');
        return;
      }
      router.refresh();
    } catch {
      setImageError('Error de red al quitar la imagen');
    } finally {
      setImageBusy(false);
    }
  };

  const handleEdit = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setEditError(null);
    const fd = new FormData(e.currentTarget);
    const name = fd.get('name') as string;
    const description = (fd.get('description') as string) || undefined;
    const priceCentsRaw = fd.get('priceCents') as string;
    const priceCents = priceCentsRaw ? Math.round(Number(priceCentsRaw) * 100) : null;

    startTransition(async () => {
      const result = await patchItemAction(item.id, { name, description, priceCents });
      if (!result.ok) {
        setEditError(result.error.message);
        return;
      }
      setEditOpen(false);
    });
  };

  return (
    <>
      <tr className="border-b">
        <td className="py-2 pr-4">
          <div className="flex items-center gap-3">
            {item.imagePath ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={`/api/images/${item.imagePath}`}
                alt=""
                className="h-10 w-10 flex-shrink-0 rounded-md object-cover"
              />
            ) : (
              <div
                className="h-10 w-10 flex-shrink-0 rounded-md bg-neutral-100"
                aria-hidden="true"
              />
            )}
            <div className="min-w-0">
              <span className="font-medium">{item.name}</span>
              {item.description && (
                <p className="max-w-xs truncate text-xs text-muted-foreground">
                  {item.description}
                </p>
              )}
            </div>
          </div>
        </td>
        <td className="py-2 pr-4">
          {(() => {
            const { value, isCombo } = getDisplayPrice(
              item.category,
              item.priceCents,
              comboPartialStarterCents,
              comboPartialMainCents,
            );
            return (
              <span className="flex flex-col leading-tight">
                <span>{value}</span>
                {isCombo && (
                  <span className="text-[10px] uppercase tracking-wide text-muted-foreground">
                    combo parcial
                  </span>
                )}
              </span>
            );
          })()}
        </td>
        <td className="py-2 pr-4">
          <div className="flex items-center gap-2">
            <Switch
              checked={item.isAvailable}
              onCheckedChange={handleToggle}
              disabled={pending}
              aria-label={item.isAvailable ? 'Disponible' : 'Se acabó'}
            />
            <span className="text-xs text-muted-foreground">
              {item.isAvailable ? 'Disponible' : 'Se acabó'}
            </span>
          </div>
        </td>
        <td className="py-2">
          <Button size="sm" variant="ghost" onClick={() => setEditOpen(true)}>
            Editar
          </Button>
        </td>
      </tr>

      <Dialog open={editOpen} onOpenChange={setEditOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Editar plato</DialogTitle>
          </DialogHeader>

          {/* Image section */}
          <div className="flex flex-col gap-2 border-b pb-4">
            <Label>Foto del plato</Label>
            <div className="flex items-center gap-3">
              {item.imagePath ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={`/api/images/${item.imagePath}`}
                  alt=""
                  className="h-20 w-20 rounded-md object-cover"
                />
              ) : (
                <div
                  className="flex h-20 w-20 items-center justify-center rounded-md bg-neutral-100 text-xs text-neutral-400"
                  aria-hidden="true"
                >
                  sin foto
                </div>
              )}
              <div className="flex flex-col gap-1">
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  disabled={imageBusy}
                  onClick={() => fileInputRef.current?.click()}
                >
                  {item.imagePath ? 'Cambiar foto' : 'Subir foto'}
                </Button>
                {item.imagePath && (
                  <Button
                    type="button"
                    size="sm"
                    variant="ghost"
                    disabled={imageBusy}
                    onClick={handleImageDelete}
                  >
                    Quitar
                  </Button>
                )}
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="image/jpeg,image/png,image/webp"
                  className="hidden"
                  onChange={handleImageUpload}
                />
              </div>
            </div>
            <p className="text-xs text-muted-foreground">
              JPG, PNG o WebP. Máx 2&nbsp;MB.
            </p>
            {imageError && (
              <p className="text-sm text-destructive">{imageError}</p>
            )}
          </div>

          <form onSubmit={handleEdit} className="flex flex-col gap-4">
            <div className="flex flex-col gap-1">
              <Label htmlFor="edit-name">Nombre *</Label>
              <Input
                id="edit-name"
                name="name"
                defaultValue={item.name}
                maxLength={80}
                required
              />
            </div>
            <div className="flex flex-col gap-1">
              <Label htmlFor="edit-description">Descripción</Label>
              <Input
                id="edit-description"
                name="description"
                defaultValue={item.description ?? ''}
                maxLength={200}
              />
            </div>
            <div className="flex flex-col gap-1">
              <Label htmlFor="edit-price">Precio (S/)</Label>
              <Input
                id="edit-price"
                name="priceCents"
                type="number"
                min={0.01}
                step={0.01}
                defaultValue={item.priceCents != null ? item.priceCents / 100 : ''}
              />
            </div>
            {editError && <p className="text-sm text-destructive">{editError}</p>}
            <div className="flex justify-end gap-2">
              <Button type="button" variant="outline" onClick={() => setEditOpen(false)}>
                Cancelar
              </Button>
              <Button type="submit" disabled={pending}>
                Guardar
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>
    </>
  );
}
