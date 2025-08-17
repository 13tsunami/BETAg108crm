// app/api/tasks/mark-done/route.ts
import { NextResponse } from 'next/server';
import { auth } from '@/auth.config';
import { prisma } from '@/lib/prisma';
import { revalidatePath } from 'next/cache';

function revalidateAll() {
  revalidatePath('/inboxtasks');
  revalidatePath('/inboxtasks/archive');
  revalidatePath('/calendar');
  revalidatePath('/'); // на случай счётчиков
}

export async function POST(req: Request) {
  try {
    const session = await auth();
    const meId = session?.user?.id ?? null;
    if (!meId) {
      return NextResponse.json({ ok: false, error: 'UNAUTHORIZED' }, { status: 401 });
    }

    // поддержка form POST (из <form method="post">)
    const contentType = req.headers.get('content-type') || '';
    let taskId = '';

    if (contentType.includes('application/x-www-form-urlencoded') || contentType.includes('multipart/form-data')) {
      const fd = await req.formData();
      taskId = String(fd.get('taskId') ?? '').trim();
    } else if (contentType.includes('application/json')) {
      const body = await req.json().catch(() => ({}));
      taskId = String(body.taskId ?? '').trim();
    } else {
      // fallback, попробуем formData
      const fd = await req.formData().catch(() => null);
      if (fd) taskId = String(fd.get('taskId') ?? '').trim();
    }

    if (!taskId) {
      return NextResponse.json({ ok: false, error: 'NO_TASK_ID' }, { status: 400 });
    }

    // обновляем только своё назначение и только если оно активно
    await prisma.taskAssignee.updateMany({
      where: { taskId, userId: meId, status: 'in_progress' },
      data: { status: 'done', completedAt: new Date() },
    });

    revalidateAll();

    // 303 на календарь, чтобы сразу увидеть эффект
    const url = new URL('/calendar', req.url);
    return NextResponse.redirect(url, { status: 303 });
  } catch (e) {
    console.error('mark-done POST error', e);
    return NextResponse.json({ ok: false, error: 'INTERNAL' }, { status: 500 });
  }
}
