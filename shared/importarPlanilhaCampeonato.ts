// Leitura das planilhas de resultado do campeonato — parte PURA.
//
// O importador antigo (pages/ChampionshipDetails.tsx) lia CSV como texto, exigia
// as colunas "NOME PILOTO"/"NOME NAVEGADOR" e UMA coluna "POS ETAPA n". As
// planilhas que o Amigo usa de verdade são .xlsx no formato LONGO — uma linha por
// pessoa, com "NOME" + "FUNÇÃO" (Piloto/Navegador) — com "ETAPA-1"/"ETAPA-2" e uma
// aba por categoria. Nada casava: a importação terminava com zero linhas.
//
// Aqui o parser entende os DOIS formatos e devolve avisos em vez de explodir:
// dado sujo de planilha é regra, não exceção, e o organizador precisa ver o que
// está torto ANTES de gravar.
//
// Este arquivo não importa `xlsx` de propósito — recebe a matriz já extraída,
// para rodar igual no browser, no servidor e no check.

// ------------------------------------------------------------------ entrada

export type CelulaPlanilha = string | number | boolean | null | undefined;

/** Uma aba da planilha: `linhas[0]` costuma ser o cabeçalho. */
export interface AbaPlanilha {
  nome: string;
  linhas: CelulaPlanilha[][];
}

export type LayoutAba = "longo" | "largo" | "desconhecido";

// ------------------------------------------------------------------ saída

export interface ResultadoImportado {
  stageNumber: number;
  categoria: string;
  pilotName: string | null;
  navigatorName: string | null;
  /** 0 quando DSQ ou DNS. */
  position: number;
  isDisqualified: boolean;
  isDns: boolean;
  /** Origem, para a UI conseguir apontar a linha da planilha. */
  aba: string;
  /** Número da linha na planilha, 1-based (igual ao que o Excel mostra). */
  linha: number;
}

export type TipoAviso =
  | "aba_vazia"
  | "layout_desconhecido"
  | "sem_coluna_etapa"
  | "linha_sem_nome"
  | "funcao_desconhecida"
  | "navegador_sem_piloto"
  | "navegador_extra"
  | "divergencia_dupla"
  | "valor_nao_reconhecido"
  | "posicao_duplicada"
  | "buraco_na_sequencia"
  | "categoria_divergente";

export interface Aviso {
  tipo: TipoAviso;
  mensagem: string;
  aba?: string;
  /** 1-based, como no Excel. */
  linha?: number;
  categoria?: string;
  stageNumber?: number;
  /** Nome sugerido, quando o aviso é de categoria divergente. */
  sugestao?: string;
}

export interface ResumoAba {
  nome: string;
  layout: LayoutAba;
  /** Categoria predominante da aba (coluna CATEGORIA ou o nome da aba). */
  categoria: string;
  duplas: number;
  etapas: number[];
}

export interface ResultadoImportacao {
  /** Números de etapa achados no cabeçalho, em ordem. */
  etapas: number[];
  resultados: ResultadoImportado[];
  avisos: Aviso[];
  abas: ResumoAba[];
}

export interface OpcoesImportacao {
  /**
   * Categorias que já existem no campeonato. Serve para avisar quando a planilha
   * escreve o mesmo nome de outro jeito ("CARRO MASTER" x "Carros Master").
   */
  categoriasConhecidas?: string[];
}

// ------------------------------------------------------------------ texto

function semAcento(texto: string): string {
  return texto.normalize("NFD").replace(/[\u0300-\u036f]/g, "");
}

/** Cabeçalho comparável: sem acento, maiúsculo, sem espaço sobrando. */
export function normalizarCabecalho(valor: CelulaPlanilha): string {
  return semAcento(String(valor ?? ""))
    .replace(/\s+/g, " ")
    .trim()
    .toUpperCase();
}

function texto(valor: CelulaPlanilha): string {
  if (valor === null || valor === undefined) return "";
  return String(valor).replace(/\s+/g, " ").trim();
}

/**
 * Chave de comparação de categoria: ignora acento, caixa e plural — é o que
 * permite ver que "CARRO MASTER" e "Carros Master" são a mesma coisa.
 */
export function chaveCategoria(nome: string): string {
  return semAcento(String(nome || ""))
    .toUpperCase()
    .replace(/[^A-Z0-9 ]+/g, " ")
    .split(/\s+/)
    .filter(Boolean)
    .map(p => (p.length > 3 && p.endsWith("S") ? p.slice(0, -1) : p))
    .join(" ");
}

// ------------------------------------------------------------------ células

export type CelulaEtapa =
  | { tipo: "posicao"; position: number }
  | { tipo: "dns" }
  | { tipo: "dsq" }
  | { tipo: "desconhecido"; texto: string };

/** Códigos de "correu e não pontuou": não classificado, desclassificado, abandonou. */
const CODIGOS_DSQ = new Set(["NC", "DSQ", "DQ", "DNF", "EXC", "ABD", "EXCLUIDO", "DESCLASSIFICADO"]);
/** Códigos de "não largou". */
const CODIGOS_DNS = new Set(["DNS", "-", "--", "AUSENTE", "FALTOU", "NL"]);

/**
 * Como ler a célula de uma coluna de etapa.
 * Inteiro >= 1 é colocação; 0/vazio/"-" é DNS; NC/DSQ/DQ/DNF/EXC/ABD é
 * desclassificado (posição 0). O resto vira aviso e é tratado como DNS, para o
 * competidor não sumir da tabela por causa de uma célula estranha.
 */
export function interpretarCelulaEtapa(valor: CelulaPlanilha): CelulaEtapa {
  if (valor === null || valor === undefined) return { tipo: "dns" };

  if (typeof valor === "number") {
    if (!Number.isFinite(valor)) return { tipo: "desconhecido", texto: String(valor) };
    if (valor === 0) return { tipo: "dns" };
    if (Number.isInteger(valor) && valor >= 1) return { tipo: "posicao", position: valor };
    return { tipo: "desconhecido", texto: String(valor) };
  }

  const cru = texto(valor);
  if (!cru) return { tipo: "dns" };

  const chave = semAcento(cru).toUpperCase().replace(/[.º°]/g, "");
  if (CODIGOS_DNS.has(chave)) return { tipo: "dns" };
  if (CODIGOS_DSQ.has(chave)) return { tipo: "dsq" };

  const numero = Number(chave.replace(",", "."));
  if (Number.isFinite(numero)) {
    if (numero === 0) return { tipo: "dns" };
    if (Number.isInteger(numero) && numero >= 1) return { tipo: "posicao", position: numero };
  }

  return { tipo: "desconhecido", texto: cru };
}

function classificarFuncao(valor: CelulaPlanilha): "piloto" | "navegador" | "desconhecida" {
  const v = normalizarCabecalho(valor);
  if (!v) return "desconhecida";
  if (v.startsWith("PILOT") || v.startsWith("CONDUTOR")) return "piloto";
  if (v.startsWith("NAVEG") || v.startsWith("COPILOT") || v.startsWith("CO-PILOT") || v.startsWith("NAVIGATOR")) {
    return "navegador";
  }
  return "desconhecida";
}

// ------------------------------------------------------------------ cabeçalho

const RE_ETAPA = /^(POS\s*)?ETAPA[\s\-_]*(\d+)$/;

interface Mapa {
  linhaCabecalho: number;
  layout: LayoutAba;
  idxNome: number;
  idxFuncao: number;
  idxCategoria: number;
  idxPiloto: number;
  idxNavegador: number;
  colunasEtapa: { coluna: number; stageNumber: number }[];
}

function mapearCabecalho(linhas: CelulaPlanilha[][]): Mapa | null {
  const limite = Math.min(linhas.length, 15);
  for (let i = 0; i < limite; i++) {
    const cabecalho = (linhas[i] || []).map(normalizarCabecalho);
    const acha = (...nomes: string[]) => cabecalho.findIndex(c => nomes.includes(c));

    const idxNome = acha("NOME", "NOME COMPLETO", "COMPETIDOR");
    const idxFuncao = acha("FUNCAO", "PAPEL", "TIPO");
    const idxPiloto = acha("NOME PILOTO", "PILOTO");
    const idxNavegador = acha("NOME NAVEGADOR", "NAVEGADOR");
    // "CATEGORIA - SUBCATEGORIA" (Kraken) também vale como categoria.
    const idxCategoria = cabecalho.findIndex(c => c === "CATEGORIA" || c.startsWith("CATEGORIA "));

    const colunasEtapa: { coluna: number; stageNumber: number }[] = [];
    cabecalho.forEach((c, col) => {
      const m = RE_ETAPA.exec(c);
      if (m) colunasEtapa.push({ coluna: col, stageNumber: Number(m[2]) });
    });

    let layout: LayoutAba = "desconhecido";
    if (idxNome >= 0 && idxFuncao >= 0) layout = "longo";
    else if (idxPiloto >= 0) layout = "largo";
    else if (idxNome >= 0) layout = "largo"; // só NOME, sem FUNÇÃO: uma pessoa por linha

    if (layout === "desconhecido") continue;

    return {
      linhaCabecalho: i,
      layout,
      idxNome,
      idxFuncao,
      idxCategoria,
      idxPiloto: idxPiloto >= 0 ? idxPiloto : layout === "largo" ? idxNome : -1,
      idxNavegador,
      colunasEtapa: colunasEtapa.sort((a, b) => a.stageNumber - b.stageNumber),
    };
  }
  return null;
}

// ------------------------------------------------------------------ duplas

interface Dupla {
  pilotName: string | null;
  navigatorName: string | null;
  categoria: string;
  linha: number;
  /** stageNumber -> célula já interpretada */
  celulas: Map<number, CelulaEtapa>;
  /**
   * Dupla criada a partir de outra (2º navegador do mesmo carro). Repete a
   * colocação da dupla original, então NÃO entra na conferência de posição
   * duplicada — senão o 2º navegador vira um "empate" fantasma.
   */
  derivada?: boolean;
}

function lerCelulas(
  linha: CelulaPlanilha[],
  mapa: Mapa,
  aba: string,
  numeroLinha: number,
  avisos: Aviso[],
): Map<number, CelulaEtapa> {
  const celulas = new Map<number, CelulaEtapa>();
  for (const col of mapa.colunasEtapa) {
    const celula = interpretarCelulaEtapa(linha[col.coluna]);
    if (celula.tipo === "desconhecido") {
      avisos.push({
        tipo: "valor_nao_reconhecido",
        aba,
        linha: numeroLinha,
        stageNumber: col.stageNumber,
        mensagem: `Etapa ${col.stageNumber}: valor "${celula.texto}" não foi reconhecido — tratado como não largou (DNS).`,
      });
    }
    celulas.set(col.stageNumber, celula);
  }
  return celulas;
}

// ------------------------------------------------------------------ importação

/**
 * Lê as abas já extraídas da planilha e devolve os resultados por etapa.
 * Nunca joga exceção por causa de dado sujo — o que estiver torto sai em `avisos`.
 */
export function importarPlanilhaCampeonato(
  abas: AbaPlanilha[],
  opcoes: OpcoesImportacao = {},
): ResultadoImportacao {
  const avisos: Aviso[] = [];
  const resultados: ResultadoImportado[] = [];
  const resumoAbas: ResumoAba[] = [];
  const etapasVistas = new Set<number>();
  const categoriasVistas: string[] = [];

  for (const aba of abas || []) {
    const linhas = (aba.linhas || []).filter(l => Array.isArray(l));
    const mapa = mapearCabecalho(linhas);

    if (!mapa) {
      avisos.push({
        tipo: "layout_desconhecido",
        aba: aba.nome,
        mensagem: `Aba "${aba.nome}": não achei as colunas NOME + FUNÇÃO nem NOME PILOTO. Aba ignorada.`,
      });
      resumoAbas.push({ nome: aba.nome, layout: "desconhecido", categoria: aba.nome, duplas: 0, etapas: [] });
      continue;
    }

    if (mapa.colunasEtapa.length === 0) {
      avisos.push({
        tipo: "sem_coluna_etapa",
        aba: aba.nome,
        mensagem: `Aba "${aba.nome}": nenhuma coluna de etapa (ex.: "ETAPA-1" ou "POS ETAPA 1"). Nada a importar daqui.`,
      });
    }

    const duplas: Dupla[] = [];
    let aberta: Dupla | null = null;

    for (let i = mapa.linhaCabecalho + 1; i < linhas.length; i++) {
      const linha = linhas[i] || [];
      const numeroLinha = i + 1;
      const temAlgo = linha.some(c => texto(c) !== "");
      if (!temAlgo) continue;

      const categoriaCrua = mapa.idxCategoria >= 0 ? texto(linha[mapa.idxCategoria]) : "";
      const categoria = categoriaCrua || aba.nome;

      if (mapa.layout === "longo") {
        const nome = texto(linha[mapa.idxNome]);
        if (!nome) {
          avisos.push({
            tipo: "linha_sem_nome",
            aba: aba.nome,
            linha: numeroLinha,
            mensagem: `Aba "${aba.nome}", linha ${numeroLinha}: linha com dados mas sem NOME — ignorada.`,
          });
          continue;
        }

        const funcao = classificarFuncao(linha[mapa.idxFuncao]);
        if (funcao === "desconhecida") {
          avisos.push({
            tipo: "funcao_desconhecida",
            aba: aba.nome,
            linha: numeroLinha,
            mensagem: `Aba "${aba.nome}", linha ${numeroLinha}: FUNÇÃO "${texto(linha[mapa.idxFuncao])}" desconhecida em "${nome}" — tratado como Piloto.`,
          });
        }

        if (funcao === "navegador") {
          const celulas = lerCelulas(linha, mapa, aba.nome, numeroLinha, avisos);
          if (!aberta) {
            // Navegador antes de qualquer piloto: entra sozinho, para não sumir.
            avisos.push({
              tipo: "navegador_sem_piloto",
              aba: aba.nome,
              linha: numeroLinha,
              mensagem: `Aba "${aba.nome}", linha ${numeroLinha}: navegador "${nome}" apareceu antes de qualquer piloto — importado sem dupla.`,
            });
            duplas.push({ pilotName: null, navigatorName: nome, categoria, linha: numeroLinha, celulas });
          } else if (!aberta.navigatorName) {
            aberta.navigatorName = nome;
            // A linha do navegador repete a posição da dupla; divergência é erro de digitação.
            for (const [stageNumber, celula] of celulas) {
              const daDupla = aberta.celulas.get(stageNumber);
              if (daDupla && daDupla.tipo === "posicao" && celula.tipo === "posicao" && daDupla.position !== celula.position) {
                avisos.push({
                  tipo: "divergencia_dupla",
                  aba: aba.nome,
                  linha: numeroLinha,
                  stageNumber,
                  categoria,
                  mensagem: `Aba "${aba.nome}", etapa ${stageNumber}: piloto "${aberta.pilotName}" está em ${daDupla.position}º e o navegador "${nome}" em ${celula.position}º — valeu a linha do piloto.`,
                });
              }
            }
          } else {
            avisos.push({
              tipo: "navegador_extra",
              aba: aba.nome,
              linha: numeroLinha,
              mensagem: `Aba "${aba.nome}", linha ${numeroLinha}: "${nome}" é o 2º navegador de "${aberta.pilotName}" — importado como competidor separado.`,
            });
            duplas.push({ pilotName: null, navigatorName: nome, categoria, linha: numeroLinha, celulas: aberta.celulas, derivada: true });
          }
          continue;
        }

        aberta = {
          pilotName: nome,
          navigatorName: null,
          categoria,
          linha: numeroLinha,
          celulas: lerCelulas(linha, mapa, aba.nome, numeroLinha, avisos),
        };
        duplas.push(aberta);
        continue;
      }

      // layout largo: uma linha = uma dupla
      const piloto = mapa.idxPiloto >= 0 ? texto(linha[mapa.idxPiloto]) : "";
      const navegador = mapa.idxNavegador >= 0 ? texto(linha[mapa.idxNavegador]) : "";
      if (!piloto && !navegador) {
        avisos.push({
          tipo: "linha_sem_nome",
          aba: aba.nome,
          linha: numeroLinha,
          mensagem: `Aba "${aba.nome}", linha ${numeroLinha}: linha com dados mas sem nome de piloto nem de navegador — ignorada.`,
        });
        continue;
      }
      duplas.push({
        pilotName: piloto || null,
        navigatorName: navegador || null,
        categoria,
        linha: numeroLinha,
        celulas: lerCelulas(linha, mapa, aba.nome, numeroLinha, avisos),
      });
    }

    if (duplas.length === 0) {
      avisos.push({
        tipo: "aba_vazia",
        aba: aba.nome,
        mensagem: `Aba "${aba.nome}": nenhum competidor encontrado abaixo do cabeçalho.`,
      });
    }

    for (const d of duplas) if (!categoriasVistas.includes(d.categoria)) categoriasVistas.push(d.categoria);

    // Emite os resultados e, de quebra, junta o material da conferência.
    const porEtapaCategoria = new Map<string, { stageNumber: number; categoria: string; posicoes: Map<number, string[]> }>();

    for (const col of mapa.colunasEtapa) {
      etapasVistas.add(col.stageNumber);
      for (const d of duplas) {
        const celula = d.celulas.get(col.stageNumber) || { tipo: "dns" as const };
        const position = celula.tipo === "posicao" ? celula.position : 0;
        const isDisqualified = celula.tipo === "dsq";
        const isDns = !isDisqualified && position === 0;

        resultados.push({
          stageNumber: col.stageNumber,
          categoria: d.categoria,
          pilotName: d.pilotName,
          navigatorName: d.navigatorName,
          position,
          isDisqualified,
          isDns,
          aba: aba.nome,
          linha: d.linha,
        });

        if (position > 0 && !d.derivada) {
          const chave = `${col.stageNumber}|${d.categoria}`;
          if (!porEtapaCategoria.has(chave)) {
            porEtapaCategoria.set(chave, { stageNumber: col.stageNumber, categoria: d.categoria, posicoes: new Map() });
          }
          const grupo = porEtapaCategoria.get(chave)!;
          if (!grupo.posicoes.has(position)) grupo.posicoes.set(position, []);
          grupo.posicoes.get(position)!.push(d.pilotName || d.navigatorName || `linha ${d.linha}`);
        }
      }
    }

    for (const grupo of porEtapaCategoria.values()) {
      for (const [posicao, nomes] of grupo.posicoes) {
        if (nomes.length > 1) {
          avisos.push({
            tipo: "posicao_duplicada",
            aba: aba.nome,
            categoria: grupo.categoria,
            stageNumber: grupo.stageNumber,
            mensagem: `Etapa ${grupo.stageNumber}, ${grupo.categoria}: ${posicao}º lugar aparece ${nomes.length} vezes (${nomes.join(", ")}).`,
          });
        }
      }
      const usadas = [...grupo.posicoes.keys()].sort((a, b) => a - b);
      const maior = usadas[usadas.length - 1] || 0;
      const buracos: number[] = [];
      for (let p = 1; p <= maior; p++) if (!grupo.posicoes.has(p)) buracos.push(p);
      if (buracos.length > 0) {
        avisos.push({
          tipo: "buraco_na_sequencia",
          aba: aba.nome,
          categoria: grupo.categoria,
          stageNumber: grupo.stageNumber,
          mensagem: `Etapa ${grupo.stageNumber}, ${grupo.categoria}: falta o(s) ${buracos.join("º, ")}º lugar (a sequência vai até ${maior}º).`,
        });
      }
    }

    resumoAbas.push({
      nome: aba.nome,
      layout: mapa.layout,
      categoria: duplas[0]?.categoria || aba.nome,
      duplas: duplas.length,
      etapas: mapa.colunasEtapa.map(c => c.stageNumber),
    });
  }

  // Categoria escrita de dois jeitos — dentro da própria planilha ou contra o
  // que já existe no campeonato ("CARRO MASTER" x "Carros Master").
  const porChave = new Map<string, { daPlanilha: string[]; conhecidas: string[] }>();
  const registrar = (nome: string, onde: "daPlanilha" | "conhecidas") => {
    const chave = chaveCategoria(nome);
    if (!chave) return;
    if (!porChave.has(chave)) porChave.set(chave, { daPlanilha: [], conhecidas: [] });
    const grupo = porChave.get(chave)!;
    if (!grupo[onde].includes(nome)) grupo[onde].push(nome);
  };
  categoriasVistas.forEach(c => registrar(c, "daPlanilha"));
  (opcoes.categoriasConhecidas || []).forEach(c => registrar(c, "conhecidas"));

  for (const grupo of porChave.values()) {
    const conhecidaIgual = grupo.conhecidas.find(c => grupo.daPlanilha.includes(c));
    for (const daPlanilha of grupo.daPlanilha) {
      const alternativa =
        grupo.conhecidas.find(c => c !== daPlanilha) ||
        grupo.daPlanilha.find(c => c !== daPlanilha);
      if (!alternativa) continue;
      if (conhecidaIgual === daPlanilha && grupo.daPlanilha.length === 1) continue;
      avisos.push({
        tipo: "categoria_divergente",
        categoria: daPlanilha,
        sugestao: alternativa,
        mensagem: `Categoria "${daPlanilha}" parece ser a mesma que "${alternativa}" — confira antes de importar.`,
      });
    }
  }

  return {
    etapas: [...etapasVistas].sort((a, b) => a - b),
    resultados,
    avisos,
    abas: resumoAbas,
  };
}
