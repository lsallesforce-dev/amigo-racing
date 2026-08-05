// Teste da fundação do campeonato: tabela de pontos, descarte N-x, desempate do
// §13.1 e o parser das planilhas reais. Roda com: npm run check:campeonato
//
// NÃO toca no banco — de propósito. A parte que importa aqui é lógica pura, e o
// dado de verdade vem das duas planilhas que o organizador usa hoje:
//   - "Campeonato - Rally do Amigo Ida 2026 (3).xlsx"  (6 abas, formato LONGO)
//   - "Campeonato - 7º Rally do Cavalo.xlsx"           (as mesmas categorias, escritas diferente)
// e das duas exportações do Kraken que vivem na raiz do repo (formato LARGO).
//
// O `xlsx` só é usado AQUI, para transformar o arquivo em matriz. O parser
// (shared/importarPlanilhaCampeonato.ts) é puro e não conhece Excel.
import fs from "fs";
import * as XLSX from "xlsx";
import {
  TABELA_REGULAMENTO,
  TABELA_CBA,
  PRESETS_PONTUACAO,
  calcularPontos,
  normalizarTabela,
  resolverTabela,
} from "../shared/pontuacaoCampeonato.js";
import {
  calcularClassificacao,
  compararCompetidores,
  aplicarDescarte,
  type CompetidorClassificado,
  type EtapaClassificacao,
  type ResultadoBruto,
  type ResultadoEtapa,
} from "../shared/classificacaoCampeonato.js";
import {
  importarPlanilhaCampeonato,
  interpretarCelulaEtapa,
  normalizarCabecalho,
  chaveCategoria,
  planejarProvas,
  type AbaPlanilha,
  type ResultadoImportacao,
  type ResultadoImportado,
  type ProvaExistente,
} from "../shared/importarPlanilhaCampeonato.js";
import {
  normalizarNome,
  normalizarEmail,
  distanciaEdicao,
  semelhancaNomes,
  sugerirUnificacoes,
  conciliarNomes,
  similaridadeConciliacao,
  type DecisaoAlias,
  type DicaEmail,
} from "../shared/nomesCampeonato.js";

let falhas = 0;
const check = (nome: string, ok: boolean, detalhe: string) => {
  console.log(`${ok ? "OK  " : "FALHA"} | ${nome} -> ${detalhe}`);
  if (!ok) falhas++;
};

const PLANILHA_IDA = "C:\\Users\\lsaud\\Downloads\\Campeonato - Rally do Amigo Ida 2026 (3).xlsx";
const PLANILHA_CAVALO = "C:\\Users\\lsaud\\Downloads\\Campeonato - 7º Rally do Cavalo.xlsx";
const KRAKEN = "ExportarKraken.xlsx";
const LISTA_EVENTO = "ListaEvento.xlsx";

// ------------------------------------------------------------------ ferramentas

/** Lê o .xlsx e devolve exatamente o que o parser espera: matriz por aba. */
function lerAbas(caminho: string): AbaPlanilha[] | null {
  if (!fs.existsSync(caminho)) return null;
  const wb = XLSX.read(fs.readFileSync(caminho), { type: "buffer" });
  return wb.SheetNames.map(nome => ({
    nome,
    linhas: XLSX.utils.sheet_to_json(wb.Sheets[nome], { header: 1, raw: true, defval: null }) as any[][],
  }));
}

const etapasDe = (quantas: number): EtapaClassificacao[] =>
  Array.from({ length: quantas }, (_, i) => ({ id: 100 + i + 1, stageNumber: i + 1, nome: `Etapa ${i + 1}` }));

/** Linha crua de resultado, do jeito que sai de championship_results. */
function linha(
  stageId: number,
  categoria: string,
  piloto: string | null,
  position: number,
  extra: Partial<ResultadoBruto> = {},
): ResultadoBruto {
  return {
    stageId,
    category: categoria,
    pilotName: piloto,
    navigatorName: null,
    position,
    isDisqualified: false,
    isDns: false,
    ...extra,
  };
}

const acharPiloto = (saida: { categorias: any[] }, categoria: string, nome: string): CompetidorClassificado | undefined =>
  saida.categorias.find(c => c.name === categoria)?.pilots.find((p: CompetidorClassificado) => p.name === nome);

const resultadoEtapa = (over: Partial<ResultadoEtapa>): ResultadoEtapa => ({
  stageId: 1,
  stageNumber: 1,
  points: 0,
  position: 0,
  isDisqualified: false,
  isDiscarded: false,
  isDns: false,
  ...over,
});

/** Converte o que o parser devolveu em linhas de resultado, como a Onda 2 vai gravar. */
function paraResultados(imp: ResultadoImportacao, idPorEtapa: Map<number, number>): ResultadoBruto[] {
  return imp.resultados
    .filter(r => idPorEtapa.has(r.provaNumber))
    .map(r => ({
      stageId: idPorEtapa.get(r.provaNumber)!,
      category: r.categoria,
      pilotName: r.pilotName,
      navigatorName: r.navigatorName,
      position: r.position,
      isDisqualified: r.isDisqualified,
      isDns: r.isDns,
    }));
}

// ------------------------------------------ campeonato em memória (evento x prova)
//
// Espelho do que o `importWorkbook` faz no banco, sem banco: resolve o evento,
// acha/cria cada prova por (evento, provaNumber), grava PROVA A PROVA e limpa só
// as categorias que o arquivo traz. Serve para provar que duas planilhas no mesmo
// campeonato não se misturam e que reimportar é idempotente.

interface CampeonatoMemoria {
  provas: (ProvaExistente & { customName: string })[];
  resultados: { stageId: number; category: string; pilotName: string | null; navigatorName: string | null; provaNumber: number }[];
  proximoId: number;
}

const novoCampeonato = (): CampeonatoMemoria => ({ provas: [], resultados: [], proximoId: 1 });

function simularImport(
  campeonato: CampeonatoMemoria,
  opcoes: { abas: AbaPlanilha[]; eventoNome: string; provas?: number[] },
) {
  const parse = importarPlanilhaCampeonato(opcoes.abas);

  // Igual ao router: valida a seleção ANTES de resolver/criar qualquer prova.
  const pedidas = [...new Set(opcoes.provas || [])];
  const desconhecidas = pedidas.filter(p => !parse.provas.includes(p)).sort((a, b) => a - b);
  if (desconhecidas.length > 0) {
    throw new Error(
      `Esta planilha não tem a prova ${desconhecidas.join(", ")}. Provas do arquivo: ${parse.provas.join(", ") || "nenhuma"}.`,
    );
  }
  const provasImportadas = pedidas.length > 0 ? parse.provas.filter(p => pedidas.includes(p)) : [...parse.provas];

  const eventoChave = `nome:${normalizarNome(opcoes.eventoNome)}`;
  const plano = planejarProvas({
    provasDoArquivo: parse.provas,
    eventoChave,
    existentes: campeonato.provas,
    selecionadas: provasImportadas,
  });

  const idPorProva = new Map<number, number>();
  for (const p of plano.provas) {
    if (!p.criada) {
      idPorProva.set(p.provaNumber, p.stageId!);
      continue;
    }
    const stageId = campeonato.proximoId++;
    campeonato.provas.push({
      stageId,
      eventoChave,
      provaNumber: p.provaNumber,
      stageNumber: p.stageNumber,
      customName: `${opcoes.eventoNome} — Prova ${p.provaNumber}`,
    });
    idPorProva.set(p.provaNumber, stageId);
  }

  const linhas: CampeonatoMemoria["resultados"] = [];
  for (const provaNumber of provasImportadas) {
    const stageId = idPorProva.get(provaNumber);
    if (!stageId) continue;
    for (const r of parse.resultados) {
      if (r.provaNumber !== provaNumber) continue;
      linhas.push({
        stageId,
        category: r.categoria || "Geral",
        pilotName: r.pilotName,
        navigatorName: r.navigatorName,
        provaNumber,
      });
    }
  }

  // Por PROVA, limpa só as categorias que o arquivo traz (igual ao saveStageResults).
  const porProva = new Map<number, Set<string>>();
  for (const l of linhas) {
    if (!porProva.has(l.stageId)) porProva.set(l.stageId, new Set());
    porProva.get(l.stageId)!.add(l.category);
  }
  campeonato.resultados = campeonato.resultados.filter(r => !porProva.get(r.stageId)?.has(r.category));
  campeonato.resultados.push(...linhas);

  return {
    campeonato,
    provasImportadas,
    provasCriadas: plano.criadas,
    provasReaproveitadas: plano.reaproveitadas,
    resultadosGravados: linhas.length,
  };
}

/** Nenhuma (prova, categoria, piloto, navegador) pode aparecer duas vezes. */
function semDuplicata(campeonato: CampeonatoMemoria): boolean {
  const vistos = new Set<string>();
  for (const r of campeonato.resultados) {
    const chave = `${r.stageId}|${r.category}|${r.pilotName || ""}|${r.navigatorName || ""}`;
    if (vistos.has(chave)) return false;
    vistos.add(chave);
  }
  return true;
}

/** As dicas de e-mail que a planilha traz, escopadas por papel (o que o router grava). */
function dicasDe(resultados: ResultadoImportado[]): DicaEmail[] {
  const vistos = new Set<string>();
  const dicas: DicaEmail[] = [];
  const juntar = (nome: string | null, email: string | null, papel: "pilot" | "navigator") => {
    const limpo = String(nome ?? "").replace(/\s+/g, " ").trim();
    const emailNorm = normalizarEmail(email);
    if (!limpo || !emailNorm) return;
    const chave = `${limpo}|${emailNorm}|${papel}`;
    if (vistos.has(chave)) return;
    vistos.add(chave);
    dicas.push({ nome: limpo, emailNorm, papel });
  };
  for (const r of resultados) {
    juntar(r.pilotName, r.pilotEmail, "pilot");
    juntar(r.navigatorName, r.navigatorEmail, "navigator");
  }
  return dicas;
}

async function main() {
  // =============================================================== 1. pontuação
  console.log("--- tabela de pontos");

  check("regulamento: 1º = 25 e 10º = 6",
    calcularPontos(1, false, false, TABELA_REGULAMENTO) === 25 && calcularPontos(10, false, false, TABELA_REGULAMENTO) === 6,
    `1º=${calcularPontos(1, false, false, TABELA_REGULAMENTO)} 10º=${calcularPontos(10, false, false, TABELA_REGULAMENTO)}`);

  const escada = [25, 22, 20, 18, 16, 14, 12, 10, 8, 6];
  check("regulamento: a escada inteira bate",
    escada.every((pontos, i) => calcularPontos(i + 1, false, false, TABELA_REGULAMENTO) === pontos),
    escada.join(", "));

  check("regulamento: do 11º em diante não pontua",
    [11, 12, 20, 99].every(p => calcularPontos(p, false, false, TABELA_REGULAMENTO) === 0),
    "11º, 12º, 20º e 99º = 0");

  check("CBA: 1º = 17 e 15º = 2, 16º não pontua",
    calcularPontos(1, false, false, TABELA_CBA) === 17 &&
    calcularPontos(15, false, false, TABELA_CBA) === 2 &&
    calcularPontos(16, false, false, TABELA_CBA) === 0,
    "17 / 2 / 0");

  check("DSQ e DNS fazem 0 mesmo em 1º",
    calcularPontos(1, true, false, TABELA_REGULAMENTO) === 0 && calcularPontos(1, false, true, TABELA_REGULAMENTO) === 0,
    "DSQ=0 DNS=0");

  check("posição inválida faz 0",
    [0, -3, NaN].every(p => calcularPontos(p as number, false, false, TABELA_REGULAMENTO) === 0), "0, -3 e NaN = 0");

  check("normalizarTabela: json torto cai no regulamento",
    normalizarTabela("{isso não é json")[1] === 25 && normalizarTabela(null)[1] === 25 && normalizarTabela({})[1] === 25,
    "string quebrada, null e {} -> 25 no 1º");

  check("normalizarTabela: aceita string json e descarta chave inválida",
    JSON.stringify(normalizarTabela('{"1":30,"2":20,"0":9,"abc":5,"3":-1}')) === JSON.stringify({ 1: 30, 2: 20 }),
    "só 1 e 2 sobreviveram");

  check("normalizarTabela: array vira 1º, 2º, 3º",
    JSON.stringify(normalizarTabela([30, 20, 10])) === JSON.stringify({ 1: 30, 2: 20, 3: 10 }), "[30,20,10]");

  check("resolverTabela: preset manda no que estiver gravado",
    resolverTabela("cba", { 1: 99 })[1] === 17 &&
    resolverTabela("regulamento", { 1: 99 })[1] === 25 &&
    resolverTabela("custom", { 1: 99 })[1] === 99 &&
    resolverTabela(null, null)[1] === 25,
    "cba=17 regulamento=25 custom=99 nulo=25");

  check("PRESETS_PONTUACAO tem os três presets", PRESETS_PONTUACAO.length === 3 &&
    PRESETS_PONTUACAO.map(p => p.id).join(",") === "regulamento,cba,custom",
    PRESETS_PONTUACAO.map(p => p.id).join(", "));

  // =============================================================== 2. descarte
  console.log("\n--- descarte N-x");

  const etapas3 = etapasDe(3);
  const cfgBase = { tabela: TABELA_REGULAMENTO, discardRule: 1, allowDiscardMissedStages: true, allowDiscardDisqualified: false };

  {
    // Faltou a etapa 2 (sem linha nenhuma) e o DNS PODE ser descartado.
    const saida = calcularClassificacao({
      etapas: etapas3,
      resultados: [linha(101, "X", "Ana", 1), linha(103, "X", "Ana", 5)],
      config: cfgBase,
    });
    const ana = acharPiloto(saida, "X", "Ana")!;
    const dns = ana.stageResults.find(sr => sr.stageNumber === 2)!;
    check("DNS descartável: some do líquido e a etapa aparece marcada",
      ana.grossPoints === 41 && ana.netPoints === 41 && dns.isDns && dns.isDiscarded,
      `bruto=${ana.grossPoints} líquido=${ana.netPoints} etapa2 dns=${dns.isDns} descartada=${dns.isDiscarded}`);
    check("DNS aparece na classificação como etapa de 0 ponto",
      ana.stageResults.length === 3 && dns.points === 0 && ana.etapasCorridas === 2,
      `${ana.stageResults.length} etapas, ${ana.etapasCorridas} corridas`);
  }

  {
    // Mesmo caso, mas o regulamento NÃO deixa descartar quem faltou: o descarte
    // cai num resultado bom e o competidor perde ponto de verdade.
    const saida = calcularClassificacao({
      etapas: etapas3,
      resultados: [linha(101, "X", "Ana", 1), linha(103, "X", "Ana", 5)],
      config: { ...cfgBase, allowDiscardMissedStages: false },
    });
    const ana = acharPiloto(saida, "X", "Ana")!;
    check("DNS não descartável: o descarte cai no pior resultado real",
      ana.netPoints === 25 && ana.stageResults.find(sr => sr.stageNumber === 3)!.isDiscarded,
      `líquido=${ana.netPoints} (descartou o 5º lugar, 16 pts)`);
  }

  {
    const resultados = [
      linha(101, "X", "Ana", 1),
      linha(102, "X", "Ana", 0, { isDisqualified: true }),
      linha(103, "X", "Ana", 2),
    ];
    const naoPode = acharPiloto(calcularClassificacao({ etapas: etapas3, resultados, config: cfgBase }), "X", "Ana")!;
    const pode = acharPiloto(
      calcularClassificacao({ etapas: etapas3, resultados, config: { ...cfgBase, allowDiscardDisqualified: true } }),
      "X", "Ana")!;
    const dsqNaoPode = naoPode.stageResults.find(sr => sr.stageNumber === 2)!;
    const dsqPode = pode.stageResults.find(sr => sr.stageNumber === 2)!;
    check("DSQ não descartável: o descarte vai para o 2º lugar",
      !dsqNaoPode.isDiscarded && naoPode.netPoints === 25,
      `líquido=${naoPode.netPoints} (perdeu os 22 do 2º lugar)`);
    check("DSQ descartável: sai o DSQ e os pontos ficam",
      dsqPode.isDiscarded && pode.netPoints === 47,
      `líquido=${pode.netPoints} (25 + 22)`);
    check("as duas flags são independentes",
      naoPode.netPoints !== pode.netPoints, "mesma entrada, resultados diferentes");
  }

  {
    // Empate de pontuação entre candidatos ao descarte: 11º lugar (0 ponto) e um
    // DSQ (0 ponto). O DSQ é "pior posição", então é ele que sai.
    const srs = [
      resultadoEtapa({ stageId: 1, stageNumber: 1, position: 11, points: 0 }),
      resultadoEtapa({ stageId: 2, stageNumber: 2, position: 0, points: 0, isDisqualified: true }),
      resultadoEtapa({ stageId: 3, stageNumber: 3, position: 1, points: 25 }),
    ];
    aplicarDescarte(srs, { discardRule: 1, allowDiscardMissedStages: true, allowDiscardDisqualified: true });
    check("empate no descarte: pior posição sai primeiro (DSQ antes do 11º)",
      srs[1].isDiscarded && !srs[0].isDiscarded, "descartou a etapa 2 (DSQ)");

    // Dois DNS idênticos: ganha a etapa mais antiga, e a ordem da entrada não muda nada.
    const doisDns = () => [
      resultadoEtapa({ stageId: 7, stageNumber: 2, isDns: true }),
      resultadoEtapa({ stageId: 3, stageNumber: 3, isDns: true }),
      resultadoEtapa({ stageId: 9, stageNumber: 1, position: 1, points: 25 }),
    ];
    const a = doisDns();
    aplicarDescarte(a, { discardRule: 1, allowDiscardMissedStages: true, allowDiscardDisqualified: true });
    const b = doisDns().reverse();
    aplicarDescarte(b, { discardRule: 1, allowDiscardMissedStages: true, allowDiscardDisqualified: true });
    const descartadaA = a.find(sr => sr.isDiscarded)!.stageNumber;
    const descartadaB = b.find(sr => sr.isDiscarded)!.stageNumber;
    check("empate no descarte: etapa mais antiga sai, em qualquer ordem de entrada",
      descartadaA === 2 && descartadaB === 2, `entrada normal=etapa ${descartadaA}, invertida=etapa ${descartadaB}`);
  }

  {
    const saida = calcularClassificacao({
      etapas: etapas3,
      resultados: [linha(101, "X", "Ana", 1), linha(102, "X", "Ana", 3), linha(103, "X", "Ana", 5)],
      config: { ...cfgBase, discardRule: 0 },
    });
    const ana = acharPiloto(saida, "X", "Ana")!;
    check("descarte 0: bruto = líquido", ana.grossPoints === 61 && ana.netPoints === 61,
      `${ana.grossPoints} = ${ana.netPoints}`);
  }

  // =============================================================== 3. desempate
  console.log("\n--- desempate (§13.1)");

  const cfg2 = { tabela: TABELA_REGULAMENTO, discardRule: 0, allowDiscardMissedStages: true, allowDiscardDisqualified: false };
  const etapas2 = etapasDe(2);

  {
    const saida = calcularClassificacao({
      etapas: etapas2,
      resultados: [
        linha(101, "X", "Ana", 1), linha(102, "X", "Ana", 1),
        linha(101, "X", "Bia", 2), linha(102, "X", "Bia", 2),
      ],
      config: cfg2,
    });
    const ordem = saida.categorias[0].pilots.map(p => p.name).join(" > ");
    check("1) pontos líquidos decidem", ordem === "Ana > Bia", ordem);
  }

  {
    // Mesmo líquido (descarte 1), bruto diferente: Bia descartou coisa melhor.
    const saida = calcularClassificacao({
      etapas: etapas2,
      resultados: [
        linha(101, "X", "Ana", 1), linha(102, "X", "Ana", 10),
        linha(101, "X", "Bia", 1), linha(102, "X", "Bia", 2),
      ],
      config: { ...cfg2, discardRule: 1 },
    });
    const [primeiro, segundo] = saida.categorias[0].pilots;
    check("2) empate no líquido: ganha o maior bruto",
      primeiro.name === "Bia" && primeiro.netPoints === segundo.netPoints && primeiro.grossPoints > segundo.grossPoints,
      `${primeiro.name} (bruto ${primeiro.grossPoints}) > ${segundo.name} (bruto ${segundo.grossPoints}), líquido ${primeiro.netPoints} nos dois`);
  }

  {
    // Tabela custom só para forçar o empate no bruto: 10+6 = 9+7 = 16 nos dois.
    // Decide quem tem mais 1º lugar.
    const saida = calcularClassificacao({
      etapas: etapas2,
      resultados: [
        linha(101, "X", "Ana", 1), linha(102, "X", "Ana", 5),
        linha(101, "X", "Bia", 2), linha(102, "X", "Bia", 4),
      ],
      config: { ...cfg2, tabela: { 1: 10, 2: 9, 3: 8, 4: 7, 5: 6 } },
    });
    const [primeiro, segundo] = saida.categorias[0].pilots;
    check("3) empate no bruto: countback (mais 1º lugar)",
      primeiro.name === "Ana" && primeiro.netPoints === segundo.netPoints && primeiro.grossPoints === segundo.grossPoints,
      `${primeiro.name} tem um 1º lugar; os dois somam ${primeiro.netPoints}`);
  }

  {
    // Countback idêntico (um 2º e um 3º cada): decide a ÚLTIMA etapa em que
    // ambos correram. Os ids estão fora de ordem de propósito — o critério é o
    // stageNumber, e é exatamente aqui que o código antigo errava.
    const foraDeOrdem: EtapaClassificacao[] = [
      { id: 900, stageNumber: 1, nome: "Etapa 1" },
      { id: 100, stageNumber: 2, nome: "Etapa 2" },
    ];
    const saida = calcularClassificacao({
      etapas: foraDeOrdem,
      resultados: [
        linha(900, "X", "Ana", 3), linha(100, "X", "Ana", 2),
        linha(900, "X", "Bia", 2), linha(100, "X", "Bia", 3),
      ],
      config: cfg2,
    });
    const [primeiro, segundo] = saida.categorias[0].pilots;
    check("4) countback igual: ganha quem foi melhor na última etapa",
      primeiro.name === "Ana" && segundo.name === "Bia",
      `${primeiro.name} foi 2º na etapa 2 (id ${100}, menor que o da etapa 1)`);
  }

  {
    // Empate ATÉ na última etapa (dado sujo: duas linhas no mesmo 2º lugar) — é o
    // único jeito de o §13.1 não resolver. A ordem então sai por nome, e a
    // COLOCAÇÃO empata: os dois são o mesmo lugar no pódio.
    const saida = calcularClassificacao({
      etapas: etapas2,
      resultados: [
        linha(101, "X", "Zeca", 2), linha(102, "X", "Zeca", 2),
        linha(101, "X", "Ana", 2), linha(102, "X", "Ana", 2),
      ],
      config: cfg2,
    });
    const pilotos = saida.categorias[0].pilots;
    check("5) empate absoluto: ordem por nome e mesma colocação para os dois",
      pilotos[0].name === "Ana" && pilotos[1].name === "Zeca" &&
      pilotos[0].posicao === 1 && pilotos[1].posicao === 1,
      `${pilotos.map(p => `${p.posicao}º ${p.name}`).join(", ")}`);
    check("comparador é simétrico e dá 0 no empate real",
      compararCompetidores(pilotos[0], pilotos[1]) === -compararCompetidores(pilotos[1], pilotos[0]),
      "compararCompetidores(a,b) = -compararCompetidores(b,a)");
  }

  {
    // Colocação depois de um empate pula o número (1, 1, 3).
    const saida = calcularClassificacao({
      etapas: etapas2,
      resultados: [
        linha(101, "X", "Ana", 1), linha(102, "X", "Ana", 1),
        linha(101, "X", "Bia", 1), linha(102, "X", "Bia", 1),
        linha(101, "X", "Cida", 3), linha(102, "X", "Cida", 3),
      ],
      config: cfg2,
    });
    const pos = saida.categorias[0].pilots.map(p => p.posicao).join(",");
    check("empate na colocação pula o número seguinte", pos === "1,1,3", `posições ${pos}`);
  }

  {
    // Piloto e navegador são competidores separados, na mesma categoria.
    const saida = calcularClassificacao({
      etapas: etapasDe(1),
      resultados: [{
        stageId: 101, category: "X", pilotName: "Ana", navigatorName: "Bia",
        position: 1, isDisqualified: false, isDns: false,
      }, {
        stageId: 101, category: "X", pilotName: "-", navigatorName: "false",
        position: 2, isDisqualified: false, isDns: false,
      }],
      config: cfg2,
    });
    const cat = saida.categorias[0];
    check("piloto e navegador entram separados, e o lixo '-'/'false' fica de fora",
      cat.pilots.length === 1 && cat.navigators.length === 1 &&
      cat.pilots[0].name === "Ana" && cat.navigators[0].name === "Bia",
      `${cat.pilots.length} piloto(s), ${cat.navigators.length} navegador(es)`);
  }

  {
    // A ordem em que os resultados chegam não pode mudar nada.
    const resultados = [
      linha(101, "X", "Ana", 1), linha(102, "X", "Ana", 3),
      linha(101, "X", "Bia", 2), linha(102, "X", "Bia", 2),
      linha(101, "X", "Cida", 3), linha(102, "X", "Cida", 1),
    ];
    const normal = calcularClassificacao({ etapas: etapas2, resultados, config: cfg2 });
    const invertido = calcularClassificacao({ etapas: [...etapas2].reverse(), resultados: [...resultados].reverse(), config: cfg2 });
    check("mesma entrada em outra ordem dá a mesma classificação",
      JSON.stringify(normal) === JSON.stringify(invertido),
      normal.categorias[0].pilots.map(p => `${p.posicao}º ${p.name}`).join(", "));
  }

  // =============================================================== 4. parser
  console.log("\n--- parser (fixtures)");

  check("normalizarCabecalho tira acento, caixa e espaço",
    normalizarCabecalho("  Função ") === "FUNCAO" && normalizarCabecalho("Pos  Etapa 1") === "POS ETAPA 1",
    'Função -> FUNCAO');

  check("célula: inteiro é posição, 0/vazio/- é DNS",
    interpretarCelulaEtapa(3).tipo === "posicao" &&
    interpretarCelulaEtapa(0).tipo === "dns" &&
    interpretarCelulaEtapa(null).tipo === "dns" &&
    interpretarCelulaEtapa("-").tipo === "dns" &&
    interpretarCelulaEtapa("  ").tipo === "dns",
    "3 -> posição; 0, vazio e - -> DNS");

  check("célula: NC/DSQ/DQ/DNF/EXC/ABD é desclassificado",
    ["NC", "DSQ", "DQ", "DNF", "EXC", "ABD", "dsq"].every(c => interpretarCelulaEtapa(c).tipo === "dsq"),
    "todos os códigos caem em dsq");

  check("célula: texto estranho é reportado, não engolido",
    interpretarCelulaEtapa("banana").tipo === "desconhecido" && interpretarCelulaEtapa("2,5").tipo === "desconhecido",
    '"banana" e "2,5" -> desconhecido');

  {
    const largo = importarPlanilhaCampeonato([{
      nome: "Geral",
      linhas: [
        ["CATEGORIA", "NOME PILOTO", "NOME NAVEGADOR", "POS ETAPA 1", "POS ETAPA 2"],
        ["Carros Light", "Ana", "Bia", 1, "NC"],
        ["Carros Light", "Cadu", null, 2, 1],
        ["Carros Light", "Duda", "Edu", "-", 2],
      ],
    }]);
    const ana2 = largo.resultados.find(r => r.pilotName === "Ana" && r.provaNumber === 2)!;
    const duda1 = largo.resultados.find(r => r.pilotName === "Duda" && r.provaNumber === 1)!;
    check("layout LARGO (Kraken): dupla por linha, provas pelo cabeçalho",
      largo.abas[0].layout === "largo" && JSON.stringify(largo.provas) === "[1,2]" && largo.resultados.length === 6,
      `${largo.abas[0].layout}, provas ${largo.provas.join("/")}, ${largo.resultados.length} resultados`);
    check("layout LARGO: NC vira desclassificado e '-' vira DNS",
      ana2.isDisqualified && ana2.position === 0 && duda1.isDns,
      `Ana etapa2 dsq=${ana2.isDisqualified}, Duda etapa1 dns=${duda1.isDns}`);
    check("layout LARGO: linha sem navegador não inventa navegador",
      largo.resultados.filter(r => r.pilotName === "Cadu").every(r => r.navigatorName === null), "Cadu sozinho");
  }

  {
    const sujo = importarPlanilhaCampeonato([{
      nome: "X",
      linhas: [
        ["CATEGORIA", "NOME", "FUNÇÃO", "ETAPA-1"],
        ["X", "Ana", "Piloto", 1],
        ["X", "Bia", "Navegador", 1],
        ["X", "Cadu", "Piloto", 1],
        ["X", "Duda", "Piloto", 4],
        ["X", "Edu", "Piloto", "banana"],
      ],
    }]);
    const tipos = sujo.avisos.map(a => a.tipo);
    check("planilha suja vira AVISO, não exceção",
      tipos.includes("posicao_duplicada") && tipos.includes("buraco_na_sequencia") && tipos.includes("valor_nao_reconhecido"),
      sujo.avisos.map(a => a.tipo).join(", "));
    check("valor não reconhecido cai em DNS (competidor não some)",
      sujo.resultados.find(r => r.pilotName === "Edu")!.isDns, "Edu entra como DNS");
    const buraco = sujo.avisos.find(a => a.tipo === "buraco_na_sequencia")!;
    check("o aviso de buraco diz quais posições faltam",
      buraco.mensagem.includes("2") && buraco.mensagem.includes("3"), `"${buraco.mensagem}"`);
  }

  {
    const semPiloto = importarPlanilhaCampeonato([{
      nome: "X",
      linhas: [
        ["NOME", "FUNÇÃO", "ETAPA-1"],
        ["Bia", "Navegador", 1],
        ["Ana", "Piloto", 2],
        ["Zulu", "Chefe", 3],
      ],
    }]);
    const tipos = semPiloto.avisos.map(a => a.tipo);
    check("navegador órfão e função desconhecida geram aviso e não somem",
      tipos.includes("navegador_sem_piloto") && tipos.includes("funcao_desconhecida") &&
      semPiloto.resultados.length === 3,
      tipos.join(", "));
  }

  check("chaveCategoria ignora plural, acento e caixa",
    chaveCategoria("Carros Master") === chaveCategoria("CARRO MASTER") &&
    chaveCategoria("Motos Graduado") === chaveCategoria("MOTO GRADUADO") &&
    chaveCategoria("Carros Light") !== chaveCategoria("CARRO RALLY"),
    `"Carros Master" -> "${chaveCategoria("Carros Master")}"`);

  // ================================================= 5. planilhas de verdade
  console.log("\n--- planilhas reais");

  const abasIda = lerAbas(PLANILHA_IDA);
  const abasCavalo = lerAbas(PLANILHA_CAVALO);
  const abasKraken = lerAbas(KRAKEN);
  const abasLista = lerAbas(LISTA_EVENTO);

  if (!abasIda) {
    console.log(`PULADO | planilha do Ida 2026 não está em ${PLANILHA_IDA}`);
  } else {
    const ida = importarPlanilhaCampeonato(abasIda);
    check("Ida 2026: 6 abas, todas no formato LONGO",
      ida.abas.length === 6 && ida.abas.every(a => a.layout === "longo"),
      ida.abas.map(a => `${a.nome}(${a.duplas})`).join(", "));
    check("Ida 2026: achou as duas provas do evento", JSON.stringify(ida.provas) === "[1,2]", `provas ${ida.provas.join(", ")}`);
    check("Ida 2026: importa sem nenhum aviso", ida.avisos.length === 0,
      ida.avisos.length ? ida.avisos.map(a => a.mensagem).join(" | ") : "planilha limpa");

    const moto = ida.resultados.filter(r => r.categoria === "MOTO GRADUADO");
    check("Ida 2026: categoria só de moto funciona sem navegador",
      moto.length === 10 && moto.every(r => r.navigatorName === null && r.pilotName !== null),
      `${moto.length} resultados (5 pilotos x 2 etapas), nenhum navegador`);

    const master = ida.resultados.filter(r => r.categoria === "CARRO MASTER" && r.provaNumber === 1);
    check("Ida 2026: dupla piloto+navegador na mesma linha de resultado",
      master.length === 3 && master.every(r => r.pilotName && r.navigatorName),
      master.map(r => `${r.pilotName}/${r.navigatorName}`).join(", "));

    // ---- a conta que o organizador vai conferir na tela
    const idPorEtapa = new Map([[1, 501], [2, 502]]);
    const etapasIda: EtapaClassificacao[] = [
      { id: 501, stageNumber: 1, nome: "Etapa 1" },
      { id: 502, stageNumber: 2, nome: "Etapa 2" },
    ];
    const saida = calcularClassificacao({
      etapas: etapasIda,
      resultados: paraResultados(ida, idPorEtapa),
      config: { tabela: TABELA_REGULAMENTO, discardRule: 1, allowDiscardMissedStages: true, allowDiscardDisqualified: false },
    });

    const motoCat = saida.categorias.find(c => c.name === "MOTO GRADUADO")!;
    const nomes = motoCat.pilots.map(p => `${p.posicao}º ${p.name} (${p.netPoints})`).join(", ");
    check("MOTO GRADUADO: 5 pilotos e nenhum navegador",
      motoCat.pilots.length === 5 && motoCat.navigators.length === 0, nomes);

    const chakal = motoCat.pilots.find(p => p.name === "Chakal")!;
    check("Chakal ganhou as duas etapas: 25 + 25 = 50 bruto",
      chakal.grossPoints === 50 && chakal.netPoints === 25 && chakal.posicao === 1,
      `bruto=${chakal.grossPoints} líquido=${chakal.netPoints} ${chakal.posicao}º`);

    const nilson = motoCat.pilots.find(p => p.name === "Nilson Soares");
    check("Nilson APARECE na classificação mesmo tendo faltado a etapa 1", !!nilson,
      nilson ? `${nilson.posicao}º com ${nilson.netPoints} pts` : "SUMIU da tabela");
    if (nilson) {
      const etapa1 = nilson.stageResults.find(sr => sr.stageNumber === 1)!;
      check("Nilson: etapa 1 é DNS de 0 ponto, e é ela que ele descarta",
        etapa1.isDns && etapa1.points === 0 && etapa1.isDiscarded && nilson.netPoints === 16,
        `dns=${etapa1.isDns} descartada=${etapa1.isDiscarded} líquido=${nilson.netPoints} (16 do 5º lugar da etapa 2)`);
    }

    const esperado = "Chakal:25, Cavalo:22, Delsin:22, Murad:18, Nilson Soares:16";
    const obtido = motoCat.pilots.map(p => `${p.name}:${p.netPoints}`).join(", ");
    check("MOTO GRADUADO: classificação inteira confere", obtido === esperado, obtido);

    const cavalo = motoCat.pilots.find(p => p.name === "Cavalo")!;
    const delsin = motoCat.pilots.find(p => p.name === "Delsin")!;
    check("Cavalo x Delsin: mesmo líquido e mesmo countback, decide a última etapa",
      cavalo.netPoints === delsin.netPoints && cavalo.grossPoints === delsin.grossPoints &&
      JSON.stringify(cavalo.countback) === JSON.stringify(delsin.countback) &&
      cavalo.posicao === 2 && delsin.posicao === 3,
      `${cavalo.netPoints} pts nos dois; Cavalo foi 2º e Delsin 3º na etapa 2`);

    // Mesma planilha, regulamento diferente: quem faltou não descarta a falta.
    const semDescarteDeFalta = calcularClassificacao({
      etapas: etapasIda,
      resultados: paraResultados(ida, idPorEtapa),
      config: { tabela: TABELA_REGULAMENTO, discardRule: 1, allowDiscardMissedStages: false, allowDiscardDisqualified: false },
    });
    const nilson2 = semDescarteDeFalta.categorias.find(c => c.name === "MOTO GRADUADO")!
      .pilots.find(p => p.name === "Nilson Soares")!;
    check("com DNS não descartável, Nilson zera (o descarte cai na única etapa que ele correu)",
      nilson2.netPoints === 0, `líquido=${nilson2.netPoints}`);

    // A mesma planilha na tabela da CBA: a ordem se mantém, os números mudam.
    const naCba = calcularClassificacao({
      etapas: etapasIda,
      resultados: paraResultados(ida, idPorEtapa),
      config: { tabela: TABELA_CBA, discardRule: 1, allowDiscardMissedStages: true, allowDiscardDisqualified: false },
    });
    const chakalCba = naCba.categorias.find(c => c.name === "MOTO GRADUADO")!.pilots.find(p => p.name === "Chakal")!;
    check("trocar a tabela muda a pontuação sem regravar nada",
      chakalCba.grossPoints === 34 && chakalCba.netPoints === 17,
      `CBA: bruto=${chakalCba.grossPoints} líquido=${chakalCba.netPoints} (regulamento dava 50/25)`);
  }

  if (!abasCavalo) {
    console.log(`PULADO | planilha do Rally do Cavalo não está em ${PLANILHA_CAVALO}`);
  } else {
    const cavalo = importarPlanilhaCampeonato(abasCavalo);
    check("Rally do Cavalo: 6 abas no formato LONGO, 2 provas",
      cavalo.abas.length === 6 && cavalo.abas.every(a => a.layout === "longo") && JSON.stringify(cavalo.provas) === "[1,2]",
      cavalo.abas.map(a => `${a.nome}(${a.duplas})`).join(", "));
    check("Rally do Cavalo: sem posição duplicada nem buraco de sequência",
      !cavalo.avisos.some(a => a.tipo === "posicao_duplicada" || a.tipo === "buraco_na_sequencia"),
      cavalo.avisos.length ? cavalo.avisos.map(a => a.tipo).join(", ") : "planilha limpa");

    if (abasIda) {
      // O caso real: as duas planilhas escrevem a MESMA categoria de dois jeitos.
      const categoriasDoIda = importarPlanilhaCampeonato(abasIda).abas.map(a => a.categoria);
      const comHistorico = importarPlanilhaCampeonato(abasCavalo, { categoriasConhecidas: categoriasDoIda });
      const divergentes = comHistorico.avisos.filter(a => a.tipo === "categoria_divergente");
      const master = divergentes.find(a => a.categoria === "Carros Master");
      check("categoria escrita diferente vira aviso com sugestão",
        divergentes.length === 5 && master?.sugestao === "CARRO MASTER",
        divergentes.map(a => `${a.categoria} ~ ${a.sugestao}`).join(", "));
      check("categoria que só existe numa das planilhas não vira aviso",
        !divergentes.some(a => a.categoria === "Carros Light"),
        "Carros Light (Cavalo) não tem par no Ida");
    }

    // Unificação: o mesmo Nilson escrito de dois jeitos nas duas planilhas.
    const nomesDasDuas = [
      ...(abasIda ? importarPlanilhaCampeonato(abasIda).resultados : []),
      ...cavalo.resultados,
    ]
      .filter(r => chaveCategoria(r.categoria) === "MOTO GRADUADO")
      .map(r => r.pilotName!)
      .filter(Boolean);
    const grupos = sugerirUnificacoes(nomesDasDuas);
    const doNilson = grupos.find(g => g.nomes.some(n => n.startsWith("Nilson")));
    check("unificador sugere juntar 'Nilson Soares' com 'Nilson Soares de Lima'",
      !!doNilson && doNilson.nomes.length === 2,
      doNilson ? `${doNilson.nomes.join(" = ")} (canônico: ${doNilson.canonico})` : "não sugeriu nada");
    check("unificador não junta quem não tem nada a ver",
      !grupos.some(g => g.nomes.includes("Cavalo") && g.nomes.includes("Chakal")),
      `${grupos.length} grupo(s) sugerido(s) em ${new Set(nomesDasDuas).size} nomes distintos`);
  }

  for (const [caminho, abas, duplasEsperadas] of [
    [KRAKEN, abasKraken, 22] as const,
    [LISTA_EVENTO, abasLista, 3] as const,
  ]) {
    if (!abas) {
      console.log(`PULADO | ${caminho} não encontrado na raiz do repo`);
      continue;
    }
    const imp = importarPlanilhaCampeonato(abas);
    check(`${caminho}: reconhecido como formato LARGO`,
      imp.abas[0].layout === "largo" && imp.abas[0].duplas === duplasEsperadas,
      `${imp.abas[0].duplas} dupla(s) em "${imp.abas[0].nome}"`);
    check(`${caminho}: sem coluna de etapa, avisa em vez de importar nada`,
      imp.avisos.some(a => a.tipo === "sem_coluna_etapa") && imp.resultados.length === 0,
      imp.avisos.map(a => a.tipo).join(", ") || "(sem avisos)");
  }

  // ============================================ 5b. arquivo = EVENTO, ETAPA-N = PROVA
  //
  // O bug de produção: modelamos ETAPA-N como numeração GLOBAL do campeonato.
  // Importar as duas planilhas no mesmo campeonato criava 4 etapas com
  // stageNumber 1,1,2,2 ("E1, E1, E2, E2") e o dado de um arquivo caía nas
  // etapas do outro. Cada arquivo é UM EVENTO; ETAPA-1 do Cavalo e ETAPA-1 do
  // Ida são provas diferentes.
  console.log("\n--- evento x prova");

  if (abasIda && abasCavalo) {
    const A = simularImport(novoCampeonato(), { abas: abasCavalo, eventoNome: "7º Rally do Cavalo" });
    check("evento A (Cavalo) sozinho: 2 provas, 48 linhas",
      A.campeonato.provas.length === 2 && A.resultadosGravados === 48,
      `${A.campeonato.provas.length} provas, ${A.resultadosGravados} resultados`);

    // As DUAS planilhas no MESMO campeonato — o caso que quebrou.
    const camp = novoCampeonato();
    const impCavalo = simularImport(camp, { abas: abasCavalo, eventoNome: "7º Rally do Cavalo" });
    const impIda = simularImport(camp, { abas: abasIda, eventoNome: "Rally do Amigo Ida 2026" });

    const stageNumbers = camp.provas.map(p => p.stageNumber).sort((a, b) => a - b);
    const eventos = new Set(camp.provas.map(p => p.eventoChave));
    check("Cavalo + Ida no mesmo campeonato: 4 provas em 2 eventos, sem colisão de stageNumber",
      camp.provas.length === 4 && eventos.size === 2 && JSON.stringify(stageNumbers) === "[1,2,3,4]",
      `${camp.provas.length} provas, ${eventos.size} eventos, stageNumber ${stageNumbers.join(",")}`);

    const contagem = camp.provas
      .sort((a, b) => a.stageNumber - b.stageNumber)
      .map(p => camp.resultados.filter(r => r.stageId === p.stageId).length);
    check("cada prova fica com a SUA contagem (Cavalo 24+24, Ida 19+19)",
      JSON.stringify(contagem) === "[24,24,19,19]", `por prova: ${contagem.join(", ")}`);

    check("nenhuma linha duplicada (piloto+navegador+prova aparece uma vez só)",
      semDuplicata(camp), `${camp.resultados.length} linhas no total`);

    check("importar dois eventos não repete o mesmo stageNumber",
      new Set(stageNumbers).size === stageNumbers.length && impCavalo.provasCriadas === 2 && impIda.provasCriadas === 2,
      `Cavalo criou ${impCavalo.provasCriadas}, Ida criou ${impIda.provasCriadas}`);

    // ---- reimportar o MESMO arquivo é idempotente
    const antes = camp.resultados.length;
    const reimport = simularImport(camp, { abas: abasIda, eventoNome: "Rally do Amigo Ida 2026" });
    check("reimportar o Ida por cima: 0 provas criadas e contagem idêntica",
      reimport.provasCriadas === 0 && reimport.provasReaproveitadas === 2 &&
      camp.provas.length === 4 && camp.resultados.length === antes,
      `criadas=${reimport.provasCriadas} reaproveitadas=${reimport.provasReaproveitadas}, ${camp.resultados.length} linhas (antes ${antes})`);
    check("reimportar não duplica nenhuma linha", semDuplicata(camp),
      `${camp.resultados.length} linhas depois da reimportação`);

    // ---- "importar 1, 2 ou todas": o organizador escolhe as provas
    const soP1 = novoCampeonato();
    const p1 = simularImport(soP1, { abas: abasIda, eventoNome: "Rally do Amigo Ida 2026", provas: [1] });
    check("provas:[1] importa só a P1 — 1 prova, 19 linhas, e a P2 nem existe",
      p1.provasCriadas === 1 && soP1.provas.length === 1 &&
      soP1.provas[0].provaNumber === 1 && p1.resultadosGravados === 19 &&
      !soP1.provas.some(p => p.provaNumber === 2),
      `${soP1.provas.length} prova(s), ${p1.resultadosGravados} linhas`);

    const p2 = simularImport(soP1, { abas: abasIda, eventoNome: "Rally do Amigo Ida 2026", provas: [2] });
    const daP1 = soP1.resultados.filter(r => r.stageId === soP1.provas.find(p => p.provaNumber === 1)!.stageId).length;
    check("depois provas:[2]: cria 1 prova nova, a P1 segue intacta, total 38",
      p2.provasCriadas === 1 && soP1.provas.length === 2 && daP1 === 19 &&
      soP1.resultados.length === 38 && semDuplicata(soP1),
      `${soP1.provas.length} provas, P1 com ${daP1}, total ${soP1.resultados.length}`);

    check("provas:[3] (não existe no arquivo) dá erro claro dizendo quais existem",
      (() => {
        try {
          simularImport(novoCampeonato(), { abas: abasIda, eventoNome: "X", provas: [3] });
          return false;
        } catch (e: any) {
          return String(e?.message).includes("prova 3") && String(e?.message).includes("1, 2");
        }
      })(), "BAD_REQUEST listando as provas do arquivo");
  }

  {
    // O planejador puro, sem planilha: é ele que garante a chave (evento, prova).
    const existentes: ProvaExistente[] = [
      { stageId: 10, eventoChave: "nome:cavalo", provaNumber: 1, stageNumber: 1 },
      { stageId: 11, eventoChave: "nome:cavalo", provaNumber: 2, stageNumber: 2 },
    ];
    const outro = planejarProvas({ provasDoArquivo: [1, 2], eventoChave: "nome:ida", existentes });
    check("planejarProvas: outro evento com ETAPA-1/2 vira stageNumber 3 e 4",
      outro.criadas === 2 && JSON.stringify(outro.provas.map(p => p.stageNumber)) === "[3,4]",
      `stageNumber ${outro.provas.map(p => p.stageNumber).join(",")}`);

    const mesmo = planejarProvas({ provasDoArquivo: [1, 2], eventoChave: "nome:cavalo", existentes });
    check("planejarProvas: mesmo evento reaproveita e PRESERVA o stageNumber",
      mesmo.criadas === 0 && mesmo.reaproveitadas === 2 &&
      JSON.stringify(mesmo.provas.map(p => p.stageNumber)) === "[1,2]",
      `reaproveitadas=${mesmo.reaproveitadas}, stageNumber ${mesmo.provas.map(p => p.stageNumber).join(",")}`);

    const parcial = planejarProvas({ provasDoArquivo: [1, 2], eventoChave: "nome:ida", existentes, selecionadas: [2] });
    check("planejarProvas: seleção não cria a prova que ficou de fora",
      parcial.provas.length === 1 && parcial.provas[0].provaNumber === 2 && parcial.criadas === 1,
      `plano com ${parcial.provas.length} prova (P${parcial.provas[0]?.provaNumber})`);

    const errada = planejarProvas({ provasDoArquivo: [1, 2], eventoChave: "nome:ida", existentes, selecionadas: [3] });
    check("planejarProvas: prova pedida que o arquivo não tem sai em `desconhecidas`",
      JSON.stringify(errada.desconhecidas) === "[3]" && errada.provas.length === 0,
      `desconhecidas ${errada.desconhecidas.join(",")}`);
  }

  // ================================================ 6. conciliação na importação
  //
  // O caso de verdade: a 1ª planilha (Ida 2026) já gravou os nomes; ao subir a 2ª
  // (Rally do Cavalo), a MESMA pessoa aparece escrita de outro jeito. O que a
  // heurística pega vira PERGUNTA antes de gravar; o que ela não pega (apelido)
  // cai como inédito e depende do popup manual — cuja resposta fica gravada em
  // championship_name_aliases e nunca mais é perguntada.
  console.log("\n--- conciliação na importação");

  {
    const nomesDe = (abas: AbaPlanilha[]) => {
      const imp = importarPlanilhaCampeonato(abas);
      const todos: string[] = [];
      for (const r of imp.resultados) {
        if (r.pilotName) todos.push(r.pilotName);
        if (r.navigatorName) todos.push(r.navigatorName);
      }
      return todos;
    };

    check("nome só com acento diferente resolve sozinho, sem perguntar",
      (() => {
        const s = conciliarNomes({ novos: ["Rogeriao", "BENÊ ", "Zé do Cafe"], existentes: ["Rogerião", "Benê", "Zé do Café"] });
        return s.automaticos.length === 3 && s.automaticos.every(a => a.motivo === "normalizado") && s.duvidas.length === 0;
      })(),
      "Rogeriao->Rogerião, BENÊ->Benê, Zé do Cafe->Zé do Café");

    check("nome idêntico é 'exato', não vira pergunta",
      (() => {
        const s = conciliarNomes({ novos: ["Chakal"], existentes: ["Chakal", "Cavalo"] });
        return s.automaticos[0]?.motivo === "exato" && s.duvidas.length === 0;
      })(), "Chakal = Chakal");

    check("nome curto (<= 3 letras) nunca vira dúvida",
      (() => {
        const s = conciliarNomes({ novos: ["Gio"], existentes: ["Gil"] });
        return s.ineditos.includes("Gio") && s.duvidas.length === 0;
      })(), "Gio x Gil -> inédito");

    if (abasIda && abasCavalo) {
      const existentes = nomesDe(abasIda);
      const novos = nomesDe(abasCavalo);
      const s = conciliarNomes({ novos, existentes });

      const distintos = new Set(novos.map(n => n.replace(/\s+/g, " ").trim())).size;
      check("conciliação classifica todo nome novo exatamente uma vez",
        s.automaticos.length + s.duvidas.length + s.ineditos.length === distintos,
        `${s.automaticos.length} automáticos + ${s.duvidas.length} dúvidas + ${s.ineditos.length} inéditos = ${distintos} nomes`);

      const nilson = s.duvidas.find(d => d.novo === "Nilson Soares de Lima");
      check("'Nilson Soares de Lima' vira PERGUNTA com 'Nilson Soares' na frente",
        !!nilson && nilson.candidatos[0].nome === "Nilson Soares" && nilson.candidatos[0].similaridade >= 0.9,
        nilson ? `candidatos: ${nilson.candidatos.map(c => `${c.nome} (${c.similaridade.toFixed(2)})`).join(", ")}` : "não perguntou");

      const marcos = s.duvidas.find(d => d.novo === "Marcos Magri");
      check("'Marcos Magri' vira PERGUNTA com 'Marcos' (mesmo primeiro nome)",
        !!marcos && marcos.candidatos.some(c => c.nome === "Marcos"),
        marcos ? marcos.candidatos.map(c => `${c.nome} (${c.similaridade.toFixed(2)})`).join(", ") : "não perguntou");

      const mateus = s.duvidas.find(d => d.novo === "Mateus Casteline");
      check("'Mateus Casteline' vira PERGUNTA com 'Mateus'",
        !!mateus && mateus.candidatos.some(c => c.nome === "Mateus"),
        mateus ? mateus.candidatos.map(c => c.nome).join(", ") : "não perguntou");

      // Apelido não é variação ortográfica: a heurística de TEXTO não pega, e está
      // certo que não pegue — chutar "Benê = Benedito Lopes" sozinho seria pior.
      check("sem dica de e-mail, apelido ('Benê' x 'Benedito Lopes') cai como inédito",
        s.ineditos.includes("Benedito Lopes") && !s.duvidas.some(d => d.novo === "Benedito Lopes"),
        "comportamento esperado: heurística não chuta apelido");
      check("sem dica de e-mail, 'Victinho' x 'Victor Hugo Pizoni Neto' também cai como inédito",
        s.ineditos.includes("Victor Hugo Pizoni Neto"), "idem — decisão manual, gravada em championship_name_aliases");

      // ---- a DICA de e-mail: é ela que finalmente liga o apelido ao nome completo
      const comEmail = conciliarNomes({
        novos, existentes,
        dicasNovos: dicasDe(importarPlanilhaCampeonato(abasCavalo).resultados),
        dicasExistentes: dicasDe(importarPlanilhaCampeonato(abasIda).resultados),
      });

      const bene = comEmail.duvidas.find(d => d.novo === "Benedito Lopes");
      const candidatoBene = bene?.candidatos.find(c => c.nome === "Benê");
      check("dica de e-mail: 'Benê' vira candidato de 'Benedito Lopes' com mesmoEmail",
        !!candidatoBene && candidatoBene.mesmoEmail === true && bene!.candidatos[0].nome === "Benê" && bene!.papel === "pilot",
        bene ? `papel=${bene.papel} candidatos: ${bene.candidatos.map(c => `${c.nome}(email=${c.mesmoEmail})`).join(", ")}` : "não virou dúvida");

      const victor = comEmail.duvidas.find(d => d.novo === "Victor Hugo Pizoni Neto");
      const candidatoVictor = victor?.candidatos.find(c => c.nome === "Victinho");
      check("dica de e-mail: 'Victinho' vira candidato de 'Victor Hugo Pizoni Neto' com mesmoEmail",
        !!candidatoVictor && candidatoVictor.mesmoEmail === true && victor!.candidatos[0].nome === "Victinho",
        victor ? victor.candidatos.map(c => `${c.nome}(email=${c.mesmoEmail})`).join(", ") : "não virou dúvida");

      check("e-mail NUNCA promove para automático — a decisão continua sendo humana",
        !comEmail.automaticos.some(a => a.novo === "Benedito Lopes" || a.novo === "Victor Hugo Pizoni Neto"),
        "apelido segue exigindo o popup");

      // A pegadinha do dado real: o e-mail da coluna EMAIL é o contato da DUPLA.
      // "Zé do Café" (piloto) traz o e-mail do "Vado" (navegador). Se o e-mail
      // casasse entre papéis, isso ligaria duas pessoas DIFERENTES.
      const cruzado = conciliarNomes({
        novos: ["Fulano de Tal"],
        existentes: ["Beltrano da Silva"],
        dicasNovos: [{ nome: "Fulano de Tal", emailNorm: "dupla@exemplo.com", papel: "navigator" }],
        dicasExistentes: [{ nome: "Beltrano da Silva", emailNorm: "dupla@exemplo.com", papel: "pilot" }],
      });
      check("mesmo e-mail em PAPÉIS diferentes não vira dica (é o contato da dupla)",
        cruzado.duvidas.length === 0 && cruzado.ineditos.includes("Fulano de Tal"),
        cruzado.duvidas.length ? "gerou dica (ERRADO)" : "nenhuma dica, entra como inédito");

      const mesmoPapel = conciliarNomes({
        novos: ["Fulano de Tal"],
        existentes: ["Beltrano da Silva"],
        dicasNovos: [{ nome: "Fulano de Tal", emailNorm: " Dupla@Exemplo.COM ", papel: "pilot" }],
        dicasExistentes: [{ nome: "Beltrano da Silva", emailNorm: "dupla@exemplo.com", papel: "pilot" }],
      });
      check("normalizarEmail: trim + lowercase casam o mesmo endereço",
        mesmoPapel.duvidas[0]?.candidatos[0]?.mesmoEmail === true,
        `"${normalizarEmail(" Dupla@Exemplo.COM ")}"`);

      const vazio = conciliarNomes({
        novos: ["Fulano de Tal"],
        existentes: ["Beltrano da Silva"],
        dicasNovos: [{ nome: "Fulano de Tal", emailNorm: "   ", papel: "pilot" }],
        dicasExistentes: [{ nome: "Beltrano da Silva", emailNorm: "", papel: "pilot" }],
      });
      check("e-mail vazio nunca casa com e-mail vazio",
        vazio.duvidas.length === 0 && vazio.ineditos.includes("Fulano de Tal"),
        "sem e-mail, sem dica");

      // "Davi Vera" é Navegador no Ida e Piloto no Cavalo: a conciliação é por
      // NOME, não por papel — quem chama decide se separa as listas.
      const davi = s.automaticos.find(a => a.novo === "Davi Vera");
      check("mesma pessoa em papel diferente casa igual (a função não sabe de papel)",
        davi?.motivo === "exato", davi ? `${davi.novo} -> ${davi.canonico} (${davi.motivo})` : "não casou");

      // ---- a memória: o que o organizador respondeu no popup
      const decisaoSim: DecisaoAlias[] = [
        { aliasNorm: normalizarNome("Benedito Lopes"), canonicalName: "Benê", isDistinct: false },
      ];
      const comSim = conciliarNomes({ novos, existentes, decisoes: decisaoSim });
      const benê = comSim.automaticos.find(a => a.novo === "Benedito Lopes");
      check("respondido 'é o mesmo': a planilha seguinte já entra com o nome canônico",
        benê?.motivo === "alias" && benê.canonico === "Benê" && !comSim.ineditos.includes("Benedito Lopes"),
        benê ? `${benê.novo} -> ${benê.canonico} (${benê.motivo})` : "não lembrou a decisão");

      const decisaoNao: DecisaoAlias[] = [
        { aliasNorm: normalizarNome("Nilson Soares de Lima"), canonicalName: "Nilson Soares", isDistinct: true },
      ];
      const comNao = conciliarNomes({ novos, existentes, decisoes: decisaoNao });
      check("respondido 'são pessoas diferentes': nunca mais pergunta o mesmo par",
        !comNao.duvidas.some(d => d.novo === "Nilson Soares de Lima" && d.candidatos.some(c => c.nome === "Nilson Soares")),
        "par recusado sai da lista de candidatos");

      // Subir a MESMA planilha de novo não pode gerar pergunta nenhuma.
      const mesma = conciliarNomes({ novos: existentes, existentes });
      check("reimportar a mesma planilha não pergunta nada",
        mesma.duvidas.length === 0 && mesma.ineditos.length === 0 && mesma.automaticos.every(a => a.motivo === "exato"),
        `${mesma.automaticos.length} nomes, todos exatos`);

      console.log(`      (dúvidas geradas na 2ª planilha: ${s.duvidas.map(d => `${d.novo} ~ ${d.candidatos[0].nome}`).join(" | ") || "nenhuma"})`);
    }

    check("similaridadeConciliacao: contido > primeiro nome igual > nada a ver",
      similaridadeConciliacao("Nilson Soares", "Nilson Soares de Lima") >= 0.92 &&
      similaridadeConciliacao("Marcos", "Marcos Magri") >= 0.82 &&
      similaridadeConciliacao("Benê", "Benedito Lopes") < 0.82,
      `${similaridadeConciliacao("Nilson Soares", "Nilson Soares de Lima").toFixed(2)} / ` +
      `${similaridadeConciliacao("Marcos", "Marcos Magri").toFixed(2)} / ` +
      `${similaridadeConciliacao("Benê", "Benedito Lopes").toFixed(2)}`);

    check("primeiro nome igual não basta para resolver sozinho — só para perguntar",
      (() => {
        const s = conciliarNomes({ novos: ["Paulo Gallina"], existentes: ["Paulo Caixa"] });
        return s.automaticos.length === 0 && (s.duvidas.length === 1 || s.ineditos.length === 1);
      })(), "dois Paulos diferentes nunca são fundidos sem resposta humana");
  }

  // =============================================================== 7. nomes
  console.log("\n--- nomes");

  check("normalizarNome tira acento, caixa e espaço duplo",
    normalizarNome("  José   DA Silva ") === "jose da silva", `"${normalizarNome("  José   DA Silva ")}"`);
  check("normalizarNome tira pontuação",
    normalizarNome("Sant'Anna Jr.") === "sant anna jr", `"${normalizarNome("Sant'Anna Jr.")}"`);
  check("distanciaEdicao conta as edições",
    distanciaEdicao("cavalo", "cavalos") === 1 && distanciaEdicao("ana", "ana") === 0 && distanciaEdicao("", "abc") === 3,
    "cavalo->cavalos = 1");
  check("semelhancaNomes ignora acento e caixa",
    semelhancaNomes("Rogério", "ROGERIO") === 1, "Rogério = ROGERIO");

  {
    const grupos = sugerirUnificacoes(["Marcos Magri", "Marcos Magri", "Marcos Magrí", "Chakal", "Cavalo"]);
    check("unificador junta a variante com acento e mantém o mais frequente como canônico",
      grupos.length === 1 && grupos[0].canonico === "Marcos Magri" && grupos[0].nomes.length === 2,
      `${grupos[0]?.nomes.join(" = ")} (canônico: ${grupos[0]?.canonico})`);
  }
  {
    const grupos = sugerirUnificacoes(["Nilson Soares", "Nilson Soares de Lima"]);
    check("unificador entende nome curto contido no completo",
      grupos.length === 1 && grupos[0].canonico === "Nilson Soares de Lima",
      grupos[0] ? grupos[0].nomes.join(" = ") : "não agrupou");
  }
  {
    const grupos = sugerirUnificacoes(["Paulo Gallina", "Paulo Caixa", "Fabio Donini"]);
    check("unificador não junta dois Paulos diferentes", grupos.length === 0,
      grupos.length ? grupos.map(g => g.nomes.join(" = ")).join(" | ") : "nenhuma sugestão");
  }

  console.log(falhas === 0 ? "\nTODOS OS CHECKS PASSARAM" : `\n${falhas} CHECK(S) FALHARAM`);
  process.exit(falhas === 0 ? 0 : 1);
}

main().catch(err => { console.error(err); process.exit(1); });
