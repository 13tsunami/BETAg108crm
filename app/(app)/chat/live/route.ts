import { NextRequest } from 'next/server';
import { auth } from '@/auth.config';
import { prisma } from '@/lib/prisma';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

// === Простенький in-memory брокер подписок по threadId ===
// (на Vercel держится в рамках одного инстанса — для наших 60 пользователей ок)
type Client = {
  threadId: string;
  userId: string;
  send: (data: string) => void;
  close: () => void;
};

const subscribers = new Map<string, Set<Client>>(); // threadId -> Set<Client>

function addSubscriber(threadId: string, client: Client) {
  if (!subscribers.has(threadId)) subscribers.set(threadId, new Set());
  subscribers.get(threadId)!.add(client);
}
function removeSubscriber(threadId: string, client: Client) {
  const set = subscribers.get(threadId);
  if (!set) return;
  set.delete(client);
  if (set.size === 0) subscribers.delete(threadId);
}
function broadcast(threadId: string, payload: unknown) {
  const set = subscribers.get(threadId);
  if (!set || set.size === 0) return;
  const data = `data: ${JSON.stringify(payload)}\n\n`;
  for (const c of set) {
    try { c.send(data); } catch { /* no-op */ }
  }
}

// Общий формат события для клиента (совпадает с типом Msg в ChatBoxClient)
type MsgPayload = {
  id: string;
  threadId: string;
  authorId: string;
  text: string;
  createdAt: string; // ISO
};

// ====== GET: SSE ======
export async function GET(req: NextRequest) {
  const session = await auth();
  const meId = session?.user?.id;
  if (!meId) {
    return new Response('Unauthorized', { status: 401 });
  }

  const threadId = req.nextUrl.searchParams.get('threadId') || '';
  if (!threadId) return new Response('threadId required', { status: 400 });

  // Проверим доступ: пользователь должен быть участником треда
  const thread = await prisma.thread.findUnique({
    where: { id: threadId },
    select: { id: true, aId: true, bId: true },
  });
  if (!thread || (thread.aId !== meId && thread.bId !== meId)) {
    return new Response('Forbidden', { status: 403 });
  }

  const stream = new ReadableStream({
    start(controller) {
      const encoder = new TextEncoder();

      const client: Client = {
        threadId,
        userId: meId,
        send: (chunk: string) => controller.enqueue(encoder.encode(chunk)),
        close: () => controller.close(),
      };

      // Заголовок «handshake» для EventSource (не обязателен, но полезен)
      controller.enqueue(encoder.encode(`event: hello\ndata: ${JSON.stringify({ ok: true })}\n\n`));

      // Регистрация клиента
      addSubscriber(threadId, client);

      // Пинги, чтобы соединение не закрывалось прокси (комментарии SSE)
      const heart = setInterval(() => {
        try { controller.enqueue(encoder.encode(`: ping\n\n`)); } catch {}
      }, 15000);

      // Закрытие при разрыве
      const cancel = () => {
        clearInterval(heart);
        removeSubscriber(threadId, client);
        try { controller.close(); } catch {}
      };

      // В Next 15 Route Handlers у ReadableStream есть cancel
      // Но прокинем и хук на аборт из запроса:
      const signal = req.signal;
      if (signal?.aborted) cancel();
      else signal?.addEventListener('abort', cancel);
    },
    cancel() {
      // Stream закрылся — остальное мы уже сделали в start.cancel
    },
  });

  return new Response(stream, {
    status: 200,
    headers: {
      'Content-Type': 'text/event-stream; charset=utf-8',
      'Cache-Control': 'no-cache, no-transform',
      Connection: 'keep-alive',
      // важный заголовок для Vercel/прокси
      'X-Accel-Buffering': 'no',
    },
  });
}

// ====== POST: отправка сообщения ======
export async function POST(req: NextRequest) {
  const session = await auth();
  const meId = session?.user?.id;
  if (!meId) return new Response('Unauthorized', { status: 401 });

  const threadId = req.nextUrl.searchParams.get('threadId') || '';
  if (!threadId) return new Response('threadId required', { status: 400 });

  const thread = await prisma.thread.findUnique({
    where: { id: threadId },
    select: { id: true, aId: true, bId: true },
  });
  if (!thread || (thread.aId !== meId && thread.bId !== meId)) {
    return new Response('Forbidden', { status: 403 });
  }

  let body: { text?: string } = {};
  try {
    body = await req.json();
  } catch {
    return new Response('Bad JSON', { status: 400 });
  }
  const text = (body.text ?? '').trim();
  if (!text) return new Response('Empty', { status: 400 });
  if (text.length > 4000) return new Response('Too long', { status: 413 });

  // Сохраняем сообщение и обновляем тред
  const msg = await prisma.message.create({
    data: {
      threadId,
      authorId: meId,
      text,
    },
    select: { id: true, threadId: true, authorId: true, text: true, createdAt: true },
  });

  await prisma.thread.update({
    where: { id: threadId },
    data: {
      lastMessageAt: msg.createdAt,
      lastMessageText: msg.text,
    },
  });

  // Обновим ReadMark для автора (он «прочёл» до текущего момента)
  await prisma.readMark.upsert({
    where: { threadId_userId: { threadId, userId: meId } },
    update: { readAt: new Date() },
    create: { threadId, userId: meId, readAt: new Date() },
  });

  // Рассылаем событие подписчикам этого треда
  const payload: MsgPayload = {
    id: msg.id,
    threadId: msg.threadId,
    authorId: msg.authorId,
    text: msg.text,
    createdAt: msg.createdAt.toISOString(),
  };
  broadcast(threadId, payload);

  return new Response(JSON.stringify({ ok: true }), { status: 200, headers: { 'Content-Type': 'application/json' } });
}
