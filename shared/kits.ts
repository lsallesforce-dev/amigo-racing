// Montagem de kits: lista de trabalho + etiquetas para colar no saco.
//
// Este arquivo é a parte PURA (sem jsPDF, sem browser): montagem dos dados e a
// grade das etiquetas. É por ela que lib/kits.check.ts confere os números contra
// o banco real. O desenho dos PDFs mora em lib/kitPdf.ts.

import { resolveStartOrder } from "./startOrderLookup.js";
import { shirtSizesOfRegistration, normalizeShirtSize, sortShirtSizes } from "./shirtSizes.js";

// ---------------------------------------------------------------- dados

export interface Kit {
  id: number;
  accessHash: string | null;
  numero: number | null;
  horario: string | null;
  categoriaNome: string;
  pilotName: string;
  navigatorName: string | null;
  telefone: string | null;
  camisaPiloto: string;
  camisaNavegador: string;
  /** Extras da loja, já formatados: "2x Camiseta Extra (M, G)". */
  extras: string;
  /** Só os tamanhos vindos da loja, um item por camiseta. */
  extrasTamanhos: string[];
  pago: boolean;
  /** Todas as camisetas do kit (piloto + nav + loja). */
  todosTamanhos: string[];
}

export interface DadosDeKits {
  kits: Kit[];
  /** Kits agrupados por categoria, na ordem de largada das categorias. */
  grupos: { categoria: string; kits: Kit[] }[];
  /** Total de camisetas por tamanho, na ordem canônica de exibição. */
  totaisPorTamanho: { size: string; total: number }[];
  totalKits: number;
  totalPendentes: number;
  totalCamisetas: number;
}

/** Extras da loja de UMA inscrição: rótulo legível + tamanhos soltos. */
function lerExtras(purchasedProducts: unknown): { texto: string; tamanhos: string[] } {
  let itens: any[] = [];
  try {
    itens = typeof purchasedProducts === "string"
      ? JSON.parse(purchasedProducts)
      : (purchasedProducts as any[]) || [];
  } catch { itens = []; }
  if (!Array.isArray(itens) || itens.length === 0) return { texto: "", tamanhos: [] };

  const tamanhos: string[] = [];
  const partes: string[] = [];
  for (const item of itens) {
    if (!item) continue;
    const nome = item.name || `Produto ${item.productId ?? ""}`.trim();
    const qtd = Number(item.quantity) || 1;
    // O card da Secretaria lia `p.size` (singular), que o sistema nunca grava —
    // por isso o tamanho do extra não aparecia. O canônico é `sizes` (array).
    const brutos: unknown[] = Array.isArray(item.sizes)
      ? item.sizes
      : (item.size ? [item.size] : []);
    const norm = brutos.map(normalizeShirtSize).filter(Boolean) as string[];
    tamanhos.push(...norm);
    partes.push(norm.length ? `${qtd}x ${nome} (${norm.join(", ")})` : `${qtd}x ${nome}`);
  }
  return { texto: partes.join(" | "), tamanhos };
}

/**
 * `regs` = inscrições cruas do evento; `categories` = categorias do evento
 * (pai e filhas); `startConfigs` = start_order_config do evento.
 * Cancelados ficam de fora — não se monta kit para inscrição cancelada.
 */
export function montarDadosDeKits(
  regs: any[] | undefined,
  categories: any[] | undefined,
  startConfigs: any[] | undefined,
): DadosDeKits {
  const cats = categories || [];
  const configs = startConfigs || [];

  const nomeDaCategoria = (categoryId: number): string => {
    const cat = cats.find((c: any) => Number(c.id) === Number(categoryId));
    if (!cat) return "Sem categoria";
    const pai = cat.parentId ? cats.find((c: any) => Number(c.id) === Number(cat.parentId)) : null;
    return pai ? `${pai.name} - ${cat.name}` : cat.name;
  };

  const kits: Kit[] = (regs || [])
    .filter((r: any) => r?.status !== "cancelled")
    .map((reg: any) => {
      const { numero, horario } = resolveStartOrder(reg, configs);
      const extras = lerExtras(reg.purchasedProducts);
      return {
        id: Number(reg.id),
        accessHash: reg.accessHash || null,
        numero,
        horario,
        categoriaNome: nomeDaCategoria(reg.categoryId),
        pilotName: reg.pilotName || "-",
        navigatorName: reg.navigatorName || null,
        // Só existe o telefone da inscrição (do piloto): não há navigatorPhone.
        telefone: reg.phone || null,
        camisaPiloto: normalizeShirtSize(reg.pilotShirtSize),
        camisaNavegador: normalizeShirtSize(reg.navigatorShirtSize),
        extras: extras.texto,
        extrasTamanhos: extras.tamanhos,
        pago: reg.status === "paid",
        todosTamanhos: shirtSizesOfRegistration(reg),
      };
    });

  // Ordem das categorias = ordem de largada; quem não tem config vai pro fim.
  const posicaoDaCategoria = (nome: string): number => {
    const cat = cats.find((c: any) => nomeDaCategoria(c.id) === nome);
    const cfg = cat ? configs.find((c: any) => Number(c.categoryId) === Number(cat.id)) : null;
    return cfg ? Number(cfg.orderPosition) : 9999;
  };

  const mapa = new Map<string, Kit[]>();
  for (const kit of kits) {
    if (!mapa.has(kit.categoriaNome)) mapa.set(kit.categoriaNome, []);
    mapa.get(kit.categoriaNome)!.push(kit);
  }
  const grupos = [...mapa.entries()]
    .map(([categoria, lista]) => ({
      categoria,
      // Dentro da categoria, na ordem de largada — a pilha de kits sai pronta.
      kits: [...lista].sort((a, b) => {
        if (a.numero != null && b.numero != null) return a.numero - b.numero;
        if (a.numero != null) return -1;
        if (b.numero != null) return 1;
        return a.pilotName.localeCompare(b.pilotName);
      }),
    }))
    .sort((a, b) => {
      const pa = posicaoDaCategoria(a.categoria);
      const pb = posicaoDaCategoria(b.categoria);
      return pa !== pb ? pa - pb : a.categoria.localeCompare(b.categoria);
    });

  const contagem = new Map<string, number>();
  for (const kit of kits) {
    for (const size of kit.todosTamanhos) {
      contagem.set(size, (contagem.get(size) || 0) + 1);
    }
  }
  const totaisPorTamanho = sortShirtSizes(
    [...contagem.entries()].map(([size, total]) => ({ size, total })),
    (i) => i.size,
  );

  return {
    kits,
    grupos,
    totaisPorTamanho,
    totalKits: kits.length,
    totalPendentes: kits.filter(k => !k.pago).length,
    totalCamisetas: totaisPorTamanho.reduce((acc, t) => acc + t.total, 0),
  };
}

// ---------------------------------------------------------------- etiquetas: grade

export type FormatoEtiqueta = "10x15" | "10x7";

export interface GradeEtiquetas {
  larguraMm: number;
  alturaMm: number;
  colunas: number;
  linhas: number;
  porFolha: number;
  margemX: number;
  margemY: number;
}

const A4_LARGURA = 210;
const A4_ALTURA = 297;

/** Quantas etiquetas cabem na A4 e onde começam, por formato. */
export function gradeDeEtiquetas(formato: FormatoEtiqueta): GradeEtiquetas {
  const larguraMm = 100;
  const alturaMm = formato === "10x15" ? 150 : 74;
  const colunas = Math.floor(A4_LARGURA / larguraMm);            // 2
  const linhas = Math.floor((A4_ALTURA - 10) / alturaMm);         // 1 (10x15) | 3 (10x7)
  return {
    larguraMm,
    alturaMm,
    colunas,
    linhas,
    porFolha: colunas * linhas,
    margemX: (A4_LARGURA - colunas * larguraMm) / 2,
    margemY: (A4_ALTURA - linhas * alturaMm) / 2,
  };
}

export function folhasDeEtiquetas(totalKits: number, formato: FormatoEtiqueta): number {
  const { porFolha } = gradeDeEtiquetas(formato);
  return Math.ceil(totalKits / porFolha);
}
