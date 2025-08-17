// app/(app)/dashboard/page.tsx
import { auth } from '@/auth.config';
import s from './page.module.css';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

export default async function DashboardPage() {
  const session = await auth();
  const name = (session?.user as any)?.name ?? 'Пользователь';

  return (
    <main className={s.dashboardRoot}>
      <header className={s.header}>
        <h1 className={s.title}>Добро пожаловать, {name}</h1>
        <p className={s.subtitle}>Ваш персональный дашбоард</p>
      </header>

      <section className={s.widgets}>
        <div className={s.card}>
          <div className={s.cardTitle}>Новые задачи</div>
          <div className={s.cardBody}>Здесь появятся ваши актуальные задачи</div>
        </div>

        <div className={s.card}>
          <div className={s.cardTitle}>Чаты</div>
          <div className={s.cardBody}>Быстрый доступ к последним сообщениям</div>
        </div>

        <div className={s.card}>
          <div className={s.cardTitle}>Календарь</div>
          <div className={s.cardBody}>Ваши ближайшие события и встречи</div>
        </div>

        <div className={s.card}>
          <div className={s.cardTitle}>Статистика</div>
          <div className={s.cardBody}>Здесь будут аналитика и графики</div>
        </div>
      </section>
    </main>
  );
}
