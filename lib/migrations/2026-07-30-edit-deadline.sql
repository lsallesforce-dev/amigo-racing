-- Trava de edição da inscrição pelo competidor.
-- Aplicado à mão com `npm run migrate:edit-deadline`. Idempotente.
--
-- Padrão 2 dias: faltando 2 dias ou menos para o evento, só a organização edita.
-- 0 desliga a trava para aquele evento.
ALTER TABLE events ADD COLUMN IF NOT EXISTS "editDeadlineDays" integer NOT NULL DEFAULT 2;
