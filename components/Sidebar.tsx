// components/Sidebar.tsx
'use client';

import Link from 'next/link';
import Image from 'next/image';
import { usePathname } from 'next/navigation';
import { useSession, signOut } from 'next-auth/react';
import { useEffect, useMemo, useState } from 'react';
import { ROLE_LABELS } from '@/lib/roleLabels';
import { normalizeRole, canViewAdmin, type Role } from '@/lib/roles';

const BRAND = '#8d2828';

function splitFio(full?: string | null) {
  const s = (full || '').trim();
  if (!s) return { last: 'ГОСТЬ', rest: '' };
  const p = s.split(/\s+/);
  if (p.length >= 2) return { last: (p[0] || '').toUpperCase(), rest: p.slice(1).join(' ') };
  return { last: s.toUpperCase(), rest: '' };
}

function GearIcon({ size = 18 }: { size?: number }) {
  return (
    <svg viewBox="0 0 24 24" width={size} height={size} aria-hidden focusable="false" style={{ display: 'block' }}>
      <g fill="currentColor">
        <path
          fillRule="evenodd"
          d="M12 2.5a9.5 9.5 0 1 1 0 19a9.5 9.5 0 1 1 0 -19M12 8a4 4 0 1 0 0 8a4 4 0 1 0 0 -8"
          clipRule="evenodd"
        />
        <rect x="10.75" y="0.5" width="2.5" height="4.2" rx="1" />
        <rect x="10.75" y="19.3" width="2.5" height="4.2" rx="1" />
        <rect x="19.3" y="10.75" width="4.2" height="2.5" rx="1" />
        <rect x="0.5" y="10.75" width="4.2" height="2.5" rx="1" />
        <rect x="17.15" y="2.15" width="2.6" height="4.2" rx="1" transform="rotate(45 18.45 4.25)" />
        <rect x="4.25" y="17.15" width="2.6" height="4.2" rx="1" transform="rotate(45 5.55 19.25)" />
        <rect x="17.15" y="17.15" width="2.6" height="4.2" rx="1" transform="rotate(135 18.45 19.25)" />
        <rect x="4.25" y="2.15" width="2.6" height="4.2" rx="1" transform="rotate(135 5.55 4.25)" />
      </g>
    </svg>
  );
}

function Tile({
  href,
  label,
  active,
  unread,
}: {
  href: string;
  label: string;
  active?: boolean;
  unread?: number;
}) {
  const showBadge = typeof unread === 'number' && unread > 0 && !active;
  const isSingleLongWord = !/\s/.test(label) && label.length >= 9;

  return (
    <Link href={href} className="navlink" aria-current={active ? 'true' : undefined} prefetch={false}>
      <div className={`tile glass ${active ? 'active' : ''} ${showBadge ? 'unread' : ''}`}>
        <span className={`label ${isSingleLongWord ? 'label--single' : 'label--multi'}`}>
          {label.toLowerCase()}
        </span>
        {showBadge ? <span className="badge">{unread! > 99 ? '99+' : unread}</span> : null}
      </div>

      <style jsx>{`
        .navlink { display: block; text-decoration: none !important; }
        .tile {
          position: relative;
          display: grid;
          place-items: center;
          text-align: center;
          width: 78%;
          margin: 0 auto;
          aspect-ratio: 1 / 1;
          border-radius: 14px;
          border: 1px solid var(--glass-stroke);
          overflow: hidden;
          cursor: pointer;
          transition: transform .16s ease, border-color .16s ease, box-shadow .16s ease, background .16s ease;
          box-shadow: var(--shadow-sm), var(--inset);
        }
        .glass {
          background:
            linear-gradient(180deg,
              color-mix(in oklab, var(--glass-soft) 92%, transparent),
              color-mix(in oklab, var(--glass-soft) 84%, transparent));
          -webkit-backdrop-filter: blur(10px) saturate(1.2);
          backdrop-filter: blur(10px) saturate(1.2);
        }
        .tile:hover {
          transform: translateY(-1px);
          border-color: var(--brand-stroke);
          box-shadow: 0 14px 26px rgba(15,23,42,.12), var(--inset);
          background:
            linear-gradient(180deg,
              color-mix(in oklab, var(--brand) 6%, #ffffff),
              color-mix(in oklab, var(--brand) 3%, #ffffff));
        }
        .tile.active { outline: 3px solid color-mix(in oklab, var(--brand) 22%, transparent); outline-offset: -3px; }
        .tile.unread::after { content:""; position:absolute; left:0; top:0; height:3px; width:100%; background:#ef9b28; z-index:2; }

        .label {
          position: relative;
          z-index: 3;
          color: var(--ink);
          font-weight: 800;
          line-height: 1.08;
          display: -webkit-box;
          -webkit-box-orient: vertical;
          overflow: hidden;
          line-clamp: 2;
          -webkit-line-clamp: 2;
          text-transform: lowercase;
          letter-spacing: .01em;
        }
        .label--multi { font-size: 12px; }
        .label--single { font-size: 11px; font-stretch: 95%; }

        .badge {
          position: absolute;
          right: 6px;
          top: 6px;
          font-size: 10.5px;
          line-height: 18px;
          min-width: 22px;
          text-align: center;
          padding: 0 6px;
          border-radius: 9999px;
          background: ${BRAND};
          color: #fff;
          font-weight: 800;
          box-shadow: 0 6px 14px rgba(141,40,40,.28), inset 0 1px 0 rgba(255,255,255,.6);
        }
      `}</style>
    </Link>
  );
}

export default function Sidebar({
  unreadChats = 0,
  unreadTasks = 0,
  unreadReviews = 0,
  unreadDiscussions = 0,
  unreadRequests = 0,
}: {
  unreadChats?: number;
  unreadTasks?: number;
  unreadReviews?: number;
  unreadDiscussions?: number;
  unreadRequests?: number;
}) {
  const pathname = usePathname();
  const { data } = useSession();
  const authed = Boolean(data?.user);

  const roleSlug = (data?.user as any)?.role as string | null;
  const roleNorm = normalizeRole(roleSlug);
  const roleRu = roleNorm ? (ROLE_LABELS[roleNorm as Role] ?? roleNorm) : null;

  const hasAdminBlock = canViewAdmin(roleNorm);
  const fio = splitFio((data?.user?.name as string) || null);

  const myTeacherUrl = useMemo(() => {
    const id = (data?.user as any)?.id as string | undefined;
    return id ? `/teacher/${id}` : null;
  }, [data?.user]);

  const [collapsed, setCollapsed] = useState(false);

  useEffect(() => {
    const preferCollapsed =
      typeof window !== 'undefined' &&
      typeof window.matchMedia === 'function' &&
      window.matchMedia('(max-width: 900px)').matches;
    setCollapsed(preferCollapsed);
  }, []);

  useEffect(() => {
    const shell = document.getElementById('app-shell');
    if (!shell) return;
    if (collapsed) shell.setAttribute('data-collapsed', 'true');
    else shell.removeAttribute('data-collapsed');
  }, [collapsed]);

  const [tasksUnread, setTasksUnread] = useState(unreadTasks);
  useEffect(() => setTasksUnread(unreadTasks), [unreadTasks]);
  useEffect(() => {
    if (pathname?.startsWith('/inboxtasks')) setTasksUnread(0);
  }, [pathname]);
  useEffect(() => {
    const onSet = (e: Event) => {
      const d = (e as CustomEvent).detail;
      if (typeof d === 'number') setTasksUnread(d);
    };
    const onBump = () => setTasksUnread((x) => x + 1);
    window.addEventListener('tasks:unread-set', onSet as any);
    window.addEventListener('tasks:unread-bump', onBump as any);
    return () => {
      window.removeEventListener('tasks:unread-set', onSet as any);
      window.removeEventListener('tasks:unread-bump', onBump as any);
    };
  }, []);

  const [reviewsUnreadState, setReviewsUnreadState] = useState(unreadReviews);
  useEffect(() => setReviewsUnreadState(unreadReviews), [unreadReviews]);
  useEffect(() => {
    if (pathname === '/reviews') setReviewsUnreadState(0);
  }, [pathname]);

  const [discussionsUnreadState, setDiscussionsUnreadState] = useState(unreadDiscussions);
  useEffect(() => setDiscussionsUnreadState(unreadDiscussions), [unreadDiscussions]);
  useEffect(() => {
    if (pathname?.startsWith('/discussions')) setDiscussionsUnreadState(0);
  }, [pathname]);

  const [requestsUnreadState, setRequestsUnreadState] = useState(unreadRequests);
  useEffect(() => setRequestsUnreadState(unreadRequests), [unreadRequests]);
  useEffect(() => {
    if (pathname?.startsWith('/requests')) setRequestsUnreadState(0);
  }, [pathname]);

  const ArrowIcon = useMemo(
    () =>
      collapsed ? (
        <svg width="16" height="16" viewBox="0 0 24 24" aria-hidden>
          <path
            d="M9 6l6 6-6 6"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      ) : (
        <svg width="16" height="16" viewBox="0 0 24 24" aria-hidden>
          <path
            d="M15 6l-6 6 6 6"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      ),
    [collapsed],
  );

  const canSeeReviewTile = authed && roleSlug !== 'teacher';

  return (
    <aside className={`wrap ${collapsed ? 'collapsed' : ''}`}>
      <button
        type="button"
        className="toggle"
        aria-label={collapsed ? 'Развернуть сайдбар' : 'Свернуть сайдбар'}
        onClick={() => setCollapsed((v) => !v)}
      >
        {ArrowIcon}
      </button>

      <div className="head glass">
        <Link href="/dashboard" aria-label="На главную" prefetch={false} className="logoWrap">
          <Image
            src="/logo-108.png"
            alt="Гимназия №108"
            width={72}
            height={72}
            className="logo"
            priority
            unoptimized
          />
        </Link>

        <div className="who" title={(data?.user?.name as string) || 'Гость'}>
          <div className="fio">
            <div className="last" style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              {myTeacherUrl ? (
                <Link href={myTeacherUrl} prefetch={false} className="lastLink" aria-label="Личная страница педагога">
                  {fio.last}
                </Link>
              ) : (
                fio.last
              )}
              {authed && (
                <Link href="/settings" aria-label="Настройки" className="gear" prefetch={false}>
                  <GearIcon />
                </Link>
              )}
            </div>
            {fio.rest ? <div className="rest">{fio.rest}</div> : null}
          </div>
          <div className="metaRow">
            {roleRu && <div className="rolePill">{roleRu}</div>}
            {authed ? (
              <button className="exit" onClick={() => signOut({ callbackUrl: '/sign-in' })}>
                выйти
              </button>
            ) : (
              <Link className="exit" href="/sign-in" prefetch={false}>
                войти
              </Link>
            )}
          </div>
        </div>
      </div>

      <nav className="nav">
        {authed && (
          <>
            <div className="grid">
              <Tile href="/dashboard" label="Главное" active={pathname === '/dashboard'} />
              <Tile
                href="/discussions"
                label="Пейджер"
                active={pathname?.startsWith('/discussions') || false}
                unread={pathname?.startsWith('/discussions') ? 0 : discussionsUnreadState}
              />
              <Tile
                href="/inboxtasks"
                label="Задачи"
                active={pathname?.startsWith('/inboxtasks') || false}
                unread={pathname?.startsWith('/inboxtasks') ? 0 : tasksUnread}
              />
              <Tile href="/inboxtasks/archive" label="Архив задач" active={pathname === '/inboxtasks/archive'} />
              {canSeeReviewTile && (
                <Tile
                  href="/reviews"
                  label="Проверка задач"
                  active={pathname === '/reviews'}
                  unread={pathname === '/reviews' ? 0 : reviewsUnreadState}
                />
              )}
              <Tile href="/teachers" label="Педагоги" active={pathname === '/teachers'} />
              <Tile href="/calendar" label="Календарь" active={pathname === '/calendar'} />
              <Tile href="/schedule" label="Расписание" active={pathname === '/schedule'} />
              <Tile href="/enterprise" label="Документация" active={pathname === '/enterprise'} />
              <Tile
                href="/requests"
                label="Заявки"
                active={pathname?.startsWith('/requests') || false}
                unread={pathname?.startsWith('/requests') ? 0 : requestsUnreadState}
              />
            </div>

            {hasAdminBlock && (
              <>
                <div className="adminTitle">Администрирование</div>
                <div className="grid">
                  <Tile href="/admin" label="Админ-панель" active={pathname === '/admin'} />
                  <Tile href="/admin/db-status" label="Статус БД" active={pathname === '/admin/db-status'} />
                  <Tile href="/groups" label="Кафедры" active={pathname === '/groups'} />
                </div>
              </>
            )}
          </>
        )}
      </nav>

      <style jsx>{`
        .wrap {
          /* Liquid Glass · iOS-26 tokens */
          --brand: ${BRAND};
          --brand-ink: #ffffff;
          --brand-10: color-mix(in oklab, var(--brand) 10%, #ffffff);
          --brand-stroke: color-mix(in oklab, var(--brand) 52%, #ffffff);

          --ink: #0f172a;
          --muted: #6b7280;
          --stroke: color-mix(in oklab, #0f172a 10%, #ffffff);

          --lg-blur: 18px;
          --glass-tint: color-mix(in oklab, #ffffff 76%, var(--brand-10));
          --glass-tint-soft: color-mix(in oklab, #ffffff 84%, var(--brand-10));
          --glass-bg: color-mix(in oklab, var(--glass-tint) 100%, transparent);
          --glass-soft: color-mix(in oklab, var(--glass-tint-soft) 100%, transparent);
          --glass-stroke: color-mix(in oklab, var(--brand-stroke) 56%, #ffffff 44%);

          --shadow-lg: 0 18px 48px rgba(15,23,42,.16);
          --shadow-md: 0 12px 30px rgba(15,23,42,.12);
          --shadow-sm: 0 8px 18px rgba(15,23,42,.10);
          --inset: inset 0 1px 0 rgba(255,255,255,.66), inset 0 -1px 0 rgba(0,0,0,.04);

          box-sizing: border-box;
          width: var(--sbw, 280px);
          height: 100%;
          display: grid;
          grid-template-rows: auto 1fr;
          border-right: 1px solid var(--glass-stroke);
          background:
            linear-gradient(180deg,
              color-mix(in oklab, var(--glass-bg) 92%, transparent),
              color-mix(in oklab, var(--glass-bg) 78%, transparent));
          -webkit-backdrop-filter: blur(var(--lg-blur)) saturate(1.25);
          backdrop-filter: blur(var(--lg-blur)) saturate(1.25);
          overflow: visible;
          position: relative;
          transition: width .24s ease;
          color: var(--ink);
        }
        .wrap.collapsed { width: 56px; }

        .head {
          display: flex; flex-direction: column; align-items: center; gap: 10px;
          padding: 12px;
          border-bottom: 1px solid var(--glass-stroke);
          position: relative;
          background:
            linear-gradient(180deg,
              color-mix(in oklab, var(--glass-soft) 94%, transparent),
              color-mix(in oklab, var(--glass-soft) 86%, transparent));
          -webkit-backdrop-filter: blur(12px) saturate(1.2);
          backdrop-filter: blur(12px) saturate(1.2);
          box-shadow: var(--inset);
        }
        .wrap.collapsed .head, .wrap.collapsed .nav { opacity: 0; pointer-events: none; visibility: hidden; }
        .head::after { content:""; position:absolute; left:0; right:0; bottom:-1px; height:2px; background: var(--brand); opacity:.10; }

        .logoWrap { display: grid; place-items: center; }
        .logo {
          width: 72px; height: 72px; border-radius: 12px; border: 1px solid var(--glass-stroke);
          background: linear-gradient(180deg, #fff, color-mix(in oklab, #fff 88%, #f3f4f6));
          box-shadow: 0 10px 22px rgba(15,23,42,.10), inset 0 1px 0 rgba(255,255,255,.60);
        }

        .who { min-width: 0; width: 100%; display: grid; gap: 6px; }
        .fio { line-height: 1.08; text-align: left; }
        .last { font-weight: 900; font-size: 20px; letter-spacing: .4px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
        .lastLink { color: inherit; text-decoration: none; }
        .lastLink:hover { text-decoration: underline; text-underline-offset: 3px; }
        .rest { font-weight: 700; font-size: 15px; color: var(--ink); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }

        .gear {
          display: inline-grid; place-items: center;
          width: 28px; height: 28px; border-radius: 8px; border: 1px solid var(--glass-stroke);
          background: linear-gradient(180deg, #fff, color-mix(in oklab, #fff 88%, #f3f4f6));
          color: var(--ink); line-height: 0;
          transition: transform .08s ease, box-shadow .16s ease, border-color .14s ease, background .14s ease;
          box-shadow: 0 8px 16px rgba(15,23,42,.08), inset 0 1px 0 rgba(255,255,255,.60);
        }
        .gear:hover { transform: translateY(-1px); box-shadow: 0 12px 22px rgba(15,23,42,.12), inset 0 1px 0 rgba(255,255,255,.66); }

        .metaRow { display: flex; align-items: center; justify-content: space-between; gap: 8px; }
        .rolePill {
          font-size: 12px; padding: 2px 8px; border-radius: 9999px; border: 1px solid var(--glass-stroke);
          background: linear-gradient(180deg, color-mix(in oklab, #ffffff 96%, transparent), color-mix(in oklab, #ffffff 88%, transparent));
          -webkit-backdrop-filter: blur(8px) saturate(1.1);
          backdrop-filter: blur(8px) saturate(1.1);
          box-shadow: 0 1px 0 rgba(255,255,255,.60) inset;
        }

        .exit {
          height: 32px; padding: 0 12px; border-radius: 12px; border: 1px solid var(--brand-stroke);
          background:
            linear-gradient(180deg,
              color-mix(in oklab, #ffffff 10%, var(--brand)) 0%,
              color-mix(in oklab, #000000 12%, var(--brand)) 100%);
          color: #fff; cursor: pointer; font-weight: 800; text-decoration: none !important;
          display: inline-flex; align-items: center; justify-content: center;
          transition: transform .06s ease, box-shadow .16s ease, filter .14s ease;
          box-shadow: 0 12px 22px rgba(141,40,40,.26), inset 0 1px 0 rgba(255,255,255,.60);
        }
        .exit:hover { transform: translateY(-1px); box-shadow: 0 14px 26px rgba(141,40,40,.30), inset 0 1px 0 rgba(255,255,255,.66); }
        .exit:active { transform: translateY(0); }

        .nav { padding: 10px; transition: opacity .2s ease; }
        .grid { display: grid; grid-template-columns: repeat(2, minmax(0,1fr)); gap: 8px; }
        .adminTitle { margin: 12px 4px 6px; font-size: 12px; color: var(--muted); font-weight: 800; }
        :global(.wrap a), :global(.wrap a *), .label { text-decoration: none !important; }

        .toggle {
          position: absolute; top: 50%; right: -16px; transform: translateY(-50%);
          width: 32px; height: 32px; border-radius: 9999px; border: 1px solid var(--glass-stroke);
          background:
            radial-gradient(60% 60% at 50% 20%, color-mix(in oklab, var(--brand) 10%, transparent), transparent 70%),
            linear-gradient(180deg, color-mix(in oklab, #ffffff 92%, transparent), color-mix(in oklab, #ffffff 84%, transparent));
          -webkit-backdrop-filter: blur(10px) saturate(1.2);
          backdrop-filter: blur(10px) saturate(1.2);
          box-shadow: 0 12px 22px rgba(15,23,42,.12), inset 0 1px 0 rgba(255,255,255,.60);
          color: var(--ink); display: grid; place-items: center;
          cursor: pointer; transition: transform .18s ease, box-shadow .18s ease, border-color .14s ease, background .16s ease;
          z-index: 1000;
        }
        .toggle:hover { box-shadow: 0 16px 28px rgba(15,23,42,.14), inset 0 1px 0 rgba(255,255,255,.66); transform: translateY(-50%) translateY(-1px); }
        .toggle:focus-visible {
          outline: none;
          box-shadow: 0 0 0 4px color-mix(in oklab, var(--brand) 26%, transparent), inset 0 1px 0 rgba(255,255,255,.60);
        }
      `}</style>
    </aside>
  );
}
