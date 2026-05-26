import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import type { AuditLogView } from '@/server/services/audit';

const ACTOR_TYPE_LABELS: Record<string, string> = {
  staff:  'Personal',
  system: 'Sistema',
  device: 'Dispositivo',
};

interface Props {
  rows: AuditLogView[];
}

export function AuditTable({ rows }: Props) {
  if (rows.length === 0) {
    return (
      <div className="rounded-lg border bg-white p-8 text-center text-sm text-gray-400 shadow-sm">
        Sin registros para los filtros seleccionados.
      </div>
    );
  }

  return (
    <div className="rounded-lg border bg-white shadow-sm">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead className="w-40">Fecha/Hora</TableHead>
            <TableHead>Actor</TableHead>
            <TableHead>Acción</TableHead>
            <TableHead>Entidad</TableHead>
            <TableHead>ID</TableHead>
            <TableHead>Payload</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {rows.map((row) => (
            <TableRow key={row.id}>
              <TableCell className="font-mono text-xs text-gray-500 whitespace-nowrap">
                {new Date(row.createdAt).toLocaleString('es-PE')}
              </TableCell>
              <TableCell>
                <span className="text-xs text-gray-500">
                  {ACTOR_TYPE_LABELS[row.actorType] ?? row.actorType}
                </span>
                {row.actorName && (
                  <span className="ml-1 text-sm font-medium">{row.actorName}</span>
                )}
                {!row.actorName && row.actorId && (
                  <span className="ml-1 text-sm font-mono">#{row.actorId}</span>
                )}
              </TableCell>
              <TableCell className="font-mono text-sm">{row.action}</TableCell>
              <TableCell className="text-sm">{row.entity}</TableCell>
              <TableCell className="font-mono text-xs text-gray-500">
                {row.entityId ?? '—'}
              </TableCell>
              <TableCell>
                <details className="max-w-xs">
                  <summary className="cursor-pointer text-xs text-blue-600 hover:underline">
                    ver
                  </summary>
                  <pre className="mt-1 max-h-32 overflow-auto rounded bg-gray-50 p-2 text-xs">
                    {JSON.stringify(row.payload, null, 2)}
                  </pre>
                </details>
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}
