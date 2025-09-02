# Аудит репозитория (Next.js 15 + Prisma)

Генерация: 2025-08-31T19:19:51.996Z

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
  server
  server/uploads.ts
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
  migrations/20250831154559_review_flow
  migrations/20250831174726_review_flow_open_submission
  migrations/migration_lock.toml
  review-flow.sql
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
uploads/
  .gitignore
  .gitkeep
```

## Страницы App Router и контракт searchParams
- app/(app)/calendar/page.tsx — searchParams: OK, await MISSING
- app/(app)/dashboard/page.tsx — searchParams: OK, await MISSING
- app/(app)/groups/page.tsx — searchParams: MISMATCH, await MISSING
- app/(app)/inboxtasks/archive/page.tsx — searchParams: OK, await MISSING
- app/(app)/inboxtasks/page.tsx — searchParams: OK, await MISSING
- app/(app)/reviews/[taskAssigneeId]/page.tsx — searchParams: MISMATCH, await MISSING
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
- app/(app)/reviews/actions.ts — use server; экспорт: submitForReviewAction: Promise<void>, approveSubmissionAction: Promise<void>, rejectSubmissionAction: Promise<void>, approveAllInTaskAction: Promise<void>
- app/(app)/settings/actions.ts — use server; экспорт: updateSelfAction: Promise<void>
- app/(app)/teachers/actions.ts — use server; экспорт: createUser: Promise<void>, updateUser: Promise<void>, deleteUser: Promise<void>
- app/admin/db-status/actions.ts — use server; экспорт: upsertUser: Promise<void>, forceResetPassword: Promise<void>, deleteUser: Promise<void>

## Prisma: модели (коротко)
- User (29 полей, 0 индексов)
- Group (3 полей, 0 индексов)
- GroupMember (5 полей, 1 индексов)
- Thread (10 полей, 1 индексов)
- Message (11 полей, 1 индексов)
- MessageHide (4 полей, 2 индексов)
- Task (14 полей, 2 индексов)
- TaskAssignee (13 полей, 5 индексов)
- Tag (3 полей, 0 индексов)
- TaskTag (5 полей, 0 индексов)
- ReadMark (5 полей, 2 индексов)
- Attachment (11 полей, 1 индексов)
- Subject (3 полей, 0 индексов)
- SubjectMember (5 полей, 1 индексов)
- Note (9 полей, 2 индексов)
- Submission (11 полей, 3 индексов)
- SubmissionAttachment (4 полей, 2 индексов)

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
- notes: Note[]
- reviewedAssignments: TaskAssignee[] @relation("TaskReviewedBy")
- reviewedSubmissions: Submission[] @relation("SubmissionReviewedBy")

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
- reviewRequired: Boolean @default(false)
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
- status: TaskAssigneeStatus @default(in_progress)
- assignedAt: DateTime @default(now())
- completedAt: DateTime ?
- submittedAt: DateTime ?
- reviewedAt: DateTime ?
- reviewedById: String ?
- reviewedBy: User ?     @relation("TaskReviewedBy", fields: [reviewedById], references: [id], onDelete: SetNull)
- submissions: Submission[]

Индексы:
@@unique([taskId, userId])
@@index([userId])
@@index([taskId])
@@index([status])
@@index([reviewedById])

### Note
- id: String @id @default(uuid())
- userId: String
- at: DateTime
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
- Task.reviewRequired: да
- TaskAssignee.status включает submitted: проверьте enum/строку
- submittedAt/reviewedAt/reviewedById: да
- Модели вложений: TaskAttachment=нет, AssigneeSubmissionAttachment=нет
