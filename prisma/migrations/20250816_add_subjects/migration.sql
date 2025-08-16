-- CreateTable Subject
CREATE TABLE "Subject" (
  "id"   TEXT NOT NULL,
  "name" TEXT NOT NULL,
  CONSTRAINT "Subject_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "Subject_name_key" UNIQUE ("name")
);

-- CreateTable SubjectMember
CREATE TABLE "SubjectMember" (
  "id"        TEXT NOT NULL,
  "userId"    TEXT NOT NULL,
  "subjectId" TEXT NOT NULL,
  CONSTRAINT "SubjectMember_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "SubjectMember_userId_subjectId_key" UNIQUE ("userId","subjectId"),
  CONSTRAINT "SubjectMember_userId_fkey"
    FOREIGN KEY ("userId") REFERENCES "User"("id")
    ON UPDATE CASCADE ON DELETE CASCADE,
  CONSTRAINT "SubjectMember_subjectId_fkey"
    FOREIGN KEY ("subjectId") REFERENCES "Subject"("id")
    ON UPDATE CASCADE ON DELETE CASCADE
);

-- (при желании индексы на lookups)
CREATE INDEX "Subject_name_idx" ON "Subject" ("name");
CREATE INDEX "SubjectMember_userId_idx" ON "SubjectMember" ("userId");
CREATE INDEX "SubjectMember_subjectId_idx" ON "SubjectMember" ("subjectId");
