// app/api/files/[name]/route.ts
import { getUploadsDir } from '@/lib/uploads';
import path from 'node:path';
import { promises as fs } from 'node:fs';
import { prisma } from '@/lib/prisma';

type Params = Promise<{ name: string }>;

export async function GET(_req: Request, { params }: { params: Params }) {
  const { name } = await params;

  // UUID + опциональное расширение; защита от traversal
  if (!/^[a-f0-9-]{36}(?:\.[a-z0-9]+)?$/i.test(name)) {
    return new Response(JSON.stringify({ error: 'Not found' }), {
      status: 404,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  // метаданные для заголовков
  const meta = await prisma.attachment.findFirst({
    where: { name },
    select: { originalName: true, mime: true, size: true },
  });
  if (!meta) {
    return new Response(JSON.stringify({ error: 'Not found' }), {
      status: 404,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  const full = path.join(getUploadsDir(), name);

  let buf: Buffer;
  try {
    buf = await fs.readFile(full);
  } catch {
    return new Response(JSON.stringify({ error: 'Not found' }), {
      status: 404,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  const headers = new Headers();
  headers.set('Content-Type', meta.mime || 'application/octet-stream');
  const filename = meta.originalName || name;
  headers.set('Content-Disposition', `inline; filename*=UTF-8''${encodeURIComponent(filename)}`);
  if (typeof meta.size === 'number') headers.set('Content-Length', String(meta.size));

  // ✅ Отдаём Uint8Array (ArrayBufferView), это корректный BodyInit
  return new Response(new Uint8Array(buf), { status: 200, headers });
}
