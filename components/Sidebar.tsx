// components/Sidebar.tsx
'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useSession, signOut } from 'next-auth/react';
import { useEffect, useState } from 'react';

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
    <Link href={href} className="navlink" aria-current={active ? 'true' : undefined}>
      <div className={`tile glass ${active ? 'active' : ''} ${showBadge ? 'unread' : ''}`}>
        <span className={`label ${isSingleLongWord ? 'label--single' : 'label--multi'}`}>{label.toLowerCase()}</span>
        {showBadge ? <span className="badge">{unread! > 99 ? '99+' : unread}</span> : null}
      </div>
      <style jsx>{`
        .navlink { display:block; text-decoration:none !important; }
        .tile { position: relative; display: grid; place-items: center; text-align: center; width: 78%; margin: 0 auto;
                aspect-ratio: 1 / 1; border-radius: 14px; border: 1px solid rgba(229,231,235,.8); overflow: hidden;
                cursor: pointer; transition: transform .12s, border-color .12s, box-shadow .12s; }
        .glass { background: linear-gradient(180deg, rgba(255,255,255,.68), rgba(255,255,255,.4));
                 backdrop-filter: saturate(180%) blur(10px); -webkit-backdrop-filter: saturate(180%) blur(10px);
                 box-shadow: 0 4px 12px rgba(0,0,0,.06), inset 0 1px 0 rgba(255,255,255,.35); }
        .tile::before { content: ""; position: absolute; inset: -35% -35% auto -35%; height: 55%;
                        background: radial-gradient(120px 40px at 10% 0%, rgba(255,255,255,.55), rgba(255,255,255,0) 60%),
                                    linear-gradient(90deg, rgba(255,255,255,.35), rgba(255,255,255,0.06));
                        opacity: 0; transform: translateY(-10%); transition: opacity .16s, transform .2s; z-index:1; }
        .tile:hover { transform: translateY(-1px); border-color:#cfe3ff; box-shadow:0 8px 18px rgba(0,0,0,.08); }
        .tile:hover::before { opacity: 1; transform: translateY(0); }
        .tile.active { outline: 2px solid rgba(207,227,255,.9); }
        .tile.unread::after { content:""; position:absolute; left:0; top:0; height:3px; width:100%; background:#ef9b28; z-index:2; }
        .label { position:relative; z-index:3; color:#0f172a; font-weight:700; line-height:1.08;
                 display:-webkit-box; -webkit-box-orient:vertical; overflow:hidden; line-clamp: 2; -webkit-line-clamp: 2; }
        .label--multi { font-size:12px; letter-spacing:.01em; }
        .label--single { font-size:11px; letter-spacing:.01em; font-stretch:95%; }
        .badge { position:absolute; right:6px; top:6px; font-size:10.5px; line-height:18px; min-width:22px; text-align:center;
                 padding:0 6px; border-radius:9999px; background:${BRAND}; color:#fff; font-weight:800; box-shadow:0 1px 4px rgba(0,0,0,.12); }
      `}</style>
    </Link>
  );
}

export default function Sidebar({
  unreadChats = 0,
  // НОВОЕ: счётчик задач по образцу сообщений
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

  // ===== чаты (как было) =====
  const [unread, setUnread] = useState(unreadChats);
  useEffect(() => setUnread(unreadChats), [unreadChats]);
  useEffect(() => {
    const onBump = () => setUnread(x => x + 1);
    window.addEventListener('app:unread-bump', onBump as any);
    return () => window.removeEventListener('app:unread-bump', onBump as any);
  }, []);

  // ===== задачи (НОВОЕ, аналогично чатам) =====
  const [tasksUnread, setTasksUnread] = useState(unreadTasks);
  useEffect(() => setTasksUnread(unreadTasks), [unreadTasks]);
  useEffect(() => {
    // универсальные события для задач: можно дергать из любого места клиента
    const onSet = (e: Event) => {
      const detail = (e as CustomEvent).detail;
      if (typeof detail === 'number') setTasksUnread(detail);
    };
    const onBump = () => setTasksUnread(x => x + 1);

    window.addEventListener('tasks:unread-set', onSet as any);
    window.addEventListener('tasks:unread-bump', onBump as any);
    return () => {
      window.removeEventListener('tasks:unread-set', onSet as any);
      window.removeEventListener('tasks:unread-bump', onBump as any);
    };
  }, []);

  return (
    <aside className="wrap">
      <div className="head glass">
        <div className="who" title={(data?.user?.name as string) || 'Гость'}>
          <div className="fio">
            <div className="last" style={{ display:'flex', alignItems:'center', gap:8 }}>
              {fio.last}
              {authed && (
                <Link href="/settings" aria-label="Настройки" className="gear">
                  <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden>
                    <path d="M12 15.5a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7Z" stroke="currentColor" fill="none" strokeWidth="2"/>
                    <path d="M19.4 15a1.7 1.7 0 0 0 .34 1.87l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06A1.7 1.7 0 0 0 15 19.4a1.7 1.7 0 0 0-1 .6l-.05.06a2 2 0 1 1-3-.01l-.05-.05a1.7 1.7 0 0 0-1-.6 1.7 1.7 0 0 0-1.87.34l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06A1.7 1.7 0 0 0 4.6 15a1.7 1.7 0 0 0-.6-1l-.06-.05a2 2 0 1 1 .01-3l.05-.05a1.7 1.7 0 0 0 .6-1A1.7 1.7 0 0 0 4.6 4.6l-.06-.06A2 2 0 1 1 7.37 1.7l.06.06A1.7 1.7 0 0 0 9 2.6a1.7 1.7 0 0 0 1-.6l.05-.06a2 2 0 1 1 3 .01l.05.05a1.7 1.7 0 0 0 1 .6 1.7 1.7 0 0 0 1.87-.34l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.7 1.7 0 0 0-.6 1c0 .38.2.74.6 1.13.22.22.41.47.56.74.15.27.26.56.31.86Z" stroke="currentColor" fill="none" strokeWidth="1.5"/>
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
              <Link className="exit" href="/sign-in">войти</Link>
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
              <Tile href="/chat"        label="Чаты"        active={pathname === '/chat'} unread={pathname === '/chat' ? 0 : unread} />
              {/* НОВОЕ: счётчик задач по образцу чатов */}
              <Tile href="/inboxtasks"  label="Задачи"      active={pathname === '/inboxtasks'} unread={pathname === '/inboxtasks' ? 0 : tasksUnread} />
              <Tile href="/calendar"    label="Календарь"   active={pathname === '/calendar'} />
              <Tile href="/schedule"    label="Расписание"  active={pathname === '/schedule'} />
              <Tile href="/inboxtasks/archive" label="Архив задач" active={pathname === '/inboxtasks/archive'} />
              <Tile href="/discussions" label="Обсуждения"  active={pathname === '/discussions'} />
            </div>

            {['director','deputy_plus','Директор','Заместитель +'].includes(roleSlug || '') && (
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
        .wrap { box-sizing:border-box; width:280px; height:100%; display:grid; grid-template-rows:auto 1fr;
                border-right:1px solid #e5e7eb; background:#fff; overflow-x:hidden; }
        .head { display:flex; align-items:center; min-height:96px; padding:12px; border-bottom:1px solid rgba(229,231,235,.85); position:relative; }
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
        .exit { height:30px; padding:0 12px; border-radius:10px; border:1px solid rgba(229,231,235,.9); background:#fff; cursor:pointer; }
        .nav { padding:10px; }
        .grid { display:grid; grid-template-columns:repeat(2, minmax(0,1fr)); gap:8px; }
        .adminTitle { margin:12px 4px 6px; font-size:12px; color:#6b7280; font-weight:700; }
        :global(.wrap a), :global(.wrap a *), .label { text-decoration:none !important; }
      `}</style>
    </aside>
  );
}
