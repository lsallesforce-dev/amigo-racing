-- Campeonato: cada ARQUIVO de planilha é um EVENTO e cada coluna ETAPA-N é uma
-- PROVA daquele evento. Antes o ETAPA-N era tratado como numeração global do
-- campeonato, então o "ETAPA-1" do 7º Rally do Cavalo e o "ETAPA-1" do Rally do
-- Amigo Ida caíam na MESMA linha de championship_stages — a tabela mostrava
-- "E1, E1, E2, E2" e o resultado de um arquivo ia parar na prova do outro.
--
-- Agora championship_stages é UMA PROVA:
--   - provaNumber = o N do ETAPA-N dentro do arquivo/evento;
--   - eventoNome  = o evento a que a prova pertence (quando não é evento da plataforma);
--   - stageNumber CONTINUA sendo a ordem GLOBAL dentro do campeonato (é o que
--     ordena as colunas da classificação e o que o desempate "última etapa" usa).
--
-- A identidade de uma prova (para reimportar não duplicar) é
-- (championshipId, evento, provaNumber), onde evento = eventId quando é evento
-- da plataforma e o eventoNome normalizado quando é externo.
--
-- Idempotente: pode rodar mais de uma vez sem quebrar.

ALTER TABLE championship_stages ADD COLUMN IF NOT EXISTS "eventoNome" varchar(200);
ALTER TABLE championship_stages ADD COLUMN IF NOT EXISTS "provaNumber" integer DEFAULT 1 NOT NULL;

-- Dica de conciliação de nomes por e-mail. NÃO é casamento automático: o e-mail
-- da planilha fica na linha do PILOTO e costuma ser o contato da DUPLA (no Ida,
-- "Zé do Café" tem o e-mail do navegador "Vado"), então ele identifica
-- dupla+posição, não pessoa. Só vale escopado por papel e como SUGESTÃO que o
-- organizador confirma.
--
-- ⚠️ Dado pessoal: esta tabela NUNCA pode sair por procedure público
-- (getStageResults é publicProcedure) — por isso o e-mail não encosta em
-- championship_results.
CREATE TABLE IF NOT EXISTS championship_competitor_emails (
  id serial PRIMARY KEY,
  "championshipId" integer NOT NULL,
  "emailNorm" varchar(200) NOT NULL,
  "papel" varchar(20) NOT NULL,          -- 'pilot' | 'navigator'
  "canonicalName" varchar(200) NOT NULL,
  "createdAt" timestamp DEFAULT now() NOT NULL
);
CREATE UNIQUE INDEX IF NOT EXISTS championship_competitor_emails_unq
  ON championship_competitor_emails ("championshipId", "emailNorm", "papel");
