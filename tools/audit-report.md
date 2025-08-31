# Аудит репозитория (Next.js 15 + Prisma)

Генерация: 2025-08-31T15:20:26.902Z

## Краткое дерево проекта
```
.docker/
  postgres
  postgres/certs
  postgres/pg_hba.conf
  postgres/postgresql.conf
.dockerignore/
.env/
.env.example/
.env.local/
.github/
  workflows
  workflows/deploy.yml
.gitignore/
.introspection/
  endpoints.json
Dockerfile/
app/
  (app)/calendar/page.tsx
  (app)/dashboard/page.tsx
  (app)/groups/page.tsx
  (app)/inboxtasks/page.tsx
  (app)/layout.tsx
  (app)/reviews/page.tsx
  (app)/schedule/page.tsx
  (app)/settings/page.tsx
  (app)/teachers/page.tsx
  (auth)/sign-in/page.tsx
  admin/db-status/page.tsx
  admin/layout.tsx
  admin/page.tsx
  layout.tsx
  page.tsx
    (app)/calendar/page.tsx
    (app)/dashboard/page.tsx
    (app)/groups/page.tsx
    (app)/inboxtasks/page.tsx
    (app)/layout.tsx
    (app)/reviews/page.tsx
    (app)/schedule/page.tsx
    (app)/settings/page.tsx
    (app)/teachers/page.tsx
    (auth)/sign-in/page.tsx
    admin/db-status/page.tsx
    admin/layout.tsx
    admin/page.tsx
auth.config.ts/
cascade_user_delete.sql/
components/
  AddUserModal.tsx
  ConfirmDeleteUser.tsx
  EditUserModal.tsx
  GroupsBoard.tsx
  Modal.tsx
  Providers.tsx
  Sidebar.tsx
  TaskPopover.tsx
  Tooltip.tsx
  UnreadBadgeClient.tsx
  UserForm.tsx
  UserMenu.tsx
  search
  search/SearchProvider.tsx
  search/UniversalSearchInput.tsx
docker-compose.yml/
lib/
  auth.ts
  db.ts
  dbInfo.ts
  edu.ts
  http.ts
  prisma.ts
  rbac.ts
  roles.ts
  search
  search/index.ts
  search/types.ts
  serialize.ts
  tasks
  tasks/getUnreadTasks.ts
middleware.ts/
migration_sync_20250817_010051.sql/
next-env.d.ts/
next.config.ts/
package-lock.json/
package.json/
prisma/
  migrations
  migrations/20250830203849_init
  migrations/migration_lock.toml
  schema.prisma
  seed.cjs
project-snapshot/
  index.json
  tree.md
public/
  .gitkeep
scripts/
  fix-admin.cjs
  list-endpoints.mjs
  upsert-admin.cjs
styles/
  globals.css
tools/
  _audit-probe.txt
  audit-repo.cjs
  audit-report.md
  snapshot.js
tsconfig.json/
tsconfig.tsbuildinfo/
```

## Страницы App Router и контракт searchParams
- app/(app)/calendar/page.tsx — searchParams: OK, await MISSING
- app/(app)/dashboard/page.tsx — searchParams: OK, await MISSING
- app/(app)/groups/page.tsx — searchParams: MISMATCH, await MISSING
- app/(app)/inboxtasks/archive/page.tsx — searchParams: OK, await MISSING
- app/(app)/inboxtasks/page.tsx — searchParams: OK, await MISSING
- app/(app)/reviews/[taskId]/page.tsx — searchParams: OK, await MISSING
- app/(app)/reviews/page.tsx — searchParams: OK, await MISSING
- app/(app)/schedule/page.tsx — searchParams: MISMATCH, await MISSING
- app/(app)/settings/page.tsx — searchParams: MISMATCH, await MISSING
- app/(app)/teachers/page.tsx — searchParams: MISMATCH, await MISSING
- app/(auth)/sign-in/page.tsx — searchParams: MISMATCH, await MISSING
- app/admin/db-status/page.tsx — searchParams: MISMATCH, await MISSING
- app/admin/page.tsx — searchParams: MISMATCH, await MISSING

## Server actions
- app/(app)/calendar/actions.ts — use server; экспорт: createNoteAction: Promise<void>, updateNoteAction: Promise<void>, deleteNoteAction: Promise<void>, markMyTaskDoneAction: Promise<void>
- app/(app)/groups/actions.ts — use server; экспорт: createGroup: Promise<void>, renameGroup: Promise<void>, deleteGroup: Promise<void>, addUsersToGroup: Promise<void>, removeUserFromGroup: Promise<void>, fetchGroupMembers: Promise<void>, renameSubject: Promise<void>, deleteSubject: Promise<void>, addUsersToSubject: Promise<void>, removeUserFromSubject: Promise<void>, createSubject: ?, fetchSubjectMembers: ?
- app/(app)/heartbeat/actions.ts — use server; экспорт: heartbeat: Promise<void>
- app/(app)/inboxtasks/actions.ts — use server; экспорт: createTaskAction: Promise<void>, updateTaskAction: Promise<void>, deleteTaskAction: Promise<void>, markAssigneeDoneAction: Promise<void>, unarchiveAssigneeAction: Promise<void>
- app/(app)/inboxtasks/review-actions.ts — use server; экспорт: submitForReviewAction: Promise<void>, approveSubmissionAction: Promise<void>, rejectSubmissionAction: Promise<void>
- app/(app)/settings/actions.ts — use server; экспорт: updateSelfAction: Promise<void>
- app/(app)/teachers/actions.ts — use server; экспорт: createUser: Promise<void>, updateUser: Promise<void>, deleteUser: Promise<void>
- app/admin/db-status/actions.ts — use server; экспорт: upsertUser: Promise<void>, forceResetPassword: Promise<void>, deleteUser: Promise<void>

## Prisma: модели (коротко)
- User (27 полей, 0 индексов)
- Group (3 полей, 0 индексов)
- GroupMember (5 полей, 1 индексов)
- Thread (10 полей, 1 индексов)
- Message (11 полей, 1 индексов)
- MessageHide (4 полей, 2 индексов)
- Task (13 полей, 2 индексов)
- TaskAssignee (8 полей, 4 индексов)
- Tag (3 полей, 0 индексов)
- TaskTag (5 полей, 0 индексов)
- ReadMark (5 полей, 2 индексов)
- Attachment (7 полей, 1 индексов)
- Subject (3 полей, 0 индексов)
- SubjectMember (5 полей, 1 индексов)
- Note (9 полей, 2 индексов)

### User
- id: String @id @default(uuid())
- name: String
- username: String ?   @unique
- email: String ?   @unique
- phone: String ?   @unique
- birthday: DateTime ?
- classroom: String ?
- role: String ?
- avatarUrl: String ?
- telegram: String ?
- about: String ?
- notifyEmail: Boolean @default(true)
- notifyTelegram: Boolean @default(false)
- subjects: String ?
- methodicalGroups: String ?
- passwordHash: String ?
- lastSeen: DateTime ?
- messages: Message[] @relation("UserMessages")
- threadsA: Thread[] @relation("ThreadA")
- threadsB: Thread[] @relation("ThreadB")
- readMarks: ReadMark[] @relation("ReadMarkUser")
- groupMemberships: GroupMember[]
- taskAssignments: TaskAssignee[]
- subjectMemberships: SubjectMember[]
- createdTasks: Task[] @relation("TaskCreatedBy")
- messageHides: MessageHide[]
- notes: Note[] // ← добавили обратную сторону связи

### Task
- id: String @id @default(uuid())
- title: String
- description: String
- dueDate: DateTime
- hidden: Boolean @default(false)
- priority: String @default("normal")
- createdAt: DateTime @default(now())
- updatedAt: DateTime @default(now()) @updatedAt
- createdById: String ?
- createdByName: String ?
- createdBy: User ? @relation("TaskCreatedBy", fields: [createdById], references: [id], onDelete: SetNull, onUpdate: Cascade)
- assignees: TaskAssignee[]
- tags: TaskTag[]

Индексы:
@@index([createdById])
@@index([dueDate])

### TaskAssignee
- id: String @id @default(uuid())
- taskId: String
- userId: String
- task: Task @relation(fields: [taskId], references: [id], onDelete: Cascade)
- user: User @relation(fields: [userId], references: [id], onDelete: Cascade)
- status: String @default("in_progress") // 'in_progress' | 'done'
- assignedAt: DateTime @default(now())
- completedAt: DateTime ?

Индексы:
@@unique([taskId, userId]) // TaskAssignee_taskId_userId_key
@@index([userId]) // TaskAssignee_userId_idx
@@index([taskId]) // TaskAssignee_taskId_idx
@@index([status]) // TaskAssignee_status_idx

### Note
- id: String @id @default(uuid())
- userId: String
- at: DateTime // сохраняем в UTC, группируем по локали на уровне UI
- allDay: Boolean @default(true)
- title: String ?
- text: String
- createdAt: DateTime @default(now())
- updatedAt: DateTime @updatedAt
- user: User @relation(fields: [userId], references: [id], onDelete: Cascade)

Индексы:
@@index([userId, at])
@@index([at])

## Готовность к review-flow
- Task.reviewRequired: нет
- TaskAssignee.status включает submitted: проверьте enum/строку
- submittedAt/reviewedAt/reviewedById: нет
- Модели вложений: TaskAttachment=нет, AssigneeSubmissionAttachment=нет
