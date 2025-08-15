// components/Sidebar.tsx
"use client";

import Link from "next/link";
import { useSession, signOut } from "next-auth/react";
import { usePathname } from "next/navigation";
import { useEffect, useMemo, useState } from "react";

const BRAND = "#8d2828";
const FONT_STACK =
  '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, "Noto Sans", "Apple Color Emoji", "Segoe UI Emoji", "Segoe UI Symbol"';

const ROLE_RU: Record<string, string> = {
  admin: "Администратор",
  director: "Директор",
  deputy_plus: "Заместитель +",
  deputy: "Заместитель",
  teacher_plus: "Педагог +",
  teacher: "Педагог",
};

type ThreadListItem = { id: string; unreadCount?: number | null };
type TaskLite = {
  id: string;
  assignedTo?: Array<{ type?: "user"; id: string }>;
  assignees?: Array<{ userId: string; status?: string; doneAt?: string | null }>;
};

function splitFio(full?: string | null) {
  const s = (full || "").trim();
  if (!s) return { last: "ГОСТЬ", rest: "" };
  const parts = s.split(/\s+/);
  if (parts.length >= 2) return { last: (parts[0] || "").toUpperCase(), rest: parts.slice(1).join(" ") };
  return { last: s.toUpperCase(), rest: "" };
}

function NavTile(props: {
  label: string;
  href?: string;
  active?: boolean;
  unread?: number | null;
  onClick?: () => void;
}) {
  const { label, href, active, unread, onClick } = props;
  const hasUnread = typeof unread === "number" && unread > 0;
  const isSingleWord = !/\s/.test(label);

  const body = (
    <div
      className={`tile glass ${active ? "active" : ""} ${hasUnread && !active ? "unread" : ""}`}
      role="button"
      aria-current={active ? "true" : undefined}
    >
      <span className={`label ${isSingleWord ? "label--single" : "label--multi"}`} title={label}>
        {label}
      </span>
      {hasUnread ? <span className="badge">{unread! > 99 ? "99+" : unread}</span> : null}

      <style jsx>{`
        .tile {
          position: relative;
          display: grid;
          place-items: center;
          width: 100%;
          aspect-ratio: 1 / 1;
          border-radius: 14px;
          border: 1px solid rgba(229, 231, 235, 0.75);
          padding: 6px;
          cursor: pointer;
          transition: transform 120ms ease, border-color 120ms ease, background 120ms ease, box-shadow 120ms ease;
          overflow: hidden;
          text-align: center;
        }
        .glass {
          background: linear-gradient(180deg, rgba(255,255,255,0.68), rgba(255,255,255,0.40));
          backdrop-filter: saturate(180%) blur(10px);
          -webkit-backdrop-filter: saturate(180%) blur(10px);
          box-shadow: 0 2px 8px rgba(0,0,0,0.06), inset 0 1px 0 rgba(255,255,255,0.35);
        }
        .tile:hover { transform: translateY(-1px); border-color: #cfe3ff; box-shadow: 0 4px 12px rgba(0,0,0,0.08); }
        .tile.active { outline: 2px solid rgba(207, 227, 255, 0.9); }
        .tile.unread::before {
          content: ""; position: absolute; left: 0; top: 0; height: 3px; width: 100%; background: #ef9b28;
        }

        .label {
          font-family: ${FONT_STACK};
          color: #0f172a;
          font-weight: 800;
          line-height: 1.1;
          max-width: 100%;
          text-align: center;
          white-space: normal;        /* переносы только между словами */
          word-break: keep-all;       /* слова не ломаем */
          overflow-wrap: normal;
          text-wrap: balance;
        }
        .label--multi {
          font-size: clamp(11.5px, 1.65vw, 13px);
          display: -webkit-box;
          -webkit-line-clamp: 2;
          -webkit-box-orient: vertical;
          overflow: hidden;
        }
        .label--single {
          font-size: clamp(11px, 1.55vw, 12.5px);
          letter-spacing: 0.02em;
          font-stretch: 96%;
        }

        .badge {
          position: absolute; right: 8px; top: 8px;
          font-size: 11px; line-height: 18px;
          min-width: 22px; text-align: center;
          padding: 0 6px; border-radius: 9999px;
          background: ${BRAND}; color: #fff; font-weight: 800;
          box-shadow: 0 1px 4px rgba(0, 0, 0, 0.12);
        }
      `}</style>
    </div>
  );

  if (onClick && !href) {
    return (
      <button className="tile-btn" onClick={onClick}>
        {body}
        <style jsx>{` .tile-btn { all: unset; display: block; } `}</style>
      </button>
    );
  }

  return (
    <Link className="tile-link" href={href || "#"} prefetch>
      {body}
      <style jsx>{` .tile-link { display: block; text-decoration: none; } `}</style>
    </Link>
  );
}

export default function Sidebar() {
  const { data } = useSession();
  const pathname = usePathname();

  const authed = Boolean(data?.user);
  const roleSlug = (data?.user as any)?.role as string | null | undefined;
  const isAdminRole = roleSlug === "admin" || roleSlug === "director" || roleSlug === "deputy_plus";
  const roleRu = roleSlug ? (ROLE_RU[roleSlug] ?? roleSlug) : null;

  const uid = useMemo(() => (data?.user as any)?.id as string | undefined, [data?.user]);

  // --- Чаты: непрочитанные
  const [unreadTotal, setUnreadTotal] = useState(0);
  async function refreshUnread() {
    if (!uid) return setUnreadTotal(0);
    try {
      const r = await fetch("/api/chat/threads/list", { cache: "no-store", headers: { "X-User-Id": uid } }).catch(() => null);
      if (!r?.ok) return;
      const list = (await r.json()) as ThreadListItem[];
      setUnreadTotal((list || []).reduce((acc, t) => acc + (t.unreadCount ?? 0), 0));
    } catch {}
  }

  // --- Задачи: «назначенные мне»
  const [tasksToMe, setTasksToMe] = useState(0);
  function assigneeIdsOf(t: TaskLite) {
    if (Array.isArray(t.assignedTo) && t.assignedTo.length) return t.assignedTo.filter(a => !a.type || a.type === "user").map(a => a.id).filter(Boolean);
    if (Array.isArray(t.assignees) && t.assignees.length) return t.assignees.map(a => a.userId).filter(Boolean);
    return [];
  }
  function myAssigneeStatus(t: TaskLite, myId?: string | null) {
    if (!myId) return null;
    const rec = (t.assignees || []).find(a => a.userId === myId);
    return rec?.status ?? null;
  }
  function tasksFromLocal(id: string) {
    try {
      const raw = localStorage.getItem(`tasks:u:${id}:toMeCount`);
      const n = raw ? parseInt(raw, 10) : 0;
      if (!Number.isNaN(n)) setTasksToMe(n);
    } catch {}
  }
  async function tasksFromServer(id: string) {
    try {
      const r = await fetch("/api/tasks", { cache: "no-store" });
      if (!r.ok) { tasksFromLocal(id); return; }
      const list = (await r.json()) as TaskLite[];
      const count = Array.isArray(list) ? list.filter(t => assigneeIdsOf(t).includes(id) && myAssigneeStatus(t, id) !== "done").length : 0;
      setTasksToMe(count);
      try {
        localStorage.setItem(`tasks:u:${id}:toMeCount`, String(count));
        window.dispatchEvent(new Event("g108:tasks-count-updated"));
      } catch {}
    } catch { tasksFromLocal(id); }
  }

  useEffect(() => {
    if (!authed || !uid) return;

    refreshUnread();
    tasksFromLocal(uid);
    tasksFromServer(uid);

    const onThreadsUpdated = () => refreshUnread();
    const onSsePush = () => refreshUnread();
    const onTasksUpdated = () => tasksFromLocal(uid);
    const onVis = () => {
      if (document.visibilityState === "visible") {
        refreshUnread();
        tasksFromServer(uid);
      }
    };

    window.addEventListener("g108:chat-threads-updated", onThreadsUpdated as any);
    window.addEventListener("g108:sse-push", onSsePush as any);
    window.addEventListener("g108:tasks-count-updated", onTasksUpdated as any);
    window.addEventListener("visibilitychange", onVis);

    const iv = window.setInterval(() => tasksFromServer(uid), 15000);
    return () => {
      window.removeEventListener("g108:chat-threads-updated", onThreadsUpdated as any);
      window.removeEventListener("g108:sse-push", onSsePush as any);
      window.removeEventListener("g108:tasks-count-updated", onTasksUpdated as any);
      window.removeEventListener("visibilitychange", onVis);
      window.clearInterval(iv);
    };
  }, [authed, uid]);

  // --- Очистка базы (модалка)
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [cleaning, setCleaning] = useState(false);
  const [cleanMsg, setCleanMsg] = useState<string | null>(null);
  const [cleanErr, setCleanErr] = useState<string | null>(null);

  async function runPurge() {
    setCleaning(true); setCleanErr(null); setCleanMsg(null);
    try {
      const r = await fetch("/api/admin/cleanup-ghosts?purge=1", { method: "POST" });
      const ct = r.headers.get("content-type") || "";
      const payload = ct.includes("application/json") ? await r.json() : null;
      if (!r.ok) throw new Error(payload?.error || `HTTP ${r.status}`);
      const removed = (payload?.deleted || []).length ?? 0;
      setConfirmOpen(false);
      setCleanMsg(`Удалено призраков: ${removed}.`);
      setTimeout(() => setCleanMsg(null), 4500);
    } catch (e: any) {
      setCleanErr(e?.message || "Не удалось очистить");
      setTimeout(() => setCleanErr(null), 6000);
    } finally {
      setCleaning(false);
    }
  }

  const fio = splitFio((data?.user?.name as string) || null);

  return (
    <aside className="wrap">
      {/* Шапка */}
      <div className="head glass">
        <div className="who" title={(data?.user?.name as string) || "Гость"}>
          <div className="fio">
            <div className="last">{fio.last}</div>
            {fio.rest ? <div className="rest">{fio.rest}</div> : null}
          </div>
          <div className="metaRow">
            {roleRu && <div className="rolePill">{roleRu}</div>}
            {authed && (
              <Link href="/settings" title="Настройки профиля" className="settings" aria-label="Настройки профиля">
                <svg viewBox="0 0 24 24" width="22" height="22" aria-hidden="true">
                  <path fill={BRAND} d="M6 5h12a1 1 0 1 1 0 2H6a1 1 0 1 1 0-2Zm3 6h9a1 1 0 1 1 0 2H9a1 1 0 1 1 0-2ZM4 17h16a1 1 0 1 1 0 2H4a1 1 0 1 1 0-2Z"/>
                  <circle cx="8" cy="6" r="2" fill={BRAND} />
                  <circle cx="14" cy="12" r="2" fill={BRAND} />
                  <circle cx="10" cy="18" r="2" fill={BRAND} />
                </svg>
              </Link>
            )}
          </div>
        </div>
      </div>

      {/* Навигация */}
      <nav className="nav">
        {authed && (
          <>
            {/* Базовые 8 плиток */}
            <div className="navGrid">
              <NavTile href="/dashboard"     active={pathname === "/dashboard"}     label="Главное" />
              <NavTile href="/chat"          active={pathname === "/chat"}          label="Чаты" unread={pathname !== "/chat" ? unreadTotal : 0} />
              <NavTile href="/inboxTasks"    active={pathname === "/inboxTasks"}    label="Задачи" unread={pathname !== "/inboxTasks" ? tasksToMe : 0} />
              <NavTile href="/calendar"      active={pathname === "/calendar"}      label="Календарь" />
              <NavTile href="/schedule"      active={pathname === "/schedule"}      label="Расписание" />
              <NavTile href="/teachers"      active={pathname === "/teachers"}      label="Педагоги" />
              <NavTile href="/discussions"   active={pathname === "/discussions"}   label="Тренды" />
              <NavTile href="/archive_tasks" active={pathname === "/archive_tasks"} label="Архив" />
            </div>

            {/* Админ-блок для директор/заместитель+ и админ */}
            {isAdminRole && (
              <>
                <div className="adminHeader">Администрирование</div>
                <div className="navGrid">
                  <NavTile href="/admin"           active={pathname === "/admin"}           label="Админ‑панель" />
                  <NavTile href="/admin/db-status" active={pathname === "/admin/db-status"} label="Статус БД" />
                  <NavTile href="/admin/groups"    active={pathname === "/admin/groups"}    label="Кафедры" />
                  <NavTile label="Очистка" onClick={() => setConfirmOpen(true)} />
                </div>
              </>
            )}
          </>
        )}
      </nav>

      {/* Низ */}
      <div className="foot">
        {isAdminRole && (
          <>
            {cleanMsg && <div className="note">{cleanMsg}</div>}
            {cleanErr && <div className="error">{cleanErr}</div>}
          </>
        )}
        {authed ? (
          <button className="btn primary" onClick={() => signOut({ callbackUrl: "/sign-in" })}>Выйти</button>
        ) : (
          <Link className="btn primary" href="/sign-in">Войти</Link>
        )}
      </div>

      {/* Модалка подтверждения очистки */}
      {confirmOpen && (
        <div className="modal-backdrop" role="dialog" aria-modal="true" onClick={() => !cleaning && setConfirmOpen(false)}>
          <div className="modal-card" onClick={(e) => e.stopPropagation()}>
            <button className="close" onClick={() => !cleaning && setConfirmOpen(false)} aria-label="Закрыть">×</button>
            <h3 className="modal-title">Окончательное удаление</h3>
            <p className="modal-text">
              Вы собираетесь очистить базу от архивированных и удаленных пользователей. Это действие необратимо.
            </p>
            <div className="modal-actions">
              <button className="btn" onClick={() => setConfirmOpen(false)} disabled={cleaning}>Отмена</button>
              <button className="btn primary" onClick={runPurge} disabled={cleaning}>
                {cleaning ? "Удаление…" : "Удалить окончательно"}
              </button>
            </div>
          </div>
        </div>
      )}

      <style jsx>{`
        .wrap {
          display: grid;
          grid-template-rows: auto 1fr auto;
          height: 100%;
          width: 256px;                /* фиксированная ширина панели */
          background: #fff;
          border-right: 1px solid #e5e7eb;
          font-size: 14px;
          font-family: ${FONT_STACK};
        }
        .head {
          display: flex; align-items: center;
          min-height: 74px; padding: 10px;
          border-bottom: 1px solid rgba(229,231,235,0.8);
          position: relative;
        }
        .head::after {
          content: ""; position: absolute; left: 0; right: 0; bottom: -1px; height: 2px;
          background: ${BRAND}; opacity: 0.12;
        }
        .glass {
          background: rgba(255,255,255,0.55);
          backdrop-filter: saturate(180%) blur(10px);
          -webkit-backdrop-filter: saturate(180%) blur(10px);
        }

        .who { min-width: 0; display: grid; gap: 6px; width: 100%; }
        .fio { line-height: 1.1; }
        .last {
          font-weight: 900; font-size: 18px; letter-spacing: 0.4px;
          white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
        }
        .rest {
          font-weight: 700; font-size: 14px; color: #111827;
          white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
        }
        .metaRow { display: flex; align-items: center; gap: 8px; justify-content: space-between; }
        .rolePill {
          display: inline-block; font-size: 12px; color: #374151; padding: 2px 8px;
          border: 1px solid rgba(229,231,235,0.9); border-radius: 9999px;
          background: rgba(255,255,255,0.6); backdrop-filter: saturate(180%) blur(8px);
        }
        .settings {
          display: inline-flex; align-items: center; justify-content: center;
          width: 36px; height: 36px; border-radius: 12px;
          background: rgba(255,255,255,0.6); border: 1px solid rgba(229,231,235,0.9);
          backdrop-filter: saturate(180%) blur(8px);
        }
        .settings:hover { background: rgba(255,255,255,0.9); }

        .nav { padding: 10px; }
        .navGrid {
          display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 8px;
        }
        .adminHeader {
          margin: 12px 4px 8px; font-size: 12px; color: #6b7280; font-weight: 700;
          text-transform: uppercase; letter-spacing: 0.06em;
        }

        .foot {
          padding: 12px; border-top: 1px solid #e5e7eb; display: grid; gap: 8px;
        }
        .btn {
          height: 36px; border: 1px solid #e5e7eb; background: #fff; border-radius: 10px;
          display: flex; align-items: center; justify-content: center; cursor: pointer;
          font-family: ${FONT_STACK};
        }
        .btn:hover { background: #f9fafb; }
        .primary { background: ${BRAND}; color: #fff; border-color: ${BRAND}; }
        .primary:hover { filter: brightness(0.96); }
        .note { font-size: 12px; color: #16a34a; }
        .error { font-size: 12px; color: #ef4444; }

        .modal-backdrop { position: fixed; inset: 0; background: rgba(0,0,0,0.4); display: flex; align-items: center; justify-content: center; z-index: 50; }
        .modal-card { position: relative; width: 520px; max-width: calc(100vw - 32px); background: #fff; border-radius: 12px; border: 1px solid #e5e7eb; padding: 16px; box-shadow: 0 16px 40px rgba(0,0,0,0.2); }
        .close { position: absolute; right: 8px; top: 6px; border: none; background: transparent; font-size: 20px; line-height: 1; cursor: pointer; }
        .modal-title { margin: 0 0 8px; font-size: 16px; font-weight: 700; }
        .modal-text { margin: 0 0 12px; font-size: 14px; color: #374151; }
        .modal-actions { display: flex; justify-content: flex-end; gap: 8px; }
      `}</style>
    </aside>
  );
}
