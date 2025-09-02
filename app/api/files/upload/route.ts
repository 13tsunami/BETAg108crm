// app/api/files/upload/route.ts
import { NextResponse } from 'next/server';
import { auth } from '@/auth.config';
import { normalizeRole, canViewTasks } from '@/lib/roles';
import { prisma } from '@/lib/prisma';
import { saveFileToDiskAndDb } from '@/lib/server/uploads';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(req: Request) {
  try {
    const session = await auth();
    const role = normalizeRole(session?.user?.role);
    const meId = session?.user?.id;
    if (!meId || !canViewTasks(role)) {
      return NextResponse.json({ ok: false, error: 'unauthorized' }, { status: 401 });
    }

    // multipart/form-data
    const form = await req.formData();
    const file = form.get('file');
    const taskAssigneeId = String(form.get('taskAssigneeId') || '');

    if (!(file instanceof File)) {
      return NextResponse.json({ ok: false, error: 'no_file' }, { status: 400 });
    }
    if (!taskAssigneeId) {
      return NextResponse.json({ ok: false, error: 'no_task_assignee' }, { status: 400 });
    }

    // проверяем, что это ИМЕННО моё назначение (я — исполнитель)
    const assn = await prisma.taskAssignee.findUnique({
      where: { id: taskAssigneeId },
      select: { userId: true },
    });
    if (!assn || assn.userId !== meId) {
      return NextResponse.json({ ok: false, error: 'forbidden' }, { status: 403 });
    }

    // лёгкие лимиты/валидация
    const MAX_SIZE = 25 * 1024 * 1024; // 25 MB
    if (file.size > MAX_SIZE) {
      return NextResponse.json({ ok: false, error: 'too_big' }, { status: 413 });
    }

    // допустим всё, но можно сузить при желании
    // const ALLOWED = ['application/pdf','image/png','image/jpeg'];
    // if (!ALLOWED.includes(file.type)) { ... }

    const saved = await saveFileToDiskAndDb({ file, taskAssigneeId });

    return NextResponse.json({ ok: true, attachment: saved });
  } catch (e) {
    console.error('upload error', e);
    return NextResponse.json({ ok: false, error: 'internal' }, { status: 500 });
  }
}
