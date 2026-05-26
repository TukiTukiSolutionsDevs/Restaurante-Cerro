export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

import { db } from '@/db/client';
import { MenuService } from '@/server/services/menu';

export async function GET() {
  const service = new MenuService(db);
  const menu = await service.getTodayPublicMenu();
  if (!menu) {
    return Response.json({ error: 'menu_closed' }, { status: 404 });
  }
  return Response.json(menu);
}
