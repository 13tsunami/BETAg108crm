// app/(app)/admin/actions.ts
'use server';

import { redirect } from 'next/navigation';
import { revalidatePath } from 'next/cache';
import { auth } from '@/auth.config';
import { canViewAdmin, normalizeRole } from '@/lib/roles';
import { promises as fs } from 'node:fs';
import path from 'node:path';
import { getUploadsBase } from '@/lib/storage';

const BASE = getUploadsBase();
const INDEX = 'enterprise.index.json';

type IndexItem = { name: string; restricted: boolean; uploadedAt: number };
type IndexShape = { files: IndexItem[] };

async function readIndex(): Promise<IndexShape> {
  try {
    const raw = await fs.readFile(path.join(BASE, INDEX), 'utf8');
    const parsed = JSON.parse(raw) as IndexShape;
    return Array.isArray(parsed?.files) ? parsed : { files: [] };
  } catch {
    return { files: [] };
  }
}
async function writeIndex(data: IndexShape): Promise<void> {
  const file = path.join(BASE, INDEX);
  const tmp = file + '.tmp';
  await fs.mkdir(BASE, { recursive: true });
  await fs.writeFile(tmp, JSON.stringify(data, null, 2), 'utf8');
  await fs.rename(tmp, file);
}

// безопасная нормализация имени
function normalizePdfName(input: string): string {
  let s = (input || '').normalize('NFC').trim().replace(/\s+/g, '-');
  // разрешаем буквы/цифры, . _ ( ) и дефис
  s = s.replace(/[^\p{L}\p{N}._()\-.]/gu, '');
  if (!s) s = 'document';
  if (!/\.pdf$/i.test(s)) s += '.pdf';
  if (s.length > 180) s = s.slice(0, 180);
  return s;
}

export async function uploadEnterprisePdfAction(formData: FormData): Promise<void> {
  try {
    const session = await auth();
    const role = normalizeRole((session?.user as any)?.role ?? null);
    if (!canViewAdmin(role)) redirect('/');

    const fileEntry = formData.get('file') as unknown;
    if (!fileEntry || typeof (fileEntry as any).arrayBuffer !== 'function') {
      throw new Error('File payload missing');
    }
    const file = fileEntry as unknown as Blob;

    const nameRaw = (formData.get('name') as string | null) ?? '';
    const restricted = (formData.get('restricted') as string | null) === '1';

    const effectiveRaw =
      nameRaw ||
      (typeof (fileEntry as any).name === 'string' ? (fileEntry as any).name : '') ||
      'document.pdf';

    const name = normalizePdfName(effectiveRaw);

    const MAX = 20 * 1024 * 1024;
    // @ts-ignore
    if ((file as any).size && (file as any).size > MAX) throw new Error('File too large');

    await fs.mkdir(BASE, { recursive: true });
    await fs.access(BASE, fs.constants.W_OK).catch(() => {
      throw new Error(`No write access to ${BASE}`);
    });

    // Разовый лог для диагностики пути (после проверки удалите)
    console.log('[enterprise-upload] BASE =', BASE);

    const buf = Buffer.from(await (file as any).arrayBuffer());
    const targetPath = path.join(BASE, name);

    // запрет перезаписи
    try {
      const st = await fs.stat(targetPath);
      if (st.isFile()) throw new Error('File already exists');
    } catch { /* ok */ }

    await fs.writeFile(targetPath, buf);

    const idx = await readIndex();
    const files = idx.files.filter(f => f.name !== name);
    files.push({ name, restricted, uploadedAt: Date.now() });
    await writeIndex({ files });

    revalidatePath('/enterprise');
    redirect('/enterprise');
  } catch (err: any) {
    console.error('uploadEnterprisePdfAction failed:', err?.stack || err);
    const msg = encodeURIComponent(typeof err?.message === 'string' ? err.message : 'Upload failed');
    redirect(`/admin?error=${msg}`);
  }
}
