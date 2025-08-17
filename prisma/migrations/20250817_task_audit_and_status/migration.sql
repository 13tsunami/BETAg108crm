-- Уникальный ключ на пару (taskId, userId) — добавляем, только если его ещё нет
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint c
    JOIN pg_class t ON t.oid = c.conrelid
    WHERE t.relname = 'TaskAssignee'
      AND c.conname = 'TaskAssignee_taskId_userId_key'
  ) THEN
    ALTER TABLE "TaskAssignee"
      ADD CONSTRAINT "TaskAssignee_taskId_userId_key"
      UNIQUE ("taskId", "userId");
  END IF;
END $$;

-- 1) Task: аудит + связь с создателем
ALTER TABLE "Task"
  ADD COLUMN IF NOT EXISTS "createdAt"     TIMESTAMPTZ NOT NULL DEFAULT now(),
  ADD COLUMN IF NOT EXISTS "updatedAt"     TIMESTAMPTZ NOT NULL DEFAULT now(),
  ADD COLUMN IF NOT EXISTS "createdById"   TEXT NULL,
  ADD COLUMN IF NOT EXISTS "createdByName" TEXT NULL;

-- FK на User(id), удаление создателя -> SET NULL, апдейт -> CASCADE
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'Task_createdById_fkey'
  ) THEN
    ALTER TABLE "Task"
      ADD CONSTRAINT "Task_createdById_fkey"
      FOREIGN KEY ("createdById")
      REFERENCES "User"("id")
      ON DELETE SET NULL
      ON UPDATE CASCADE;
  END IF;
END $$;

-- Индексы
CREATE INDEX IF NOT EXISTS "Task_createdById_idx" ON "Task" ("createdById");
CREATE INDEX IF NOT EXISTS "Task_dueDate_idx"     ON "Task" ("dueDate");

-- 2) TaskAssignee: статусы исполнителя
ALTER TABLE "TaskAssignee"
  ADD COLUMN IF NOT EXISTS "status"       TEXT NOT NULL DEFAULT 'in_progress',
  ADD COLUMN IF NOT EXISTS "assignedAt"   TIMESTAMPTZ NOT NULL DEFAULT now(),
  ADD COLUMN IF NOT EXISTS "completedAt"  TIMESTAMPTZ NULL;

-- Индексы
CREATE INDEX IF NOT EXISTS "TaskAssignee_userId_idx"  ON "TaskAssignee" ("userId");
CREATE INDEX IF NOT EXISTS "TaskAssignee_taskId_idx"  ON "TaskAssignee" ("taskId");
CREATE INDEX IF NOT EXISTS "TaskAssignee_status_idx"  ON "TaskAssignee" ("status");
