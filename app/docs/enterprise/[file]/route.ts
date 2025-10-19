export const runtime = 'nodejs';

import { NextResponse } from 'next/server';
import { auth } from '@/auth.config';
import { normalizeRole } from '@/lib/roles';
import { promises as fs } from 'node:fs';
import { createReadStream } from 'node:fs';
import { Readable } from 'node:stream';
import path from 'node:path';

const BASE = process.env.ENTERPRISE_DIR || '/uploads';
const INDEX = 'enterprise.index.json';

type IndexItem = { name: string; restricted: boolean; uploadedAt: number };
type IndexShape = { files: IndexItem[] };

function isDeputyOrHigher(role: string | null | undefined): boolean {
  const r = normalizeRole(role);
  return r === 'director' || r === 'deputy_plus' || r === 'deputy';
}

async function readIndex(): Promise<IndexShape> {
  try {
    const raw = await fs.readFile(path.join(BASE, INDEX), 'utf8');
    const parsed = JSON.parse(raw) as IndexShape;
    return Array.isArray(parsed?.files) ? parsed : { files: [] };
  } catch {
    return { files: [] };
  }
}

export async function GET(
  _req: Request,
  ctx: { params: Promise<{ file: string }> }   // <-- ВАЖНО: Promise в Next 15
) {
  // только для авторизованных
  const session = await auth();
  if (!session) return new NextResponse('Unauthorized', { status: 401 });
  const role = (session.user as any)?.role ?? null;

  const { file } = await ctx.params;          // <-- await
  const requested = (file || '').normalize('NFC');

  // базовая валидация
  if (!requested || requested.includes('..') || requested.includes('/') || requested.includes('\\')) {
    return new NextResponse('Forbidden', { status: 403 });
  }
  if (!/\.pdf$/i.test(requested)) {
    return new NextResponse('Unsupported Media Type', { status: 415 });
  }

  // проверка «служебности» через индекс
  const idx = await readIndex();
  const meta = idx.files.find(f => f.name === requested);
  const isRestricted = meta?.restricted === true;
  if (isRestricted && !isDeputyOrHigher(role)) {
    return new NextResponse('Forbidden', { status: 403 });
  }

  const filePath = path.join(BASE, requested);

  try {
    const stat = await fs.stat(filePath);
    if (!stat.isFile()) return new NextResponse('Not found', { status: 404 });

    const nodeStream = createReadStream(filePath);
    const webStream = Readable.toWeb(nodeStream) as unknown as ReadableStream;

    const asciiFallback = requested.replace(/[^\x20-\x7E]/g, '_');
    const filenameStar = encodeURIComponent(requested);

    return new NextResponse(webStream, {
      status: 200,
      headers: {
        'Content-Type': 'application/pdf',
        'Content-Length': String(stat.size),
        'Content-Disposition': `inline; filename="${asciiFallback}"; filename*=UTF-8''${filenameStar}`,
        'Cache-Control': 'public, max-age=300',
      },
    });
  } catch {
    return new NextResponse('Not found', { status: 404 });
  }
}
