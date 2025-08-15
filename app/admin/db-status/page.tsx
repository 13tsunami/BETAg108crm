// app/admin/db-status/page.tsx
import { prisma } from '@/lib/prisma';
import { canViewAdmin } from '@/lib/roles';
import { auth } from '@/auth.config';
import { redirect } from 'next/navigation';
import { deleteUser, forceResetPassword, upsertUser } from './actions';

export const dynamic = 'force-dynamic';

type UserRow = {
  id: string;
  name: string;
  username: string | null;
  email: string | null;
  phone: string | null;
  role: string | null;
};

// Next.js 15: searchParams — это Promise<...>, ждём его внутри async-страницы
export default async function DbStatusPage(props: {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
}) {
  const session = await auth();
  const role = (session?.user as any)?.role ?? null;

  if (!canViewAdmin(role)) {
    redirect('/');
  }

  const sp = (props.searchParams ? await props.searchParams : undefined) ?? undefined;

  const okParam = sp?.ok;
  const errorParam = sp?.error;

  const ok = Array.isArray(okParam) ? okParam[0] : okParam;
  const error = Array.isArray(errorParam) ? errorParam[0] : errorParam;

  const users = await prisma.user.findMany({
    orderBy: { name: 'asc' },
    select: {
      id: true,
      name: true,
      username: true,
      email: true,
      phone: true,
      role: true,
    },
  });

  return (
    <main className="p-6 space-y-6">
      {ok && <div className="rounded-md border p-3 text-sm">Готово: {ok}</div>}
      {error && (
        <div className="rounded-md border p-3 text-sm">Ошибка: {error}</div>
      )}

      <section>
        <h1 className="text-xl font-semibold mb-2">Статус БД</h1>
        <p className="text-sm">
          Пользователей: {users.length}. Подключение активно.
        </p>
      </section>

      <section>
        <h2 className="text-lg font-medium mb-2">Пользователи</h2>
        <table className="w-full text-sm border-collapse">
          <thead>
            <tr>
              <th className="border px-2 py-1 text-left">Имя</th>
              <th className="border px-2 py-1 text-left">Логин</th>
              <th className="border px-2 py-1 text-left">Email</th>
              <th className="border px-2 py-1 text-left">Телефон</th>
              <th className="border px-2 py-1 text-left">Роль</th>
              <th className="border px-2 py-1 text-left">Действия</th>
            </tr>
          </thead>
          <tbody>
            {users.map((u: UserRow) => (
              <tr key={u.id}>
                <td className="border px-2 py-1">{u.name}</td>
                <td className="border px-2 py-1">{u.username ?? '—'}</td>
                <td className="border px-2 py-1">{u.email ?? '—'}</td>
                <td className="border px-2 py-1">{u.phone ?? '—'}</td>
                <td className="border px-2 py-1">{u.role ?? '—'}</td>
                <td className="border px-2 py-1">
                  <form action={deleteUser} className="inline-block mr-2">
                    <input type="hidden" name="id" value={u.id} />
                    <button className="underline">Удалить</button>
                  </form>
                  <form action={forceResetPassword} className="inline-block">
                    <input type="hidden" name="id" value={u.id} />
                    <input
                      name="newPassword"
                      placeholder="Новый пароль"
                      className="border px-1 py-0.5 text-xs mr-2"
                      required
                    />
                    <button className="underline">Сбросить пароль</button>
                  </form>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>

      <section>
        <h2 className="text-lg font-medium mb-2">Создать/обновить пользователя</h2>
        <form action={upsertUser} className="space-x-2">
          <input name="id" placeholder="id (опц.)" className="border px-2 py-1" />
          <input name="name" placeholder="Имя" className="border px-2 py-1" required />
          <input name="username" placeholder="Логин" className="border px-2 py-1" />
          <input name="email" placeholder="Email" className="border px-2 py-1" />
          <input name="phone" placeholder="Телефон" className="border px-2 py-1" />
          <select name="role" className="border px-2 py-1">
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
          <button className="underline">Сохранить</button>
        </form>
      </section>
    </main>
  );
}
