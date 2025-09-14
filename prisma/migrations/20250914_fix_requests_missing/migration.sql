-- Создаём расширение для uuid, если его нет (Prisma обычно использует gen_random_uuid())
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- 1) ENUM RequestStatus (если отсутствует)
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type t WHERE t.typname = 'RequestStatus') THEN
    CREATE TYPE "RequestStatus" AS ENUM ('new', 'in_progress', 'done', 'rejected');
  END IF;
END $$;

-- 2) Таблица "Request" (если отсутствует)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = 'Request'
  ) THEN
    CREATE TABLE "public"."Request" (
      "id"            uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
      "createdAt"     timestamp   NOT NULL DEFAULT now(),
      "updatedAt"     timestamp   NOT NULL DEFAULT now(),
      "authorId"      uuid        NOT NULL,
      "target"        text        NOT NULL,
      "status"        "RequestStatus" NOT NULL DEFAULT 'new',
      "title"         text        NOT NULL,
      "body"          text        NOT NULL,
      "processedById" uuid        NULL,
      "closedAt"      timestamp   NULL,
      "rejectedReason" text       NULL,
      "lastMessageAt" timestamp   NOT NULL DEFAULT now(),
      "globalNumber"  integer     NOT NULL,
      "targetNumber"  integer     NULL
    );

    CREATE SEQUENCE IF NOT EXISTS "Request_globalNumber_seq"
      START WITH 1 INCREMENT BY 1 NO MINVALUE NO MAXVALUE CACHE 1;
    ALTER SEQUENCE "Request_globalNumber_seq" OWNED BY "public"."Request"."globalNumber";
    ALTER TABLE "public"."Request"
      ALTER COLUMN "globalNumber" SET DEFAULT nextval('Request_globalNumber_seq');

    ALTER TABLE "public"."Request" ADD CONSTRAINT "Request_globalNumber_key" UNIQUE ("globalNumber");
    CREATE UNIQUE INDEX IF NOT EXISTS "Request_target_targetNumber_key"
      ON "public"."Request" ("target","targetNumber");

    CREATE INDEX IF NOT EXISTS "Request_author_status_lastMessageAt_idx"
      ON "public"."Request" ("authorId","status","lastMessageAt");
    CREATE INDEX IF NOT EXISTS "Request_target_status_lastMessageAt_idx"
      ON "public"."Request" ("target","status","lastMessageAt");
    CREATE INDEX IF NOT EXISTS "Request_target_targetNumber_idx"
      ON "public"."Request" ("target","targetNumber");

    ALTER TABLE "public"."Request"
      ADD CONSTRAINT "Request_authorId_fkey"
      FOREIGN KEY ("authorId") REFERENCES "public"."User"("id") ON DELETE CASCADE;

    ALTER TABLE "public"."Request"
      ADD CONSTRAINT "Request_processedById_fkey"
      FOREIGN KEY ("processedById") REFERENCES "public"."User"("id") ON DELETE SET NULL;
  END IF;
END $$;

-- 3) Таблица "RequestMessage" (если отсутствует)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = 'RequestMessage'
  ) THEN
    CREATE TABLE "public"."RequestMessage" (
      "id"         uuid      PRIMARY KEY DEFAULT gen_random_uuid(),
      "createdAt"  timestamp NOT NULL DEFAULT now(),
      "requestId"  uuid      NOT NULL,
      "authorId"   uuid      NOT NULL,
      "body"       text      NOT NULL
    );

    CREATE INDEX IF NOT EXISTS "RequestMessage_requestId_createdAt_idx"
      ON "public"."RequestMessage" ("requestId","createdAt");

    ALTER TABLE "public"."RequestMessage"
      ADD CONSTRAINT "RequestMessage_requestId_fkey"
      FOREIGN KEY ("requestId") REFERENCES "public"."Request"("id") ON DELETE CASCADE;

    ALTER TABLE "public"."RequestMessage"
      ADD CONSTRAINT "RequestMessage_authorId_fkey"
      FOREIGN KEY ("authorId") REFERENCES "public"."User"("id") ON DELETE CASCADE;
  END IF;
END $$;

-- 4) Триггер для обновления "updatedAt"
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_proc WHERE proname = 'set_current_timestamp_updated_at') THEN
    CREATE OR REPLACE FUNCTION set_current_timestamp_updated_at()
    RETURNS TRIGGER AS $$
    BEGIN
      NEW."updatedAt" = now();
      RETURN NEW;
    END;
    $$ LANGUAGE plpgsql;
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_trigger
    WHERE tgname = 'Request_updatedAt_trigger'
  ) THEN
    CREATE TRIGGER "Request_updatedAt_trigger"
    BEFORE UPDATE ON "public"."Request"
    FOR EACH ROW
    EXECUTE PROCEDURE set_current_timestamp_updated_at();
  END IF;
END $$;
