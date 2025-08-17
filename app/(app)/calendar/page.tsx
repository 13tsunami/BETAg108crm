import { auth } from '@/auth.config';
import { normalizeRole } from '@/lib/roles';
import CalendarBoard from './CalendarBoard';

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

export default async function Page({
  searchParams,
}: {
  searchParams: SearchParams;
}) {
  // Контракт Next 15: ожидаем Promise и делаем await
  const _sp = await searchParams;

  const session = await auth();
  const meId = session?.user?.id ?? '';
const norm = normalizeRole(session?.user?.role);
const roleStr = norm ? String(norm) : null;

// Право видеть "все задачи" только у директора и "заместитель +"
const canSeeAll =
  roleStr === 'director' ||
  roleStr === 'deputy_plus' ||
  roleStr === 'Директор' ||
  roleStr === 'Заместитель +';

  return (
    <main style={{ padding: 16, display: 'grid', gap: 12 }}>
      <header style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <h1 style={{ margin: 0 }}>Календарь</h1>
        {/* при необходимости сюда можно добавить доп. элементы управления */}
      </header>

      {/* CalendarBoard — клиентский компонент. */}
      <CalendarBoard meId={meId} canSeeAll={canSeeAll} />
    </main>
  );
}
