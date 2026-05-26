import { headers } from 'next/headers';
import Link from 'next/link';
import QRCode from 'qrcode';

import { CerroLogo } from '@/app/_components/cerro-logo';
import { db } from '@/db/client';
import { formatSoles } from '@/lib/money/format';
import { OrderService } from '@/server/services/order';

import { LiveStatus } from './_components/live-status';

function getQrSecret(): Uint8Array {
  const raw = process.env.QR_SECRET ?? '';
  return new TextEncoder().encode(raw.padEnd(32, '0'));
}

interface PageProps {
  params: Promise<{ token: string }>;
}

export default async function OrderTicketPage({ params }: PageProps) {
  const { token } = await params;

  const service = new OrderService(db, getQrSecret());
  const order = await service.getByToken(token);

  if (!order) {
    return (
      <div
        style={{
          minHeight: '100dvh',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          background: 'var(--neutral-50)',
          padding: 32,
          textAlign: 'center',
          gap: 12,
        }}
      >
        <h1
          style={{
            fontFamily: 'var(--font-display)',
            fontSize: 22,
            fontWeight: 700,
            color: 'var(--neutral-800)',
          }}
        >
          Pedido no encontrado
        </h1>
        <p style={{ fontSize: 14, color: 'var(--neutral-500)' }}>
          El enlace puede haber expirado o ser inválido.
        </p>
        <Link
          href="/"
          style={{
            marginTop: 12,
            padding: '10px 20px',
            background: 'var(--brand-500)',
            color: '#fff',
            borderRadius: 12,
            fontSize: 14,
            fontWeight: 600,
            textDecoration: 'none',
          }}
        >
          Volver al menú
        </Link>
      </div>
    );
  }

  const hdrs = await headers();
  const host = hdrs.get('host') ?? 'localhost:3000';
  const protocol = host.startsWith('localhost') ? 'http' : 'https';
  const orderUrl = `${protocol}://${host}/pedido/${token}`;

  const qrDataUrl = await QRCode.toDataURL(orderUrl, {
    width: 240,
    margin: 2,
    errorCorrectionLevel: 'M',
  });

  return (
    <div
      style={{
        background: 'var(--neutral-50)',
        minHeight: '100dvh',
        maxWidth: 448,
        margin: '0 auto',
        display: 'flex',
        flexDirection: 'column',
      }}
    >
      {/* Header */}
      <div
        style={{
          padding: '14px 16px',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
        }}
      >
        <CerroLogo size={14} color="var(--brand-700)" />
        <Link
          href="/"
          style={{
            padding: '6px 10px',
            color: 'var(--neutral-500)',
            fontSize: 12,
            fontWeight: 500,
            textDecoration: 'none',
          }}
        >
          Nuevo pedido
        </Link>
      </div>

      {/* Content */}
      <div
        className="slide-up"
        style={{
          flex: 1,
          overflowY: 'auto',
          padding: '8px 20px 32px',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
        }}
      >
        {/* Live status banner */}
        <LiveStatus token={token} initialOrder={order} />

        {/* Tu código label */}
        <div
          style={{
            fontSize: 11,
            color: 'var(--neutral-500)',
            fontWeight: 600,
            textTransform: 'uppercase',
            letterSpacing: '0.08em',
            marginTop: 20,
            marginBottom: 6,
          }}
        >
          Tu código
        </div>

        {/* Short code GIGANTE */}
        <div
          className="tabnum"
          style={{
            fontFamily: 'var(--font-mono)',
            fontWeight: 700,
            color: 'var(--neutral-800)',
            fontSize: 'var(--shortcode-cliente)',
            letterSpacing: '0.06em',
            lineHeight: 1,
            marginBottom: 18,
          }}
        >
          {order.shortCode}
        </div>

        {/* QR */}
        <div
          style={{
            padding: 14,
            background: 'var(--neutral-0)',
            borderRadius: 18,
            boxShadow: '0 4px 12px rgba(28,24,16,0.08)',
            marginBottom: 18,
          }}
        >
          <img
            src={qrDataUrl}
            alt={`Código QR para el pedido ${order.shortCode}`}
            width={240}
            height={240}
            style={{ display: 'block' }}
          />
        </div>

        {/* Details card */}
        <div
          style={{
            width: '100%',
            padding: '14px 16px',
            background: 'var(--neutral-0)',
            border: '1px solid var(--neutral-200)',
            borderRadius: 14,
          }}
        >
          <div
            style={{
              display: 'flex',
              justifyContent: 'space-between',
              fontSize: 13,
              color: 'var(--neutral-500)',
              marginBottom: 10,
            }}
          >
            <span>
              {order.orderType === 'dine_in' && order.tableCode
                ? `Mesa ${order.tableCode}`
                : 'Para llevar'}
            </span>
          </div>

          {order.items.map((item, idx) => (
            <div
              key={idx}
              style={{
                display: 'flex',
                justifyContent: 'space-between',
                padding: '4px 0',
                fontSize: 13,
                color: 'var(--neutral-700)',
              }}
            >
              <span>
                {item.quantity}× {item.name}
                {item.withTupper ? ' · con tupper' : ''}
              </span>
              {item.unitPriceCents > 0 && (
                <span className="tabnum">
                  {formatSoles(item.unitPriceCents * item.quantity)}
                </span>
              )}
            </div>
          ))}

          <div style={{ height: 1, background: 'var(--neutral-200)', margin: '10px 0' }} />

          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
            <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--neutral-700)' }}>
              Total a pagar
            </span>
            <span
              className="tabnum"
              style={{
                fontFamily: 'var(--font-mono)',
                fontSize: 22,
                fontWeight: 700,
                color: 'var(--neutral-800)',
              }}
            >
              {formatSoles(order.totalCents)}
            </span>
          </div>
        </div>

        <div
          style={{
            marginTop: 18,
            padding: '0 8px',
            textAlign: 'center',
            fontSize: 11,
            color: 'var(--neutral-400)',
            lineHeight: 1.6,
          }}
        >
          Muestra este código o QR a caja para pagar.
          <br />
          Tu estado se actualiza solo.
        </div>
      </div>
    </div>
  );
}
