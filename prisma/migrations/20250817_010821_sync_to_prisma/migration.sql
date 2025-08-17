-- DropIndex
DROP INDEX IF EXISTS "public"."Subject_name_idx";

-- DropIndex
DROP INDEX IF EXISTS "public"."SubjectMember_subjectId_idx";

-- DropIndex
DROP INDEX IF EXISTS "public"."SubjectMember_userId_idx";

-- AlterTable
ALTER TABLE "public"."Message" ALTER COLUMN "editedAt" SET DATA TYPE TIMESTAMP(3),
ALTER COLUMN "deletedAt" SET DATA TYPE TIMESTAMP(3);

-- AlterTable
ALTER TABLE "public"."ReadMark" ALTER COLUMN "readAt" SET DATA TYPE TIMESTAMP(3);

-- AlterTable
ALTER TABLE "public"."Task" ALTER COLUMN "createdAt" SET DATA TYPE TIMESTAMP(3),
ALTER COLUMN "updatedAt" SET DATA TYPE TIMESTAMP(3);

-- AlterTable
ALTER TABLE "public"."TaskAssignee" ALTER COLUMN "assignedAt" SET DATA TYPE TIMESTAMP(3),
ALTER COLUMN "completedAt" SET DATA TYPE TIMESTAMP(3);

-- AlterTable
ALTER TABLE "public"."Thread" ALTER COLUMN "aId" SET NOT NULL,
ALTER COLUMN "bId" SET NOT NULL;

-- CreateIndex
CREATE UNIQUE INDEX IF NOT EXISTS "GroupMember_userId_groupId_key" ON "public"."GroupMember"("userId", "groupId");

-- RenameIndex
ALTER INDEX IF EXISTS "public"."Attachment_message_idx" RENAME TO "Attachment_messageId_idx";

-- RenameIndex
ALTER INDEX IF EXISTS "public"."Message_thread_created_idx" RENAME TO "Message_threadId_createdAt_idx";

-- RenameIndex
ALTER INDEX IF EXISTS "public"."ReadMark_user_idx" RENAME TO "ReadMark_userId_idx";

