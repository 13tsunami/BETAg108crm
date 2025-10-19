'use server';

import { redirect } from 'next/navigation';
import { revalidatePath } from 'next/cache';
import { auth } from '@/auth.config';
import { canViewAdmin, normalizeRole } from '@/lib/roles';
import { promises as fs } from 'node:fs';
import path from 'node:path';

const BASE = process.env.ENTERPRISE_DIR || '/uploads';
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

function normalizePdfName(input: string): string {
  let s = (input || '').normalize('NFC').trim().replace(/\s+/g, '-');
  s = s.replace(/[^\p{L}\p{N}._()\\-]/gu, ''); // Unicode letters/digits + . _ -
  if (!s) s = 'document';
  if (!/\.pdf$/i.test(s)) s += '.pdf';
  if (s.length > 180) s = s.slice(0, 180);
  return s;
}

export async function uploadEnterprisePdfAction(formData: FormData): Promise<void> {
  const session = await auth();
  const role = normalizeRole((session?.user as any)?.role ?? null);
  if (!canViewAdmin(role)) redirect('/');

  const file = formData.get('file');
  const nameRaw = (formData.get('name') as string | null) ?? '';
  // чекбокс «служебный» можно добавить на форме: name="restricted" value="1"
  const restricted = ((formData.get('restricted') as string | null) === '1') || false;

  if (!(file instanceof File)) throw new Error('Файл не получен');

  const effectiveRaw = nameRaw || (typeof (file as any).name === 'string' ? (file as any).name : '');
  const name = normalizePdfName(effectiveRaw);

  const MAX = 20 * 1024 * 1024;
  if (file.size > MAX) throw new Error('Файл слишком большой');

  const buf = Buffer.from(await file.arrayBuffer());

  await fs.mkdir(BASE, { recursive: true });
  const targetPath = path.join(BASE, name);

  // запретим перезапись
  try {
    const st = await fs.stat(targetPath);
    if (st.isFile()) throw new Error('Файл с таким именем уже существует');
  } catch { /* ok */ }

  await fs.writeFile(targetPath, buf);

  // запись в индекс: видим потом на /enterprise
  const idx = await readIndex();
  const files = idx.files.filter(f => f.name === name ? false : true);
  files.push({ name, restricted, uploadedAt: Date.now() });
  await writeIndex({ files });

  revalidatePath('/enterprise');
  redirect('/enterprise');
}
