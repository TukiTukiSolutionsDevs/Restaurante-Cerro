import { mkdir, unlink, writeFile } from 'node:fs/promises';
import path from 'node:path';

import { eq } from 'drizzle-orm';
import { revalidatePath } from 'next/cache';
import { NextResponse } from 'next/server';

import { db } from '@/db/client';
import { menuItem } from '@/db/schema';
import { nextCookies } from '@/lib/auth/next-adapter';
import { requireRole } from '@/lib/auth/session';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

const UPLOADS_DIR = process.env.UPLOADS_DIR ?? '/app/uploads';
const MAX_BYTES = 2 * 1024 * 1024; // 2 MiB
const MIME_TO_EXT: Record<string, string> = {
  'image/jpeg': 'jpg',
  'image/png':  'png',
  'image/webp': 'webp',
};

async function requireAdmin() {
  const cookies = await nextCookies();
  const auth = await requireRole(cookies, ['admin']);
  return auth.ok ? null : NextResponse.json({ error: 'unauthorized' }, { status: 401 });
}

async function removePreviousImage(existing: string | null) {
  if (!existing) return;
  try {
    await unlink(path.join(UPLOADS_DIR, existing));
  } catch {
    // File may have been removed already; ignore.
  }
}

export async function POST(
  req: Request,
  ctx: { params: Promise<{ id: string }> },
) {
  const unauthorized = await requireAdmin();
  if (unauthorized) return unauthorized;

  const { id } = await ctx.params;
  const itemId = Number(id);
  if (!Number.isInteger(itemId) || itemId <= 0) {
    return NextResponse.json({ error: 'invalid id' }, { status: 400 });
  }

  const form = await req.formData();
  const file = form.get('image');
  if (!(file instanceof File)) {
    return NextResponse.json({ error: 'missing file' }, { status: 400 });
  }

  const ext = MIME_TO_EXT[file.type];
  if (!ext) {
    return NextResponse.json(
      { error: 'unsupported file type (use jpg, png, or webp)' },
      { status: 400 },
    );
  }

  if (file.size > MAX_BYTES) {
    return NextResponse.json(
      { error: 'file too large (max 2 MB)' },
      { status: 400 },
    );
  }

  const [existing] = await db
    .select({ imagePath: menuItem.imagePath })
    .from(menuItem)
    .where(eq(menuItem.id, itemId));

  if (!existing) {
    return NextResponse.json({ error: 'item not found' }, { status: 404 });
  }

  await mkdir(UPLOADS_DIR, { recursive: true });
  const filename = `${itemId}.${ext}`;
  const absolutePath = path.join(UPLOADS_DIR, filename);
  const bytes = new Uint8Array(await file.arrayBuffer());
  await writeFile(absolutePath, bytes);

  // If previous image had a different extension, delete the old file.
  if (existing.imagePath && existing.imagePath !== filename) {
    await removePreviousImage(existing.imagePath);
  }

  await db
    .update(menuItem)
    .set({ imagePath: filename })
    .where(eq(menuItem.id, itemId));

  revalidatePath('/admin/menu');
  return NextResponse.json({ imagePath: filename });
}

export async function DELETE(
  _req: Request,
  ctx: { params: Promise<{ id: string }> },
) {
  const unauthorized = await requireAdmin();
  if (unauthorized) return unauthorized;

  const { id } = await ctx.params;
  const itemId = Number(id);
  if (!Number.isInteger(itemId) || itemId <= 0) {
    return NextResponse.json({ error: 'invalid id' }, { status: 400 });
  }

  const [existing] = await db
    .select({ imagePath: menuItem.imagePath })
    .from(menuItem)
    .where(eq(menuItem.id, itemId));

  if (!existing) {
    return NextResponse.json({ error: 'item not found' }, { status: 404 });
  }

  await removePreviousImage(existing.imagePath);
  await db
    .update(menuItem)
    .set({ imagePath: null })
    .where(eq(menuItem.id, itemId));

  revalidatePath('/admin/menu');
  return NextResponse.json({ ok: true });
}
