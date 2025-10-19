// lib/storage.ts
import path from 'node:path';

export function getUploadsBase(): string {
  const env =
    process.env.ENTERPRISE_DIR ||
    process.env.UPLOADS_DIR ||
    process.env.FILES_DIR ||
    process.env.STORAGE_DIR ||
    '/uploads';
  return path.resolve(env);
}
