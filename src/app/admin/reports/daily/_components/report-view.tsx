import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import type { DailyReport } from '@/server/services/report';

function fmt(cents: number) {
  return `S/ ${(cents / 100).toFixed(2)}`;
}

function fmtMs(ms: number | null) {
  if (ms === null) return '—';
  const m = Math.floor(ms / 60_000);
  const s = Math.floor((ms % 60_000) / 1000);
  return `${m}m ${s}s`;
}

interface Props {
  report: DailyReport;
}

export function ReportView({ report }: Props) {
  if (!report.hasActivity) {
    return (
      <div className="rounded-lg border bg-white p-12 text-center text-gray-400 shadow-sm">
        Sin actividad en este día
      </div>
    );
  }

  const totalOrders =
    report.byStatus.pending +
    report.byStatus.paid +
    report.byStatus.in_kitchen +
    report.byStatus.delivered +
    report.byStatus.cancelled;

  return (
    <div className="space-y-6">
      {/* KPI cards */}
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
        {[
          { label: 'Ingresos',               value: fmt(report.revenue.totalCents)  },
          { label: 'Pedidos',                value: String(totalOrders)             },
          { label: 'Tiempo promedio cocina', value: fmtMs(report.avgKitchenServiceMs) },
          { label: 'Cancelaciones',          value: String(report.byStatus.cancelled) },
        ].map((k) => (
          <div key={k.label} className="rounded-lg border bg-white p-4 shadow-sm">
            <p className="text-xs text-gray-500">{k.label}</p>
            <p className="mt-1 text-xl font-bold">{k.value}</p>
          </div>
        ))}
      </div>

      {/* Revenue breakdown */}
      <Card>
        <CardHeader>
          <CardTitle>Ingresos</CardTitle>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Concepto</TableHead>
                <TableHead className="text-right">Monto</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              <TableRow>
                <TableCell>Total</TableCell>
                <TableCell className="text-right font-medium">{fmt(report.revenue.totalCents)}</TableCell>
              </TableRow>
              <TableRow>
                <TableCell>Efectivo</TableCell>
                <TableCell className="text-right">{fmt(report.revenue.cashCents)}</TableCell>
              </TableRow>
              <TableRow>
                <TableCell>Yape</TableCell>
                <TableCell className="text-right">{fmt(report.revenue.yapeCents)}</TableCell>
              </TableRow>
              <TableRow>
                <TableCell>Para comer aquí</TableCell>
                <TableCell className="text-right">{fmt(report.revenue.dineInCents)}</TableCell>
              </TableRow>
              <TableRow>
                <TableCell>Para llevar</TableCell>
                <TableCell className="text-right">{fmt(report.revenue.takeawayCents)}</TableCell>
              </TableRow>
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      {/* Top 5 items */}
      <Card>
        <CardHeader>
          <CardTitle>Top 5 platos</CardTitle>
        </CardHeader>
        <CardContent>
          {report.topItems.length === 0 ? (
            <p className="text-sm text-gray-400">Sin datos.</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Plato</TableHead>
                  <TableHead className="text-right">Cantidad</TableHead>
                  <TableHead className="text-right">Total</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {report.topItems.map((item) => (
                  <TableRow key={item.menuItemId}>
                    <TableCell>{item.name}</TableCell>
                    <TableCell className="text-right">{item.quantity}</TableCell>
                    <TableCell className="text-right">{fmt(item.totalCents)}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      {/* Cancellations */}
      {report.cancellations.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>Cancelaciones</CardTitle>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Pedido</TableHead>
                  <TableHead>Motivo</TableHead>
                  <TableHead>Hora</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {report.cancellations.map((c) => (
                  <TableRow key={c.orderId}>
                    <TableCell className="font-mono text-xs">{c.orderId.slice(0, 8)}…</TableCell>
                    <TableCell>{c.reason || '—'}</TableCell>
                    <TableCell className="text-sm text-gray-500">
                      {new Date(c.cancelledAt).toLocaleTimeString('es-PE')}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
