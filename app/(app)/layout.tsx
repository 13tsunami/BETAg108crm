import { redirect } from 'next/navigation';
import type { ReactNode } from 'react';
import { auth } from '@/auth.config';
import Sidebar from '@/components/Sidebar';
import styles from './layout.module.css';

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
      </main>
    </div>
  );
}
