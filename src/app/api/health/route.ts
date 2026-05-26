import { sql } from 'drizzle-orm';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET() {
  const startedAt = Date.now();

  const { getRealtimeBus } = await import('@/lib/realtime/listener');
  const bus = getRealtimeBus();

  let dbOk = false;
  try {
    const { db } = await import('@/db/client');
    await db.execute(sql`SELECT 1`);
    dbOk = true;
  } catch {
    /* dbOk stays false */
  }

  return Response.json(
    {
      ok: dbOk && bus.state() === 'connected',
      db: dbOk,
      listener: bus.state(),
      uptime_ms: Date.now() - startedAt,
      timestamp: new Date().toISOString(),
    },
    { status: dbOk ? 200 : 503 },
  );
}
