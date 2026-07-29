// Variáveis que o organizador pode usar no corpo do e-mail: {{piloto}}, {{numero}}…
// Usado tanto pelo envio manual quanto pela régua automática de cobrança, pra
// os dois resolverem exatamente os mesmos dados.

import { escapeHtml } from "./emailLayout.js";
import { formatarDataDoBanco } from "./horarioBrasilia.js";

export const VARIAVEIS_EMAIL = [
  { chave: "piloto", descricao: "Nome do piloto" },
  { chave: "navegador", descricao: "Nome do navegador (ou '-')" },
  { chave: "numero", descricao: "Número de largada" },
  { chave: "horario_largada", descricao: "Horário de largada (HH:MM)" },
  { chave: "categoria", descricao: "Categoria da inscrição" },
  { chave: "evento", descricao: "Nome do evento" },
  { chave: "data_evento", descricao: "Data do evento" },
  { chave: "local", descricao: "Local / cidade do evento" },
  { chave: "status", descricao: "Confirmado ou Pendente" },
  { chave: "valor", descricao: "Valor da inscrição" },
] as const;

export type ChaveVariavel = typeof VARIAVEIS_EMAIL[number]["chave"];
export type ValoresVariaveis = Partial<Record<ChaveVariavel, string>>;

const formatarMoeda = (v: unknown) =>
  typeof v === "number"
    ? v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" })
    : "";

/** Monta os valores das variáveis a partir de uma inscrição + evento + largada. */
export function valoresDaInscricao(args: {
  reg: any;
  evento?: any;
  categoriaNome?: string | null;
  numero?: number | null;
  horario?: string | null;
}): ValoresVariaveis {
  const { reg, evento, categoriaNome, numero, horario } = args;

  return {
    piloto: String(reg?.pilotName || "").trim(),
    navegador: String(reg?.navigatorName || "").trim() || "-",
    numero: numero !== null && numero !== undefined ? String(numero) : "-",
    horario_largada: horario || "-",
    categoria: String(categoriaNome || reg?.categoryName || "-"),
    evento: String(evento?.name || reg?.eventName || ""),
    // events.startDate é timestamp sem fuso (relógio de parede) — formatar em
    // Brasília subtrairia 3h e anunciaria a data/hora errada do rally.
    data_evento: formatarDataDoBanco(evento?.startDate),
    local: [evento?.location, evento?.city, evento?.state].filter(Boolean).join(" - "),
    status: reg?.status === "paid" ? "Confirmado" : reg?.status === "cancelled" ? "Cancelado" : "Pendente",
    valor: formatarMoeda(reg?.categoryPrice),
  };
}

/**
 * Troca {{chave}} pelos valores, ESCAPANDO cada um: nome de piloto é dado de
 * entrada e não pode injetar HTML no e-mail. Variável desconhecida some.
 * Aceita espaços e maiúsculas ({{ Piloto }} funciona).
 */
export function aplicarVariaveis(texto: string, valores: ValoresVariaveis): string {
  return String(texto || "").replace(/\{\{\s*([a-zA-Z_]+)\s*\}\}/g, (_m, chave: string) => {
    const valor = valores[chave.toLowerCase() as ChaveVariavel];
    return valor === undefined ? "" : escapeHtml(valor);
  });
}

/**
 * Versão para o ASSUNTO do e-mail: mesma substituição, mas sem escapar
 * (assunto é texto puro; escapar deixaria "&amp;" visível pro destinatário).
 */
export function aplicarVariaveisTexto(texto: string, valores: ValoresVariaveis): string {
  return String(texto || "").replace(/\{\{\s*([a-zA-Z_]+)\s*\}\}/g, (_m, chave: string) => {
    const valor = valores[chave.toLowerCase() as ChaveVariavel];
    return valor === undefined ? "" : valor;
  });
}

/** Variáveis usadas no texto que não existem — para avisar antes de disparar. */
export function variaveisDesconhecidas(texto: string): string[] {
  const conhecidas = new Set(VARIAVEIS_EMAIL.map(v => v.chave as string));
  const achadas = [...String(texto || "").matchAll(/\{\{\s*([a-zA-Z_]+)\s*\}\}/g)]
    .map(m => m[1].toLowerCase());
  return [...new Set(achadas.filter(c => !conhecidas.has(c)))];
}
