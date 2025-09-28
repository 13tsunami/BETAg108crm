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
import { normalizeRole, canViewAdmin, type Role } from '@/lib/roles';
import { ROLE_LABELS } from '@/lib/roleLabels';
import s from './page.module.css';

type Search = Promise<Record<string, string | string[] | undefined>>;

export const dynamic = 'force-dynamic';
export const revalidate = 0;

const ONLINE_WINDOW_MS = 5 * 60 * 1000;

function formatRuDate(date: Date): string {
  const d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
  return d.toLocaleDateString('ru-RU', { day: '2-digit', month: '2-digit', year: 'numeric' });
}
function dateToInputYMD(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}
const clean = (x?: string | null) => x ?? '—';

export default async function TeachersPage(props: { searchParams?: Search }) {
  const sp = (props.searchParams ? await props.searchParams : undefined) ?? {};
  const q = (Array.isArray(sp.q) ? sp.q[0] : sp.q) || '';
  const okRaw = Array.isArray(sp.ok) ? sp.ok[0] : sp.ok;
  const errorRaw = Array.isArray(sp.error) ? sp.error[0] : sp.error;
  const ok = okRaw && !/^NEXT_REDIRECT/.test(okRaw) ? okRaw : undefined;
  const error = errorRaw && !/^NEXT_REDIRECT/.test(errorRaw) ? errorRaw : undefined;

  const session = await auth();
  const roleRaw = (session?.user as any)?.role as string | undefined;
  const roleNorm = normalizeRole(roleRaw ?? null);
  const canManage = canViewAdmin(roleNorm);

  const sTerm = q.trim();
  const or: Prisma.UserWhereInput[] = sTerm
    ? [
        { name:      { contains: sTerm, mode: Prisma.QueryMode.insensitive } },
        { email:     { contains: sTerm, mode: Prisma.QueryMode.insensitive } },
        { phone:     { contains: sTerm, mode: Prisma.QueryMode.insensitive } },
        { classroom: { contains: sTerm, mode: Prisma.QueryMode.insensitive } },
        { username:  { contains: sTerm, mode: Prisma.QueryMode.insensitive } },
        { telegram:  { contains: sTerm, mode: Prisma.QueryMode.insensitive } },
        { about:     { contains: sTerm, mode: Prisma.QueryMode.insensitive } },
        { role:      { contains: sTerm, mode: Prisma.QueryMode.insensitive } },
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

  return (
    <section className={s.page}>
      <header className={s.head + ' ' + s.glass}>
        <h1 className={s.title}>пользователи</h1>
        <p className={s.subtitle}>все из базы; поиск по всем полям</p>
      </header>

      <div className={s.toolbar + ' ' + s.glass}>
        <SearchBox initial={q} />
        {canManage && <AddUserModal action={createUser} />}
      </div>

      {(ok || error) && (
        <div className={`${s.note} ${ok ? s.ok : s.err}`}>
          {ok ? `Готово: ${ok}` : `Ошибка: ${error}`}
        </div>
      )}

      <div className={s.listWrap + ' ' + s.glass}>
        <div className={s.list}>
          {users.map((u, idx) => {
            const ls = u.lastSeen ? new Date(u.lastSeen as any) : null;
            const online = !!(ls && now.getTime() - ls.getTime() <= ONLINE_WINDOW_MS);

            return (
              <details key={u.id} className={s.item} data-first={idx === 0 ? '1' : undefined}>
                <summary className={s.summary}>
                  <div className={s.summaryMain}>
                    <span className={s.name}>{u.name}</span>
                    <span className={s.roleText}>
                      {(() => {
                        const r = normalizeRole(u.role ?? null) as Role | null;
                        return r ? (ROLE_LABELS[r] ?? r) : '—';
                      })()}
                    </span>
                    <span className={`${s.badge} ${online ? s.badgeOnline : s.badgeOffline}`}>
                      {online ? 'онлайн' : 'офлайн'}
                    </span>
                  </div>

                  {canManage && (
                    <div className={s.actions}>
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

                <div className={s.details}>
                  <div className={s.tile + ' ' + s.glassTile}>
                    <div className={s.grid3}>
                      <Field label="логин" value={clean(u.username)} />
                      <Field label="email" value={clean(u.email)} />
                      <Field label="телефон" value={clean(u.phone)} />
                      <Field label="классное руководство" value={clean(u.classroom)} />
                      <Field label="telegram" value={clean(u.telegram)} />
                    </div>
                  </div>

                  <div className={s.tile + ' ' + s.glassTile}>
                    <div className={s.fieldLabel}>о себе</div>
                    <div className={s.about}>{u.about ? u.about : '—'}</div>
                  </div>
                </div>
              </details>
            );
          })}
          {!users.length && <div className={s.empty}>ничего не найдено</div>}
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
    <div className={s.field}>
      <div className={s.fieldLabel}>{label}</div>
      <div className={s.fieldValue}>{value}</div>
    </div>
  );
}
