// app/(app)/layout.tsx
import { redirect } from 'next/navigation';
import type { ReactNode } from 'react';
import { auth } from '@/auth.config';
import Sidebar from '@/components/Sidebar';
import styles from './layout.module.css';

// ➕ вот это добавь:
import Heartbeat from './heartbeat/Heartbeat';
import { heartbeat } from './heartbeat/actions';

export default async function AppLayout({ children }: { children: ReactNode }) {
  const session = await auth();
  if (!session) redirect('/sign-in');

  return (
    <div className={styles.appShell}>
      <aside className={styles.appSidebar}>
        <Sidebar />
      </aside>
      <main className={styles.appMain}>
        {children}
        {/* ➕ тихий пульс раз в минуту */}
        <Heartbeat action={heartbeat} intervalMs={60_000} />
      </main>
    </div>
  );
}
