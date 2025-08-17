-- Добавляем уникальный ключ на пару (taskId, userId)
ALTER TABLE "TaskAssignee"
  ADD CONSTRAINT "TaskAssignee_taskId_userId_key"
  UNIQUE ("taskId", "userId");
-- 1) Task: аудит + связь с создателем
ALTER TABLE "Task"
  ADD COLUMN "createdAt"     TIMESTAMPTZ NOT NULL DEFAULT now(),
  ADD COLUMN "updatedAt"     TIMESTAMPTZ NOT NULL DEFAULT now(),
  ADD COLUMN "createdById"   TEXT NULL,
  ADD COLUMN "createdByName" TEXT NULL;

-- FK на User(id), удаление создателя -> SET NULL, апдейт -> CASCADE
ALTER TABLE "Task"
  ADD CONSTRAINT "Task_createdById_fkey"
  FOREIGN KEY ("createdById")
  REFERENCES "User"("id")
  ON DELETE SET NULL
  ON UPDATE CASCADE;

-- Индексы (полезно для выборок «назначенные мной» и сортировок)
CREATE INDEX IF NOT EXISTS "Task_createdById_idx" ON "Task" ("createdById");
CREATE INDEX IF NOT EXISTS "Task_dueDate_idx"     ON "Task" ("dueDate");

-- 2) TaskAssignee: статусы исполнителя
ALTER TABLE "TaskAssignee"
  ADD COLUMN "status"       TEXT NOT NULL DEFAULT 'in_progress',
  ADD COLUMN "assignedAt"   TIMESTAMPTZ NOT NULL DEFAULT now(),
  ADD COLUMN "completedAt"  TIMESTAMPTZ NULL;

-- Индексы (для «назначенные мне» и прогресса)
CREATE INDEX IF NOT EXISTS "TaskAssignee_userId_idx"  ON "TaskAssignee" ("userId");
CREATE INDEX IF NOT EXISTS "TaskAssignee_taskId_idx"  ON "TaskAssignee" ("taskId");
CREATE INDEX IF NOT EXISTS "TaskAssignee_status_idx"  ON "TaskAssignee" ("status");

-- ВАЖНО: уникальный ключ по (taskId, userId) отложен по вашей просьбе.
-- Когда будете готовы, отдельной миграцией:
-- ALTER TABLE "TaskAssignee" ADD CONSTRAINT "TaskAssignee_taskId_userId_key" UNIQUE ("taskId","userId");
