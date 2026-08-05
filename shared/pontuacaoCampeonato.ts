// Tabela de pontos do campeonato.
//
// Até aqui a pontuação era a tabela da CBA, cravada em api/_server/utils/cbaRules.ts,
// e — pior — era CONGELADA na gravação: `saveStageResults` calculava os pontos e
// gravava em championship_results.points. Trocar a regra depois não corrigia nada
// do que já estava salvo, e cada campeonato do Amigo usa um regulamento próprio.
//
// Aqui a tabela vira dado: o campeonato guarda um preset ("regulamento" | "cba" |
// "custom") e, no caso do custom, um json {posicao: pontos}. Quem calcula é a
// LEITURA (shared/classificacaoCampeonato.ts) — o banco só guarda posição/DSQ/DNS.

/** {posição: pontos}. Posição que não estiver na tabela vale 0. */
export type TabelaPontos = Record<number, number>;

/** Padrão do regulamento do Amigo Racing: 11º em diante não pontua. */
export const TABELA_REGULAMENTO: TabelaPontos = Object.freeze({
  1: 25,
  2: 22,
  3: 20,
  4: 18,
  5: 16,
  6: 14,
  7: 12,
  8: 10,
  9: 8,
  10: 6,
});

/** Tabela da CBA (Confederação Brasileira de Automobilismo), 1º ao 15º. */
export const TABELA_CBA: TabelaPontos = Object.freeze({
  1: 17,
  2: 15,
  3: 14,
  4: 13,
  5: 12,
  6: 11,
  7: 10,
  8: 9,
  9: 8,
  10: 7,
  11: 6,
  12: 5,
  13: 4,
  14: 3,
  15: 2,
});

export type IdPreset = "regulamento" | "cba" | "custom";

export interface PresetPontuacao {
  id: IdPreset;
  nome: string;
  descricao: string;
  /** No "custom" é só o ponto de partida da edição. */
  tabela: TabelaPontos;
}

/** Preset de campeonato criado antes desta feature (default da coluna no banco). */
export const PRESET_PADRAO: IdPreset = "regulamento";

export const PRESETS_PONTUACAO: PresetPontuacao[] = [
  {
    id: "regulamento",
    nome: "Regulamento Amigo Racing",
    descricao: "25, 22, 20, 18, 16, 14, 12, 10, 8, 6 — do 11º em diante não pontua.",
    tabela: TABELA_REGULAMENTO,
  },
  {
    id: "cba",
    nome: "Tabela CBA",
    descricao: "17, 15, 14, 13, 12, 11, 10, 9, 8, 7, 6, 5, 4, 3, 2 — pontua até o 15º.",
    tabela: TABELA_CBA,
  },
  {
    id: "custom",
    nome: "Personalizada",
    descricao: "Pontuação definida pelo organizador, posição por posição.",
    tabela: TABELA_REGULAMENTO,
  },
];

/** Só para a UI mostrar a cara da tabela numa linha: "25, 22, 20, 18…". */
export function descreverTabela(tabela: TabelaPontos, limite = 10): string {
  const posicoes = Object.keys(tabela)
    .map(Number)
    .filter(p => Number.isFinite(p))
    .sort((a, b) => a - b);
  const cabeca = posicoes.slice(0, limite).map(p => tabela[p]);
  return cabeca.join(", ") + (posicoes.length > limite ? "…" : "");
}

/**
 * Aceita o que vier do banco (json objeto, json array ou string com json) e
 * devolve uma tabela sã. Qualquer coisa inválida cai no padrão do regulamento —
 * campeonato NUNCA fica sem pontuação por causa de um json torto.
 *
 * Array é aceito por conveniência da UI: [25, 22, 20] = 1º, 2º, 3º.
 */
export function normalizarTabela(valor: unknown): TabelaPontos {
  let cru: unknown = valor;

  if (typeof cru === "string") {
    try {
      cru = JSON.parse(cru);
    } catch {
      return TABELA_REGULAMENTO;
    }
  }

  if (Array.isArray(cru)) {
    const daLista: TabelaPontos = {};
    cru.forEach((pontos, i) => {
      const n = Number(pontos);
      if (Number.isFinite(n) && n >= 0) daLista[i + 1] = n;
    });
    return Object.keys(daLista).length > 0 ? daLista : TABELA_REGULAMENTO;
  }

  if (!cru || typeof cru !== "object") return TABELA_REGULAMENTO;

  const tabela: TabelaPontos = {};
  for (const [chave, bruto] of Object.entries(cru as Record<string, unknown>)) {
    const posicao = Number(chave);
    const pontos = Number(bruto);
    // Posição tem que ser inteiro >= 1; pontos, número finito >= 0.
    if (!Number.isInteger(posicao) || posicao < 1) continue;
    if (!Number.isFinite(pontos) || pontos < 0) continue;
    tabela[posicao] = pontos;
  }

  return Object.keys(tabela).length > 0 ? tabela : TABELA_REGULAMENTO;
}

/**
 * Pontos de UM resultado. Vale 0 para desclassificado (DSQ/NC), para quem não
 * largou (DNS), para posição inválida (<= 0) e para posição fora da tabela.
 */
export function calcularPontos(
  posicao: number,
  isDsq: boolean,
  isDns: boolean,
  tabela: TabelaPontos,
): number {
  if (isDsq || isDns) return 0;
  const p = Number(posicao);
  if (!Number.isFinite(p) || p <= 0) return 0;
  const pontos = tabela[Math.trunc(p)];
  return Number.isFinite(pontos) ? pontos : 0;
}

/**
 * A tabela que vale para o campeonato, a partir das duas colunas do banco
 * (`pointsPreset` e `pointsTable`). Campeonato antigo (preset nulo) usa a tabela
 * custom se ela existir, senão o regulamento.
 */
export function resolverTabela(pointsPreset: string | null | undefined, pointsTable: unknown): TabelaPontos {
  const preset = (pointsPreset || "").trim().toLowerCase();

  if (preset === "cba") return TABELA_CBA;
  if (preset === "regulamento") return TABELA_REGULAMENTO;
  if (preset === "custom") return normalizarTabela(pointsTable);

  // Sem preset (dado anterior à migração): honra a tabela se houver uma válida.
  return normalizarTabela(pointsTable);
}
