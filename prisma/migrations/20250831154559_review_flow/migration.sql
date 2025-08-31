-- === review-flow migration ===

-- 1. Enum для статуса исполнителя
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'TaskAssigneeStatus') THEN
    CREATE TYPE "public"."TaskAssigneeStatus" AS ENUM ('in_progress','submitted','done','rejected');
  END IF;
END $$;

-- 2. TaskAssignee: новые поля
ALTER TABLE "public"."TaskAssignee"
  ADD COLUMN IF NOT EXISTS "reviewedAt" TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS "reviewedById" TEXT,
  ADD COLUMN IF NOT EXISTS "submittedAt" TIMESTAMPTZ;

-- 3. TaskAssignee: новый enum-столбец для статуса
ALTER TABLE "public"."TaskAssignee"
  ADD COLUMN IF NOT EXISTS "status_new" "public"."TaskAssigneeStatus" NOT NULL DEFAULT 'in_progress';

-- 4. Переносим старые значения status → status_new
UPDATE "public"."TaskAssignee"
SET "status_new" = CASE lower(coalesce("status", ''))
  WHEN 'in_progress' THEN 'in_progress'::"public"."TaskAssigneeStatus"
  WHEN 'done'        THEN 'done'::"public"."TaskAssigneeStatus"
  WHEN 'submitted'   THEN 'submitted'::"public"."TaskAssigneeStatus"
  WHEN 'rejected'    THEN 'rejected'::"public"."TaskAssigneeStatus"
  ELSE 'in_progress'::"public"."TaskAssigneeStatus"
END;

-- 5. Чистим старый индекс по status
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM pg_indexes WHERE indexname = 'TaskAssignee_status_idx') THEN
    DROP INDEX "TaskAssignee_status_idx";
  END IF;
END $$;

-- 6. Дропаем старый текстовый столбец и переименовываем новый
ALTER TABLE "public"."TaskAssignee" DROP COLUMN IF EXISTS "status";
ALTER TABLE "public"."TaskAssignee" RENAME COLUMN "status_new" TO "status";

-- 7. Индексы и FK
CREATE INDEX IF NOT EXISTS "TaskAssignee_status_idx" ON "public"."TaskAssignee"("status");
CREATE INDEX IF NOT EXISTS "TaskAssignee_reviewedById_idx" ON "public"."TaskAssignee"("reviewedById");

ALTER TABLE "public"."TaskAssignee"
  ADD CONSTRAINT "TaskAssignee_reviewedById_fkey"
  FOREIGN KEY ("reviewedById") REFERENCES "public"."User"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;

-- 8. Task: добавляем reviewRequired
ALTER TABLE "public"."Task"
  ADD COLUMN IF NOT EXISTS "reviewRequired" BOOLEAN NOT NULL DEFAULT false;

-- 9. Attachment: новые поля и nullable messageId
ALTER TABLE "public"."Attachment"
  ALTER COLUMN "messageId" DROP NOT NULL;

ALTER TABLE "public"."Attachment"
  ADD COLUMN IF NOT EXISTS "originalName" TEXT,
  ADD COLUMN IF NOT EXISTS "sha256" VARCHAR(64),
  ADD COLUMN IF NOT EXISTS "createdAt" TIMESTAMPTZ DEFAULT now();

-- 10. Submission
CREATE TABLE IF NOT EXISTS "public"."Submission" (
  "id" TEXT PRIMARY KEY,
  "taskAssigneeId" TEXT NOT NULL,
  "comment" TEXT,
  "createdAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "Submission_taskAssigneeId_fkey"
    FOREIGN KEY ("taskAssigneeId") REFERENCES "public"."TaskAssignee"("id")
    ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS "Submission_taskAssigneeId_idx" ON "public"."Submission"("taskAssigneeId");

-- 11. SubmissionAttachment
CREATE TABLE IF NOT EXISTS "public"."SubmissionAttachment" (
  "submissionId" TEXT NOT NULL,
  "attachmentId" TEXT NOT NULL,
  PRIMARY KEY ("submissionId","attachmentId"),
  CONSTRAINT "SubmissionAttachment_submissionId_fkey"
    FOREIGN KEY ("submissionId") REFERENCES "public"."Submission"("id")
    ON DELETE CASCADE,
  CONSTRAINT "SubmissionAttachment_attachmentId_fkey"
    FOREIGN KEY ("attachmentId") REFERENCES "public"."Attachment"("id")
    ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS "SubmissionAttachment_attachmentId_idx"
  ON "public"."SubmissionAttachment"("attachmentId");
