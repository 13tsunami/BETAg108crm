# Project snapshot: BETAg108crm.clean
Generated: 2025-08-16T15:33:39.400Z
## UI hints
```json
{
  "brand": "#8d2828",
  "sidebarWidthPx": 22
}
```
## Tree
```text
   ├─ .env
   ├─ .env.example
   ├─ .gitignore
   ├─ .introspection
   │  └─ endpoints.json
   ├─ app
   │  ├─ (app)
   │  │  ├─ calendar
   │  │  │  └─ page.tsx
   │  │  ├─ chat
   │  │  │  ├─ ChatBoxClient.tsx
   │  │  │  ├─ SearchBox.tsx
   │  │  │  ├─ actions.ts
   │  │  │  ├─ chat.module.css
   │  │  │  ├─ live.tsx
   │  │  │  ├─ page.tsx
   │  │  │  └─ sse
   │  │  │     ├─ broker.ts
   │  │  │     └─ route.ts
   │  │  ├─ dashboard
   │  │  │  ├─ page.module.css
   │  │  │  └─ page.tsx
   │  │  ├─ groups
   │  │  │  ├─ actions.ts
   │  │  │  └─ page.tsx
   │  │  ├─ heartbeat
   │  │  │  ├─ Heartbeat.tsx
   │  │  │  └─ actions.ts
   │  │  ├─ inboxtasks
   │  │  │  ├─ TaskForm.tsx
   │  │  │  ├─ actions.ts
   │  │  │  └─ page.tsx
   │  │  ├─ layout.module.css
   │  │  ├─ layout.tsx
   │  │  ├─ settings
   │  │  │  ├─ SettingsToast.tsx
   │  │  │  ├─ actions.ts
   │  │  │  └─ page.tsx
   │  │  └─ teachers
   │  │     ├─ SearchBox.tsx
   │  │     ├─ TeachersToast.tsx
   │  │     ├─ actions.ts
   │  │     └─ page.tsx
   │  ├─ (auth)
   │  │  └─ sign-in
   │  │     ├─ SignInForm.tsx
   │  │     └─ page.tsx
   │  ├─ admin
   │  │  ├─ db-status
   │  │  │  ├─ actions.ts
   │  │  │  ├─ page.module.css
   │  │  │  └─ page.tsx
   │  │  ├─ layout.module.css
   │  │  ├─ layout.tsx
   │  │  ├─ page.module.css
   │  │  └─ page.tsx
   │  ├─ api
   │  │  └─ auth
   │  │     └─ [...nextauth]
   │  │        └─ route.ts
   │  ├─ layout.tsx
   │  ├─ page.tsx
   │  └─ providers.tsx
   ├─ auth.config.ts
   ├─ cascade_user_delete.sql
   ├─ components
   │  ├─ AddUserModal.tsx
   │  ├─ CalendarBoard.tsx
   │  ├─ ConfirmDeleteUser.tsx
   │  ├─ EditUserModal.tsx
   │  ├─ GroupsBoard.tsx
   │  ├─ Modal.tsx
   │  ├─ Providers.tsx
   │  ├─ Sidebar.tsx
   │  ├─ TaskPopover.tsx
   │  ├─ UnreadBadgeClient.tsx
   │  ├─ UserForm.tsx
   │  └─ UserMenu.tsx
   ├─ lib
   │  ├─ auth.ts
   │  ├─ chatSSE.ts
   │  ├─ db.ts
   │  ├─ dbInfo.ts
   │  ├─ edu.ts
   │  ├─ http.ts
   │  ├─ prisma.ts
   │  ├─ rbac.ts
   │  ├─ roles.ts
   │  └─ serialize.ts
   ├─ middleware.ts
   ├─ next-env.d.ts
   ├─ next.config.ts
   ├─ package-lock.json
   ├─ package.json
   ├─ prisma
   │  ├─ dev.db
   │  ├─ migrations
   │  │  ├─ 000_init
   │  │  │  └─ migration.sql
   │  │  ├─ 20250814151727_init
   │  │  │  └─ migration.sql
   │  │  ├─ 20250816_002949_add_readmark_and_attachment
   │  │  │  └─ migration.sql
   │  │  ├─ 20250816_003914_add_readmark_and_attachment_take2
   │  │  │  └─ migration.sql
   │  │  ├─ 20250816_004527_require_thread_participants
   │  │  │  └─ migration.sql
   │  │  ├─ 20250816_182139_cascade_user_delete_fix
   │  │  │  └─ migration.sql
   │  │  ├─ init_baseline_20250811_225344
   │  │  │  └─ migration.sql
   │  │  └─ migration_lock.toml
   │  ├─ schema.prisma
   │  └─ seed.cjs
   ├─ scripts
   │  ├─ fix-admin.cjs
   │  ├─ list-endpoints.mjs
   │  └─ upsert-admin.cjs
   ├─ styles
   │  └─ globals.css
   ├─ tools
   │  └─ snapshot.js
   ├─ tsconfig.json
   └─ tsconfig.tsbuildinfo
```
## Routes (App Router)
```text
/  ⟶  app/(app)/layout.tsx
/  ⟶  app/layout.tsx
/  ⟶  app/page.tsx
/admin  ⟶  app/admin/layout.tsx
/admin  ⟶  app/admin/page.tsx
/admin/db-status  ⟶  app/admin/db-status/page.tsx
/api/auth/[...nextauth]  ⟶  app/api/auth/[...nextauth]/route.ts
/calendar  ⟶  app/(app)/calendar/page.tsx
/chat  ⟶  app/(app)/chat/page.tsx
/chat/sse  ⟶  app/(app)/chat/sse/route.ts
/dashboard  ⟶  app/(app)/dashboard/page.tsx
/groups  ⟶  app/(app)/groups/page.tsx
/inboxtasks  ⟶  app/(app)/inboxtasks/page.tsx
/settings  ⟶  app/(app)/settings/page.tsx
/sign-in  ⟶  app/(auth)/sign-in/page.tsx
/teachers  ⟶  app/(app)/teachers/page.tsx
```