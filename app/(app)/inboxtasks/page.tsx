import { Suspense } from 'react';
import { auth } from '@/auth.config';
import { prisma } from '@/lib/prisma';
import { normalizeRole, canCreateTasks } from '@/lib/roles';
import TaskForm from './TaskForm';
import {
  createTaskAction,
  updateTaskAction,
  deleteTaskAction,
  markAssigneeDoneAction,
} from './actions';
import type { Prisma } from '@prisma/client';

type SearchParams = Promise<Record<string, string | string[] | undefined>>;
type TaskWithAssignees = Prisma.TaskGetPayload<{
  include: { assignees: { include: { user: { select: { id: true; name: true } } } } }
}>;

function fmtRuDateWithOptionalTimeYekb(d: Date | string | null | undefined): string {
  if (!d) return '';
  const dt = typeof d === 'string' ? new Date(d) : d;
  const parts = new Intl.DateTimeFormat('ru-RU', {
    timeZone: 'Asia/Yekaterinburg',
    hour: '2-digit',
    minute: '2-digit',
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  }).formatToParts(dt);
  const map = Object.fromEntries(parts.map(p => [p.type, p.value]));
  const dd = `${map.day} ${map.month?.replace('.', '')}`;
  const yyyy = map.year;
  const hm = new Intl.DateTimeFormat('ru-RU', {
    timeZone: 'Asia/Yekaterinburg',
    hour: '2-digit',
    minute: '2-digit',
  }).formatToParts(dt);
  const hh = hm.find(p => p.type === 'hour')?.value ?? '00';
  const mm = hm.find(p => p.type === 'minute')?.value ?? '00';
  const isDefaultEnd = hh === '23' && mm === '59';
  return isDefaultEnd ? `${dd} ${yyyy}` : `${dd} ${yyyy}, ${hh}:${mm}`;
}

function TeacherGuide() {
  return (
    <div style={{ border: '1px solid #e5e7eb', borderRadius: 12, padding: 12, background: '#fff', fontSize: 14, lineHeight: 1.5 }}>
      <h3 style={{ marginTop: 0, marginBottom: 8 }}>РљР°Рє СЂР°Р±РѕС‚Р°С‚СЊ СЃ Р·Р°РґР°С‡Р°РјРё</h3>
      <ul style={{ margin: 0, paddingLeft: 18 }}>
        <li>Р’Рѕ РІРєР»Р°РґРєРµ В«РќР°Р·РЅР°С‡РµРЅРЅС‹Рµ РјРЅРµВ» РІС‹ РІРёРґРёС‚Рµ Р°РєС‚СѓР°Р»СЊРЅС‹Рµ Р·Р°РґР°С‡Рё, РЅР°Р·РЅР°С‡РµРЅРЅС‹Рµ РІР°Рј СЂСѓРєРѕРІРѕРґРёС‚РµР»СЏРјРё.</li>
        <li>РћС‚РєСЂРѕР№С‚Рµ Р·Р°РґР°С‡Сѓ Рё РЅР°Р¶РјРёС‚Рµ В«Р’С‹РїРѕР»РЅРёС‚СЊВ», РєРѕРіРґР° Р·Р°РєРѕРЅС‡РёС‚Рµ СЂР°Р±РѕС‚Сѓ вЂ” РѕРЅР° СѓР№РґС‘С‚ РІ Р°СЂС…РёРІ.</li>
        <li>РљРЅРѕРїРєР° В«РЈС‚РѕС‡РЅРёС‚СЊ Р·Р°РґР°С‡СѓВ» РѕС‚РєСЂС‹РІР°РµС‚ С‡Р°С‚ СЃ РЅР°Р·РЅР°С‡РёРІС€РёРј Р·Р°РґР°С‡Сѓ РґР»СЏ РІРѕРїСЂРѕСЃРѕРІ Рё СѓС‚РѕС‡РЅРµРЅРёР№.</li>
        <li>Р”РµРґР»Р°Р№РЅ РѕС‚РѕР±СЂР°Р¶Р°РµС‚СЃСЏ СЃ РґР°С‚РѕР№ Рё, РїСЂРё РЅРµРѕР±С…РѕРґРёРјРѕСЃС‚Рё, РІСЂРµРјРµРЅРµРј.</li>
      </ul>
    </div>
  );
}

export default async function Page({
  searchParams,
}: {
  searchParams: SearchParams;
}) {
  const sp = await searchParams;
  const tabParam = typeof sp.tab === 'string' ? sp.tab : Array.isArray(sp.tab) ? sp.tab[0] : undefined;

  const session = await auth();
  const meId = session?.user?.id ?? null;
  const role = normalizeRole(session?.user?.role);
  const mayCreate = canCreateTasks(role);

  if (!meId) {
    return (
      <main style={{ padding: 16 }}>
        <h1>Р—Р°РґР°С‡Рё</h1>
        <p>РќРµ Р°РІС‚РѕСЂРёР·РѕРІР°РЅРѕ.</p>
      </main>
    );
  }

  const activeTab = mayCreate ? (tabParam === 'byme' ? 'byme' : 'mine') : 'mine';

  // Р”Р°РЅРЅС‹Рµ РґР»СЏ TaskForm
  let users: Array<{ id: string; name: string | null; role?: string | null; methodicalGroups?: string | null; subjects?: any }> = [];
  let groups: Array<{ id: string; name: string }> = [];
  let subjects: Array<{ name: string; count?: number }> = [];
  let groupMembers: Array<{ groupId: string; userId: string }> = [];
  let subjectMembers: Array<{ subjectName: string; userId: string }> = [];

  if (mayCreate) {
    const [usersRaw, groupsRaw, subjectsRaw, groupMembersRaw, subjectMembersRaw] = await Promise.all([
      prisma.user.findMany({
        select: {
          id: true,
          name: true,
          role: true,
          methodicalGroups: true,
          subjects: true,
        },
        orderBy: { name: 'asc' },
      }),
      prisma.group.findMany({ select: { id: true, name: true }, orderBy: { name: 'asc' } }),
      prisma.subject.findMany({
        select: { name: true, _count: { select: { members: true } } },
        orderBy: { name: 'asc' },
      }),
      prisma.groupMember.findMany({ select: { groupId: true, userId: true } }),
      prisma.subjectMember.findMany({
        select: {
          userId: true,
          subject: { select: { name: true } },
        },
      }),
    ]);

    users = usersRaw;
    groups = groupsRaw;
    subjects = subjectsRaw.map((s) => ({ name: s.name, count: s._count.members }));
    groupMembers = groupMembersRaw;
    subjectMembers = subjectMembersRaw.map((sm) => ({ userId: sm.userId, subjectName: sm.subject.name }));
  }

  // РЎРїРёСЃРєРё Р·Р°РґР°С‡
  const [assignedToMe, createdByMe]: [TaskWithAssignees[], TaskWithAssignees[]] = await Promise.all([
    prisma.task.findMany({
      where: {
        assignees: { some: { userId: meId, status: 'in_progress' } },
      },
      include: {
        assignees: { include: { user: { select: { id: true, name: true } } } },
      },
      orderBy: [{ dueDate: 'asc' }, { createdAt: 'desc' }],
    }),
    mayCreate
      ? prisma.task.findMany({
          where: { createdById: meId },
          include: { assignees: { include: { user: { select: { id: true, name: true } } } } },
          orderBy: [{ dueDate: 'asc' }, { createdAt: 'desc' }],
        })
      : Promise.resolve([] as TaskWithAssignees[]),
  ]);

  return (
    <main style={{ padding: 16 }}>
      <div className="gridWrap">
        {/* Р›РµРІР°СЏ РєРѕР»РѕРЅРєР°: С„РѕСЂРјР° (РёР»Рё РіРёРґ РґР»СЏ Teacher) */}
        <aside className="leftCol">
          {mayCreate ? (
            <section aria-label="РЎРѕР·РґР°С‚СЊ Р·Р°РґР°С‡Сѓ" className="card">
              <Suspense fallback={null}>
                <TaskForm
                  users={users}
                  groups={groups}
                  subjects={subjects}
                  groupMembers={groupMembers}
                  subjectMembers={subjectMembers}
                  createAction={createTaskAction}
                />
              </Suspense>
            </section>
          ) : (
            <TeacherGuide />
          )}
        </aside>

        {/* РџСЂР°РІР°СЏ РєРѕР»РѕРЅРєР°: СЃРїРёСЃРѕРє Р·Р°РґР°С‡ СЃ С‚Р°Р±Р°РјРё */}
        <section className="rightCol">
          <header className="tabsWrap">
            {mayCreate ? (
              <nav className="tabs">
                <a
                  href="/inboxtasks?tab=mine"
                  className={`tab ${activeTab === 'mine' ? 'tab--active' : ''}`}
                  aria-current={activeTab === 'mine' ? 'page' : undefined}
                >
                  РќР°Р·РЅР°С‡РµРЅРЅС‹Рµ РјРЅРµ ({assignedToMe.length})
                </a>
                <a
                  href="/inboxtasks?tab=byme"
                  className={`tab ${activeTab === 'byme' ? 'tab--active' : ''}`}
                  aria-current={activeTab === 'byme' ? 'page' : undefined}
                >
                  РќР°Р·РЅР°С‡РµРЅРЅС‹Рµ РјРЅРѕР№ ({createdByMe.length})
                </a>
              </nav>
            ) : (
              <div style={{ fontSize: 13, color: '#6b7280' }}>
                Р РѕР»СЊ: РїСЂРµРїРѕРґР°РІР°С‚РµР»СЊ вЂ” РґРѕСЃС‚СѓРїРЅР° С‚РѕР»СЊРєРѕ РІРєР»Р°РґРєР° В«РќР°Р·РЅР°С‡РµРЅРЅС‹Рµ РјРЅРµВ»
              </div>
            )}
          </header>

          {/* Р’РєР»Р°РґРєР°: РќР°Р·РЅР°С‡РµРЅРЅС‹Рµ РјРЅРµ вЂ” РџР•Р Р•Р’РЃР РЎРўРђРќРћ */}
          {activeTab === 'mine' && (
            <section aria-label="РќР°Р·РЅР°С‡РµРЅРЅС‹Рµ РјРЅРµ" style={{ display: 'grid', gap: 8 }}>
              {assignedToMe.length === 0 && <div style={{ color: '#6b7280', fontSize: 14 }}>РџРѕРєР° РЅРµС‚ Р°РєС‚РёРІРЅС‹С… Р·Р°РґР°С‡.</div>}
              {assignedToMe.map((t) => {
                const myAssn = t.assignees.find((a) => a.userId === meId);
                const urgent = (t.priority ?? 'normal') === 'high';
                return (
                  <details key={t.id} className="taskCard">
                    <summary className="taskSummary">
                      <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                        <span style={{ fontWeight: 600 }}>{t.title}</span>
                        {urgent && (
                          <span className="pillUrgent">РЎСЂРѕС‡РЅРѕ</span>
                        )}
                      </div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 12, fontSize: 12, color: '#374151' }}>
                        <span>{fmtRuDateWithOptionalTimeYekb(t.dueDate as Date)}</span>
                        <span>РќР°Р·РЅР°С‡РёР»: {t.createdByName ?? 'вЂ”'}</span>
                      </div>
                    </summary>
                    <div className="taskBody">
                      {t.description && (
                        <div
                          style={{
                            whiteSpace: 'pre-wrap',
                            color: '#111827',
                            marginBottom: 8,
                            overflowWrap: 'anywhere',
                            wordBreak: 'break-word',
                          }}
                        >
                          {t.description}
                        </div>
                      )}
                      <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                        <form action={markAssigneeDoneAction}>
                          <input type="hidden" name="taskId" value={t.id} />
                          <button
                            type="submit"
                            className="btnPrimaryGreen"
                            disabled={!myAssn || myAssn.status === 'done'}
                          >
                            Р’С‹РїРѕР»РЅРёС‚СЊ
                          </button>
                        </form>
                        {t.createdById && (
                          <a
                            href="#"
                            className="btnGhost"
                          >
                            РЈС‚РѕС‡РЅРёС‚СЊ Р·Р°РґР°С‡Сѓ
                          </a>
                        )}
                      </div>
                    </div>
                  </details>
                );
              })}
            </section>
          )}

          {/* Р’РєР»Р°РґРєР°: РќР°Р·РЅР°С‡РµРЅРЅС‹Рµ РјРЅРѕР№ (РєР°Рє Р±С‹Р»Рѕ РІ РїСЂРµРґС‹РґСѓС‰РµР№ РІРµСЂСЃРёРё) */}
          {activeTab === 'byme' && mayCreate && (
            <section aria-label="РќР°Р·РЅР°С‡РµРЅРЅС‹Рµ РјРЅРѕР№" style={{ display: 'grid', gap: 8 }}>
              {createdByMe.length === 0 && <div style={{ color: '#6b7280', fontSize: 14 }}>Р’С‹ РїРѕРєР° РЅРµ СЃРѕР·РґР°РІР°Р»Рё Р·Р°РґР°С‡.</div>}
              {createdByMe.map((t) => {
                const urgent = (t.priority ?? 'normal') === 'high';
                const total = t.assignees.length;
                const done = t.assignees.filter(a => a.status === 'done').length;
                const allDone = total > 0 && done === total;

                const sorted = [...t.assignees].sort((a, b) => {
                  const av = a.status === 'done' ? 1 : 0;
                  const bv = b.status === 'done' ? 1 : 0;
                  return av - bv;
                });

                const preview = sorted.slice(0, 7);
                const hasMore = sorted.length > 7;

                return (
                  <details key={t.id} className="taskCard">
                    <summary className="taskSummary">
                      <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                        <span style={{ fontWeight: 600 }}>{t.title}</span>
                        {urgent && <span className="pillUrgent">РЎСЂРѕС‡РЅРѕ</span>}
                      </div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 12, fontSize: 12, color: '#374151' }}>
                        <span>{fmtRuDateWithOptionalTimeYekb(t.dueDate as Date)}</span>
                        <span style={{ color: '#111827', fontWeight: 600 }}>{done}/{total} РІС‹РїРѕР»РЅРµРЅРѕ</span>
                      </div>
                    </summary>

                    <div className="taskBody" style={{ display: 'grid', gap: 10 }}>
                      {/* РљРѕРјСѓ РЅР°Р·РЅР°С‡РµРЅРѕ (СЃРІРѕСЂР°С‡РёРІР°РµРјС‹Р№ СЃРїРёСЃРѕРє) */}
                      <div style={{ fontSize: 13 }}>
                        <div style={{ color: '#6b7280', marginBottom: 4 }}>РљРѕРјСѓ РЅР°Р·РЅР°С‡РµРЅРѕ:</div>

                        {hasMore ? (
                          <details>
                            <summary style={{ listStyle: 'none', cursor: 'pointer' }}>
                              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                                {preview.map((a) => (
                                  <span
                                    key={a.id}
                                    title={a.status === 'done' ? 'Р’С‹РїРѕР»РЅРµРЅРѕ' : 'Р’ СЂР°Р±РѕС‚Рµ'}
                                    style={{
                                      border: '1px solid #e5e7eb',
                                      borderRadius: 999,
                                      padding: '2px 8px',
                                      fontSize: 12,
                                      background: a.status === 'done' ? '#ecfdf5' : '#fff',
                                    }}
                                  >
                                    {(a.user?.name ?? `${a.userId.slice(0,8)}вЂ¦`)} {a.status === 'done' ? 'вњ“' : ''}
                                  </span>
                                ))}
                              </div>
                              <div style={{ marginTop: 6, fontSize: 12, color: '#374151' }}>РџРѕРєР°Р·Р°С‚СЊ РІСЃРµС…</div>
                            </summary>
                            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 8 }}>
                              {sorted.map((a) => (
                                <span
                                  key={a.id}
                                  title={a.status === 'done' ? 'Р’С‹РїРѕР»РЅРµРЅРѕ' : 'Р’ СЂР°Р±РѕС‚Рµ'}
                                  style={{
                                    border: '1px solid #e5e7eb',
                                    borderRadius: 999,
                                    padding: '2px 8px',
                                    fontSize: 12,
                                    background: a.status === 'done' ? '#ecfdf5' : '#fff',
                                  }}
                                >
                                  {(a.user?.name ?? `${a.userId.slice(0,8)}вЂ¦`)} {a.status === 'done' ? 'вњ“' : ''}
                                </span>
                              ))}
                            </div>
                          </details>
                        ) : (
                          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                            {sorted.map((a) => (
                              <span
                                key={a.id}
                                title={a.status === 'done' ? 'Р’С‹РїРѕР»РЅРµРЅРѕ' : 'Р’ СЂР°Р±РѕС‚Рµ'}
                                style={{
                                  border: '1px solid #e5e7eb',
                                  borderRadius: 999,
                                  padding: '2px 8px',
                                  fontSize: 12,
                                  background: a.status === 'done' ? '#ecfdf5' : '#fff',
                                }}
                              >
                                {(a.user?.name ?? `${a.userId.slice(0,8)}вЂ¦`)} {a.status === 'done' ? 'вњ“' : ''}
                              </span>
                            ))}
                          </div>
                        )}
                      </div>

                      {/* Р РµРґР°РєС‚РёСЂРѕРІР°РЅРёРµ РѕСЃРЅРѕРІРЅС‹С… РїРѕР»РµР№ */}
                      <form action={updateTaskAction} style={{ display: 'grid', gap: 8 }}>
                        <input type="hidden" name="taskId" value={t.id} />
                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 180px 140px', gap: 8 }}>
                          <input
                            name="title"
                            defaultValue={t.title}
                            placeholder="РќР°Р·РІР°РЅРёРµ"
                            style={{ padding: '6px 8px', border: '1px solid #e5e7eb', borderRadius: 8 }}
                          />
                          <input
                            name="dueDate"
                            type="date"
                            defaultValue={new Date(t.dueDate as Date).toISOString().slice(0, 10)}
                            style={{ padding: '6px 8px', border: '1px solid #e5e7eb', borderRadius: 8 }}
                          />
                          <select name="priority" defaultValue={t.priority ?? 'normal'} style={{ padding: '6px 8px', border: '1px solid #e5e7eb', borderRadius: 8 }}>
                            <option value="normal">РѕР±С‹С‡РЅС‹Р№</option>
                            <option value="high">СЃСЂРѕС‡РЅРѕ</option>
                          </select>
                        </div>
                        <textarea
                          name="description"
                          defaultValue={t.description ?? ''}
                          rows={3}
                          placeholder="РћРїРёСЃР°РЅРёРµ"
                          style={{ padding: '6px 8px', border: '1px solid #e5e7eb', borderRadius: 8, resize: 'vertical' }}
                        />
                        <label style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 13 }}>
                          <input type="checkbox" name="hidden" defaultChecked={t['hidden'] ?? false} /> РЅРµ СЂР°Р·РјРµС‰Р°С‚СЊ РІ РєР°Р»РµРЅРґР°СЂРµ
                        </label>
                        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                          <button type="submit" className="btnPrimary">
                            РЎРѕС…СЂР°РЅРёС‚СЊ РёР·РјРµРЅРµРЅРёСЏ
                          </button>
                        </div>
                      </form>

                      {/* РљРЅРѕРїРєРё РЈРґР°Р»РёС‚СЊ / Р’ Р°СЂС…РёРІ */}
                      <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
                        <form action={deleteTaskAction}>
                          <input type="hidden" name="taskId" value={t.id} />
                          <button type="submit" className="btnDanger">
                            РЈРґР°Р»РёС‚СЊ
                          </button>
                        </form>
                        {(() => {
                          const total = t.assignees.length;
                          const done = t.assignees.filter(a => a.status === 'done').length;
                          const allDone = total > 0 && done === total;
                          return allDone ? (
                            <form action={updateTaskAction} style={{ marginLeft: 'auto' }}>
                              <input type="hidden" name="taskId" value={t.id} />
                              <input type="hidden" name="archive" value="1" />
                              
                            </form>
                          ) : null;
                        })()}
                      </div>
                    </div>
                  </details>
                );
              })}
            </section>
          )}
        </section>
      </div>

      {/* РѕР±С‹С‡РЅС‹Р№ <style>, РќР• styled-jsx */}
      <style>{`
        .gridWrap {
          display: grid;
          grid-template-columns: minmax(320px, clamp(320px, 33%, 420px)) 1fr;
          gap: 12px;
        }
        @media (max-width: 980px) {
          .gridWrap { grid-template-columns: 1fr; }
        }
        .leftCol { min-width: 0; }
        .rightCol { min-width: 0; }

        .card { border:1px solid #e5e7eb; border-radius:12px; padding:12px; background:#fff; }

        .tabsWrap { display:flex; align-items:center; justify-content:space-between; margin-bottom:8px; }
        .tabs { display:flex; gap:8px; }
        .tab {
          padding: 6px 10px;
          border-radius: 999px;
          border: 1px solid #e5e7eb;
          background: #fff;
          color: #111827;
          text-decoration: none;
          font-size: 13px;
        }
        .tab--active {
          background: #8d2828;
          color: #fff;
          border-color: #8d2828;
        }

        .taskCard { border:1px solid #e5e7eb; border-radius:12px; background:#fff; }
        .taskSummary { padding:10px; cursor:pointer; display:flex; justify-content:space-between; align-items:center; }
        .taskBody { padding:10px; border-top:1px solid #f3f4f6; }

        .pillUrgent { font-size:11px; color:#8d2828; border:1px solid #8d2828; border-radius:999px; padding:0 6px; }

        .btnPrimary {
          height:32px; padding:0 12px; border-radius:10px; border:1px solid #111827; background:#111827; color:#fff; cursor:pointer; font-size:13px;
        }
        .btnPrimaryGreen {
          height:32px; padding:0 12px; border-radius:10px; border:1px solid #10b981; background:#10b981; color:#fff; cursor:pointer; font-size:13px;
        }
        .btnDanger {
          height:32px; padding:0 12px; border-radius:10px; border:1px solid #ef4444; background:#ef4444; color:#fff; cursor:pointer; font-size:13px;
        }
        .btnGhost {
          height:32px; padding:0 12px; border-radius:10px; border:1px solid #e5e7eb; background:#fff; color:#111827;
          text-decoration:none; display:inline-flex; align-items:center; font-size:13px;
        }
      `}</style>
    </main>
  );
}
