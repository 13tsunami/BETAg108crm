// app/(app)/calendar/page.tsx
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
  const roleSlug = normalizeRole(session?.user?.role) ?? null;

  return (
    <main style={{ padding: 16, display: 'grid', gap: 12 }}>
      <header style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <h1 style={{ margin: 0 }}>Календарь</h1>
        {/* при необходимости сюда можно добавить фильтры / кнопки периода */}
      </header>

      {/* CalendarBoard — клиентский компонент.
          Пробрасываем meId и roleSlug, чтобы внутри включить переключатель «Мои/Все» и фильтрацию. */}
      {/* Предполагаем пропсы: { meId: string; roleSlug: string | null } */}
      <CalendarBoard meId={meId} roleSlug={roleSlug} />
    </main>
  );
}
