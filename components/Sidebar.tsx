// components/Sidebar.tsx
import Link from 'next/link';
import { auth } from '@/auth.config';
import { canCreateTasks, canViewAdmin, canViewTasks, normalizeRole } from '@/lib/roles';
import UserMenu from './UserMenu';

export default async function Sidebar() {
  const session = await auth();
  const user = session?.user as any | undefined;

  const role = normalizeRole(user?.role ?? null);
  const name = user?.name ?? 'Пользователь';
  const showAdmin = canViewAdmin(role);
  const showTasks = canViewTasks(role);
  const showCreateTasks = canCreateTasks(role);

  return (
    <aside className="w-64 shrink-0 border-r bg-white p-4 space-y-4">
      <header className="space-y-1">
        <div className="font-semibold truncate">{name}</div>
        <div className="text-xs text-gray-600">{role ?? '—'}</div>
        <UserMenu />
      </header>

      <nav className="space-y-3 text-sm">
        <div>
          <Link className="underline" href="/">
            Главная
          </Link>
        </div>

        {showTasks && (
          <div>
            <div className="mt-3 text-xs uppercase text-gray-600">Работа</div>
            <div className="mt-1">
              <Link className="underline" href="/inboxTasks">
                Задачи
              </Link>
            </div>
            {showCreateTasks && (
              <div className="mt-1">
                <Link className="underline" href="/inboxTasks?create=1">
                  Новая задача
                </Link>
              </div>
            )}
          </div>
        )}

        {showAdmin && (
          <div>
            <div className="mt-4 text-xs uppercase text-gray-600">Администрирование</div>
            <div className="mt-1">
              <Link className="underline" href="/admin">
                Админка
              </Link>
            </div>
            <div className="mt-1">
              <Link className="underline" href="/admin/db-status">
                Статус БД
              </Link>
            </div>
          </div>
        )}
      </nav>
    </aside>
  );
}
