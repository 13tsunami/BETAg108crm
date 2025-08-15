"use client";

import Link from "next/link";
import { useSession, signOut } from "next-auth/react";
import { usePathname } from "next/navigation";
import type { Role } from "@/lib/roles";
import { canViewAdmin } from "@/lib/roles";

export default function Sidebar() {
  const { data: session } = useSession();
  const pathname = usePathname();
  const authed = !!session?.user;
  const role = ((session?.user as any)?.role ?? "user") as Role;

  return (
    <aside className="sidebar">
      <div className="sidebar-profile">
        <div className="sidebar-name">{authed ? session?.user?.name : "Гость"}</div>
        {authed && <div className="sidebar-role">{role}</div>}
      </div>

      {authed && (
        <nav className="nav">
          <ul className="navGrid">
            <li>
              <Link href="/" className={pathname === "/" ? "active" : ""}>Главная</Link>
            </li>
          </ul>

          {canViewAdmin(role) && (
            <>
              <div className="adminHeader">Администрирование</div>
              <ul className="navGrid">
                <li>
                  <Link href="/admin" className={pathname === "/admin" ? "active" : ""}>Панель администратора</Link>
                </li>
                <li>
                  <Link href="/admin/db-status" className={pathname === "/admin/db-status" ? "active" : ""}>Статус БД</Link>
                </li>
              </ul>
            </>
          )}
        </nav>
      )}

      <div className="sidebar-footer">
        {authed ? (
          <button onClick={() => signOut({ callbackUrl: "/sign-in" })}>Выйти</button>
        ) : (
          <Link href="/sign-in">Войти</Link>
        )}
      </div>
    </aside>
  );
}
