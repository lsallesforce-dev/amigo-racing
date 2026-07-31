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
  telefoneNavegador: string | null;
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
        telefone: reg.phone || null,
        telefoneNavegador: reg.navigatorPhone || null,
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

export type FormatoEtiqueta = "10x15" | "a6" | "10x7";

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

// A4 = 210x297. As medidas de cada formato saem daí:
//  10x15 -> 2 lado a lado; a segunda fileira não cabe (300 > 297)
//  a6    -> 105x148,5 é exatamente um quarto da folha: 2x2 sem sobra
//  10x7  -> o adesivo A4 comum, 2x3
// As linhas são fixadas de propósito, não calculadas: no compacto caberiam 4
// fileiras (296 de 297mm), mas cortar com meio milímetro de folga é pedir para
// errar. Três fileiras deixam margem para a tesoura.
const MEDIDAS: Record<FormatoEtiqueta, { largura: number; altura: number; linhas: number }> = {
  "10x15": { largura: 100, altura: 150, linhas: 1 },
  a6: { largura: 105, altura: 148.5, linhas: 2 },
  "10x7": { largura: 100, altura: 74, linhas: 3 },
};

export const ROTULOS_ETIQUETA: Record<FormatoEtiqueta, string> = {
  "10x15": "10 x 15 cm (grande)",
  a6: "10,5 x 14,8 cm (A6)",
  "10x7": "10 x 7,4 cm (compacto)",
};

/** Quantas etiquetas cabem na A4 e onde começam, por formato. */
export function gradeDeEtiquetas(formato: FormatoEtiqueta): GradeEtiquetas {
  const medida = MEDIDAS[formato] || MEDIDAS["10x15"];
  const larguraMm = medida.largura;
  const alturaMm = medida.altura;
  const colunas = Math.floor(A4_LARGURA / larguraMm);      // 2 em todos
  const linhas = medida.linhas;
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

/**
 * O que vai dentro do QR da etiqueta: a URL do passaporte da inscrição.
 * Com o hash cru (como era antes) a câmera do celular só mostrava um punhado de
 * letras e não abria nada.
 */
export function urlDoPassaporte(baseUrl: string, accessHash: string): string {
  const raiz = String(baseUrl || "").replace(/\/+$/, "");
  return `${raiz}/passport/${accessHash}`;
}

export function folhasDeEtiquetas(totalKits: number, formato: FormatoEtiqueta): number {
  const { porFolha } = gradeDeEtiquetas(formato);
  return Math.ceil(totalKits / porFolha);
}
