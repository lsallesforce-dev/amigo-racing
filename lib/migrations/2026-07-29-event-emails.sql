-- Central de e-mails do evento (envio manual + régua de cobrança).
-- Aplicado à mão com `npm run migrate:emails` (drizzle-kit não é usado neste projeto).
-- Idempotente: pode rodar de novo sem quebrar.

CREATE TABLE IF NOT EXISTS event_emails (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "eventId"     integer NOT NULL,
  subject       text NOT NULL,
  body          text NOT NULL,
  kind          varchar(30) NOT NULL DEFAULT 'manual',
  "autoStage"   varchar(20),
  filters       json,
  status        varchar(20) NOT NULL DEFAULT 'pending',
  "totalRecipients" integer NOT NULL DEFAULT 0,
  "sentCount"   integer NOT NULL DEFAULT 0,
  "failedCount" integer NOT NULL DEFAULT 0,
  "createdBy"   integer,
  "createdAt"   timestamp NOT NULL DEFAULT now(),
  "finishedAt"  timestamp
);

CREATE INDEX IF NOT EXISTS event_emails_event_idx ON event_emails ("eventId");

CREATE TABLE IF NOT EXISTS event_email_recipients (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "emailId"        uuid NOT NULL,
  "eventId"        integer NOT NULL,
  "registrationId" integer,
  email            varchar(320) NOT NULL,
  name             text,
  status           varchar(20) NOT NULL DEFAULT 'pending',
  error            text,
  "sentAt"         timestamp,
  "createdAt"      timestamp NOT NULL DEFAULT now(),
  CONSTRAINT event_email_recipients_unique UNIQUE ("emailId", email)
);

-- O laço de envio busca sempre "os pendentes deste disparo".
CREATE INDEX IF NOT EXISTS event_email_recipients_pending_idx
  ON event_email_recipients ("emailId", status);

-- Usado pela régua pra saber se aquele marco já foi enviado pra inscrição.
CREATE INDEX IF NOT EXISTS event_email_recipients_reg_idx
  ON event_email_recipients ("registrationId");

ALTER TABLE events ADD COLUMN IF NOT EXISTS "autoChargeEnabled" boolean NOT NULL DEFAULT false;
ALTER TABLE events ADD COLUMN IF NOT EXISTS "autoChargeSubject" text;
ALTER TABLE events ADD COLUMN IF NOT EXISTS "autoChargeBody" text;
