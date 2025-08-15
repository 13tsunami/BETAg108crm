# Project snapshot: BETAg108crm.clean
Generated: 2025-08-15T18:39:13.888Z
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
   │  │  ├─ chat
   │  │  │  ├─ page.tsx
   │  │  │  └─ refresh.tsx
   │  │  ├─ dashboard
   │  │  │  ├─ page.module.css
   │  │  │  └─ page.tsx
   │  │  ├─ heartbeat
   │  │  │  ├─ Heartbeat.tsx
   │  │  │  └─ actions.ts
   │  │  ├─ layout.module.css
   │  │  ├─ layout.tsx
   │  │  └─ teachers
   │  │     ├─ SearchBox.tsx
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
   ├─ components
   │  ├─ AddUserModal.tsx
   │  ├─ EditUserModal.tsx
   │  ├─ Modal.tsx
   │  ├─ Providers.tsx
   │  ├─ Sidebar.tsx
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
   │  │  ├─ 20250814151727_init
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
/chat  ⟶  app/(app)/chat/page.tsx
/dashboard  ⟶  app/(app)/dashboard/page.tsx
/sign-in  ⟶  app/(auth)/sign-in/page.tsx
/teachers  ⟶  app/(app)/teachers/page.tsx
```