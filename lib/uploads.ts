// lib/uploads.ts
import { promises as fs } from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';

export function getUploadsDir(): string {
  const dir = process.env.UPLOADS_DIR || '/uploads';
  return dir;
}

export function inferSafeExt(originalName?: string | null): string {
  if (!originalName) return '';
  const ext = path.extname(originalName).toLowerCase();
  // допустимые короткие расширения; всё остальное — без расширения
  if (/^\.(pdf|png|jpg|jpeg|gif|webp|txt|csv|docx|xlsx|pptx|mp4|mp3|wav)$/.test(ext)) return ext;
  return '';
}

export async function ensureUploadsDir() {
  const dir = getUploadsDir();
  await fs.mkdir(dir, { recursive: true });
}

export async function saveBufferToUploads(buf: Buffer, originalName?: string | null) {
  const sha256 = crypto.createHash('sha256').update(buf).digest('hex');
  const safeExt = inferSafeExt(originalName);
  const name = `${crypto.randomUUID()}${safeExt}`; // имя в сторадже
  const full = path.join(getUploadsDir(), name);

  await ensureUploadsDir();
  await fs.writeFile(full, buf, { flag: 'wx' }); // 'wx' — не перезаписывать

  return { name, sha256, size: buf.length };
}
