import { redirect } from 'next/navigation';
import { auth } from '@/auth.config';
import { canViewAdmin, normalizeRole } from '@/lib/roles';
import styles from './page.module.css';

export const dynamic = 'force-dynamic';

export default async function AdminStub() {
  const session = await auth();
  const role = normalizeRole((session?.user as any)?.role ?? null);
  if (!canViewAdmin(role)) redirect('/');

  return (
    <main className={styles.page}>
      <header className={`${styles.glass} ${styles.head}`}>
        <h1 className={styles.title}>Администрирование</h1>
        <p className={styles.subtitle}>доступ: {role || '—'}</p>
      </header>

      <section className={styles.info + ' ' + styles.glass}>
        <div className={styles.infoRow}>
          <span className={styles.infoKey}>панель</span>
          <span className={styles.infoVal}>доступ к инструментам управления системой</span>
        </div>
      </section>
    </main>
  );
}
