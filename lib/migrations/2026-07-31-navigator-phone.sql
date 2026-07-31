-- Telefone do navegador. Até aqui existia só `phone` (do piloto), então a lista
-- de montagem de kits tinha um contato só por inscrição.
ALTER TABLE registrations ADD COLUMN IF NOT EXISTS "navigatorPhone" varchar(20);
