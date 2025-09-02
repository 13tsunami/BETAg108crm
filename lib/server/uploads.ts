// lib/server/uploads.ts
import { promises as fs } from 'fs';
import path from 'path';
import crypto from 'crypto';
import { prisma } from '@/lib/prisma';

export type SavedAttachment = {
  id: string;
  originalName: string | null;
  name: string;
  size: number;
  mime: string;
  createdAt: Date;
};

const UPLOADS_DIR = process.env.UPLOADS_DIR || path.join(process.cwd(), 'uploads');

// гарантируем наличие папки (лениво)
async function ensureDir(dir: string) {
  await fs.mkdir(dir, { recursive: true });
}

function safeFileName(base: string) {
  // Нормализуем и оставляем только: латиница, кириллица, цифры, пробел, . - _
  const normalized = base.normalize('NFKC');
  return normalized
    .replace(/[^\w.\- \u0400-\u04FF]/g, '') // \w = [A-Za-z0-9_], добавили диапазон кириллицы
    .trim()
    .replace(/\s+/g, ' ')
    .slice(0, 180);
}

function randomName(ext: string) {
  const id = crypto.randomUUID().replace(/-/g, '');
  return ext ? `${id}${ext}` : id;
}

async function sha256OfBuffer(buf: Buffer): Promise<string> {
  return crypto.createHash('sha256').update(buf).digest('hex');
}

/**
 * Сохранение файла исполнителя в Submission (review-flow)
 */
export async function saveFileToDiskAndDb(opts: {
  file: File;
  // гарантируем, что есть открытая Submission у исполнителя; если нет — создадим
  taskAssigneeId: string;
}): Promise<SavedAttachment> {
  const { file, taskAssigneeId } = opts;

  // 1) Подготовка буфера и метаданных
  const arrayBuf = await file.arrayBuffer();
  const buf = Buffer.from(arrayBuf);
  const size = buf.length;
  const mime = file.type || 'application/octet-stream';
  const originalBase = safeFileName(file.name || 'file');
  const ext = path.extname(originalBase).toLowerCase();
  const storedName = randomName(ext);

  // 2) Запись на диск
  await ensureDir(UPLOADS_DIR);
  const dest = path.join(UPLOADS_DIR, storedName);
  await fs.writeFile(dest, buf);

  // 3) Хэш
  const sha256 = await sha256OfBuffer(buf);

  // 4) Гарантируем открытую submission (если вдруг ещё нет)
  const open = await prisma.submission.findFirst({
    where: { taskAssigneeId, open: true },
    select: { id: true },
  });
  const submissionId = open
    ? open.id
    : (await prisma.submission.create({ data: { taskAssigneeId, open: true } })).id;

  // 5) Записываем Attachment и линк
  const attachment = await prisma.attachment.create({
    data: {
      name: storedName,
      originalName: originalBase,
      mime,
      size,
      sha256,
      submissionLinks: {
        create: { submissionId },
      },
    },
    select: { id: true, originalName: true, name: true, size: true, mime: true, createdAt: true },
  });

  return attachment;
}

/**
 * Сохранение файлов при создании задачи
 */
export async function saveTaskFileToDiskAndDb(opts: {
  file: File;
  taskId: string;
}): Promise<SavedAttachment> {
  const { file, taskId } = opts;

  // 1) Подготовка буфера и метаданных
  const arrayBuf = await file.arrayBuffer();
  const buf = Buffer.from(arrayBuf);
  const size = buf.length;
  const mime = file.type || 'application/octet-stream';
  const originalBase = safeFileName(file.name || 'file');
  const ext = path.extname(originalBase).toLowerCase();
  const storedName = randomName(ext);

  // 2) Запись на диск
  await ensureDir(UPLOADS_DIR);
  const dest = path.join(UPLOADS_DIR, storedName);
  await fs.writeFile(dest, buf);

  // 3) Хэш
  const sha256 = await sha256OfBuffer(buf);

  // 4) Записываем Attachment и линк с Task
  const attachment = await prisma.attachment.create({
    data: {
      name: storedName,
      originalName: originalBase,
      mime,
      size,
      sha256,
      taskLinks: {
        create: { taskId },
      },
    },
    select: { id: true, originalName: true, name: true, size: true, mime: true, createdAt: true },
  });

  return attachment;
}
