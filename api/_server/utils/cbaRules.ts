/**
 * Regras de pontuação da CBA — agora só uma casca fina.
 *
 * A tabela virou dado do campeonato (shared/pontuacaoCampeonato.ts): cada
 * campeonato escolhe entre o regulamento do Amigo Racing, a tabela da CBA ou uma
 * personalizada, e o cálculo acontece na LEITURA da classificação.
 *
 * Este arquivo continua existindo porque pages/ChampionshipDetails.tsx importa
 * daqui (o front atravessa a fronteira da API) — remover quebraria o build antes
 * da refatoração da tela terminar. Código novo deve importar de
 * shared/pontuacaoCampeonato.ts direto.
 *
 * @deprecated use `resolverTabela` + `calcularPontos` de shared/pontuacaoCampeonato.ts
 */

import { TABELA_CBA, calcularPontos } from "../../../shared/pontuacaoCampeonato.js";

/** @deprecated re-export de TABELA_CBA. */
export const CBA_POINTS_TABLE: Record<number, number> = TABELA_CBA;

/**
 * Pontos pela tabela da CBA. Desclassificado (ou fora da tabela) faz 0.
 *
 * @deprecated a pontuação do campeonato pode não ser a da CBA — use
 * `calcularPontos(posicao, isDsq, isDns, tabela)` com a tabela do campeonato.
 */
export const calculateCbaPoints = (position: number, isDisqualified: boolean = false): number => {
  return calcularPontos(position, isDisqualified, false, TABELA_CBA);
};
