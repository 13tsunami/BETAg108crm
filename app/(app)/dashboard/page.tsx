import { redirect } from 'next/navigation';
import { auth } from '@/auth.config';
import styles from './page.module.css';

export default async function Dashboard() {
  const session = await auth();
  if (!session) redirect('/sign-in');

  return (
    <section className={styles.page}>
      <header className={`${styles.glass} ${styles.head}`}>
        <h1 className={styles.title}>Дашборд</h1>
        <p className={styles.subtitle}>стартовая страница после входа</p>
      </header>

      <div className={styles.grid}>
        <div className={styles.card}>
          <div className={styles.cardTitle}>сводка</div>
          <div className={styles.cardText}>здесь появятся ваши виджеты и показатели</div>
        </div>
        <div className={styles.card}>
          <div className={styles.cardTitle}>обновления</div>
          <div className={styles.cardText}>история действий и системные уведомления</div>
        </div>
      </div>
    </section>
  );
}
