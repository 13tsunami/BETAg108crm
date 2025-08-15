import { prisma } from '@/lib/prisma';
import { createUser, updateUser, deleteUser, archiveUser } from './actions';
import AddUserModal from '@/components/AddUserModal';
import EditUserModal from '@/components/EditUserModal';
import SearchBox from './SearchBox';
import { auth } from '@/auth.config';
import { Prisma } from '@prisma/client';

type Search = Promise<Record<string, string | string[] | undefined>>;

export const dynamic = 'force-dynamic';

const BORDER = 'rgba(229,231,235,.8)';

export default async function TeachersPage(props: { searchParams?: Search }) {
  const sp = (props.searchParams ? await props.searchParams : undefined) ?? {};
  const q = (Array.isArray(sp.q) ? sp.q[0] : sp.q) || '';
  const ok = Array.isArray(sp.ok) ? sp.ok[0] : sp.ok;
  const error = Array.isArray(sp.error) ? sp.error[0] : sp.error;

  const session = await auth();
  const role = (session?.user as any)?.role as string | undefined;
  const canManage = role === 'director' || role === 'deputy_plus';

  const s = q.trim();
  const or: Prisma.UserWhereInput[] = s ? [
    { name:      { contains: s, mode: Prisma.QueryMode.insensitive } },
    { email:     { contains: s, mode: Prisma.QueryMode.insensitive } },
    { phone:     { contains: s, mode: Prisma.QueryMode.insensitive } },
    { classroom: { contains: s, mode: Prisma.QueryMode.insensitive } },
    { username:  { contains: s, mode: Prisma.QueryMode.insensitive } },
    { role:      { contains: s, mode: Prisma.QueryMode.insensitive } },
    { telegram:  { contains: s, mode: Prisma.QueryMode.insensitive } },
    { about:     { contains: s, mode: Prisma.QueryMode.insensitive } },
  ] : [];
  const where: Prisma.UserWhereInput | undefined = or.length ? { OR: or } : undefined;

  const users = await prisma.user.findMany({
    where,
    orderBy: { name: 'asc' },
    select: {
      id: true, name: true, role: true, username: true, email: true, phone: true,
      classroom: true, telegram: true, about: true, birthday: true,
      notifyEmail: true, notifyTelegram: true,
    },
  });

  const btnGhost: React.CSSProperties = { height: 32, padding: '4px 10px', borderRadius: 10, border: '1px solid rgba(229,231,235,.9)', background: '#fff', cursor: 'pointer' };
  const btnDanger: React.CSSProperties = { height: 32, padding: '4px 10px', borderRadius: 10, border: '1px solid #ef4444', background: '#fff', color: '#b91c1c', cursor: 'pointer' };

  const clean = (x?: string | null) => x ?? '—';
  const ruRole = (r?: string | null) =>
    r === 'director' ? 'Директор'
    : r === 'deputy_plus' ? 'Заместитель +'
    : r === 'deputy' ? 'Заместитель'
    : r === 'teacher_plus' ? 'Педагог +'
    : r === 'teacher' ? 'Педагог'
    : r === 'archived' ? 'В архиве'
    : (r || '—');

  return (
    <section style={{ display: 'grid', gap: 12 }}>
      {/* локальные стили для apple-expand */}
      <style>{`
        .glass-tile {
          position: relative;
          padding: 10px 12px;
          border-radius: 12px;
          border: 1px solid ${BORDER};
          background: linear-gradient(180deg, rgba(255,255,255,0.70), rgba(255,255,255,0.44));
          backdrop-filter: saturate(180%) blur(12px);
          -webkit-backdrop-filter: saturate(180%) blur(12px);
          box-shadow: 0 6px 16px rgba(0,0,0,.06), inset 0 1px 0 rgba(255,255,255,.45);
          transition: transform .16s ease, box-shadow .16s ease, outline-color .16s ease;
          user-select: none;
        }
        .glass-tile:hover {
          transform: translateY(-1px);
          box-shadow: 0 10px 24px rgba(0,0,0,.08), inset 0 1px 0 rgba(255,255,255,.5);
        }
        details[open] > summary .glass-tile {
          outline: 2px solid rgba(207,227,255,.9);
          box-shadow: 0 12px 28px rgba(0,0,0,.10), inset 0 1px 0 rgba(255,255,255,.55);
        }
        .expand-summary {
          list-style: none;
          cursor: pointer;
        }
        .caret {
          transition: transform .16s ease, opacity .16s ease;
          opacity: .7;
        }
        details[open] .caret { transform: rotate(90deg); opacity: 1; }
        .pill-arch {
          font-size: 12px; padding: 2px 8px; border-radius: 9999px;
          border: 1px solid rgba(229,231,235,.9); background: #fff;
        }
        .u-glass-lite {
          background: rgba(255,255,255,0.60);
          backdrop-filter: saturate(160%) blur(6px);
          -webkit-backdrop-filter: saturate(160%) blur(6px);
          border: 1px solid rgba(229,231,235,0.7);
          box-shadow: inset 0 1px 0 rgba(255,255,255,.35);
        }
      `}</style>

      {/* Шапка */}
      <header className="u-glass" style={{ padding: '14px 16px', borderRadius: 16 }}>
        <h1 style={{ margin: 0, fontWeight: 900, fontSize: 22, color: '#0f172a' }}>пользователи</h1>
        <p style={{ margin: '6px 0 0', fontSize: 14, color: '#374151' }}>все из базы; поиск по всем полям</p>
      </header>

      {/* Тулбар */}
      <div className="u-glass" style={{ padding: 10, borderRadius: 16, display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
        <SearchBox initial={q} />
        {canManage && <AddUserModal action={createUser} />}
      </div>

      {(ok || error) && (
        <div
          style={{
            borderRadius: 10, padding: '8px 10px',
            border: `1px solid ${ok ? '#c8e6c9' : '#fecaca'}`,
            background: ok ? '#f0fbf1' : '#fff1f2',
            color: ok ? '#166534' : '#991b1b', fontSize: 14
          }}
        >
          {ok ? `Готово: ${ok}` : `Ошибка: ${error}`}
        </div>
      )}

      {/* Список */}
      <div className="u-glass" style={{ borderRadius: 16, overflow: 'hidden', padding: 6 }}>
        <div style={{ display: 'grid', gap: 8 }}>
          {users.map((u, idx) => {
            const isArchived = (u as any).role === 'archived';
            return (
              <div
                key={u.id}
                style={{
                  display: 'grid',
                  gridTemplateColumns: canManage ? '1fr auto' : '1fr',
                  alignItems: 'start',
                  gap: 8,
                  padding: 6,
                  borderTop: idx ? '1px solid #eef0f2' : 'none'
                }}
              >
                {/* LEFT: ФИО → expand */}
                <details>
                  <summary className="expand-summary">
                    <div className="glass-tile">
                      <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
                        <svg className="caret" width="16" height="16" viewBox="0 0 24 24" aria-hidden="true">
                          <path fill="#0f172a" d="M8.59 16.59 13.17 12 8.59 7.41 10 6l6 6-6 6-1.41-1.41Z"/>
                        </svg>
                        <span style={{ fontWeight: 800, color: '#0f172a', fontSize: 16, lineHeight: '20px' }}>{u.name}</span>
                        {isArchived && <span className="pill-arch">в архиве</span>}
                      </div>
                    </div>
                  </summary>

                  {/* раскрытая часть */}
                  <div className="u-glass-lite" style={{ marginTop: 10, borderRadius: 12, padding: 12 }}>
                    <div style={{ display: 'grid', gap: 12, gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))' }}>
                      <div style={{ display: 'grid', gap: 6 }}>
                        <div><strong>роль:</strong> {ruRole((u as any).role)}</div>
                        <div><strong>логин:</strong> {clean(u.username)}</div>
                        <div><strong>e-mail:</strong> {clean(u.email)}</div>
                        <div><strong>телефон:</strong> {clean(u.phone)}</div>
                      </div>
                      <div style={{ display: 'grid', gap: 6 }}>
                        <div><strong>классное руководство:</strong> {clean(u.classroom)}</div>
                        <div><strong>telegram:</strong> {clean(u.telegram)}</div>
                        <div><strong>дата рождения:</strong> {u.birthday ? new Date(u.birthday as any).toLocaleDateString() : '—'}</div>
                        <div><strong>уведомления:</strong> {u.notifyEmail ? 'e-mail ' : ''}{u.notifyTelegram ? 'telegram' : (!u.notifyEmail ? '—' : '')}</div>
                      </div>
                      <div style={{ gridColumn: '1 / -1' }}>
                        <div><strong>о себе:</strong></div>
                        <div style={{ whiteSpace: 'pre-wrap' }}>{clean(u.about)}</div>
                      </div>
                    </div>
                  </div>
                </details>

                {/* RIGHT: действия (только для директор/зам+) */}
                {canManage && (
                  <div style={{ display: 'flex', gap: 8, alignItems: 'center', paddingTop: 2 }}>
                    <EditUserModal
                      action={updateUser}
                      userId={u.id}
                      initial={{
                        name: u.name,
                        username: u.username ?? '',
                        email: u.email ?? '',
                        phone: u.phone ?? '',
                        classroom: u.classroom ?? '',
                        role: (u as any).role ?? 'teacher',
                        birthday: u.birthday ? new Date(u.birthday as any).toISOString().slice(0,10) : '',
                        telegram: u.telegram ?? '',
                        about: u.about ?? '',
                        notifyEmail: !!u.notifyEmail,
                        notifyTelegram: !!u.notifyTelegram,
                      }}
                    />
                    {!isArchived && (
                      <form action={archiveUser} style={{ display: 'inline-block' }}>
                        <input type="hidden" name="id" value={u.id} />
                        <button style={btnGhost}>в архив</button>
                      </form>
                    )}
                    <form action={deleteUser} style={{ display: 'inline-block' }}>
                      <input type="hidden" name="id" value={u.id} />
                      <button style={btnDanger}>удалить</button>
                    </form>
                  </div>
                )}
              </div>
            );
          })}
          {!users.length && <div style={{ padding: 20, color: '#6b7280' }}>ничего не найдено</div>}
        </div>
      </div>
    </section>
  );
}
