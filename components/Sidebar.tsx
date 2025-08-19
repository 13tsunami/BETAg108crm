// components/Sidebar.tsx
'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useSession, signOut } from 'next-auth/react';
import { useEffect, useMemo, useState } from 'react';

const BRAND = '#8d2828';

const ROLE_RU: Record<string, string> = {
  admin: 'Администратор',
  director: 'Директор',
  deputy_plus: 'Заместитель +',
  deputy: 'Заместитель',
  teacher_plus: 'Педагог +',
  teacher: 'Педагог',
};

function splitFio(full?: string | null) {
  const s = (full || '').trim();
  if (!s) return { last: 'ГОСТЬ', rest: '' };
  const p = s.split(/\s+/);
  if (p.length >= 2) return { last: (p[0] || '').toUpperCase(), rest: p.slice(1).join(' ') };
  return { last: s.toUpperCase(), rest: '' };
}

function Tile({
  href, label, active, unread,
}: { href: string; label: string; active?: boolean; unread?: number }) {
  const showBadge = typeof unread === 'number' && unread > 0 && !active;
  const isSingleLongWord = !/\s/.test(label) && label.length >= 9;
  return (
    <Link href={href} className="navlink" aria-current={active ? 'true' : undefined} prefetch={false}>
      <div className={`tile glass ${active ? 'active' : ''} ${showBadge ? 'unread' : ''}`}>
        <span className={`label ${isSingleLongWord ? 'label--single' : 'label--multi'}`}>{label.toLowerCase()}</span>
        {showBadge ? <span className="badge">{unread! > 99 ? '99+' : unread}</span> : null}
      </div>
      <style jsx>{`
        .navlink { display:block; text-decoration:none !important; }
        .tile {
          position: relative; display: grid; place-items: center; text-align: center;
          width: 78%; margin: 0 auto; aspect-ratio: 1 / 1; border-radius: 14px;
          border: 1px solid rgba(229,231,235,.8); overflow: hidden; cursor: pointer;
          transition: transform .16s ease, border-color .16s ease, box-shadow .16s ease, background .16s ease;
        }
        .glass {
          background: linear-gradient(180deg, rgba(255,255,255,.68), rgba(255,255,255,.4));
          backdrop-filter: saturate(180%) blur(10px); -webkit-backdrop-filter: saturate(180%) blur(10px);
          box-shadow: 0 4px 12px rgba(0,0,0,.06), inset 0 1px 0 rgba(255,255,255,.35);
        }
        .tile::before {
          content: ""; position: absolute; inset: -35% -35% auto -35%; height: 55%;
          background: radial-gradient(120px 40px at 10% 0%, rgba(255,255,255,.55), rgba(255,255,255,0) 60%),
                      linear-gradient(90deg, rgba(255,255,255,.35), rgba(255,255,255,0.06));
          opacity: 0; transform: translateY(-10%); transition: opacity .2s, transform .2s; z-index:1;
        }
        .tile:hover {
          transform: translateY(-1px);
          border-color: rgba(141,40,40,.35);
          box-shadow: 0 8px 18px rgba(0,0,0,.08);
          background:
            linear-gradient(180deg, rgba(141,40,40,.08), rgba(141,40,40,.03)),
            linear-gradient(180deg, rgba(255,255,255,.68), rgba(255,255,255,.4));
        }
        .tile:hover::before { opacity: 1; transform: translateY(0); }
        .tile.active { outline: 2px solid rgba(141,40,40,.35); }
        .tile.unread::after { content:""; position:absolute; left:0; top:0; height:3px; width:100%; background:#ef9b28; z-index:2; }
        .label { position:relative; z-index:3; color:#0f172a; font-weight:700; line-height:1.08;
                 display:-webkit-box; -webkit-box-orient:vertical; overflow:hidden; line-clamp: 2; -webkit-line-clamp: 2; }
        .label--multi { font-size:12px; letter-spacing:.01em; }
        .label--single { font-size:11px; letter-spacing:.01ем; font-stretch:95%; }
        .badge {
          position:absolute; right:6px; top:6px; font-size:10.5px; line-height:18px; min-width:22px; text-align:center;
          padding:0 6px; border-radius:9999px; background:${BRAND}; color:#fff; font-weight:800; box-shadow:0 1px 4px rgba(0,0,0,.12);
        }
      `}</style>
    </Link>
  );
}

export default function Sidebar({
  unreadChats = 0,
  unreadTasks = 0,
}: {
  unreadChats?: number;
  unreadTasks?: number;
}) {
  const pathname = usePathname();
  const { data } = useSession();
  const authed = Boolean(data?.user);
  const roleSlug = (data?.user as any)?.role as string | null;
  const roleRu = roleSlug ? (ROLE_RU[roleSlug] ?? roleSlug) : null;
  const hasAdminBlock = ['director', 'deputy_plus', 'Директор', 'Заместитель +'].includes(roleSlug || '');
  const fio = splitFio((data?.user?.name as string) || null);

  const [collapsed, setCollapsed] = useState(false);

  // старт: на узких экранах свернуто
  useEffect(() => {
    const preferCollapsed =
      typeof window !== 'undefined' &&
      typeof window.matchMedia === 'function' &&
      window.matchMedia('(max-width: 900px)').matches;
    setCollapsed(preferCollapsed);
  }, []);

  // вместо класса — data-атрибут на #app-shell (работает с CSS‑модулем)
  useEffect(() => {
    const shell = document.getElementById('app-shell');
    if (!shell) return;
    if (collapsed) shell.setAttribute('data-collapsed', 'true');
    else shell.removeAttribute('data-collapsed');
  }, [collapsed]);

  // счётчики (как было)
  const [unread, setUnread] = useState(unreadChats);
  useEffect(() => setUnread(unreadChats), [unreadChats]);
  useEffect(() => {
    const onBump = () => setUnread(x => x + 1);
    window.addEventListener('app:unread-bump', onBump as any);
    return () => window.removeEventListener('app:unread-bump', onBump as any);
  }, []);
  const [tasksUnread, setTasksUnread] = useState(unreadTasks);
  useEffect(() => setTasksUnread(unreadTasks), [unreadTasks]);
  useEffect(() => {
    const onSet = (e: Event) => {
      const d = (e as CustomEvent).detail;
      if (typeof d === 'number') setTasksUnread(d);
    };
    const onBump = () => setTasksUnread(x => x + 1);
    window.addEventListener('tasks:unread-set', onSet as any);
    window.addEventListener('tasks:unread-bump', onBump as any);
    return () => {
      window.removeEventListener('tasks:unread-set', onSet as any);
      window.removeEventListener('tasks:unread-bump', onBump as any);
    };
  }, []);

  const ArrowIcon = useMemo(() => (
    collapsed ? (
      <svg width="16" height="16" viewBox="0 0 24 24" aria-hidden>
        <path d="M9 6l6 6-6 6" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
      </svg>
    ) : (
      <svg width="16" height="16" viewBox="0 0 24 24" aria-hidden>
        <path d="M15 6l-6 6 6 6" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
      </svg>
    )
  ), [collapsed]);

  return (
    <aside className={`wrap ${collapsed ? 'collapsed' : ''}`}>
      <button
        type="button"
        className="toggle"
        aria-label={collapsed ? 'Развернуть сайдбар' : 'Свернуть сайдбар'}
        onClick={() => setCollapsed(v => !v)}
      >
        {ArrowIcon}
      </button>

      <div className="head glass">
        <div className="who" title={(data?.user?.name as string) || 'Гость'}>
          <div className="fio">
            <div className="last" style={{ display:'flex', alignItems:'center', gap:8 }}>
              {fio.last}
              {authed && (
                <Link href="/settings" aria-label="Настройки" className="gear" prefetch={false}>
                  <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden>
                    <path d="M12 15.5a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7Z" stroke="currentColor" fill="none" strokeWidth="2"/>
                    <path d="M19.4 15a1.7 1.7 0 0 0 .34 1.87l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06A1.7 1.7 0 0 0 15 19.4a1.7 1.7 0 0 0-1 .6l-.05.06a2 2 0 1 1-3-.01l-.05-.05a1.7 1.7 0 0 0-1-.6 1.7 1.7 0 0 0-1.87.34l.06-.06a2 2 0 1 1 2.83-2.83l.06-.06a1.7 1.7 0 0 0-.6 1c0 .38.2.74.6 1.13.22.22.41.47.56.74.15.27.26.56.31.86Z" stroke="currentColor" fill="none" strokeWidth="1.5"/>
                  </svg>
                </Link>
              )}
            </div>
            {fio.rest ? <div className="rest">{fio.rest}</div> : null}
          </div>
          <div className="metaRow">
            {roleRu && <div className="rolePill">{roleRu}</div>}
            {authed ? (
              <button className="exit" onClick={() => signOut({ callbackUrl: '/sign-in' })}>выйти</button>
            ) : (
              <Link className="exit" href="/sign-in" prefetch={false}>войти</Link>
            )}
          </div>
        </div>
      </div>

      <nav className="nav">
        {authed && (
          <>
            <div className="grid">
              <Tile href="/dashboard"   label="Главное"     active={pathname === '/dashboard'} />
              <Tile href="/teachers"    label="Педагоги"    active={pathname === '/teachers'} />
              <Tile href="/inboxtasks"  label="Задачи"      active={pathname === '/inboxtasks'} unread={pathname === '/inboxtasks' ? 0 : tasksUnread} />
              <Tile href="/calendar"    label="Календарь"   active={pathname === '/calendar'} />
              <Tile href="/schedule"    label="Расписание"  active={pathname === '/schedule'} />
              <Tile href="/inboxtasks/archive" label="Архив задач" active={pathname === '/inboxtasks/archive'} />
            </div>

            {hasAdminBlock && (
              <>
                <div className="adminTitle">Администрирование</div>
                <div className="grid">
                  <Tile href="/admin"           label="Админ-панель" active={pathname === '/admin'} />
                  <Tile href="/admin/db-status" label="Статус БД"    active={pathname === '/admin/db-status'} />
                  <Tile href="/groups"          label="Кафедры"      active={pathname === '/groups'} />
                  <Tile href="/admin/cleanup"   label="Очистка базы" active={pathname === '/admin/cleanup'} />
                </div>
              </>
            )}
          </>
        )}
      </nav>

      <style jsx>{`
        .wrap {
          box-sizing:border-box; width:var(--sbw, 280px); height:100%;
          display:grid; grid-template-rows:auto 1fr;
          border-right:1px solid #e5e7eb; background:#fff; overflow:visible; position:relative;
          transition: width .24s ease;
        }
        .wrap.collapsed { width:56px; }
        .head { display:flex; align-items:center; min-height:96px; padding:12px; border-bottom:1px solid rgba(229,231,235,.85); position:relative; transition: opacity .2s ease; }
        .wrap.collapsed .head, .wrap.collapsed .nav { opacity:0; pointer-events:none; visibility:hidden; }
        .head::after { content:""; position:absolute; left:0; right:0; bottom:-1px; height:2px; background:${BRAND}; opacity:.12; }
        .glass { background:rgba(255,255,255,.55); backdrop-filter:saturate(180%) blur(10px); -webkit-backdrop-filter:saturate(180%) blur(10px); }
        .who { min-width:0; width:100%; display:grid; gap:6px; }
        .fio { line-height:1.08; }
        .last { font-weight:900; font-size:20px; letter-spacing:.4px; white-space:nowrap; overflow:hidden; text-overflow:ellipsis; }
        .rest { font-weight:700; font-size:15px; color:#111827; white-space:nowrap; overflow:hidden; text-overflow:ellipsis; }
        .gear { display:inline-flex; align-items:center; justify-content:center; width:28px; height:28px; border-radius:8px;
                border:1px solid rgba(229,231,235,.9); background:#fff; color:#0f172a; }
        .gear:hover { background:#fafafa; }
        .metaRow { display:flex; align-items:center; justify-content:space-between; gap:8px; }
        .rolePill { font-size:12px; padding:2px 8px; border-radius:9999px; border:1px solid rgba(229,231,235,.9); background:rgba(255,255,255,.6); }

        .exit {
          height:30px; padding:0 12px; border-radius:10px;
          border:1px solid ${BRAND}; background:${BRAND}; color:#fff; cursor:pointer; font-weight:700;
          transition: filter .15s ease, transform .08s ease;
          text-decoration:none !important; display:inline-flex; align-items:center; justify-content:center;
        }
        .exit:hover { filter: brightness(0.95); }
        .exit:active { transform: translateY(1px); }

        .nav { padding:10px; transition: opacity .2s ease; }
        .grid { display:grid; grid-template-columns:repeat(2, minmax(0,1fr)); gap:8px; }
        .adminTitle { margin:12px 4px 6px; font-size:12px; color:#6b7280; font-weight:700; }
        :global(.wrap a), :global(.wrap a *), .label { text-decoration:none !important; }

        .toggle {
  position:absolute; top:50%; right:-16px; transform:translateY(-50%);
  width:32px; height:32px; border-radius:9999px;
  border:1px solid rgba(229,231,235,.9);
  background: linear-gradient(180deg, rgba(255,255,255,.68), rgba(255,255,255,.4));
  backdrop-filter: saturate(180%) blur(10px);
  -webkit-backdrop-filter: saturate(180%) blur(10px);
  box-shadow: 0 8px 24px rgba(0,0,0,.08);
  color:#0f172a; display:grid; place-items:center;
  cursor:pointer;
  transition: transform .18s ease, box-shadow .18s ease, border-color .18s ease, background .18s ease;
  z-index:1000;          /* ← увеличил, чтобы не перекрывалось контентом */
}

        .toggle:hover {
          box-shadow: 0 10px 28px rgba(0,0,0,.10);
          border-color: rgba(141,40,40,.35);
          background:
            radial-gradient(60% 60% at 50% 20%, rgba(141,40,40,.10), rgba(141,40,40,0) 70%),
            linear-gradient(180deg, rgba(255,255,255,.68), rgba(255,255,255,.4));
        }
      `}</style>
    </aside>
  );
}
