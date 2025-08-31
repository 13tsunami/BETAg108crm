import { auth } from '@/auth.config';
import { prisma } from '@/lib/prisma';
import { normalizeRole, canCreateTasks } from '@/lib/roles';
import { redirect, notFound } from 'next/navigation';
import type { Prisma } from '@prisma/client';
import {
  approveSubmissionAction,
  rejectSubmissionAction,
} from '../../inboxtasks/review-actions';

type SearchParams = Promise<Record<string, string | string[] | undefined>>;
type Params = Promise<{ taskId: string }>;

type TaskWithAssignees = Prisma.TaskGetPayload<{
  include: { assignees: { include: { user: { select: { id: true; name: true } } } } }
}>;

function fmtRuDate(d: Date | string | null | undefined): string {
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

// До миграций: считаем, что задача "требует проверки", если в title/description встречается [review] / [проверка]
const hasReviewMarker = (t: Pick<TaskWithAssignees, 'title' | 'description'>) => {
  const rx = /\[(review|проверка)\]/i;
  return rx.test(t.title ?? '') || rx.test(t.description ?? '');
};

// До миграций: считаем, что "сдал на проверку" == status === 'in_progress'
const isSubmitted = (status: string | null | undefined) => status === 'in_progress';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

export default async function Page({
  params,
  searchParams,
}: {
  params: Params;
  searchParams: SearchParams;
}) {
  const { taskId } = await params;
  const sp = await searchParams;
  const sel = typeof sp.sel === 'string' ? sp.sel : Array.isArray(sp.sel) ? sp.sel[0] : undefined;

  const session = await auth();
  const meId = session?.user?.id ?? null;
  const role = normalizeRole(session?.user?.role);
  const mayReview = canCreateTasks(role);

  if (!meId || !mayReview) {
    redirect('/inboxtasks');
  }

  const task = await prisma.task.findFirst({
    where: { id: taskId, createdById: meId },
    include: {
      assignees: { include: { user: { select: { id: true, name: true } } } },
    },
  });

  if (!task) notFound();

  const requiresReview = hasReviewMarker(task);
  // группировки по состоянию
  const assignees = task.assignees;
  const onReview   = assignees.filter(a => isSubmitted(a.status));     // "на проверке" (псевдо submitted)
  const accepted   = assignees.filter(a => a.status === 'done');       // принято
  const inProgress = assignees.filter(a => !isSubmitted(a.status) && a.status !== 'done'); // ещё "в работе"

  const everyoneSubmitted = assignees.length > 0 && assignees.every(a => isSubmitted(a.status));

  // выбранный исполнитель (через query ?sel=USER_ID)
  const current = (sel ? assignees.find(a => a.userId === sel) : undefined) ?? onReview[0] ?? inProgress[0] ?? accepted[0];

  return (
    <main style={{ padding: 16 }}>
      <header style={{ marginBottom: 10, display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
        <a href="/reviews" className="btnGhost" aria-label="Назад к списку">← Назад</a>
        <h1 style={{ margin: 0, fontSize: 20, lineHeight: 1.2 }}>
          Проверка задачи: <span style={{ fontWeight: 800 }}>{task.title}</span>
        </h1>
        <div style={{ marginLeft: 'auto', display: 'flex', gap: 8, alignItems: 'center' }}>
          <span style={{ fontSize: 12, color: '#374151' }}>
            Срок: {fmtRuDate(task.dueDate as Date)}
          </span>
          {requiresReview ? <span className="pill">требует проверки</span> : null}
          {/* Макет: массовое принятие — активна, когда все "сдали" (эвристика), пока без экшена */}
          <button
            type="button"
            className="btnPrimary"
            disabled={!everyoneSubmitted}
            title={everyoneSubmitted ? 'Принять всех (макет, действие подключим после миграций)' : 'Кнопка станет активной, когда все отправят на проверку'}
            onClick={() => alert('Макет: массовое принятие подключим после миграций')}
          >
            Принять всех
          </button>
        </div>
      </header>

      <section className="layout">
        {/* Левая колонка — список исполнителей с фильтрами */}
        <aside className="left">
          <div className="group">
            <div className="groupTitle">На проверке ({onReview.length})</div>
            {onReview.length === 0 ? (
              <div className="empty">Пока никого.</div>
            ) : (
              <ul className="list">
                {onReview.map(a => (
                  <li key={a.id}>
                    <a
                      href={`?sel=${encodeURIComponent(a.userId)}`}
                      className={`row ${current?.userId === a.userId ? 'row--active' : ''}`}
                    >
                      <span className="name">{a.user?.name ?? a.userId}</span>
                      <span className="statusDot statusDot--review" title="На проверке" />
                    </a>
                  </li>
                ))}
              </ul>
            )}
          </div>

          <div className="group">
            <div className="groupTitle">В работе ({inProgress.length})</div>
            {inProgress.length === 0 ? (
              <div className="empty">Пока никого.</div>
            ) : (
              <ul className="list">
                {inProgress.map(a => (
                  <li key={a.id}>
                    <a
                      href={`?sel=${encodeURIComponent(a.userId)}`}
                      className={`row ${current?.userId === a.userId ? 'row--active' : ''}`}
                    >
                      <span className="name">{a.user?.name ?? a.userId}</span>
                      <span className="statusDot statusDot--work" title="В работе" />
                    </a>
                  </li>
                ))}
              </ul>
            )}
          </div>

          <div className="group">
            <div className="groupTitle">Принято ({accepted.length})</div>
            {accepted.length === 0 ? (
              <div className="empty">Пока никого.</div>
            ) : (
              <ul className="list">
                {accepted.map(a => (
                  <li key={a.id}>
                    <a
                      href={`?sel=${encodeURIComponent(a.userId)}`}
                      className={`row ${current?.userId === a.userId ? 'row--active' : ''}`}
                    >
                      <span className="name">{a.user?.name ?? a.userId}</span>
                      <span className="statusDot statusDot--ok" title="Принято" />
                    </a>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </aside>

        {/* Правая колонка — просмотрщик и действия по выбранному исполнителю */}
        <section className="right">
          {!current ? (
            <div className="card" style={{ fontSize: 14, color: '#6b7280' }}>
              Выберите исполнителя слева, чтобы открыть предпросмотр и выполнить проверку.
            </div>
          ) : (
            <div className="card" style={{ display: 'grid', gap: 10 }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10, minWidth: 0 }}>
                  <span className="avatar" aria-hidden />
                  <div style={{ minWidth: 0 }}>
                    <div style={{ fontWeight: 700, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {current.user?.name ?? current.userId}
                    </div>
                    <div style={{ fontSize: 12, color: '#6b7280' }}>Статус: {isSubmitted(current.status) ? 'на проверке' : current.status === 'done' ? 'принято' : 'в работе'}</div>
                  </div>
                </div>

                {/* Действия по одному исполнителю */}
                <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                  <form action={approveSubmissionAction}>
                    <input type="hidden" name="taskId" value={task.id} />
                    <input type="hidden" name="userId" value={current.userId} />
                    <button type="submit" className="btnPrimary" title="Принять (макет)">
                      Принять
                    </button>
                  </form>

                  <form action={rejectSubmissionAction} style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                    <input type="hidden" name="taskId" value={task.id} />
                    <input type="hidden" name="userId" value={current.userId} />
                    <input
                      name="comment"
                      placeholder="Комментарий (опц.)"
                      style={{ height: 30, padding: '0 8px', borderRadius: 8, border: '1px solid #e5e7eb', fontSize: 13 }}
                    />
                    <button type="submit" className="btnGhost" title="Вернуть (макет)">
                      Вернуть
                    </button>
                  </form>
                </div>
              </div>

              {/* Предпросмотр — заглушка до миграций/файлов */}
              <div className="preview">
                <div className="previewHeader">Файлы (макет)</div>
                <div className="previewBody">
                  <div className="fileMock">
                    <span className="fileIcon" aria-hidden />
                    <div className="fileMeta">
                      <div className="fileName">шаблон/работа_{(current.user?.name ?? current.userId).replace(/\s+/g, '_')}.pdf</div>
                      <div className="fileHint">Предпросмотр появится после миграций (конверсия в PDF/PNG).</div>
                    </div>
                  </div>
                  <div className="fileMock">
                    <span className="fileIcon" aria-hidden />
                    <div className="fileMeta">
                      <div className="fileName">дополнение_{(current.user?.name ?? current.userId).replace(/\s+/g, '_')}.docx</div>
                      <div className="fileHint">Пока заглушка. Оригинал и превью будут доступны тут.</div>
                    </div>
                  </div>
                </div>
              </div>

              {/* История/комменты — заглушка */}
              <div className="notes">
                <div className="notesTitle">Комментарии и история (макет)</div>
                <div className="notesBody">
                  <div className="note">15.09, 14:30 — «Отправлено на проверку»</div>
                  <div className="note">17.09, 09:12 — «Замечание: заполните раздел 2.3»</div>
                </div>
              </div>
            </div>
          )}
        </section>
      </section>

      <style>{`
        .layout {
          display: grid;
          grid-template-columns: minmax(260px, 320px) 1fr;
          gap: 12px;
        }
        @media (max-width: 980px) {
          .layout { grid-template-columns: 1fr; }
        }

        .left { display: grid; gap: 10px; }
        .right { min-width: 0; }

        .group { border:1px solid #e5e7eb; border-radius:12px; background:#fff; padding:8px; }
        .groupTitle { font-size:12px; color:#6b7280; margin:4px 2px 8px; font-weight:700; }
        .empty { font-size:13px; color:#9ca3af; padding:6px 2px; }
        .list { list-style:none; margin:0; padding:0; display:grid; gap:4px; }
        .row {
          display:flex; align-items:center; justify-content:space-between; gap:8px;
          padding:8px 10px; border:1px solid #e5e7eb; border-radius:10px; text-decoration:none; background:#fff; color:#111827;
        }
        .row:hover { background:#fafafa; }
        .row--active { outline:2px solid rgba(141,40,40,.35); }
        .name { overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }

        .statusDot { width:8px; height:8px; border-radius:999px; display:inline-block; }
        .statusDot--review { background:#ef9b28; }
        .statusDot--work { background:#9ca3af; }
        .statusDot--ok { background:#10b981; }

        .card { border:1px solid #e5e7eb; border-radius:12px; background:#fff; padding:10px; }

        .btnPrimary {
          height:32px; padding:0 12px; border-radius:10px; border:1px solid #111827; background:#111827; color:#fff; cursor:pointer; font-size:13px;
        }
        .btnPrimary:disabled { opacity:.45; cursor:not-allowed; }
        .btnGhost {
          height:32px; padding:0 12px; border-radius:10px; border:1px solid #e5e7eb; background:#fff; color:#111827;
          text-decoration:none; display:inline-flex; align-items:center; font-size:13px;
        }
        .pill { font-size:11px; color:#8d2828; border:1px solid #8d2828; border-radius:999px; padding:0 6px; }

        .avatar { width:28px; height:28px; border-radius:50%; background:#f3f4f6; border:1px solid #e5e7eb; }

        .preview { border:1px dashed #e5e7eb; border-radius:10px; }
        .previewHeader { font-size:12px; color:#6b7280; padding:8px 10px; border-bottom:1px dashed #e5e7eb; }
        .previewBody { padding:8px; display:grid; gap:8px; }
        .fileMock { display:flex; align-items:center; gap:10px; padding:8px; border:1px solid #f3f4f6; border-radius:8px; background:#fff; }
        .fileIcon { width:28px; height:36px; border-radius:6px; background:linear-gradient(180deg,#f3f4f6,#e5e7eb); border:1px solid #e5e7eb; }
        .fileMeta { min-width:0; }
        .fileName { font-size:13px; font-weight:700; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }
        .fileHint { font-size:12px; color:#6b7280; }

        .notes { border:1px dashed #e5e7eb; border-radius:10px; }
        .notesTitle { font-size:12px; color:#6b7280; padding:8px 10px; border-bottom:1px dashed #e5e7eb; }
        .notesBody { padding:8px; display:grid; gap:6px; }
        .note { font-size:12px; color:#374151; }
      `}</style>
    </main>
  );
}
