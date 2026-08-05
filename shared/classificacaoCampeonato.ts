// Motor da classificação do campeonato — função PURA, sem banco.
//
// Antes isto vivia dentro de calculateChampionshipStandings (api/_server/backend_routers/
// championship.ts), misturado com queries. Três problemas nasciam daí:
//
//  1. Os pontos vinham de championship_results.points, congelados na hora da
//     gravação. Trocar a tabela de pontos não mexia no que já estava salvo.
//     Aqui o ponto é SEMPRE recalculado a partir de posição/DSQ/DNS + tabela.
//  2. Quem não largou (DNS) sumia da tabela — o competidor "desaparecia" do
//     campeonato ao faltar numa etapa. Agora ele aparece, com 0 e marcado DNS.
//  3. Uma flag só (`allowDiscardMissedStages`) governava o descarte de DNS E de
//     DSQ. São regras diferentes: faltar não é a mesma coisa que ser excluído.
//     Agora são duas flags independentes.
//
// Além disso, os empates eram resolvidos pela ordem em que o Array.sort recebeu
// os dados (instável na prática). Aqui tudo é determinístico: mesmo dado de
// entrada, em qualquer ordem, sai a mesma classificação.

import { calcularPontos, type TabelaPontos } from "./pontuacaoCampeonato.js";

export type PapelCompetidor = "pilot" | "navigator";

export interface EtapaClassificacao {
  id: number;
  /** É por ele que "última etapa" é decidida — o id do banco não é confiável para isso. */
  stageNumber: number;
  nome: string;
}

/** Uma linha de championship_results, sem os campos que não interessam ao cálculo. */
export interface ResultadoBruto {
  stageId: number;
  category: string | null;
  pilotName: string | null;
  navigatorName: string | null;
  position: number;
  isDisqualified: boolean;
  isDns: boolean;
}

export interface ConfigClassificacao {
  /** N-x: quantos piores resultados cada competidor descarta. 0 = ninguém descarta. */
  discardRule: number;
  /** Pode descartar etapa em que não largou (DNS)? */
  allowDiscardMissedStages: boolean;
  /** Pode descartar etapa em que foi desclassificado (DSQ/NC)? */
  allowDiscardDisqualified: boolean;
  tabela: TabelaPontos;
}

export interface ResultadoEtapa {
  stageId: number;
  stageNumber: number;
  points: number;
  position: number;
  isDisqualified: boolean;
  isDiscarded: boolean;
  /** Não largou (ou não existe linha dele nesta etapa). */
  isDns: boolean;
}

export interface CompetidorClassificado {
  name: string;
  category: string;
  role: PapelCompetidor;
  /** UMA entrada por etapa do campeonato, em ordem de stageNumber — DNS inclusive. */
  stageResults: ResultadoEtapa[];
  grossPoints: number;
  netPoints: number;
  /** Só as colocações válidas (sem DSQ, sem DNS), em ordem de etapa. */
  positionHistory: number[];
  /** countback[p] = quantas vezes terminou em p-ésimo. Índice 0 nunca é usado. */
  countback: number[];
  /** Quantas etapas ele de fato completou (posição válida). */
  etapasCorridas: number;
  /** Colocação no campeonato, 1-based. Empate de verdade repete o número. */
  posicao: number;
}

export interface CategoriaClassificacao {
  name: string;
  pilots: CompetidorClassificado[];
  navigators: CompetidorClassificado[];
}

export interface EntradaClassificacao {
  etapas: EtapaClassificacao[];
  resultados: ResultadoBruto[];
  config: ConfigClassificacao;
}

export interface SaidaClassificacao {
  categorias: CategoriaClassificacao[];
}

/** Posição "de verdade" — a que conta para desempate e para histórico. */
function posicaoValida(r: { position: number; isDisqualified: boolean; isDns: boolean }): boolean {
  return !r.isDisqualified && !r.isDns && Number.isFinite(r.position) && r.position > 0;
}

/**
 * Lixo que o importador antigo deixou no banco: nome "-" e a string "false"
 * (booleano serializado por engano). Sem isto a classificação ganha competidores
 * fantasma chamados "false".
 */
export function nomeDeCompetidorValido(nome: string | null | undefined): boolean {
  const limpo = (nome || "").trim();
  if (!limpo) return false;
  if (limpo === "-" || limpo === "--") return false;
  const min = limpo.toLowerCase();
  return min !== "false" && min !== "null" && min !== "undefined";
}

const CHAVE = (nome: string, categoria: string, papel: string) => `${nome}|${categoria}|${papel}`;

interface Interno {
  pub: CompetidorClassificado;
  porEtapa: Map<number, ResultadoEtapa>;
}

/**
 * Compara dois competidores pelo §13.1 do regulamento, SEM o desempate final por
 * nome — é isto que decide se o empate é real (para dois competidores dividirem
 * a mesma colocação).
 */
function compararRegulamento(a: CompetidorClassificado, b: CompetidorClassificado): number {
  // 1) pontos líquidos (já com descarte)
  if (b.netPoints !== a.netPoints) return b.netPoints - a.netPoints;

  // 2) pontos brutos (quem descartou menos coisa boa)
  if (b.grossPoints !== a.grossPoints) return b.grossPoints - a.grossPoints;

  // 3) countback: mais 1ºs lugares, depois mais 2ºs, e assim por diante.
  //    O vetor vem pronto do cálculo — recalcular aqui dentro tornava o sort O(n²).
  const maxPos = Math.max(a.countback.length, b.countback.length) - 1;
  for (let p = 1; p <= maxPos; p++) {
    const ca = a.countback[p] || 0;
    const cb = b.countback[p] || 0;
    if (ca !== cb) return cb - ca;
  }

  // 4) melhor colocação na última etapa em que AMBOS correram. "Última" é o maior
  //    stageNumber — o código antigo usava o stageId como proxy de recência, o que
  //    inverte o critério quando as etapas são cadastradas fora de ordem.
  const posA = new Map<number, number>();
  for (const sr of a.stageResults) if (posicaoValida(sr)) posA.set(sr.stageNumber, sr.position);
  const comuns: { n: number; pa: number; pb: number }[] = [];
  for (const sr of b.stageResults) {
    if (!posicaoValida(sr)) continue;
    const pa = posA.get(sr.stageNumber);
    if (pa !== undefined) comuns.push({ n: sr.stageNumber, pa, pb: sr.position });
  }
  comuns.sort((x, y) => y.n - x.n);
  for (const c of comuns) {
    if (c.pa !== c.pb) return c.pa - c.pb;
  }

  return 0;
}

/**
 * Ordenação final da classificação: regulamento + desempate determinístico por
 * nome. O fallback por nome existe só para a ordem nunca depender da
 * estabilidade do sort — não é critério de regulamento, e por isso não conta
 * como desempate na hora de numerar as posições.
 */
export function compararCompetidores(a: CompetidorClassificado, b: CompetidorClassificado): number {
  const pelaRegra = compararRegulamento(a, b);
  if (pelaRegra !== 0) return pelaRegra;
  return a.name.localeCompare(b.name, "pt-BR");
}

/**
 * Marca como descartados os N piores resultados elegíveis (regra N-x).
 *
 * O empate entre candidatos com a MESMA pontuação era resolvido pela ordem em que
 * o array chegou. Aqui a ordem é: menor pontuação -> pior posição -> etapa mais
 * antiga. "Pior posição" trata DNS/DSQ como o fim da fila: entre um 11º lugar
 * (0 ponto) e um DSQ (0 ponto), o descartado é o DSQ.
 */
export function aplicarDescarte(
  stageResults: ResultadoEtapa[],
  config: Pick<ConfigClassificacao, "discardRule" | "allowDiscardMissedStages" | "allowDiscardDisqualified">,
): void {
  const quantidade = Math.max(0, Math.trunc(Number(config.discardRule) || 0));
  for (const sr of stageResults) sr.isDiscarded = false;
  if (quantidade === 0) return;

  const elegivel = (sr: ResultadoEtapa) => {
    if (sr.isDns) return config.allowDiscardMissedStages;
    if (sr.isDisqualified) return config.allowDiscardDisqualified;
    return true;
  };
  // DNS/DSQ não têm colocação: entram como o pior valor possível.
  const rankPosicao = (sr: ResultadoEtapa) => (posicaoValida(sr) ? sr.position : Number.MAX_SAFE_INTEGER);

  const candidatos = stageResults
    .filter(elegivel)
    .sort((a, b) =>
      a.points - b.points ||
      rankPosicao(b) - rankPosicao(a) ||
      a.stageNumber - b.stageNumber ||
      a.stageId - b.stageId,
    );

  for (let i = 0; i < Math.min(quantidade, candidatos.length); i++) {
    candidatos[i].isDiscarded = true;
  }
}

/**
 * A classificação inteira, a partir das etapas + linhas cruas de resultado.
 * Não toca no banco e não lê `points` de lugar nenhum: o ponto sai da tabela.
 */
export function calcularClassificacao(entrada: EntradaClassificacao): SaidaClassificacao {
  const etapas = [...(entrada.etapas || [])].sort(
    (a, b) => a.stageNumber - b.stageNumber || a.id - b.id,
  );
  const etapaPorId = new Map(etapas.map(e => [e.id, e]));
  const config = entrada.config;

  const competidores = new Map<string, Interno>();

  const anotar = (nome: string, categoria: string, papel: PapelCompetidor, r: ResultadoBruto, stageNumber: number) => {
    const limpo = nome.trim();
    const chave = CHAVE(limpo, categoria, papel);
    let interno = competidores.get(chave);
    if (!interno) {
      interno = {
        pub: {
          name: limpo,
          category: categoria,
          role: papel,
          stageResults: [],
          grossPoints: 0,
          netPoints: 0,
          positionHistory: [],
          countback: [],
          etapasCorridas: 0,
          posicao: 0,
        },
        porEtapa: new Map(),
      };
      competidores.set(chave, interno);
    }
    // Duas linhas do mesmo competidor na mesma etapa (dado sujo): vale a primeira.
    if (interno.porEtapa.has(r.stageId)) return;

    // Dado antigo gravava "não largou" como position 0 sem flag nenhuma.
    const isDns = !!r.isDns || (!r.isDisqualified && !(Number(r.position) > 0));
    interno.porEtapa.set(r.stageId, {
      stageId: r.stageId,
      stageNumber,
      points: 0,
      position: Number(r.position) || 0,
      isDisqualified: !!r.isDisqualified,
      isDiscarded: false,
      isDns,
    });
  };

  for (const r of entrada.resultados || []) {
    const etapa = etapaPorId.get(r.stageId);
    if (!etapa) continue; // resultado órfão (etapa apagada) não entra na conta
    const categoria = (r.category || "").trim() || "Geral";
    if (nomeDeCompetidorValido(r.pilotName)) anotar(r.pilotName as string, categoria, "pilot", r, etapa.stageNumber);
    if (nomeDeCompetidorValido(r.navigatorName)) anotar(r.navigatorName as string, categoria, "navigator", r, etapa.stageNumber);
  }

  const lista: CompetidorClassificado[] = [];

  for (const interno of competidores.values()) {
    const comp = interno.pub;

    // Etapa sem linha nenhuma do competidor também é DNS — é assim que quem
    // faltou continua aparecendo na tabela, com 0.
    for (const etapa of etapas) {
      const existente = interno.porEtapa.get(etapa.id);
      if (existente) {
        comp.stageResults.push(existente);
      } else {
        comp.stageResults.push({
          stageId: etapa.id,
          stageNumber: etapa.stageNumber,
          points: 0,
          position: 0,
          isDisqualified: false,
          isDiscarded: false,
          isDns: true,
        });
      }
    }
    comp.stageResults.sort((a, b) => a.stageNumber - b.stageNumber || a.stageId - b.stageId);

    for (const sr of comp.stageResults) {
      sr.points = calcularPontos(sr.position, sr.isDisqualified, sr.isDns, config.tabela);
    }

    comp.grossPoints = comp.stageResults.reduce((soma, sr) => soma + sr.points, 0);
    comp.positionHistory = comp.stageResults.filter(posicaoValida).map(sr => sr.position);
    comp.etapasCorridas = comp.positionHistory.length;

    const maxPos = comp.positionHistory.reduce((m, p) => Math.max(m, p), 0);
    comp.countback = new Array(maxPos + 1).fill(0);
    for (const p of comp.positionHistory) comp.countback[p]++;

    aplicarDescarte(comp.stageResults, config);
    comp.netPoints = comp.stageResults.reduce((soma, sr) => soma + (sr.isDiscarded ? 0 : sr.points), 0);

    lista.push(comp);
  }

  const nomesDeCategoria = Array.from(new Set(lista.map(c => c.category))).sort((a, b) =>
    a.localeCompare(b, "pt-BR"),
  );

  const numerar = (competidoresDaLista: CompetidorClassificado[]) => {
    const ordenados = [...competidoresDaLista].sort(compararCompetidores);
    let posicao = 0;
    ordenados.forEach((c, i) => {
      // Empate real (todos os critérios do regulamento iguais) divide a colocação.
      if (i === 0 || compararRegulamento(ordenados[i - 1], c) !== 0) posicao = i + 1;
      c.posicao = posicao;
    });
    return ordenados;
  };

  const categorias = nomesDeCategoria.map(nome => ({
    name: nome,
    pilots: numerar(lista.filter(c => c.category === nome && c.role === "pilot")),
    navigators: numerar(lista.filter(c => c.category === nome && c.role === "navigator")),
  }));

  return { categorias };
}
