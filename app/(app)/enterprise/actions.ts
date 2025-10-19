'use server';

import { redirect } from 'next/navigation';
import { revalidatePath } from 'next/cache';
import { auth } from '@/auth.config';
import { normalizeRole } from '@/lib/roles';
import { promises as fs } from 'node:fs';
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
async function writeIndex(data: IndexShape): Promise<void> {
  const file = path.join(BASE, INDEX);
  const tmp = file + '.tmp';
  await fs.mkdir(BASE, { recursive: true });
  await fs.writeFile(tmp, JSON.stringify(data, null, 2), 'utf8');
  await fs.rename(tmp, file);
}

function safeName(name: string): string {
  const n = (name || '').normalize('NFC');
  if (!n || n.includes('..') || n.includes('/') || n.includes('\\')) {
    throw new Error('Некорректное имя файла');
  }
  if (!/\.pdf$/i.test(n)) throw new Error('Ожидается .pdf');
  return n;
}

function normalizePdfName(input: string): string {
  let s = (input || '').normalize('NFC').trim().replace(/\s+/g, '-');
  s = s.replace(/[^\p{L}\p{N}._()\\-]/gu, '');
  if (!s) s = 'document';
  if (!/\.pdf$/i.test(s)) s += '.pdf';
  if (s.length > 180) s = s.slice(0, 180);
  return s;
}

export async function deletePdfAction(formData: FormData): Promise<void> {
  const session = await auth();
  const role = (session?.user as any)?.role ?? null;
  if (!isDeputyOrHigher(role)) redirect('/');

  const name = safeName((formData.get('name') as string | null) ?? '');
  try { await fs.unlink(path.join(BASE, name)); } catch { /* ignore */ }

  const idx = await readIndex();
  await writeIndex({ files: idx.files.filter(f => f.name !== name) });

  revalidatePath('/enterprise');
  redirect('/enterprise');
}

export async function renamePdfAction(formData: FormData): Promise<void> {
  const session = await auth();
  const role = (session?.user as any)?.role ?? null;
  if (!isDeputyOrHigher(role)) redirect('/');

  const oldName = safeName((formData.get('oldName') as string | null) ?? '');
  const newName = normalizePdfName((formData.get('newName') as string | null) ?? '');

  const from = path.join(BASE, oldName);
  const to = path.join(BASE, newName);

  try {
    const st = await fs.stat(to);
    if (st.isFile()) throw new Error('Файл с таким именем уже существует');
  } catch { /* ok */ }

  await fs.rename(from, to);

  const idx = await readIndex();
  const files = idx.files.map(f => f.name === oldName ? { ...f, name: newName } : f);
  await writeIndex({ files });

  revalidatePath('/enterprise');
  redirect('/enterprise');
}

export async function toggleRestrictedAction(formData: FormData): Promise<void> {
  const session = await auth();
  const role = (session?.user as any)?.role ?? null;
  if (!isDeputyOrHigher(role)) redirect('/');

  const name = safeName((formData.get('name') as string | null) ?? '');
  const next = (formData.get('next') as string | null) === '1';

  const idx = await readIndex();
  const i = idx.files.findIndex(f => f.name === name);
  if (i === -1) throw new Error('Файл не найден');

  idx.files[i] = { ...idx.files[i], restricted: next };
  await writeIndex(idx);

  revalidatePath('/enterprise');
  redirect('/enterprise');
}
