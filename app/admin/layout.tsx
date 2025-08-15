// app/admin/layout.tsx
import { redirect } from 'next/navigation';
import type { ReactNode } from 'react';
import { auth } from '@/auth.config';
import { canViewAdmin, normalizeRole } from '@/lib/roles';
import Sidebar from '@/components/Sidebar';
import styles from './layout.module.css';

export const dynamic = 'force-dynamic';

export default async function AdminLayout({ children }: { children: ReactNode }) {
  const session = await auth();
  const role = normalizeRole((session?.user as any)?.role ?? null);

  if (!session) redirect('/sign-in');
  if (!canViewAdmin(role)) redirect('/');

  return (
    <div className={styles.appShell}>
      <aside className={styles.appSidebar}>
        <Sidebar />
      </aside>
      <main className={styles.appMain}>
        {children}
      </main>
    </div>
  );
}
