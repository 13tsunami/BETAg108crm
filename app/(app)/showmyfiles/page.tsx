// app/(app)/showmyfiles/page.tsx
import { auth } from '@/auth.config';
import { prisma } from '@/lib/prisma';

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

function fmtRuDateTimeYekb(input: string | Date) {
  const dt = typeof input === 'string' ? new Date(input) : input;
  const dateParts = new Intl.DateTimeFormat('ru-RU', {
    timeZone: 'Asia/Yekaterinburg',
    day: '2-digit',
    month: 'long',
    year: 'numeric',
  }).formatToParts(dt).reduce<Record<string, string>>((acc, p) => {
    acc[p.type] = p.value;
    return acc;
  }, {});
  const dd = dateParts.day;
  const month = dateParts.month;
  const yyyy = dateParts.year;

  const timeParts = new Intl.DateTimeFormat('ru-RU', {
    timeZone: 'Asia/Yekaterinburg',
    hour: '2-digit',
    minute: '2-digit',
  }).formatToParts(dt);
  const hh = timeParts.find((p) => p.type === 'hour')?.value ?? '00';
  const mm = timeParts.find((p) => p.type === 'minute')?.value ?? '00';

  return `${dd} ${month} ${yyyy}, ${hh}:${mm}`;
}

export default async function Page({ searchParams }: { searchParams: SearchParams }) {
  const sp = await searchParams;
  const tabParam = typeof sp.tab === 'string' ? sp.tab : Array.isArray(sp.tab) ? sp.tab[0] : undefined;

  const session = await auth();
  const meId = session?.user?.id ?? null;
  if (!meId) {
    return (
      <main style={{ padding: 16 }}>
        <h1 style={{ marginTop: 0 }}>Мои файлы</h1>
        <p>Не авторизовано.</p>
      </main>
    );
  }

  const [outgoing, incoming] = await Promise.all([
    // «Мной загружено»: файлы из моих отправок на проверку
    prisma.submissionAttachment.findMany({
      where: { submission: { assignee: { userId: meId } } },
      include: {
        attachment: { select: { id: true, name: true, originalName: true, mime: true, size: true, createdAt: true } },
        submission: {
          include: {
            assignee: {
              include: {
                user: { select: { id: true, name: true } },
                task: { select: { id: true, number: true, title: true, createdById: true, createdByName: true } },
              },
            },
          },
        },
      },
      orderBy: { attachment: { createdAt: 'desc' } },
      take: 500,
    }),
    // «Для меня»: файлы, прикреплённые к задачам, где я — исполнитель
    prisma.taskAttachment.findMany({
      where: { task: { assignees: { some: { userId: meId } } } },
      include: {
        attachment: { select: { id: true, name: true, originalName: true, mime: true, size: true, createdAt: true } },
        task: {
          select: {
            id: true, number: true, title: true, createdById: true, createdByName: true,
            assignees: { select: { userId: true } },
          },
        },
      },
      orderBy: { attachment: { createdAt: 'desc' } },
      take: 500,
    }),
  ]);

  const activeTab: 'forme' | 'byme' = tabParam === 'byme' ? 'byme' : 'forme';

  return (
    <main style={{ padding: 16 }}>
      <h1 style={{ marginTop: 0 }}>Мои файлы</h1>

      <nav style={{ display: 'flex', gap: 8, marginBottom: 16 }}>
        <a href="/showmyfiles?tab=forme"
           style={{ padding: '6px 10px', borderRadius: 8, textDecoration: 'none', border: '1px solid #e5e7eb',
                    background: activeTab === 'forme' ? '#f3f4f6' : '#fff' }}>
          Для меня
        </a>
        <a href="/showmyfiles?tab=byme"
           style={{ padding: '6px 10px', borderRadius: 8, textDecoration: 'none', border: '1px solid #e5e7eb',
                    background: activeTab === 'byme' ? '#f3f4f6' : '#fff' }}>
          Мной загружено
        </a>
      </nav>

      {activeTab === 'forme' ? (
        <section>
          {incoming.length === 0 ? (
            <div style={{ color: '#6b7280' }}>Нет файлов для вас.</div>
          ) : (
            <ul style={{ margin: 0, paddingLeft: 18 }}>
              {incoming.map((row) => {
                const a = row.attachment;
                const t = row.task;
                const href = `/api/files/${a.name}`;
                const title = a.originalName || a.name;
                const sizeKb = Math.max(1, Math.round(a.size / 1024));
                const who = t.createdByName || t.createdById || 'неизвестно';
                const toWhom = 'исполнителям задачи';
                return (
                  <li key={`${t.id}:${a.id}`} style={{ marginBottom: 8 }}>
                    <div style={{ display: 'flex', flexDirection: 'column' }}>
                      <div>
                        <a href={href} target="_blank" rel="noreferrer" style={{ textDecoration: 'none' }}>
                          {title}
                        </a>
                        <span style={{ color: '#6b7280', marginLeft: 6, fontSize: 12 }}>
                          ({a.mime}, ~{sizeKb} КБ)
                        </span>
                      </div>
                      <div style={{ color: '#374151', fontSize: 13 }}>
                        Кому: {toWhom} • Кто загрузил: {who} • Когда: {fmtRuDateTimeYekb(a.createdAt)} • Задача: №{t.number} — {t.title}
                      </div>
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </section>
      ) : (
        <section>
          {outgoing.length === 0 ? (
            <div style={{ color: '#6b7280' }}>Нет загруженных вами файлов.</div>
          ) : (
            <ul style={{ margin: 0, paddingLeft: 18 }}>
              {outgoing.map((row) => {
                const a = row.attachment;
                const sub = row.submission;
                const assn = sub.assignee;
                const task = assn.task;
                const href = `/api/files/${a.name}`;
                const title = a.originalName || a.name;
                const sizeKb = Math.max(1, Math.round(a.size / 1024));
                const who = assn.user?.name || assn.userId;
                const toWhom = task.createdByName || task.createdById || 'проверяющему';
                return (
                  <li key={`${sub.id}:${a.id}`} style={{ marginBottom: 8 }}>
                    <div style={{ display: 'flex', flexDirection: 'column' }}>
                      <div>
                        <a href={href} target="_blank" rel="noreferrer" style={{ textDecoration: 'none' }}>
                          {title}
                        </a>
                        <span style={{ color: '#6b7280', marginLeft: 6, fontSize: 12 }}>
                          ({a.mime}, ~{sizeKb} КБ)
                        </span>
                      </div>
                      <div style={{ color: '#374151', fontSize: 13 }}>
                        Кто загрузил: {who} • Кому: {toWhom} • Когда: {fmtRuDateTimeYekb(a.createdAt)} • Задача: №{task.number} — {task.title}
                      </div>
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </section>
      )}
    </main>
  );
}
