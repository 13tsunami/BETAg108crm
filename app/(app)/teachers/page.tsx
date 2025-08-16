import { prisma } from '@/lib/prisma';
import { createUser, updateUser, deleteUser } from './actions';
import AddUserModal from '@/components/AddUserModal';
import EditUserModal from '@/components/EditUserModal';
import SearchBox from './SearchBox';
import { auth } from '@/auth.config';
import { Prisma } from '@prisma/client';
import ConfirmDeleteUser from '@/components/ConfirmDeleteUser';
import { Suspense } from 'react';
import TeachersToast from './TeachersToast';

type Search = Promise<Record<string, string | string[] | undefined>>;

export const dynamic = 'force-dynamic';
export const revalidate = 0;

const ONLINE_WINDOW_MS = 5 * 60 * 1000; // 5 минут

// Форматирование даты рождения для отображения без времени и без смещения
function formatRuDate(date: Date): string {
  // «Обнуляем» смещение, чтобы не съезжало на -1 день
  const d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
  return d.toLocaleDateString('ru-RU', { day: '2-digit', month: '2-digit', year: 'numeric' });
}

// Значение для <input type="date"> в формате YYYY-MM-DD без смещения по таймзоне
function dateToInputYMD(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

const clean = (x?: string | null) => x ?? '—';
const ruRole = (r?: string | null) =>
  r === 'director' ? 'Директор'
  : r === 'deputy_plus' ? 'Заместитель +'
  : r === 'deputy' ? 'Заместитель'
  : r === 'teacher_plus' ? 'Педагог +'
  : r === 'teacher' ? 'Педагог'
  : r === 'archived' ? 'В архиве'
  : (r || '—');

export default async function TeachersPage(props: { searchParams?: Search }) {
  const sp = (props.searchParams ? await props.searchParams : undefined) ?? {};
  const q = (Array.isArray(sp.q) ? sp.q[0] : sp.q) || '';
  const okRaw = Array.isArray(sp.ok) ? sp.ok[0] : sp.ok;
  const errorRaw = Array.isArray(sp.error) ? sp.error[0] : sp.error;
  const ok = okRaw && !/^NEXT_REDIRECT/.test(okRaw) ? okRaw : undefined;
  const error = errorRaw && !/^NEXT_REDIRECT/.test(errorRaw) ? errorRaw : undefined;

  const session = await auth();
  const role = (session?.user as any)?.role as string | undefined;
  const canManage = role === 'director' || role === 'deputy_plus';

  const s = q.trim();
  const or: Prisma.UserWhereInput[] = s
    ? [
        { name:      { contains: s, mode: Prisma.QueryMode.insensitive } },
        { email:     { contains: s, mode: Prisma.QueryMode.insensitive } },
        { phone:     { contains: s, mode: Prisma.QueryMode.insensitive } },
        { classroom: { contains: s, mode: Prisma.QueryMode.insensitive } },
        { username:  { contains: s, mode: Prisma.QueryMode.insensitive } },
        { telegram:  { contains: s, mode: Prisma.QueryMode.insensitive } },
        { about:     { contains: s, mode: Prisma.QueryMode.insensitive } },
        { role:      { contains: s, mode: Prisma.QueryMode.insensitive } },
      ]
    : [];
  const where: Prisma.UserWhereInput | undefined = or.length ? { OR: or } : undefined;

  const users = await prisma.user.findMany({
    where,
    orderBy: { name: 'asc' },
    select: {
      id: true, name: true, role: true, username: true, email: true, phone: true,
      classroom: true, telegram: true, about: true, birthday: true,
      notifyEmail: true, notifyTelegram: true, lastSeen: true,
    },
  });

  const now = new Date();

  // Общий «стеклянный» стиль для плиток в раскрывашках
  const glassTile: React.CSSProperties = {
    borderRadius: 16,
    background: 'rgba(255,255,255,0.6)',
    border: '1px solid rgba(229,231,235,.9)',
    boxShadow: '0 8px 24px rgba(0,0,0,.06), inset 0 1px 0 rgba(255,255,255,.6)',
    backdropFilter: 'blur(8px)',
  };

  return (
    <section style={{ display: 'grid', gap: 12 }}>
      <header className="u-glass" style={{ padding: '14px 16px', borderRadius: 16 }}>
        <h1 style={{ margin: 0, fontWeight: 900, fontSize: 22, color: '#0f172a' }}>пользователи</h1>
        <p style={{ margin: '6px 0 0', fontSize: 14, color: '#374151' }}>все из базы; поиск по всем полям</p>
      </header>

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

      <div className="u-glass" style={{ borderRadius: 16, overflow: 'hidden', padding: 6 }}>
        <div style={{ display: 'grid', gap: 8 }}>
          {users.map((u, idx) => {
            const ls = u.lastSeen ? new Date(u.lastSeen as any) : null;
            const online = !!(ls && (now.getTime() - ls.getTime() <= ONLINE_WINDOW_MS));

            return (
              <details
                key={u.id}
                style={{
                  borderTop: idx ? '1px solid #eef0f2' : 'none',
                  padding: 6,
                }}
              >
                <summary
                  style={{
                    listStyle: 'none',
                    cursor: 'pointer',
                    display: 'grid',
                    gridTemplateColumns: canManage ? '1fr auto' : '1fr',
                    alignItems: 'center',
                    gap: 8,
                  }}
                >
                  <div style={{ display: 'flex', gap: 10, alignItems: 'baseline', flexWrap: 'wrap' }}>
                    <span style={{ fontWeight: 700 }}>{u.name}</span>
                    <span style={{ opacity: .75 }}>{ruRole(u.role)}</span>
                    <span style={{
                      fontSize: 12,
                      padding: '2px 8px',
                      borderRadius: 999,
                      border: `1px solid ${online ? '#16a34a' : '#9ca3af'}`,
                      color: online ? '#166534' : '#6b7280',
                      background: online ? '#dcfce7' : '#f3f4f6'
                    }}>
                      {online ? 'онлайн' : 'офлайн'}
                    </span>
                  </div>

                  {canManage && (
                    <div style={{ display: 'flex', gap: 8 }}>
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
                          birthday: u.birthday ? dateToInputYMD(new Date(u.birthday as any)) : '',
                          telegram: u.telegram ?? '',
                          about: u.about ?? '',
                          notifyEmail: !!u.notifyEmail,
                          notifyTelegram: !!u.notifyTelegram,
                        }}
                      />
                      <ConfirmDeleteUser userId={u.id} userName={u.name} action={deleteUser} />
                    </div>
                  )}
                </summary>

                <div style={{ marginTop: 8, paddingLeft: 4, display: 'grid', gap: 8 }}>
                  <div style={{ ...glassTile, padding: 12 }}>
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, minmax(0, 1fr))', gap: 8 }}>
                      <Field label="логин" value={clean(u.username)} />
                      <Field label="email" value={clean(u.email)} />
                      <Field label="телефон" value={clean(u.phone)} />
                      <Field label="классное руководство" value={clean(u.classroom)} />
                      <Field label="telegram" value={clean(u.telegram)} />
                      <Field label="дата рождения" value={u.birthday ? formatRuDate(new Date(u.birthday as any)) : '—'} />
                      <Field label="уведомления email" value={u.notifyEmail ? 'вкл' : 'выкл'} />
                      <Field label="уведомления telegram" value={u.notifyTelegram ? 'вкл' : 'выкл'} />
                    </div>
                  </div>

                  <div style={{ ...glassTile, padding: 12 }}>
                    <div style={{ fontSize: 13, opacity: .6, marginBottom: 6 }}>о себе</div>
                    <div style={{ color: '#374151' }}>{u.about ? u.about : '—'}</div>
                  </div>
                </div>
              </details>
            );
          })}
          {!users.length && <div style={{ padding: 20, color: '#6b7280' }}>ничего не найдено</div>}
        </div>
      </div>

      <Suspense>
        <TeachersToast />
      </Suspense>
    </section>
  );
}

function Field({ label, value }: { label: string; value: string }) {
  return (
    <div style={{ fontSize: 13 }}>
      <div style={{ opacity: .6 }}>{label}</div>
      <div style={{ fontWeight: 600 }}>{value}</div>
    </div>
  );
}
