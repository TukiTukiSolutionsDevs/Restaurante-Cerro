'use client';

import { Badge } from '@/components/ui/badge';

type OrderStatus = 'pending' | 'paid' | 'in_kitchen' | 'delivered' | 'cancelled';

interface StatusBadgeProps {
  status: OrderStatus;
  cancelReason?: string | null;
}

const STATUS_CONFIG: Record<OrderStatus, { label: string; className: string }> = {
  pending: {
    label: 'Esperando pago',
    className: 'bg-warning-50 text-warning-700 border-warning-200',
  },
  paid: {
    label: 'Pago confirmado',
    className: 'bg-info-50 text-info-700 border-info-200',
  },
  in_kitchen: {
    label: 'En cocina',
    className: 'bg-brand-50 text-brand-700 border-brand-200',
  },
  delivered: {
    label: 'Listo, te lo lleva el mozo',
    className: 'bg-success-50 text-success-700 border-success-200',
  },
  cancelled: {
    label: 'Pedido cancelado',
    className: 'bg-danger-50 text-danger-700 border-danger-200',
  },
};

export function StatusBadge({ status, cancelReason }: StatusBadgeProps) {
  const config = STATUS_CONFIG[status];
  const label =
    status === 'cancelled' && cancelReason === 'qr_expired'
      ? 'QR vencido, ya no puedes pagar este pedido'
      : config.label;

  return (
    <Badge variant="outline" className={`px-4 py-2 text-sm font-semibold ${config.className}`}>
      {label}
    </Badge>
  );
}
