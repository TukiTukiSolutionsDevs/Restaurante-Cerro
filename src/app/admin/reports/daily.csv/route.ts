import { db } from '@/db/client';
import { nextCookies } from '@/lib/auth/next-adapter';
import { requireRole } from '@/lib/auth/session';
import { ReportService } from '@/server/services/report';

export async function GET(request: Request): Promise<Response> {
  const cookieStore = await nextCookies();
  const auth = await requireRole(cookieStore, ['admin']);
  if (!auth.ok) {
    return new Response('No autorizado', { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const dateParam = searchParams.get('date');

  if (!dateParam || !/^\d{4}-\d{2}-\d{2}$/.test(dateParam)) {
    return new Response('Parámetro date inválido. Formato: YYYY-MM-DD', { status: 400 });
  }

  const parsed = new Date(dateParam + 'T00:00:00.000Z');
  if (isNaN(parsed.getTime())) {
    return new Response('Fecha inválida', { status: 400 });
  }

  const today = new Date().toISOString().slice(0, 10);
  if (dateParam > today) {
    return new Response('No se permiten fechas futuras', { status: 400 });
  }

  const svc = new ReportService(db);
  const report = await svc.daily(parsed);

  const lines: string[] = [];

  lines.push('Resumen');
  lines.push('Estado,Pedidos');
  lines.push(`Pendiente,${report.byStatus.pending}`);
  lines.push(`Cobrado,${report.byStatus.paid}`);
  lines.push(`En cocina,${report.byStatus.in_kitchen}`);
  lines.push(`Entregado,${report.byStatus.delivered}`);
  lines.push(`Cancelado,${report.byStatus.cancelled}`);
  lines.push('');

  lines.push('Ingresos');
  lines.push('Concepto,Monto (S/)');
  lines.push(`Total,${(report.revenue.totalCents / 100).toFixed(2)}`);
  lines.push(`Efectivo,${(report.revenue.cashCents / 100).toFixed(2)}`);
  lines.push(`Yape,${(report.revenue.yapeCents / 100).toFixed(2)}`);
  lines.push(`Para comer aquí,${(report.revenue.dineInCents / 100).toFixed(2)}`);
  lines.push(`Para llevar,${(report.revenue.takeawayCents / 100).toFixed(2)}`);
  lines.push('');

  lines.push('Top 5 platos');
  lines.push('Plato,Cantidad,Total (S/)');
  for (const item of report.topItems) {
    const safeName = item.name.replace(/"/g, '""');
    lines.push(`"${safeName}",${item.quantity},${(item.totalCents / 100).toFixed(2)}`);
  }
  lines.push('');

  lines.push('Cancelaciones');
  lines.push('Pedido,Motivo,Fecha');
  for (const c of report.cancellations) {
    const safeReason = c.reason.replace(/"/g, '""');
    lines.push(`"${c.orderId}","${safeReason}","${c.cancelledAt.toISOString()}"`);
  }

  const csv = '\uFEFF' + lines.join('\r\n');

  return new Response(csv, {
    status: 200,
    headers: {
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': `attachment; filename="reporte-${dateParam}.csv"`,
    },
  });
}
