import { prisma } from '@/lib/prisma';
import { canViewAdmin } from '@/lib/roles';
import { auth } from '@/auth.config';
import { redirect } from 'next/navigation';
import { deleteUser, forceResetPassword, upsertUser } from './actions';
import styles from './page.module.css';

export const dynamic = 'force-dynamic';

type UserRow = {
  id: string;
  name: string;
  username: string | null;
  email: string | null;
  phone: string | null;
  role: string | null;
};

export default async function DbStatusPage(props: {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
}) {
  const session = await auth();
  const role = (session?.user as any)?.role ?? null;
  if (!canViewAdmin(role)) redirect('/');

  const sp = (props.searchParams ? await props.searchParams : undefined) ?? undefined;
  const okParam = sp?.ok;
  const errorParam = sp?.error;
  const ok = Array.isArray(okParam) ? okParam[0] : okParam;
  const error = Array.isArray(errorParam) ? errorParam[0] : errorParam;

  const users = await prisma.user.findMany({
    orderBy: { name: 'asc' },
    select: { id: true, name: true, username: true, email: true, phone: true, role: true },
  });

  return (
    <main className={styles.page}>
      <header className={`${styles.glass} ${styles.head}`}>
        <h1 className={styles.title}>Статус БД</h1>
        <p className={styles.subtitle}>пользователей: {users.length}. подключение активно.</p>
      </header>

      {(ok || error) && (
        <div className={`${styles.note} ${ok ? styles.ok : styles.err}`}>
          {ok ? <>Готово: {ok}</> : <>Ошибка: {error}</>}
        </div>
      )}

      <section className={styles.panel + ' ' + styles.glass}>
        <h2 className={styles.h2}>пользователи</h2>
        <div className={styles.tableWrap + ' ' + styles.glassLite}>
          <table className={styles.table}>
            <thead>
              <tr>
                <th>имя</th>
                <th>логин</th>
                <th>email</th>
                <th>телефон</th>
                <th>роль</th>
                <th>действия</th>
              </tr>
            </thead>
            <tbody>
              {users.map((u: UserRow) => (
                <tr key={u.id}>
                  <td>{u.name}</td>
                  <td>{u.username ?? '—'}</td>
                  <td>{u.email ?? '—'}</td>
                  <td>{u.phone ?? '—'}</td>
                  <td>{u.role ?? '—'}</td>
                  <td className={styles.actions}>
                    <form action={deleteUser}>
                      <input type="hidden" name="id" value={u.id} />
                      <button className={`${styles.btn} ${styles.ghost}`} type="submit">удалить</button>
                    </form>
                    <form action={forceResetPassword} className={styles.resetForm}>
                      <input type="hidden" name="id" value={u.id} />
                      <input name="newPassword" placeholder="Новый пароль" className={styles.input} required />
                      <button className={`${styles.btn} ${styles.ghost}`} type="submit">сбросить</button>
                    </form>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section className={styles.panel + ' ' + styles.glass}>
        <h2 className={styles.h2}>создать/обновить пользователя</h2>
        <form action={upsertUser} className={styles.form}>
          <input name="id" placeholder="id (опц.)" className={styles.input} />
          <input name="name" placeholder="Имя" className={styles.input} required />
          <input name="username" placeholder="Логин" className={styles.input} />
          <input name="email" placeholder="Email" className={styles.input} />
          <input name="phone" placeholder="Телефон" className={styles.input} />
          <select name="role" className={styles.input}>
            <option value="">—</option>
            <option value="guest">guest</option>
            <option value="user">user</option>
            <option value="student">student</option>
            <option value="staff">staff</option>
            <option value="teacher">teacher</option>
            <option value="deputy">deputy</option>
            <option value="deputy_plus">deputy_plus</option>
            <option value="director">director</option>
          </select>
          <button className={`${styles.btn} ${styles.primary}`} type="submit">сохранить</button>
        </form>
      </section>
    </main>
  );
}
