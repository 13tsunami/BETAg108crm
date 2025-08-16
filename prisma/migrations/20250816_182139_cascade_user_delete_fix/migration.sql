-- === Каскадное удаление пользователя и связанных данных ===

-- Thread.aId / Thread.bId
ALTER TABLE "Thread" DROP CONSTRAINT IF EXISTS "Thread_aId_fkey";
ALTER TABLE "Thread" DROP CONSTRAINT IF EXISTS "Thread_bId_fkey";

ALTER TABLE "Thread"
  ADD CONSTRAINT "Thread_aId_fkey"
  FOREIGN KEY ("aId") REFERENCES "User"("id")
  ON UPDATE CASCADE ON DELETE CASCADE;

ALTER TABLE "Thread"
  ADD CONSTRAINT "Thread_bId_fkey"
  FOREIGN KEY ("bId") REFERENCES "User"("id")
  ON UPDATE CASCADE ON DELETE CASCADE;

-- Message.authorId / Message.threadId
ALTER TABLE "Message" DROP CONSTRAINT IF EXISTS "Message_authorId_fkey";
ALTER TABLE "Message" DROP CONSTRAINT IF EXISTS "Message_threadId_fkey";

ALTER TABLE "Message"
  ADD CONSTRAINT "Message_authorId_fkey"
  FOREIGN KEY ("authorId") REFERENCES "User"("id")
  ON UPDATE CASCADE ON DELETE CASCADE;

ALTER TABLE "Message"
  ADD CONSTRAINT "Message_threadId_fkey"
  FOREIGN KEY ("threadId") REFERENCES "Thread"("id")
  ON UPDATE CASCADE ON DELETE CASCADE;

-- Attachment.messageId
ALTER TABLE "Attachment" DROP CONSTRAINT IF EXISTS "Attachment_messageId_fkey";

ALTER TABLE "Attachment"
  ADD CONSTRAINT "Attachment_messageId_fkey"
  FOREIGN KEY ("messageId") REFERENCES "Message"("id")
  ON UPDATE CASCADE ON DELETE CASCADE;

-- ReadMark.threadId / ReadMark.userId
ALTER TABLE "ReadMark" DROP CONSTRAINT IF EXISTS "ReadMark_threadId_fkey";
ALTER TABLE "ReadMark" DROP CONSTRAINT IF EXISTS "ReadMark_userId_fkey";

ALTER TABLE "ReadMark"
  ADD CONSTRAINT "ReadMark_threadId_fkey"
  FOREIGN KEY ("threadId") REFERENCES "Thread"("id")
  ON UPDATE CASCADE ON DELETE CASCADE;

ALTER TABLE "ReadMark"
  ADD CONSTRAINT "ReadMark_userId_fkey"
  FOREIGN KEY ("userId") REFERENCES "User"("id")
  ON UPDATE CASCADE ON DELETE CASCADE;

-- GroupMember.userId / GroupMember.groupId
ALTER TABLE "GroupMember" DROP CONSTRAINT IF EXISTS "GroupMember_userId_fkey";
ALTER TABLE "GroupMember" DROP CONSTRAINT IF EXISTS "GroupMember_groupId_fkey";

ALTER TABLE "GroupMember"
  ADD CONSTRAINT "GroupMember_userId_fkey"
  FOREIGN KEY ("userId") REFERENCES "User"("id")
  ON UPDATE CASCADE ON DELETE CASCADE;

ALTER TABLE "GroupMember"
  ADD CONSTRAINT "GroupMember_groupId_fkey"
  FOREIGN KEY ("groupId") REFERENCES "Group"("id")
  ON UPDATE CASCADE ON DELETE CASCADE;

-- TaskAssignee.userId / TaskAssignee.taskId
ALTER TABLE "TaskAssignee" DROP CONSTRAINT IF EXISTS "TaskAssignee_userId_fkey";
ALTER TABLE "TaskAssignee" DROP CONSTRAINT IF EXISTS "TaskAssignee_taskId_fkey";

ALTER TABLE "TaskAssignee"
  ADD CONSTRAINT "TaskAssignee_userId_fkey"
  FOREIGN KEY ("userId") REFERENCES "User"("id")
  ON UPDATE CASCADE ON DELETE CASCADE;

ALTER TABLE "TaskAssignee"
  ADD CONSTRAINT "TaskAssignee_taskId_fkey"
  FOREIGN KEY ("taskId") REFERENCES "Task"("id")
  ON UPDATE CASCADE ON DELETE CASCADE;

-- MessageHide.messageId / MessageHide.userId
ALTER TABLE "MessageHide" DROP CONSTRAINT IF EXISTS "MessageHide_messageId_fkey";
ALTER TABLE "MessageHide" DROP CONSTRAINT IF EXISTS "MessageHide_userId_fkey";

ALTER TABLE "MessageHide"
  ADD CONSTRAINT "MessageHide_messageId_fkey"
  FOREIGN KEY ("messageId") REFERENCES "Message"("id")
  ON UPDATE CASCADE ON DELETE CASCADE;

ALTER TABLE "MessageHide"
  ADD CONSTRAINT "MessageHide_userId_fkey"
  FOREIGN KEY ("userId") REFERENCES "User"("id")
  ON UPDATE CASCADE ON DELETE CASCADE;