// app/admin/db-status/page.tsx
import { prisma } from '@/lib/prisma';
import { auth } from '@/auth.config';
import { redirect } from 'next/navigation';
import Link from 'next/link';
import { deleteUser, forceResetPassword } from './actions';
import styles from './page.module.css';

import { normalizeRole, canViewAdmin, type Role } from '@/lib/roles';
import { ROLE_LABELS } from '@/lib/roleLabels';

export const dynamic = 'force-dynamic';

type UserRow = {
  id: string;
  name: string;
  username: string | null;
  role: string | null;
};

export default async function DbStatusPage(props: {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
}) {
  const session = await auth();
  const roleNorm = normalizeRole((session?.user as any)?.role ?? null);
  if (!canViewAdmin(roleNorm)) redirect('/');

  const sp = (props.searchParams ? await props.searchParams : undefined) ?? undefined;
  const okParam = sp?.ok;
  const errorParam = sp?.error;
  const ok = Array.isArray(okParam) ? okParam[0] : okParam;
  const error = Array.isArray(errorParam) ? errorParam[0] : errorParam;

  const users: UserRow[] = await prisma.user.findMany({
    orderBy: { name: 'asc' },
    select: { id: true, name: true, username: true, role: true },
  });

  return (
    <main className={styles.page}>
      <header className={`${styles.glass} ${styles.head}`} style={{ borderRadius: 16, padding: '14px 16px' }}>
        <h1 className={styles.title} style={{ margin: 0, fontWeight: 900 }}>Статус БД</h1>
        <p className={styles.subtitle} style={{ margin: '6px 0 0', opacity: .85 }}>
          пользователей: <b>{users.length}</b>. подключение активно.
        </p>
      </header>

      {(ok || error) && (
        <div
          className={`${styles.note} ${ok ? styles.ok : styles.err}`}
          style={{
            borderRadius: 12,
            padding: '10px 12px',
            border: `1px solid ${ok ? '#c8e6c9' : '#fecaca'}`,
            background: ok ? '#f0fbf1' : '#fff1f2',
            color: ok ? '#166534' : '#991b1b',
            fontWeight: 700,
          }}
        >
          {ok ? <>Готово: {ok}</> : <>Ошибка: {error}</>}
        </div>
      )}

      <section className={styles.panel + ' ' + styles.glass} style={{ borderRadius: 16 }}>
        <h2 className={styles.h2} style={{ marginTop: 0 }}>пользователи</h2>
        <div className={styles.tableWrap + ' ' + styles.glassLite} style={{ borderRadius: 12 }}>
          <table className={styles.table}>
            <thead>
              <tr>
                <th>имя</th>
                <th>логин</th>
                <th>роль</th>
                <th>действия</th>
              </tr>
            </thead>
            <tbody>
              {users.map((u) => {
                const r = normalizeRole(u.role ?? null) as Role | null;
                const roleLabel = r ? (ROLE_LABELS[r] ?? r) : '—';
                const canLink = !!u.username && u.username.trim().length > 0;

                return (
                  <tr key={u.id}>
                    <td>
                      {canLink ? (
                        <Link
                          href={`/u/${encodeURIComponent(u.username!)}`}
                          className={styles.linkName}
                          prefetch={false}
                          title={`Открыть профиль: ${u.name}`}
                        >
                          {u.name}
                        </Link>
                      ) : (
                        u.name
                      )}
                    </td>
                    <td>{u.username ?? '—'}</td>
                    <td>
                      <span
                        style={{
                          display: 'inline-block',
                          fontSize: 12,
                          padding: '2px 8px',
                          borderRadius: 999,
                          border: '1px solid rgba(229,231,235,.9)',
                          background: 'rgba(255,255,255,.6)',
                        }}
                        title={u.role ?? ''}
                      >
                        {roleLabel}
                      </span>
                    </td>
                    <td className={styles.actions}>
                      <form action={deleteUser}>
                        <input type="hidden" name="id" value={u.id} />
                        <button className={`${styles.btn} ${styles.ghost}`} type="submit" style={{ borderRadius: 10 }}>
                          удалить
                        </button>
                      </form>

                      <form action={forceResetPassword} className={styles.resetForm} style={{ display: 'flex', gap: 8 }}>
                        <input name="id" type="hidden" value={u.id} />
                        <input
                          name="newPassword"
                          placeholder="Новый пароль"
                          className={styles.input}
                          required
                          style={{ borderRadius: 10, border: '1px solid rgba(229,231,235,.9)', padding: '6px 10px' }}
                        />
                        <button className={`${styles.btn} ${styles.ghost}`} type="submit" style={{ borderRadius: 10 }}>
                          сбросить
                        </button>
                      </form>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </section>
    </main>
  );
}
