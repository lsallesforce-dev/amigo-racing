/**
 * Lógica compartilhada da ordem de largada (cascata de números e horários).
 * Usada por StartOrderConfig, SorteoPage e StartOrderManager.
 * Mantenha este módulo puro (sem React, sem tRPC) — ele tem testes em lib/start-order.test.ts
 * (rode com `npm run test:start-order`).
 */

export interface CascadeEntry {
  categoryId: number;
  orderPosition: number;
  numberStart: number;
  numberEnd: number;
  /** HH:MM */
  startTime: string;
  intervalSeconds: number;
  /** Minutos de intervalo até a categoria seguinte */
  timeBetweenCategories: number;
  registrationCount: number;
  /** Campos marcados como manuais NÃO são sobrescritos pela cascata */
  numberStartManual: boolean;
  numberEndManual: boolean;
  startTimeManual: boolean;
}

export const timeToMinutes = (time: string): number => {
  const [hours, minutes] = (time || "08:00").split(":").map(Number);
  return (hours || 0) * 60 + (minutes || 0);
};

export const minutesToTime = (minutes: number): string => {
  const safe = Math.max(0, Math.round(minutes));
  const hours = Math.floor(safe / 60) % 24;
  const mins = safe % 60;
  return `${String(hours).padStart(2, "0")}:${String(mins).padStart(2, "0")}`;
};

/** Horário de largada do piloto `index` (0-based) dentro da categoria. */
export const calculateStartTime = (baseTime: string, index: number, intervalSeconds: number): string => {
  if (!baseTime) return "08:00";
  const [hours, minutes] = baseTime.split(":").map(Number);
  const totalSeconds = (hours || 0) * 3600 + (minutes || 0) * 60 + index * (intervalSeconds || 0);
  const newHours = Math.floor(totalSeconds / 3600) % 24;
  const newMinutes = Math.floor((totalSeconds % 3600) / 60);
  return `${String(newHours).padStart(2, "0")}:${String(newMinutes).padStart(2, "0")}`;
};

/** Vagas ocupadas pela categoria (mínimo 1 para a cascata nunca zerar). */
export const slotsOf = (entry: Pick<CascadeEntry, "numberStart" | "numberEnd">): number =>
  Math.max(entry.numberEnd - entry.numberStart + 1, 1);

/** Duração da categoria em minutos (última largada relativa à primeira, arredondada pra cima). */
export const durationMinutes = (slots: number, intervalSeconds: number): number =>
  Math.ceil(Math.max(0, (slots - 1) * (intervalSeconds || 0)) / 60);

/**
 * Recalcula números e horários em cascata, na ordem de `orderPosition`:
 * - numberStart automático = numberEnd da categoria anterior + 1 (a 1ª categoria é a âncora);
 * - numberEnd automático   = numberStart + max(inscritos, 1) - 1 (expande sozinho com inscrição nova);
 * - startTime automático   = início da anterior + duração da anterior + timeBetweenCategories.
 * Campos com a flag `*Manual` correspondente são preservados como estão.
 * `orderPosition` é normalizado para 1..n no retorno.
 */
export function computeCascade(entries: CascadeEntry[]): CascadeEntry[] {
  const sorted = [...entries].sort(
    (a, b) => (a.orderPosition - b.orderPosition) || (a.categoryId - b.categoryId)
  );
  const result: CascadeEntry[] = [];

  sorted.forEach((entry, i) => {
    const out = { ...entry, orderPosition: i + 1 };
    const prev = result[i - 1];

    if (i > 0 && !out.numberStartManual) {
      out.numberStart = prev.numberEnd + 1;
    }
    if (!out.numberEndManual) {
      out.numberEnd = out.numberStart + Math.max(out.registrationCount, 1) - 1;
    }
    if (out.numberEnd < out.numberStart) {
      out.numberEnd = out.numberStart;
    }

    if (i > 0 && !out.startTimeManual) {
      const prevEndMinutes =
        timeToMinutes(prev.startTime) + durationMinutes(slotsOf(prev), prev.intervalSeconds);
      out.startTime = minutesToTime(prevEndMinutes + Math.max(0, prev.timeBetweenCategories || 0));
    }

    result.push(out);
  });

  return result;
}
