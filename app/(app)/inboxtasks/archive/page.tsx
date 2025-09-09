// app/(app)/inboxtasks/archive/page.tsx
import { auth } from '@/auth.config';
import { prisma } from '@/lib/prisma';
import { normalizeRole, canCreateTasks } from '@/lib/roles';
import { redirect } from 'next/navigation';
import type { Prisma } from '@prisma/client';

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

type TaskForArchive = Prisma.TaskGetPayload<{
  include: {
    _count: { select: { attachments: true } };
    assignees: {
      select: {
        status: true;
        completedAt: true;
        user: { select: { id: true; name: true } };
        submissions: {
          orderBy: { createdAt: 'desc' };
          take: 1;
          select: { createdAt: true };
        };
      };
    };
  };
}>;

function fmtRuDate(d?: Date | string | null): string {
  if (!d) return '';
  const dt = typeof d === 'string' ? new Date(d) : d;
  const f = new Intl.DateTimeFormat('ru-RU', {
    timeZone: 'Asia/Yekaterinburg',
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  }).format(dt);
  return f.replace('.', '');
}
function fmtTime(d?: Date | string | null): string {
  if (!d) return '';
  const dt = typeof d === 'string' ? new Date(d) : d;
  return new Intl.DateTimeFormat('ru-RU', {
    timeZone: 'Asia/Yekaterinburg',
    hour: '2-digit',
    minute: '2-digit',
  }).format(dt);
}

export const dynamic = 'force-dynamic';
export const revalidate = 0;

export default async function Page({ searchParams }: { searchParams: SearchParams }) {
  const sp = await searchParams;

  const session = await auth();
  const meId = session?.user?.id ?? null;
  const role = normalizeRole(session?.user?.role);
  if (!meId) redirect('/');

  const tab = (Array.isArray(sp.tab) ? sp.tab[0] : sp.tab) === 'byme' ? 'byme' : 'mine';
  const maySeeByMe = canCreateTasks(role);
  const effectiveTab = tab === 'byme' && maySeeByMe ? 'byme' : 'mine';

  const whereMine: Prisma.TaskWhereInput = {
    assignees: { some: { userId: meId, status: 'done' } },
    hidden: { not: true },
  };
  const whereByMe: Prisma.TaskWhereInput = {
    createdById: meId,
    assignees: { every: { status: 'done' } },
    hidden: { not: true },
  };

  const qRaw = Array.isArray(sp.q) ? sp.q[0] : sp.q;
  const q = (qRaw ?? '').trim();
  const searchFilter: Prisma.TaskWhereInput | undefined = q
    ? { OR: [{ title: { contains: q, mode: 'insensitive' } }, { description: { contains: q, mode: 'insensitive' } }] }
    : undefined;

  const prRaw = Array.isArray(sp.priority) ? sp.priority[0] : sp.priority;
  const pr = prRaw === 'high' ? 'high' : prRaw === 'normal' ? 'normal' : undefined;
  const priorityFilter: Prisma.TaskWhereInput | undefined = pr ? { priority: pr } as Prisma.TaskWhereInput : undefined;

  const hasFiles = (Array.isArray(sp.hasFiles) ? sp.hasFiles[0] : sp.hasFiles) === '1';
  const filesFilter: Prisma.TaskWhereInput | undefined = hasFiles ? { attachments: { some: {} } } : undefined;

  const periodRaw = Array.isArray(sp.period) ? sp.period[0] : sp.period;
  const now = new Date();
  const since =
    periodRaw === '30d' ? new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000) :
    periodRaw === 'quarter' ? new Date(now.getTime() - 90 * 24 * 60 * 60 * 1000) :
    periodRaw === 'year' ? new Date(now.getTime() - 365 * 24 * 60 * 60 * 1000) :
    undefined;
  const periodFilter: Prisma.TaskWhereInput | undefined = since ? { updatedAt: { gte: since } } : undefined;

  const where: Prisma.TaskWhereInput =
    effectiveTab === 'mine'
      ? { AND: [whereMine, searchFilter ?? {}, priorityFilter ?? {}, filesFilter ?? {}, periodFilter ?? {}] }
      : { AND: [whereByMe, searchFilter ?? {}, priorityFilter ?? {}, filesFilter ?? {}, periodFilter ?? {}] };

  const takeStr = Array.isArray(sp.take) ? sp.take[0] : sp.take;
  const take = Math.min(50, Math.max(5, Number(takeStr) || 20));

  const tasks: TaskForArchive[] = await prisma.task.findMany({
    where,
    include: {
      _count: { select: { attachments: true } },
      assignees: {
        select: {
          status: true,
          completedAt: true,
          user: { select: { id: true, name: true } },
          submissions: { orderBy: { createdAt: 'desc' }, take: 1, select: { createdAt: true } },
        },
      },
    },
    orderBy: [{ updatedAt: 'desc' as const }, { createdAt: 'desc' as const }],
    take,
  });

  return (
    <main className="archive" style={{ padding: 16 }}>
      <header style={{ marginBottom: 12, display: 'flex', justifyContent: 'space-between', alignItems: 'end', gap: 8, flexWrap: 'wrap' }}>
        <div>
          <h1 style={{ margin: 0, fontSize: 22 }}>Архив задач</h1>
          <div style={{ fontSize: 13, color: '#6b7280' }}>Доступ только для чтения: описание, вложения, история сдач.</div>
        </div>

        <nav className="tabs">
          <a
            href={`/inboxtasks/archive?tab=mine`}
            className={`tab ${effectiveTab === 'mine' ? 'tab--active' : ''}`}
          >
            Назначенные мне
          </a>

          {maySeeByMe ? (
            <a
              href={`/inboxtasks/archive?tab=byme`}
              className={`tab ${effectiveTab === 'byme' ? 'tab--active' : ''}`}
            >
              Назначенные мной
            </a>
          ) : (
            <span className="tab tab--disabled" aria-disabled="true">
              Назначенные мной
            </span>
          )}
        </nav>
      </header>

      {/* ФИЛЬТРЫ / ПОИСК */}
      <form method="get" className="filters">
        <input type="hidden" name="tab" value={effectiveTab} />
        <input
          name="q"
          defaultValue={q}
          placeholder="Поиск по названию и описанию"
          className="input inputSearch"
        />
        <select name="priority" defaultValue={pr ?? ''} className="input">
          <option value="">Приоритет: любой</option>
          <option value="high">Только высокий</option>
          <option value="normal">Только обычный</option>
        </select>
        <select name="period" defaultValue={periodRaw ?? ''} className="input">
          <option value="">За всё время</option>
          <option value="30d">За 30 дней</option>
          <option value="quarter">За квартал</option>
          <option value="year">За год</option>
        </select>
        <label className="chk">
          <input type="checkbox" name="hasFiles" value="1" defaultChecked={hasFiles} /> с вложениями
        </label>
        <select name="take" defaultValue={String(take)} className="input">
          <option value="10">10</option>
          <option value="20">20</option>
          <option value="30">30</option>
          <option value="50">50</option>
        </select>
        <button className="btn">Показать</button>
      </form>

      {tasks.length === 0 ? (
        <div style={{ fontSize: 14, color: '#6b7280' }}>Ничего не найдено.</div>
      ) : (
        <section style={{ display: 'grid', gap: 10 }}>
          {tasks.map((t) => {
            const total = t.assignees.length;
            const done = t.assignees.filter(a => a.status === 'done').length;
            const lastActivity = t.assignees
              .map(a => a.submissions[0]?.createdAt)
              .filter(Boolean)
              .sort((a, b) => +new Date(b as Date) - +new Date(a as Date))[0];

            return (
              <article key={t.id} className="card">
                <header className="cardHead">
                  <div>
                    <a href={`/inboxtasks/archive/${t.id}`} className="titleLink">{t.title}</a>
                    <div className="meta">
                      Дедлайн: {fmtRuDate(t.dueDate)} • Завершено {done} из {total}
                      {t.priority === 'high' ? ' • Срочно' : ''}
                      {t._count.attachments ? ` • 📎 ${t._count.attachments}` : ''}
                    </div>
                    <div className="meta">
                      Назначил: <span className="brand">{t.createdByName ?? t.createdById}</span>
                      {lastActivity ? ` • последняя активность: ${fmtTime(lastActivity as Date)}` : ''}
                    </div>
                  </div>
                  <a href={`/inboxtasks/archive/${t.id}`} className="btnBrand">Открыть задачу</a>
                </header>

                {t.description && (
                  <div className="desc">
                    {t.description.length > 240 ? t.description.slice(0, 240) + '…' : t.description}
                  </div>
                )}

                {t.assignees.length > 0 && (
                  <div className="chips">
                    {t.assignees.slice(0, 6).map((a, idx) => (
                      <span key={idx} className={`chip ${a.status === 'done' ? 'chipDone' : ''}`}>
                        {a.user?.name ?? '—'}{a.status === 'done' ? ' ✓' : ''}
                      </span>
                    ))}
                    {t.assignees.length > 6 && (
                      <span className="chip">и ещё {t.assignees.length - 6}</span>
                    )}
                  </div>
                )}
              </article>
            );
          })}
        </section>
      )}

      <style>{`
        .archive { --brand:#8d2828; }
        .brand { color: var(--brand); }

        .tabs { display: flex; gap: 8px; }
        .tab {
          border: 1px solid #e5e7eb; border-radius: 999px; padding: 6px 12px; font-size: 13px; text-decoration: none; color:#111827; background:#fff; display:inline-flex; align-items:center;
        }
        .tab--active { border-color: var(--brand); }
        .tab--disabled { opacity: .5; pointer-events: none; }

        /* --- Форма фильтров: фиксируем width:auto и inline-бокс --- */
        .filters {
          display:flex; flex-wrap:wrap; align-items:center; gap:8px; margin-bottom:10px;
        }
        .filters .input,
        .filters .btn {
          width:auto !important;           /* переопределяет глобальное 100% */
          display:inline-block;            /* чтобы не растягивались */
          flex: 0 0 auto;                  /* не тянуться в flex-контейнере */
        }
        .input {
          height: 32px; padding: 0 10px; border:1px solid #e5e7eb; border-radius: 8px; background:#fff; font-size:13px;
        }
        .inputSearch { width: clamp(240px, 36vw, 420px) !important; }
        .chk { display:flex; gap:6px; align-items:center; font-size:13px; color:#111827; }
        .btn {
          height: 32px; padding: 0 12px; border-radius: 10px; border: 1px solid #e5e7eb; background:#fff; cursor:pointer; font-size:13px;
        }
        .btnBrand {
          height: 32px; padding: 0 12px; border-radius: 10px; border: 1px solid var(--brand); background: var(--brand); color: #fff; cursor: pointer; font-size: 13px; text-decoration:none; display:inline-flex; align-items:center;
        }

        .card {
          border: 2px solid var(--brand); border-radius: 12px; background:#fff; padding: 10px; display: grid; gap: 10px;
        }
        .cardHead { display:flex; justify-content:space-between; align-items:flex-start; gap: 10px; }
        .titleLink { font-size: 18px; font-weight: 600; color:#111827; text-decoration:none; }
        .titleLink:hover { text-decoration: underline; }
        .meta { font-size: 12px; color:#374151; margin-top: 2px; }

        .desc { border:1px solid #e5e7eb; border-radius:12px; padding: 8px; white-space:pre-wrap; overflow-wrap:anywhere; word-break:break-word; }

        .chips { display:flex; gap: 8px; flex-wrap: wrap; }
        .chip { border:1px solid #e5e7eb; border-radius:999px; padding: 2px 8px; font-size:12px; background:#fff; }
        .chipDone { background:#ecfdf5; border-color:#d1fae5; }

        @media (max-width: 720px) {
          .cardHead { flex-direction: column; align-items: stretch; }
          .btnBrand { align-self: flex-start; }
        }
      `}</style>
    </main>
  );
}
