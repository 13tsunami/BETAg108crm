-- CreateEnum
CREATE TYPE "public"."RequestStatus" AS ENUM ('new', 'in_progress', 'done', 'rejected');

-- CreateTable
CREATE TABLE "public"."Request" (
    "id" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "authorId" TEXT NOT NULL,
    "target" TEXT NOT NULL,
    "status" "public"."RequestStatus" NOT NULL DEFAULT 'new',
    "title" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "processedById" TEXT,
    "closedAt" TIMESTAMP(3),
    "rejectedReason" TEXT,
    "lastMessageAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "globalNumber" SERIAL NOT NULL,
    "targetNumber" INTEGER,

    CONSTRAINT "Request_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."RequestMessage" (
    "id" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "requestId" TEXT NOT NULL,
    "authorId" TEXT NOT NULL,
    "body" TEXT NOT NULL,

    CONSTRAINT "RequestMessage_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."RequestCounter" (
    "target" TEXT NOT NULL,
    "lastNumber" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "RequestCounter_pkey" PRIMARY KEY ("target")
);

-- CreateTable
CREATE TABLE "public"."DiscussionPost" (
    "id" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "authorId" TEXT NOT NULL,
    "text" TEXT NOT NULL,
    "pinned" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "DiscussionPost_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."DiscussionComment" (
    "id" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "postId" TEXT NOT NULL,
    "authorId" TEXT NOT NULL,
    "text" TEXT NOT NULL,

    CONSTRAINT "DiscussionComment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."DiscussionReaction" (
    "postId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "kind" TEXT NOT NULL DEFAULT 'like',

    CONSTRAINT "DiscussionReaction_pkey" PRIMARY KEY ("postId","userId")
);

-- CreateTable
CREATE TABLE "public"."DiscussionPostAttachment" (
    "postId" TEXT NOT NULL,
    "attachmentId" TEXT NOT NULL,

    CONSTRAINT "DiscussionPostAttachment_pkey" PRIMARY KEY ("postId","attachmentId")
);

-- CreateTable
CREATE TABLE "public"."DiscussionCommentAttachment" (
    "commentId" TEXT NOT NULL,
    "attachmentId" TEXT NOT NULL,

    CONSTRAINT "DiscussionCommentAttachment_pkey" PRIMARY KEY ("commentId","attachmentId")
);

-- CreateIndex
CREATE UNIQUE INDEX "Request_globalNumber_key" ON "public"."Request"("globalNumber");

-- CreateIndex
CREATE INDEX "Request_authorId_status_lastMessageAt_idx" ON "public"."Request"("authorId", "status", "lastMessageAt");

-- CreateIndex
CREATE INDEX "Request_target_status_lastMessageAt_idx" ON "public"."Request"("target", "status", "lastMessageAt");

-- CreateIndex
CREATE INDEX "Request_target_targetNumber_idx" ON "public"."Request"("target", "targetNumber");

-- CreateIndex
CREATE UNIQUE INDEX "Request_target_targetNumber_key" ON "public"."Request"("target", "targetNumber");

-- CreateIndex
CREATE INDEX "RequestMessage_requestId_createdAt_idx" ON "public"."RequestMessage"("requestId", "createdAt");

-- CreateIndex
CREATE INDEX "DiscussionPost_createdAt_idx" ON "public"."DiscussionPost"("createdAt");

-- CreateIndex
CREATE INDEX "DiscussionComment_postId_createdAt_idx" ON "public"."DiscussionComment"("postId", "createdAt");

-- CreateIndex
CREATE INDEX "DiscussionPostAttachment_attachmentId_idx" ON "public"."DiscussionPostAttachment"("attachmentId");

-- CreateIndex
CREATE INDEX "DiscussionCommentAttachment_attachmentId_idx" ON "public"."DiscussionCommentAttachment"("attachmentId");

-- AddForeignKey
ALTER TABLE "public"."Request" ADD CONSTRAINT "Request_authorId_fkey" FOREIGN KEY ("authorId") REFERENCES "public"."User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."Request" ADD CONSTRAINT "Request_processedById_fkey" FOREIGN KEY ("processedById") REFERENCES "public"."User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."RequestMessage" ADD CONSTRAINT "RequestMessage_requestId_fkey" FOREIGN KEY ("requestId") REFERENCES "public"."Request"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."RequestMessage" ADD CONSTRAINT "RequestMessage_authorId_fkey" FOREIGN KEY ("authorId") REFERENCES "public"."User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."DiscussionPost" ADD CONSTRAINT "DiscussionPost_authorId_fkey" FOREIGN KEY ("authorId") REFERENCES "public"."User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."DiscussionComment" ADD CONSTRAINT "DiscussionComment_postId_fkey" FOREIGN KEY ("postId") REFERENCES "public"."DiscussionPost"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."DiscussionComment" ADD CONSTRAINT "DiscussionComment_authorId_fkey" FOREIGN KEY ("authorId") REFERENCES "public"."User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."DiscussionReaction" ADD CONSTRAINT "DiscussionReaction_postId_fkey" FOREIGN KEY ("postId") REFERENCES "public"."DiscussionPost"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."DiscussionReaction" ADD CONSTRAINT "DiscussionReaction_userId_fkey" FOREIGN KEY ("userId") REFERENCES "public"."User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."DiscussionPostAttachment" ADD CONSTRAINT "DiscussionPostAttachment_postId_fkey" FOREIGN KEY ("postId") REFERENCES "public"."DiscussionPost"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."DiscussionPostAttachment" ADD CONSTRAINT "DiscussionPostAttachment_attachmentId_fkey" FOREIGN KEY ("attachmentId") REFERENCES "public"."Attachment"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."DiscussionCommentAttachment" ADD CONSTRAINT "DiscussionCommentAttachment_commentId_fkey" FOREIGN KEY ("commentId") REFERENCES "public"."DiscussionComment"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."DiscussionCommentAttachment" ADD CONSTRAINT "DiscussionCommentAttachment_attachmentId_fkey" FOREIGN KEY ("attachmentId") REFERENCES "public"."Attachment"("id") ON DELETE CASCADE ON UPDATE CASCADE;
