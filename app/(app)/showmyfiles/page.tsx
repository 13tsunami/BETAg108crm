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

function fmtSize(bytes: number) {
  if (bytes >= 1024 * 1024) return `${(bytes / 1024 / 1024).toFixed(1)} МБ`;
  return `${Math.max(1, Math.round(bytes / 1024))} КБ`;
}

// Фильтр по MIME для select'ов ниже
function mimeWhereForType(type: string) {
  if (type === 'image') return { mime: { startsWith: 'image/' } };
  if (type === 'pdf')   return { mime: { startsWith: 'application/pdf' } };
  if (type === 'doc')   return { OR: [{ mime: { contains: 'word' } }, { mime: { contains: 'rtf' } }] };
  if (type === 'xls')   return { OR: [{ mime: { contains: 'excel' } }, { mime: { contains: 'spreadsheetml' } }] };
  if (type === 'ppt')   return { OR: [{ mime: { contains: 'powerpoint' } }, { mime: { contains: 'presentationml' } }] };
  if (type === 'other') return {
    NOT: { OR: [
      { mime: { startsWith: 'image/' } },
      { mime: { startsWith: 'application/pdf' } },
      { mime: { contains: 'word' } }, { mime: { contains: 'rtf' } },
      { mime: { contains: 'excel' } }, { mime: { contains: 'spreadsheetml' } },
      { mime: { contains: 'powerpoint' } }, { mime: { contains: 'presentationml' } },
    ]},
  };
  return {};
}

export default async function Page({ searchParams }: { searchParams: SearchParams }) {
  const sp = await searchParams;

  // ── параметры UI (серверные, без клиентских хуков) ──
  const tabParam = typeof sp.tab === 'string' ? sp.tab : Array.isArray(sp.tab) ? sp.tab[0] : undefined;
  const activeTab: 'forme' | 'byme' = tabParam === 'byme' ? 'byme' : 'forme';

  const q = typeof sp.q === 'string' ? sp.q.trim() : '';
  const type = typeof sp.type === 'string' ? sp.type : '';
  const sort = sp.sort === 'old' ? 'old' : 'new';
  const after = typeof sp.after === 'string' ? sp.after : '';
  const before = typeof sp.before === 'string' ? sp.before : '';
  const pageSize = 50;

  const orderBy = { attachment: { createdAt: sort === 'old' ? 'asc' : 'desc' } } as const;
  const cursorCond =
    after ? { attachment: { createdAt: { lt: new Date(after) } } } :
    before ? { attachment: { createdAt: { gt: new Date(before) } } } :
    {};

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

  // where-условия «по тексту» — подставляются в нужные места для каждой выборки
  const titleWhereForTaskAttachment = q
    ? {
        OR: [
          { attachment: { originalName: { contains: q, mode: 'insensitive' as const } } },
          { attachment: { name: { contains: q, mode: 'insensitive' as const } } },
          { task: { title: { contains: q, mode: 'insensitive' as const } } },
          ...(isNaN(Number(q)) ? [] : [{ task: { number: Number(q) } }]),
        ],
      }
    : {};

  const titleWhereForSubmissionAttachment = q
    ? {
        OR: [
          { attachment: { originalName: { contains: q, mode: 'insensitive' as const } } },
          { attachment: { name: { contains: q, mode: 'insensitive' as const } } },
          { submission: { assignee: { task: { title: { contains: q, mode: 'insensitive' as const } } } } },
          ...(isNaN(Number(q)) ? [] : [{ submission: { assignee: { task: { number: Number(q) } } } }]),
        ],
      }
    : {};

  const [outgoingRaw, incomingRaw] = await Promise.all([
    // «Мной загружено»: файлы из моих отправок на проверку
    prisma.submissionAttachment.findMany({
      where: {
        AND: [
          { submission: { assignee: { userId: meId, task: { hidden: { not: true } } } } }, // исключаем скрытые задачи
          { attachment: mimeWhereForType(type) },
          titleWhereForSubmissionAttachment,
          cursorCond,
        ],
      },
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
      orderBy,
      take: pageSize + 1, // на один больше — чтобы понять, есть ли следующая страница
    }),

    // «Для меня»: файлы, прикреплённые к задачам, где я — исполнитель
    prisma.taskAttachment.findMany({
      where: {
        AND: [
          {
            task: {
              hidden: { not: true },               // исключаем скрытые задачи
              assignees: { some: { userId: meId } },
            },
          },
          { attachment: mimeWhereForType(type) },
          titleWhereForTaskAttachment,
          cursorCond,
        ],
      },
      include: {
        attachment: { select: { id: true, name: true, originalName: true, mime: true, size: true, createdAt: true } },
        task: {
          select: {
            id: true, number: true, title: true, createdById: true, createdByName: true,
            assignees: { select: { userId: true } },
          },
        },
      },
      orderBy,
      take: pageSize + 1,
    }),
  ]);

  // Выбор активного списка и расчёт пагинации
  const list = activeTab === 'forme' ? incomingRaw : outgoingRaw;
  const hasMore = list.length > pageSize;
  const page = hasMore ? list.slice(0, pageSize) : list;
  const oldest = page.at(-1)?.attachment.createdAt as Date | undefined;
  const newest = page.at(0)?.attachment.createdAt as Date | undefined;

  // Хэлпер сборки URL с сохранением фильтров
  const buildHref = (params: Record<string, string | undefined>) => {
    const p = new URLSearchParams();
    p.set('tab', activeTab);
    if (q) p.set('q', q);
    if (type) p.set('type', type);
    if (sort) p.set('sort', sort);
    if (params.before) p.set('before', params.before);
    if (params.after) p.set('after', params.after);
    return `/showmyfiles?${p.toString()}`;
  };

  return (
    <main style={{ padding: 16 }}>
      <h1 style={{ marginTop: 0 }}>Мои файлы</h1>

      <nav style={{ display: 'flex', gap: 8, marginBottom: 12 }}>
        <a
          href={buildHref({ before: undefined, after: undefined }).replace('tab=byme', 'tab=forme')}
          style={{
            padding: '6px 10px', borderRadius: 8, textDecoration: 'none', border: '1px solid #e5e7eb',
            background: activeTab === 'forme' ? '#f3f4f6' : '#fff'
          }}
        >
          Для меня
        </a>
        <a
          href={buildHref({ before: undefined, after: undefined }).replace('tab=forme', 'tab=byme')}
          style={{
            padding: '6px 10px', borderRadius: 8, textDecoration: 'none', border: '1px solid #e5e7eb',
            background: activeTab === 'byme' ? '#f3f4f6' : '#fff'
          }}
        >
          Мной загружено
        </a>
      </nav>

      {/* Фильтры (SSR, метод GET) */}
      <form method="get" style={{ display: 'grid', gridTemplateColumns: '1fr 180px 140px', gap: 8, marginBottom: 16 }}>
        <input name="tab" type="hidden" value={activeTab} />
        <input
          name="q"
          defaultValue={q}
          placeholder="Поиск по имени файла или задаче"
          style={{ padding: '6px 10px', border: '1px solid #e5e7eb', borderRadius: 8 }}
        />
        <select
          name="type"
          defaultValue={type}
          style={{ padding: '6px 10px', border: '1px solid #e5e7eb', borderRadius: 8 }}
        >
          <option value="">Все типы</option>
          <option value="image">Изображения</option>
          <option value="pdf">PDF</option>
          <option value="doc">Документы</option>
          <option value="xls">Таблицы</option>
          <option value="ppt">Презентации</option>
          <option value="other">Прочее</option>
        </select>
        <select
          name="sort"
          defaultValue={sort}
          style={{ padding: '6px 10px', border: '1px solid #e5e7eb', borderRadius: 8 }}
        >
          <option value="new">Сначала новые</option>
          <option value="old">Сначала старые</option>
        </select>
      </form>

      {activeTab === 'forme' ? (
        <section>
          {page.length === 0 ? (
            <div style={{ color: '#6b7280' }}>Нет файлов для вас.</div>
          ) : (
            <ul style={{ margin: 0, paddingLeft: 18 }}>
              {page.map((row) => {
                const a = row.attachment;
                const t = (row as any).task as {
                  id: string; number: number; title: string; createdById: string | null; createdByName: string | null;
                };
                const href = `/api/files/${a.name}`;
                const title = a.originalName || a.name;
                const who = t.createdByName || t.createdById || 'неизвестно';
                const toWhom = 'исполнителям задачи';
                return (
                  <li key={`${t.id}:${a.id}`} style={{ marginBottom: 8 }}>
                    <div style={{ display: 'flex', flexDirection: 'column' }}>
                      <div>
                        <a
                          href={href}
                          target="_blank"
                          rel="noreferrer"
                          title={title}
                          style={{ textDecoration: 'none', display: 'inline-block', maxWidth: '640px', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}
                        >
                          {title}
                        </a>
                        <span style={{ color: '#6b7280', marginLeft: 6, fontSize: 12 }}>
                          ({a.mime || 'application/octet-stream'}, ~{fmtSize(a.size)})
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
          {page.length === 0 ? (
            <div style={{ color: '#6b7280' }}>Нет загруженных вами файлов.</div>
          ) : (
            <ul style={{ margin: 0, paddingLeft: 18 }}>
              {page.map((row) => {
                const a = row.attachment;
                const sub = (row as any).submission as any;
                const assn = sub.assignee as { user?: { id: string; name: string | null } | null; userId: string; task: { id: string; number: number; title: string; createdById: string | null; createdByName: string | null } };
                const task = assn.task;
                const href = `/api/files/${a.name}`;
                const title = a.originalName || a.name;
                const who = assn.user?.name || assn.userId;
                const toWhom = task.createdByName || task.createdById || 'проверяющему';
                return (
                  <li key={`${sub.id}:${a.id}`} style={{ marginBottom: 8 }}>
                    <div style={{ display: 'flex', flexDirection: 'column' }}>
                      <div>
                        <a
                          href={href}
                          target="_blank"
                          rel="noreferrer"
                          title={title}
                          style={{ textDecoration: 'none', display: 'inline-block', maxWidth: '640px', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}
                        >
                          {title}
                        </a>
                        <span style={{ color: '#6b7280', marginLeft: 6, fontSize: 12 }}>
                          ({a.mime || 'application/octet-stream'}, ~{fmtSize(a.size)})
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

      {/* Пагинация */}
      <div style={{ marginTop: 12, display: 'flex', gap: 8 }}>
        {before && newest && (
          <a
            href={buildHref({ before: newest.toISOString(), after: undefined })}
            style={{ padding: '6px 10px', border: '1px solid #e5e7eb', borderRadius: 8, textDecoration: 'none', background: '#fff' }}
          >
            Назад
          </a>
        )}
        {hasMore && oldest && (
          <a
            href={buildHref({ after: oldest.toISOString(), before: undefined })}
            style={{ padding: '6px 10px', border: '1px solid #e5e7eb', borderRadius: 8, textDecoration: 'none', background: '#fff' }}
          >
            Далее
          </a>
        )}
      </div>
    </main>
  );
}
