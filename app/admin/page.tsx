// app/admin/page.tsx
import { redirect } from 'next/navigation';
import { auth } from '@/auth.config';
import { canViewAdmin, normalizeRole } from '@/lib/roles';

export const dynamic = 'force-dynamic';

export default async function AdminStub() {
  const session = await auth();

  const role = normalizeRole((session?.user as any)?.role ?? null);

  if (!canViewAdmin(role)) {
    redirect('/');
  }

  return (
    <main className="p-6">
      <h1 className="text-xl font-semibold mb-2">Администрирование</h1>
      <p className="text-sm">Раздел доступен: {role}</p>
    </main>
  );
}
