import { NextResponse } from 'next/server';

import { db } from '@/db/client';
import { TableService } from '@/server/services/table';

export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    const service = new TableService(db);
    const tables = await service.listAllWithDerivedState();
    return NextResponse.json(tables);
  } catch (err) {
    console.error('[GET /api/tables]', err);
    return NextResponse.json({ error: 'Error interno del servidor.' }, { status: 500 });
  }
}
