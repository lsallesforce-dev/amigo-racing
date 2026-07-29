// Número e horário de largada de UMA inscrição, a partir da start_order_config.
//
// Os campos registrations.startNumber / startTime vivem quase sempre null: o valor
// real é derivado da config da categoria + a posição da inscrição no
// registrationOrder (o sorteio). Essa conta já existia copiada em três lugares
// (PDF da Listagem de Inscritos, painel do competidor, ordem de largada) — aqui
// ela fica num lugar só, pra convocação por e-mail não virar a quarta cópia.

import { calculateStartTime } from "../lib/start-order.js";

export interface StartOrderInfo {
  numero: number | null;
  horario: string | null; // HH:MM
}

function parseOrder(registrationOrder: unknown): number[] {
  if (Array.isArray(registrationOrder)) return registrationOrder as number[];
  if (typeof registrationOrder === "string") {
    try {
      const parsed = JSON.parse(registrationOrder);
      return Array.isArray(parsed) ? parsed : [];
    } catch {
      return [];
    }
  }
  return [];
}

/**
 * `configs` = todas as start_order_config do evento. `reg` precisa de id,
 * categoryId e (como fallback) startNumber/startTime já gravados.
 */
export function resolveStartOrder(reg: any, configs: any[] | undefined): StartOrderInfo {
  const fallback: StartOrderInfo = {
    numero: reg?.startNumber ?? null,
    horario: reg?.startTime ? String(reg.startTime).substring(0, 5) : null,
  };
  if (!configs?.length) return fallback;

  const config = configs.find((c: any) => Number(c.categoryId) === Number(reg?.categoryId));
  if (!config) return fallback;

  const ordem = parseOrder(config.registrationOrder);
  const idx = ordem.indexOf(Number(reg?.id));
  if (idx < 0) return fallback;

  return {
    numero: Number(config.numberStart) + idx,
    horario: calculateStartTime(String(config.startTime || "08:00"), idx, Number(config.intervalSeconds) || 0),
  };
}
