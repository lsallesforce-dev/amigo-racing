-- Pontuação configurável por campeonato + DNS como dado de verdade.
--
-- A pontuação era a tabela da CBA, cravada no código, e ainda por cima congelada
-- na gravação do resultado (championship_results.points). Trocar a regra não
-- corrigia nada do que já estava salvo. Agora o campeonato guarda qual tabela
-- usa ("regulamento" | "cba" | "custom") e o cálculo passa a ser feito na
-- LEITURA, a partir de posição/DSQ/DNS.
--
-- `allowDiscardDisqualified` separa o que era uma flag só: até aqui
-- `allowDiscardMissedStages` governava o descarte de quem FALTOU e de quem foi
-- DESCLASSIFICADO ao mesmo tempo — regras diferentes, decisões diferentes.
-- Default false: o descarte de DSQ tem que ser uma escolha explícita do organizador.
--
-- `isDns` deixa de ser adivinhado por "position = 0": quem não largou aparece na
-- classificação com 0 ponto, marcado como DNS, em vez de sumir da tabela.
--
-- Idempotente: pode rodar de novo sem quebrar nada.
--   npx tsx lib/migrate.ts lib/migrations/2026-08-04-campeonato-pontuacao.sql

ALTER TABLE championships        ADD COLUMN IF NOT EXISTS "pointsTable" json;
ALTER TABLE championships        ADD COLUMN IF NOT EXISTS "pointsPreset" varchar(30) DEFAULT 'regulamento' NOT NULL;
ALTER TABLE championships        ADD COLUMN IF NOT EXISTS "allowDiscardDisqualified" boolean DEFAULT false NOT NULL;
ALTER TABLE championship_results ADD COLUMN IF NOT EXISTS "isDns" boolean DEFAULT false NOT NULL;

-- Memória das decisões de nome tomadas na importação.
--
-- O competidor do campeonato é uma STRING digitada por quem monta a planilha:
-- "Rogerião" na 1ª etapa e "Rogério Flávio Paggioro" na 2ª viram duas pessoas,
-- cada uma com metade dos pontos. Na 2ª planilha em diante o importador pergunta
-- ("esse nome é o mesmo que esse?") — e a resposta mora aqui, para a 3ª planilha
-- NÃO reperguntar.
--
-- `aliasNorm` é o nome já normalizado (sem acento, minúsculo, espaço colapsado):
-- é a chave de busca. `isDistinct = true` guarda o "não, são pessoas diferentes",
-- que é tão importante quanto o "sim" — sem ele o popup repete para sempre.
CREATE TABLE IF NOT EXISTS championship_name_aliases (
  id serial PRIMARY KEY,
  "championshipId" integer NOT NULL,
  "aliasNorm" varchar(200) NOT NULL,
  "canonicalName" varchar(200) NOT NULL,
  "isDistinct" boolean DEFAULT false NOT NULL,
  "createdAt" timestamp DEFAULT now() NOT NULL
);

CREATE UNIQUE INDEX IF NOT EXISTS championship_name_aliases_unq
  ON championship_name_aliases ("championshipId", "aliasNorm");
