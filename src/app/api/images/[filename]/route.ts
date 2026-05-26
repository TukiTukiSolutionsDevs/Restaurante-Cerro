import { readFile, stat } from 'node:fs/promises';
import path from 'node:path';

import { NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

const UPLOADS_DIR = process.env.UPLOADS_DIR ?? '/app/uploads';

// Allowed extensions and their content types. Restricting the regex blocks
// path traversal (no slashes, no dots beyond the extension).
const FILENAME_RE = /^[0-9]+\.(jpe?g|png|webp)$/;
const CONTENT_TYPES: Record<string, string> = {
  jpg:  'image/jpeg',
  jpeg: 'image/jpeg',
  png:  'image/png',
  webp: 'image/webp',
};

export async function GET(
  _req: Request,
  ctx: { params: Promise<{ filename: string }> },
) {
  const { filename } = await ctx.params;

  if (!FILENAME_RE.test(filename)) {
    return NextResponse.json({ error: 'invalid filename' }, { status: 400 });
  }

  const absolutePath = path.join(UPLOADS_DIR, filename);
  try {
    await stat(absolutePath);
  } catch {
    return NextResponse.json({ error: 'not found' }, { status: 404 });
  }

  const ext = filename.split('.').pop()!.toLowerCase();
  const contentType = CONTENT_TYPES[ext] ?? 'application/octet-stream';
  const buffer = await readFile(absolutePath);
  const body = new Uint8Array(buffer);

  return new Response(body, {
    status: 200,
    headers: {
      'Content-Type': contentType,
      'Cache-Control': 'public, max-age=60, must-revalidate',
    },
  });
}
