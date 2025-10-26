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
  const priorityFilter: Prisma.TaskWhereInput | undefined = pr ? ({ priority: pr } as Prisma.TaskWhereInput) : undefined;

  const hasFiles = (Array.isArray(sp.hasFiles) ? sp.hasFiles[0] : sp.hasFiles) === '1';
  const filesFilter: Prisma.TaskWhereInput | undefined = hasFiles ? { attachments: { some: {} } } : undefined;

  const periodRaw = Array.isArray(sp.period) ? sp.period[0] : sp.period;
  const now = new Date();
  const since =
    periodRaw === '30d'
      ? new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000)
      : periodRaw === 'quarter'
      ? new Date(now.getTime() - 90 * 24 * 60 * 60 * 1000)
      : periodRaw === 'year'
      ? new Date(now.getTime() - 365 * 24 * 60 * 60 * 1000)
      : undefined;
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
    orderBy: [{ updatedAt: 'desc' as const }, { createdAt: 'asc' as const }], // стабильнее для архива при равных updatedAt
    take,
  });

  return (
    <main className="archive">
      <header className="head glass">
        <div>
          <h1 className="pageTitle">Архив задач</h1>
          <div className="pageSubtitle">Доступ только для чтения: описание, вложения, история сдач.</div>
        </div>

        <nav className="tabs" role="tablist" aria-label="Фильтр архива">
          <a
            href={`/inboxtasks/archive?tab=mine`}
            className={`tab ${effectiveTab === 'mine' ? 'tabActive' : ''}`}
            role="tab"
            aria-selected={effectiveTab === 'mine'}
          >
            Назначенные мне
          </a>

          {maySeeByMe ? (
            <a
              href={`/inboxtasks/archive?tab=byme`}
              className={`tab ${effectiveTab === 'byme' ? 'tabActive' : ''}`}
              role="tab"
              aria-selected={effectiveTab === 'byme'}
            >
              Назначенные мной
            </a>
          ) : (
            <span className="tab tabDisabled" aria-disabled="true" role="tab">
              Назначенные мной
            </span>
          )}
        </nav>
      </header>

      <form method="get" className="filters glass">
        <input type="hidden" name="tab" value={effectiveTab} />
        <input name="q" defaultValue={q} placeholder="Поиск по названию и описанию" className="input inputSearch" />
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
        <button className="btnPrimary">Показать</button>
      </form>

      {tasks.length === 0 ? (
        <div className="empty">Ничего не найдено.</div>
      ) : (
        <section className="list">
          {tasks.map((t) => {
            const total = t.assignees.length;
            const done = t.assignees.filter((a) => a.status === 'done').length;
            const lastActivity = t.assignees
              .map((a) => a.submissions[0]?.createdAt)
              .filter(Boolean)
              .sort((a, b) => +new Date(b as Date) - +new Date(a as Date))[0];

            return (
              <article key={t.id} className="card glass">
                <header className="cardHead">
                  <div className="titleBox">
                    <a href={`/inboxtasks/archive/${t.id}`} className="titleLink">
                      {t.title}
                    </a>
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
                  <a href={`/inboxtasks/archive/${t.id}`} className="btnBrand">
                    Открыть задачу
                  </a>
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
                        {a.user?.name ?? '—'}
                        {a.status === 'done' ? ' ✓' : ''}
                      </span>
                    ))}
                    {t.assignees.length > 6 && <span className="chip">и ещё {t.assignees.length - 6}</span>}
                  </div>
                )}
              </article>
            );
          })}
        </section>
      )}

      <style>{`
        /* Liquid Glass · iOS-26 tokens */
        .archive {
          --brand: #8d2828;
          --brand-ink: #ffffff;
          --brand-10: color-mix(in oklab, var(--brand) 10%, #ffffff);
          --brand-stroke: color-mix(in oklab, var(--brand) 52%, #ffffff);
          --ring: color-mix(in oklab, var(--brand) 26%, transparent);

          --text: #0f172a;
          --muted: #6b7280;
          --muted-2: #374151;

          --lg-blur: 18px;
          --glass-tint: color-mix(in oklab, #ffffff 76%, var(--brand-10));
          --glass-tint-soft: color-mix(in oklab, #ffffff 84%, var(--brand-10));
          --glass-bg: color-mix(in oklab, var(--glass-tint) 100%, transparent);
          --glass-soft: color-mix(in oklab, var(--glass-tint-soft) 100%, transparent);
          --glass-stroke: color-mix(in oklab, var(--brand-stroke) 56%, #ffffff 44%);

          --shadow-lg: 0 18px 48px rgba(15,23,42,.16);
          --shadow-md: 0 12px 30px rgba(15,23,42,.12);
          --shadow-sm: 0 8px 18px rgba(15,23,42,.10);
          --inset: inset 0 1px 0 rgba(255,255,255,.66), inset 0 -1px 0 rgba(0,0,0,.04);

          min-height: 100%;
          padding: 16px;

          background:
            radial-gradient(1200px 600px at 80% -10%, color-mix(in oklab, var(--brand) 22%, transparent), transparent 60%),
            radial-gradient(800px 480px at 10% 110%, color-mix(in oklab, var(--brand) 18%, transparent), transparent 60%),
            linear-gradient(180deg, #fafafa, #f3f4f6);
          color: var(--text);
        }

        .glass {
          background:
            linear-gradient(180deg,
              color-mix(in oklab, var(--glass-soft) 94%, transparent),
              color-mix(in oklab, var(--glass-soft) 86%, transparent));
          -webkit-backdrop-filter: blur(calc(var(--lg-blur)*.66)) saturate(1.25);
          backdrop-filter: blur(calc(var(--lg-blur)*.66)) saturate(1.25);
          border: 1px solid var(--glass-stroke);
          border-radius: 16px;
          box-shadow: var(--shadow-md), var(--inset);
        }

        /* Head */
        .head {
          margin: 0 0 12px;
          padding: 12px;
          display: flex;
          justify-content: space-between;
          align-items: end;
          gap: 8px;
          flex-wrap: wrap;
        }
        .pageTitle { margin: 0; font-size: 22px; font-weight: 900; letter-spacing: .2px; color: var(--text); }
        .pageSubtitle { font-size: 13px; color: var(--muted); }

        /* Tabs */
        .tabs { display: flex; gap: 8px; }
        .tab {
          display: inline-flex; align-items: center; gap: 8px;
          height: 34px; padding: 0 12px; border-radius: 999px;
          background:
            linear-gradient(180deg,
              color-mix(in oklab, #ffffff 94%, transparent),
              color-mix(in oklab, #ffffff 86%, transparent));
          -webkit-backdrop-filter: blur(10px) saturate(1.2);
          backdrop-filter: blur(10px) saturate(1.2);
          border: 1px solid var(--glass-stroke);
          color: var(--text); font-size: 13px; text-decoration: none;
          transition: transform .06s ease, box-shadow .16s ease, border-color .14s ease, background .16s ease;
          box-shadow: var(--shadow-sm), inset 0 1px 0 rgba(255,255,255,.60);
        }
        .tab:hover {
          transform: translateY(-1px);
          border-color: var(--brand-stroke);
          box-shadow: 0 12px 20px rgba(15,23,42,.12), inset 0 1px 0 rgba(255,255,255,.66);
          background:
            linear-gradient(180deg,
              color-mix(in oklab, var(--brand) 4%, #ffffff),
              color-mix(in oklab, var(--brand) 2%, #ffffff));
        }
        .tabActive {
          border-color: var(--brand-stroke);
          outline: 3px solid color-mix(in oklab, var(--brand) 20%, transparent);
          outline-offset: -3px;
          color: var(--text);
        }
        .tabDisabled { opacity: .55; pointer-events: none; }

        /* Filters */
        .filters {
          display: flex; flex-wrap: wrap; align-items: center;
          gap: 8px; margin-bottom: 12px; padding: 10px;
          border-radius: 16px;
        }
        .filters .input,
        .filters .btnPrimary {
          width: auto !important;
          display: inline-block;
          flex: 0 0 auto;
        }
        .input {
          height: 34px; padding: 0 10px; border-radius: 12px;
          border: 1px solid var(--glass-stroke);
          background:
            linear-gradient(180deg,
              color-mix(in oklab, #ffffff 92%, transparent),
              color-mix(in oklab, #ffffff 84%, transparent));
          color: var(--text); font-size: 13px; outline: none;
          -webkit-backdrop-filter: blur(10px) saturate(1.15);
          backdrop-filter: blur(10px) saturate(1.15);
          box-shadow: inset 0 1px 0 rgba(255,255,255,.60), var(--shadow-sm);
          transition: box-shadow .16s ease, border-color .14s ease, background .16s ease;
        }
        .input:focus {
          border-color: var(--brand-stroke);
          box-shadow: 0 0 0 4px var(--ring), inset 0 1px 0 rgba(255,255,255,.66);
          background:
            linear-gradient(180deg,
              color-mix(in oklab, #ffffff 96%, transparent),
              color-mix(in oklab, #ffffff 88%, transparent));
        }
        .inputSearch { width: clamp(240px, 36vw, 420px) !important; }
        .chk { display:flex; gap:6px; align-items:center; font-size:13px; color:var(--text); }

        .btnPrimary {
          height: 34px; padding: 0 14px; border-radius: 12px;
          border: 1px solid var(--brand-stroke);
          background:
            linear-gradient(180deg,
              color-mix(in oklab, #ffffff 10%, var(--brand)) 0%,
              color-mix(in oklab, #000000 12%, var(--brand)) 100%);
          color: #fff; cursor: pointer; font-size: 13px; font-weight: 800;
          -webkit-backdrop-filter: blur(12px) saturate(1.25);
          backdrop-filter: blur(12px) saturate(1.25);
          box-shadow: 0 12px 22px rgba(141,40,40,.26), inset 0 1px 0 rgba(255,255,255,.60);
          transition: transform .06s ease, box-shadow .16s ease, filter .14s ease, border-color .14s ease, background .16s ease;
        }
        .btnPrimary:hover { transform: translateY(-1px); box-shadow: 0 14px 26px rgba(141,40,40,.30), inset 0 1px 0 rgba(255,255,255,.66); }
        .btnPrimary:active { transform: translateY(0); }

        /* List */
        .list { display: grid; gap: 10px; }

        /* Cards */
        .card {
          border-radius: 16px;
          padding: 12px;
          transition: transform .06s ease, box-shadow .16s ease, border-color .14s ease, background .16s ease;
        }
        .card:hover {
          transform: translateY(-1px);
          border-color: var(--brand-stroke);
          box-shadow: 0 16px 30px rgba(17,24,39,.14), var(--inset);
          background:
            linear-gradient(180deg,
              color-mix(in oklab, var(--brand) 4%, #ffffff),
              color-mix(in oklab, var(--brand) 2%, #ffffff));
        }
        .cardHead { display:flex; justify-content:space-between; align-items:flex-start; gap: 10px; }
        .titleBox { min-width: 0; }
        .titleLink { font-size: 18px; font-weight: 800; color: var(--text); text-decoration:none; word-break: break-word; }
        .titleLink:hover { text-decoration: underline; text-underline-offset: 3px; }
        .meta { font-size: 12px; color: var(--muted-2); margin-top: 2px; }
        .brand { color: var(--brand); font-weight: 700; }

        .btnBrand {
          height: 32px; padding: 0 12px; border-radius: 12px;
          border: 1px solid var(--brand-stroke);
          background:
            linear-gradient(180deg,
              color-mix(in oklab, #ffffff 10%, var(--brand)) 0%,
              color-mix(in oklab, #000000 12%, var(--brand)) 100%);
          color: #fff; cursor: pointer; font-size: 13px; font-weight: 800; text-decoration:none; display:inline-flex; align-items:center; justify-content:center;
          -webkit-backdrop-filter: blur(12px) saturate(1.25);
          backdrop-filter: blur(12px) saturate(1.25);
          box-shadow: 0 12px 22px rgba(141,40,40,.26), inset 0 1px 0 rgba(255,255,255,.60);
          transition: transform .06s ease, box-shadow .16s ease, filter .14s ease;
        }
        .btnBrand:hover { transform: translateY(-1px); box-shadow: 0 14px 26px rgba(141,40,40,.30), inset 0 1px 0 rgba(255,255,255,.66); }
        .btnBrand:active { transform: translateY(0); }
        /* фикс цвета и жирности для прод-сборки */
        .archive a.btnBrand,
        .archive a.btnBrand:visited,
        .archive a.btnBrand:hover,
        .archive a.btnBrand:active,
        .archive a.btnBrand:focus { color: #fff !important; font-weight: 800; text-decoration: none; }

        .desc {
          border: 1px solid var(--glass-stroke); border-radius: 12px; padding: 8px;
          background:
            linear-gradient(180deg,
              color-mix(in oklab, #ffffff 96%, transparent),
              color-mix(in oklab, #ffffff 90%, transparent));
          -webkit-backdrop-filter: blur(10px) saturate(1.15);
          backdrop-filter: blur(10px) saturate(1.15);
          white-space: pre-wrap; overflow-wrap: anywhere; word-break: break-word;
          box-shadow: inset 0 1px 0 rgba(255,255,255,.60);
        }

        .chips { display:flex; gap: 8px; flex-wrap: wrap; }
        .chip {
          border:1px solid var(--glass-stroke); border-radius:999px; padding: 2px 8px; font-size:12px;
          background:
            linear-gradient(180deg,
              color-mix(in oklab, #ffffff 96%, transparent),
              color-mix(in oklab, #ffffff 90%, transparent));
          -webkit-backdrop-filter: blur(8px) saturate(1.1);
          backdrop-filter: blur(8px) saturate(1.1);
        }
        .chipDone {
          background:
            linear-gradient(180deg,
              color-mix(in oklab, #ecfdf5 92%, #ffffff 8%),
              color-mix(in oklab, #d1fae5 92%, #ffffff 8%));
          border-color: color-mix(in oklab, #10b981 42%, var(--glass-stroke));
        }

        .empty { font-size: 14px; color: var(--muted); }

        @media (max-width: 720px) {
          .head { align-items: stretch; }
          .cardHead { flex-direction: column; align-items: stretch; }
          .btnBrand { align-self: flex-start; }
        }

        /* focus-visible for accessibility */
        .tab:focus-visible,
        .input:focus-visible,
        .btnPrimary:focus-visible,
        .btnBrand:focus-visible,
        .card:focus-visible {
          outline: none;
          box-shadow: 0 0 0 4px var(--ring), inset 0 1px 0 rgba(255,255,255,.66);
          border-color: var(--brand-stroke);
        }
      `}</style>
    </main>
  );
}
