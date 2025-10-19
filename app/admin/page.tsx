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
      <div className={styles.container}>
        <header className={`${styles.glass} ${styles.head}`}>
          <div>
            <h1 className={styles.title}>Администрирование документов</h1>
            <p className={styles.subtitle}>доступ: РАЗРЕШЁН</p>
          </div>
         </header>

       <section className={styles.tiles} aria-label="Инструменты">
          <article className={`${styles.tile} ${styles.glass}`}>
            <div className={styles.tileHead}>
              <h3 className={styles.tileTitle}>Документация</h3>
              <span className={styles.badge}>Документы</span>
            </div>
            <p className={styles.tileDesc}>
              Просмотр документов.
              </p>
            <div className={styles.tileActions}>
              <Link href="/enterprise" className={styles.btnPrimary} prefetch>Открыть раздел</Link>
              <a href="/docs/enterprise/enterprise-card.pdf" className={styles.btnGhost}>
                Карточка предприятия
              </a>
            </div>
          </article>

          <article className={`${styles.tile} ${styles.glass}`}>
            <div className={styles.tileHead}>
              <h3 className={styles.tileTitle}>Загрузка документов</h3>
              <span className={styles.badge}>PDF/DOC/XLS/JPG/PNG</span>
            </div>

            <p className={styles.tileDesc}>
              Файл сохраняется в базовый каталог документации. При выставлении флага "ограничить доступ по ролям"
              доступ к файлу смогут получить только пользователи с ролью «заместитель директора» и выше.
            </p>

            <form action={uploadEnterprisePdfAction} className={styles.formGrid}>
              <label className={styles.formRow} htmlFor="file-name">
                <span className={styles.formKey}>имя файла</span>
                <div className={styles.formCol}>
                  <input
                    id="file-name"
                    type="text"
                    name="name"
                    placeholder="например: приказ-01.docx (можно оставить пустым)"
                    className={styles.input}
                    inputMode="text"
                    autoComplete="off"
                  />
                  <small className={styles.help}>Если пусто — возьмём имя исходного файла без изменений.</small>
                </div>
              </label>

              <div className={styles.formRow}>
                <span className={styles.formKey}>служебный</span>
                <div className={styles.formColInline}>
                  <input id="restricted" type="checkbox" name="restricted" value="1" />
                  <label htmlFor="restricted" className={styles.checkboxLabel}>
                    ограничить доступ по ролям
                  </label>
                </div>
              </div>

              <label className={styles.formRow} htmlFor="file">
                <span className={styles.formKey}>файл</span>
                <div className={styles.formCol}>
                  <input
                    id="file"
                    type="file"
                    name="file"
                    required
                    className={styles.input}
                    aria-describedby="file-hint"
                    accept=".pdf,.doc,.docx,.xls,.xlsx,.ppt,.pptx,.jpg,.jpeg,.png,application/pdf,application/msword,application/vnd.openxmlformats-officedocument.wordprocessingml.document,application/vnd.ms-excel,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,application/vnd.ms-powerpoint,application/vnd.openxmlformats-officedocument.presentationml.presentation,image/jpeg,image/png"
                  />
                  <small id="file-hint" className={styles.help}>
                    Допустимые типы: PDF, DOC(X), XLS(X), PPT(X), JPG, PNG. Максимум ~50 МБ.
                  </small>
                </div>
              </label>

              <div className={styles.formActions}>
                <button type="submit" className={styles.btnPrimary}>Загрузить</button>
                <span className={styles.hint}>
                  после загрузки: <code>файлы окажутся в «документация»</code>
                </span>
              </div>
            </form>
          </article>
        </section>
      </div>
    </main>
  );
}
