'use client';

import { useTransition } from 'react';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { closeDayAction, openDayAction } from '@/server/actions/menu';

interface DayControlProps {
  menuId: number;
  status: 'draft' | 'opened' | 'closed';
  hasCombo: boolean;
  /** 0 = no shift has been opened yet (draft); 1..N = number of opened shifts so far. */
  shiftNumber: number;
}

export function DayControl({
  menuId,
  status,
  hasCombo,
  shiftNumber,
}: DayControlProps) {
  const [pending, startTransition] = useTransition();

  const handleOpen = () => {
    startTransition(async () => {
      await openDayAction(menuId);
    });
  };

  const handleClose = () => {
    startTransition(async () => {
      await closeDayAction(menuId);
    });
  };

  const nextShift = shiftNumber + 1;

  return (
    <div className="flex items-center gap-4">
      {status === 'draft' && (
        <Badge variant="secondary">Borrador — no visible para clientes</Badge>
      )}
      {status === 'opened' && (
        <Badge variant="default">
          {shiftNumber > 1 ? `Turno ${shiftNumber} abierto` : 'Abierto'}
        </Badge>
      )}
      {status === 'closed' && (
        <Badge variant="destructive">
          {shiftNumber > 0 ? `Turno ${shiftNumber} cerrado` : 'Cerrado'}
        </Badge>
      )}

      {status === 'draft' && (
        <div className="flex flex-col gap-1">
          <Button
            onClick={handleOpen}
            disabled={pending || !hasCombo}
            size="sm"
          >
            Abrir día de atención
          </Button>
          {!hasCombo && (
            <p className="text-xs text-muted-foreground">
              Configura los precios del combo antes de abrir el día
            </p>
          )}
        </div>
      )}

      {status === 'opened' && (
        <Button onClick={handleClose} disabled={pending} variant="outline" size="sm">
          Cerrar día
        </Button>
      )}

      {status === 'closed' && (
        <Button
          onClick={handleOpen}
          disabled={pending || !hasCombo}
          size="sm"
        >
          Reabrir como Turno {nextShift}
        </Button>
      )}
    </div>
  );
}
