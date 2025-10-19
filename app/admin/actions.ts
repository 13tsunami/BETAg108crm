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

// app/(app)/admin/actions.ts
const ALLOWED_EXTS = ['pdf','doc','docx','xls','xlsx','ppt','pptx','jpg','jpeg','png'] as const;

type AllowedExt = typeof ALLOWED_EXTS[number];

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

// нормализация имени: сохраняем допустимое расширение, иначе добавим .pdf (как дефолт)
function normalizeUploadName(input: string, fallbackFromOriginal?: string): string {
  const original = (input || '').normalize('NFC').trim();
  const cleaned = original.replace(/\s+/g, '-').replace(/[^\p{L}\p{N}._()\-.]/gu, '');
  let base = cleaned || 'document';

  // попробуем вытащить расширение из имени
  const m1 = base.match(/\.([A-Za-z0-9]+)$/);
  let ext = m1 ? m1[1].toLowerCase() : '';

  // если не нашли — попробуем из «оригинального имени файла»
  if (!ext && fallbackFromOriginal) {
    const m2 = fallbackFromOriginal.normalize('NFC').match(/\.([A-Za-z0-9]+)$/);
    if (m2) ext = (m2[1] || '').toLowerCase();
  }

  // приняли только разрешённые
  if (!ALLOWED_EXTS.includes(ext as AllowedExt)) {
    ext = 'pdf';
  }

  // убираем старый хвост и навешиваем корректное расширение
  base = base.replace(/\.([A-Za-z0-9]+)$/, '');
  base = base.slice(0, 180); // ограничим длину
  return `${base}.${ext}`;
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

    const originalName = typeof (fileEntry as any).name === 'string' ? (fileEntry as any).name : '';
    const name = normalizeUploadName(nameRaw || originalName || 'document', originalName);

    const MAX = 20 * 1024 * 1024;
    // @ts-ignore
    if ((file as any).size && (file as any).size > MAX) throw new Error('File too large');

    await fs.mkdir(BASE, { recursive: true });
    await fs.access(BASE, fs.constants.W_OK).catch(() => {
      throw new Error(`No write access to ${BASE}`);
    });

    const buf = Buffer.from(await (file as any).arrayBuffer());
    const targetPath = path.join(BASE, name);

    // запрет перезаписи
    try {
      const st = await fs.stat(targetPath);
      if (st.isFile()) throw new Error('File already exists');
    } catch { /* ok */ }

    await fs.writeFile(targetPath, buf);

    // индекс
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
