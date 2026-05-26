'use client';

import { Banknote, Check, Flame, X } from 'lucide-react';
import { useState } from 'react';

import type { OrderStatusChangedPayload } from '@/lib/realtime/channels';
import { useSse } from '@/lib/realtime/client';
import type { PublicOrder } from '@/server/services/order';

type OrderStatus = PublicOrder['status'];

interface StatusUI {
  title: string;
  sub: string;
  icon: React.ReactNode;
  bg: string;
  iconBg: string;
  iconColor: string;
  textColor: string;
  subColor: string;
  pulse?: boolean;
}

function getStatusUI(status: OrderStatus): StatusUI {
  switch (status) {
    case 'pending':
      return {
        title: 'Muestra esto en caja para pagar',
        sub: 'Cuando pagues, cocina recibe tu pedido',
        icon: <Banknote size={18} />,
        bg: 'var(--info-50)',
        iconBg: 'var(--info-500)',
        iconColor: '#fff',
        textColor: 'var(--info-700)',
        subColor: 'var(--info-500)',
      };
    case 'paid':
      return {
        title: '¡Pago recibido!',
        sub: 'Cocina ya recibió tu pedido',
        icon: <Check size={18} />,
        bg: 'var(--info-50)',
        iconBg: 'var(--info-500)',
        iconColor: '#fff',
        textColor: 'var(--info-700)',
        subColor: 'var(--info-500)',
      };
    case 'in_kitchen':
      return {
        title: 'En cocina, paciencia',
        sub: 'Estamos preparando tu pedido',
        icon: <Flame size={18} />,
        bg: 'var(--warning-50)',
        iconBg: 'var(--warning-500)',
        iconColor: '#fff',
        textColor: 'var(--warning-700)',
        subColor: 'var(--warning-600)',
        pulse: true,
      };
    case 'delivered':
      return {
        title: 'Listo, ya te lo lleva el mozo',
        sub: 'Buen provecho',
        icon: <Check size={18} />,
        bg: 'var(--success-50)',
        iconBg: 'var(--success-500)',
        iconColor: '#fff',
        textColor: 'var(--success-700)',
        subColor: 'var(--success-600)',
      };
    case 'cancelled':
      return {
        title: 'Pedido cancelado',
        sub: 'Si fue un error, habla con un mozo',
        icon: <X size={18} />,
        bg: 'var(--danger-50)',
        iconBg: 'var(--danger-500)',
        iconColor: '#fff',
        textColor: 'var(--danger-700)',
        subColor: 'var(--danger-600)',
      };
    default:
      return getStatusUI('pending');
  }
}

interface LiveStatusProps {
  token: string;
  initialOrder: PublicOrder;
}

export function LiveStatus({ token, initialOrder }: LiveStatusProps) {
  const [order, setOrder] = useState<PublicOrder>(initialOrder);

  useSse<PublicOrder | null, OrderStatusChangedPayload>({
    url: `/api/sse/order/${token}`,
    eventNames: { update: 'status' },
    onSnapshot: (data) => {
      if (data) setOrder(data);
    },
    onUpdate: (payload) => {
      setOrder((prev) => ({
        ...prev,
        status: payload.to as PublicOrder['status'],
      }));
    },
  });

  const ui = getStatusUI(order.status);

  return (
    <div
      className={ui.pulse ? 'pulse-soft' : ''}
      style={{
        width: '100%',
        padding: '12px 16px',
        borderRadius: 14,
        background: ui.bg,
        display: 'flex',
        alignItems: 'center',
        gap: 12,
      }}
      role="status"
      aria-live="polite"
    >
      <div
        style={{
          width: 36,
          height: 36,
          borderRadius: '50%',
          background: ui.iconBg,
          color: ui.iconColor,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          flexShrink: 0,
        }}
        aria-hidden="true"
      >
        {ui.icon}
      </div>
      <div style={{ flex: 1 }}>
        <div style={{ fontSize: 14, fontWeight: 700, color: ui.textColor, lineHeight: 1.2 }}>
          {ui.title}
        </div>
        <div style={{ fontSize: 12, color: ui.subColor, marginTop: 2 }}>{ui.sub}</div>
      </div>
    </div>
  );
}
