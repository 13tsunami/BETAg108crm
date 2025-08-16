// app/(app)/calendar/page.tsx
import { auth } from '@/auth.config';
import { redirect } from 'next/navigation';
import { headers } from 'next/headers';
import CalendarBoard from '@/components/CalendarBoard';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

async function getOrigin() {
  const h = await headers();
  const proto = h.get('x-forwarded-proto') ?? 'https';
  const host = h.get('x-forwarded-host') ?? h.get('host') ?? '';
  return `${proto}://${host}`;
}

export default async function Page({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  await searchParams; // контракт Next 15
  const session = await auth();
  const meId = (session?.user as any)?.id as string | undefined;
  if (!meId) redirect('/sign-in');

  const origin = await getOrigin();

  // Подгружаем имена пользователей на сервере, чтобы сократить «мигание» на клиенте.
  async function fetchJson<T>(path: string, fallback: T): Promise<T> {
    const url = path.startsWith('http') ? path : `${origin}${path}`;
    try {
      const r = await fetch(url, { cache: 'no-store', next: { revalidate: 0 } });
      if (!r.ok) return fallback;
      const j = await r.json();
      return (j ?? fallback) as T;
    } catch {
      return fallback;
    }
  }

  type SimpleUser = { id: string; name: string | null; role?: string | null; roleSlug?: string | null };

  const users = await fetchJson<SimpleUser[]>('/api/users', []);

  return (
    <main style={{ padding: 14 }}>
      <CalendarBoard meId={meId} initialUsers={users} />
    </main>
  );
}
