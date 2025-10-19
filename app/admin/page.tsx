import Link from 'next/link';
import { redirect } from 'next/navigation';
import { auth } from '@/auth.config';
import { canViewAdmin, normalizeRole } from '@/lib/roles';
import styles from './page.module.css';
import { uploadEnterprisePdfAction } from './actions';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

export default async function AdminPage() {
  const session = await auth();
  const role = normalizeRole((session?.user as any)?.role ?? null);
  if (!canViewAdmin(role)) redirect('/');

  return (
    <main className={styles.page}>
      <header className={`${styles.glass} ${styles.head}`}>
        <h1 className={styles.title}>Администрирование</h1>
        <p className={styles.subtitle}>доступ: {role || '—'}</p>
      </header>

      <section className={`${styles.info} ${styles.glass}`}>
        <div className={styles.infoRow}>
          <span className={styles.infoKey}>панель</span>
          <span className={styles.infoVal}>доступ к инструментам управления системой</span>
        </div>

        <div className={styles.infoRow}>
          <span className={styles.infoKey}>enterprise</span>
          <span className={styles.infoVal}>
            <Link href="/enterprise" className={styles.linkAccent}>
              служебные документы и реквизиты
            </Link>
          </span>
        </div>
      </section>

      <section className={styles.tiles}>
        <article className={`${styles.tile} ${styles.glass}`}>
          <div className={styles.tileHead}>
            <h2 className={styles.tileTitle}>Enterprise</h2>
            <span className={styles.badge}>Документы</span>
          </div>
          <p className={styles.tileDesc}>
            Просмотр документов. Раздача по адресу <code>/docs/enterprise/&lt;имя-файла&gt;</code>.
          </p>
          <div className={styles.tileActions}>
            <Link href="/enterprise" className={styles.btnPrimary}>Открыть раздел</Link>
            <a href="/docs/enterprise/enterprise-card.pdf" className={styles.btnGhost}>Карточка предприятия</a>
          </div>
        </article>

        <article className={`${styles.tile} ${styles.glass}`}>
          <div className={styles.tileHead}>
            <h2 className={styles.tileTitle}>Загрузка документов</h2>
            <span className={styles.badge}>PDF/DOC/XLS/JPG/PNG</span>
          </div>
          <p className={styles.tileDesc}>
            Файл сохраняется в базовый каталог хранения и будет доступен как
            <code> /docs/enterprise/&lt;имя&gt;</code>.
          </p>

          <form action={uploadEnterprisePdfAction} className={styles.formGrid}>
            <label className={styles.formRow}>
              <span className={styles.formKey}>имя файла</span>
              <input
                type="text"
                name="name"
                placeholder="например: приказ-01.docx (можно оставить пустым)"
                className={styles.input}
              />
            </label>

            <label className={styles.formRow}>
              <span className={styles.formKey}>служебный</span>
              <input type="checkbox" name="restricted" value="1" />
            </label>

            <label className={styles.formRow}>
              <span className={styles.formKey}>файл</span>
              <input
                type="file"
                name="file"
                required
                className={styles.input}
                accept=".pdf,.doc,.docx,.xls,.xlsx,.ppt,.pptx,.jpg,.jpeg,.png,application/pdf,application/msword,application/vnd.openxmlformats-officedocument.wordprocessingml.document,application/vnd.ms-excel,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,application/vnd.ms-powerpoint,application/vnd.openxmlformats-officedocument.presentationml.presentation,image/jpeg,image/png"

              />
            </label>

            <div className={styles.formActions}>
              <button type="submit" className={styles.btnPrimary}>Загрузить</button>
              <span className={styles.hint}>
                после загрузки: <code>ваши файлы окажутся в "документация"</code>
              </span>
            </div>
          </form>
        </article>
      </section>
    </main>
  );
}
