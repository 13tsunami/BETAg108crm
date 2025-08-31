/*
  Warnings:

  - Made the column `createdAt` on table `Attachment` required. This step will fail if there are existing NULL values in that column.

*/
-- DropForeignKey
ALTER TABLE "public"."Submission" DROP CONSTRAINT "Submission_taskAssigneeId_fkey";

-- DropForeignKey
ALTER TABLE "public"."SubmissionAttachment" DROP CONSTRAINT "SubmissionAttachment_attachmentId_fkey";

-- DropForeignKey
ALTER TABLE "public"."SubmissionAttachment" DROP CONSTRAINT "SubmissionAttachment_submissionId_fkey";

-- AlterTable
ALTER TABLE "public"."Attachment" ALTER COLUMN "data" DROP NOT NULL,
ALTER COLUMN "createdAt" SET NOT NULL,
ALTER COLUMN "createdAt" SET DATA TYPE TIMESTAMP(3);

-- AlterTable
ALTER TABLE "public"."Submission" ADD COLUMN     "open" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN     "reviewedAt" TIMESTAMP(3),
ADD COLUMN     "reviewedById" TEXT,
ADD COLUMN     "reviewerComment" TEXT,
ALTER COLUMN "createdAt" SET DATA TYPE TIMESTAMP(3);

-- AlterTable
ALTER TABLE "public"."TaskAssignee" ALTER COLUMN "reviewedAt" SET DATA TYPE TIMESTAMP(3),
ALTER COLUMN "submittedAt" SET DATA TYPE TIMESTAMP(3);

-- CreateIndex
CREATE INDEX "Submission_reviewedById_idx" ON "public"."Submission"("reviewedById");

-- CreateIndex
CREATE INDEX "Submission_taskAssigneeId_open_idx" ON "public"."Submission"("taskAssigneeId", "open");

-- AddForeignKey
ALTER TABLE "public"."Submission" ADD CONSTRAINT "Submission_reviewedById_fkey" FOREIGN KEY ("reviewedById") REFERENCES "public"."User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."Submission" ADD CONSTRAINT "Submission_taskAssigneeId_fkey" FOREIGN KEY ("taskAssigneeId") REFERENCES "public"."TaskAssignee"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."SubmissionAttachment" ADD CONSTRAINT "SubmissionAttachment_submissionId_fkey" FOREIGN KEY ("submissionId") REFERENCES "public"."Submission"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."SubmissionAttachment" ADD CONSTRAINT "SubmissionAttachment_attachmentId_fkey" FOREIGN KEY ("attachmentId") REFERENCES "public"."Attachment"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE UNIQUE INDEX IF NOT EXISTS "Submission_one_open_per_assignee"
ON "Submission" ("taskAssigneeId")
WHERE "open" = true;
