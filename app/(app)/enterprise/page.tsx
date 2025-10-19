import Link from 'next/link';
import { redirect } from 'next/navigation';
import { auth } from '@/auth.config';
import { normalizeRole } from '@/lib/roles';
import s from './page.module.css';
import { promises as fs } from 'node:fs';
import path from 'node:path';
import { deletePdfAction, renamePdfAction, toggleRestrictedAction } from './actions';
import { getUploadsBase } from '@/lib/storage';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

type Doc = { id: string; title: string; description?: string; href: string; external?: boolean };

const BASE = getUploadsBase();
const INDEX = 'enterprise.index.json';

const DOCS: readonly Doc[] = [
  {
    id: 'enterprise-card',
    title: 'Карточка предприятия',
    description:
      'Реквизиты МАОУ гимназия №108: ИНН/КПП, ОГРН, коды ОКПО/ОКТМО/ОКВЭД/ОКАТО, банковские реквизиты, контакты и директор.',
    href: '/docs/enterprise/enterprise-card.pdf',
  },
];

type IndexItem = { name: string; restricted: boolean; uploadedAt: number };
type IndexShape = { files: IndexItem[] };

async function readIndex(): Promise<IndexShape> {
  try {
    const raw = await fs.readFile(path.join(BASE, INDEX), 'utf8');
    const parsed = JSON.parse(raw) as IndexShape;
    return Array.isArray(parsed?.files) ? parsed : { files: [] };
  } catch {
    return { files: [] };
  }
}

function isDeputyOrHigher(role: string | null | undefined): boolean {
  const r = normalizeRole(role);
  return r === 'director' || r === 'deputy_plus' || r === 'deputy';
}
function isDeputyPlusOrHigher(role: string | null | undefined): boolean {
  const r = normalizeRole(role);
  return r === 'director' || r === 'deputy_plus';
}

export default async function EnterprisePage(
  { searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }
) {
  const session = await auth();
  if (!session) redirect('/');

  const role = normalizeRole((session.user as any)?.role ?? null);
  const deputyOrHigher = isDeputyOrHigher(role);
  const deputyPlusOrHigher = isDeputyPlusOrHigher(role);

  const sp = await searchParams;
  const qRaw = (Array.isArray(sp.q) ? sp.q[0] : sp.q) || '';
  const q = qRaw.normalize('NFC').toLowerCase().trim();

  const idx = await readIndex();

  let files = idx.files.slice();
  if (!deputyOrHigher) files = files.filter(f => !f.restricted);

  const total = files.length;

  if (q) files = files.filter(f => f.name.normalize('NFC').toLowerCase().includes(q));

  files.sort((a, b) => b.uploadedAt - a.uploadedAt);

  return (
    <main className={s.page}>
      <header className={`${s.glass} ${s.head}`}>
        <h1 className={s.title}>Служебные документы и образцы служебных документов</h1>
        <p className={s.subtitle}>доступ: {role || '—'}</p>

        <form method="GET" className={s.searchRow}>
          <input
            type="text"
            name="q"
            defaultValue={qRaw || ''}
            placeholder="Поиск по имени файла…"
            className={s.input}
          />
          <button className={s.primary} type="submit">Найти</button>
          {q ? <a className={s.ghost} href="/enterprise">Сброс</a> : null}
          <span className={s.searchHint}>
            {q ? `Найдено ${files.length} из ${total}` : `Всего: ${total}`}
          </span>
        </form>
      </header>

      <section className={s.grid}>
        {DOCS.map(d => (
          <article key={d.id} className={`${s.glass} ${s.card}`}>
            <div className={s.cardHead}>
              <span className={s.badge}>PDF</span>
              <h2 className={s.cardTitle}>{d.title}</h2>
            </div>
            {d.description ? <p className={s.cardDesc}>{d.description}</p> : null}
            <div className={s.actions}>
              <Link href={d.href} className={s.primary}>Открыть</Link>
              <Link href={d.href} download className={s.ghost}>Скачать</Link>
            </div>
          </article>
        ))}
      </section>

      <section className={s.grid} style={{ marginTop: 12 }}>
        {files.map(f => {
          const href = `/docs/enterprise/${f.name}`;
          const isRestricted = f.restricted === true;
          return (
            <article key={f.name} className={`${s.glass} ${s.card}`}>
              <div className={s.cardHead}>
                <span className={s.badge}>PDF</span>
                <h2 className={s.cardTitle}>{f.name}</h2>
                {deputyOrHigher && (
                  <span className={isRestricted ? s.flagRestricted : s.flagOpen}>
                    {isRestricted ? 'служебный' : 'открытый'}
                  </span>
                )}
              </div>

              <div className={s.actions}>
                <Link href={href} className={s.primary}>Открыть</Link>
                <Link href={href} download className={s.ghost}>Скачать</Link>
              </div>

              {deputyPlusOrHigher && (
                <>
                  <form action={renamePdfAction} className={s.manageRow}>
                    <input type="hidden" name="oldName" value={f.name} />
                    <input
                      type="text"
                      name="newName"
                      defaultValue={f.name}
                      className={s.input}
                      placeholder="новое имя (автоматически добавим .pdf)"
                      required
                    />
                    <button type="submit" className={s.btnSmall}>Переименовать</button>
                  </form>

                  <form action={toggleRestrictedAction} className={s.manageRow}>
                    <input type="hidden" name="name" value={f.name} />
                    <input type="hidden" name="next" value={isRestricted ? '0' : '1'} />
                    <button type="submit" className={s.btnSmall}>
                      {isRestricted ? 'Сделать открытым' : 'Сделать служебным'}
                    </button>
                  </form>

                  <form action={deletePdfAction} className={s.manageRow}>
                    <input type="hidden" name="name" value={f.name} />
                    <button type="submit" className={s.btnSmallDanger}>Удалить</button>
                  </form>
                </>
              )}
            </article>
          );
        })}
      </section>

      {files.length === 0 && (
        <div className={`${s.glass} ${s.head}`} style={{ marginTop: 12 }}>
          <p className={s.subtitle}>Документы не найдены. Загрузите файлы или измените запрос поиска.</p>
        </div>
      )}
    </main>
  );
}
