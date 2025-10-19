export const runtime = 'nodejs';

import { NextResponse } from 'next/server';
import { auth } from '@/auth.config';
import { normalizeRole } from '@/lib/roles';
import { promises as fs } from 'node:fs';
import { createReadStream } from 'node:fs';
import { Readable } from 'node:stream';
import path from 'node:path';
import { getUploadsBase } from '@/lib/storage';

const BASE = getUploadsBase();
const INDEX = 'enterprise.index.json';

type IndexItem = { name: string; restricted: boolean; uploadedAt: number };
type IndexShape = { files: IndexItem[] };

const ALLOWED_EXTS = ['pdf','doc','docx','xls','xlsx','ppt','pptx','jpg','jpeg','png'] as const;
type AllowedExt = typeof ALLOWED_EXTS[number];

function guessContentType(filename: string): { type: string; inline: boolean } {
  const ext = (filename.split('.').pop() || '').toLowerCase();
  switch (ext) {
    case 'pdf':   return { type: 'application/pdf', inline: true };
    case 'jpg':
    case 'jpeg':  return { type: 'image/jpeg', inline: true };
    case 'png':   return { type: 'image/png', inline: true };
    case 'doc':   return { type: 'application/msword', inline: true };
    case 'docx':  return { type: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', inline: true };
    case 'xls':   return { type: 'application/vnd.ms-excel', inline: true };
    case 'xlsx':  return { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', inline: true };
    case 'ppt':   return { type: 'application/vnd.ms-powerpoint', inline: true };
    case 'pptx':  return { type: 'application/vnd.openxmlformats-officedocument.presentationml.presentation', inline: true };
    default:      return { type: 'application/octet-stream', inline: false };
  }
}

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

export async function GET(_req: Request, ctx: { params: Promise<{ file: string }> }) {
  const session = await auth();
  if (!session) return new NextResponse('Unauthorized', { status: 401 });
  const role = (session.user as any)?.role ?? null;

  const { file } = await ctx.params;
  const requested = (file || '').normalize('NFC');

  if (!requested || requested.includes('..') || requested.includes('/') || requested.includes('\\')) {
    return new NextResponse('Forbidden', { status: 403 });
  }
  const ext = (requested.split('.').pop() || '').toLowerCase();
  if (!ALLOWED_EXTS.includes(ext as AllowedExt)) {
    return new NextResponse('Unsupported Media Type', { status: 415 });
  }

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

    const { type, inline } = guessContentType(requested);
    const asciiFallback = requested.replace(/[^\x20-\x7E]/g, '_');
    const filenameStar = encodeURIComponent(requested);
    const disposition = inline ? 'inline' : 'attachment';

    return new NextResponse(webStream, {
      status: 200,
      headers: {
        'Content-Type': type,
        'Content-Length': String(stat.size),
        'Content-Disposition': `${disposition}; filename="${asciiFallback}"; filename*=UTF-8''${filenameStar}`,
        'Cache-Control': 'public, max-age=300',
      },
    });
  } catch {
    return new NextResponse('Not found', { status: 404 });
  }
}
