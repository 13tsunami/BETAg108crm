-- AlterTable
ALTER TABLE "public"."Task" ADD COLUMN     "number" SERIAL NOT NULL;

-- CreateTable
CREATE TABLE "public"."TaskAttachment" (
    "taskId" TEXT NOT NULL,
    "attachmentId" TEXT NOT NULL,

    CONSTRAINT "TaskAttachment_pkey" PRIMARY KEY ("taskId","attachmentId")
);

-- CreateIndex
CREATE INDEX "TaskAttachment_attachmentId_idx" ON "public"."TaskAttachment"("attachmentId");

-- CreateIndex
CREATE UNIQUE INDEX "Task_number_key" ON "public"."Task"("number");

-- AddForeignKey
ALTER TABLE "public"."TaskAttachment" ADD CONSTRAINT "TaskAttachment_taskId_fkey" FOREIGN KEY ("taskId") REFERENCES "public"."Task"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."TaskAttachment" ADD CONSTRAINT "TaskAttachment_attachmentId_fkey" FOREIGN KEY ("attachmentId") REFERENCES "public"."Attachment"("id") ON DELETE CASCADE ON UPDATE CASCADE;

