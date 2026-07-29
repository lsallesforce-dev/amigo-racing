// Horário de Brasília como âncora única de data/hora exibida e digitada.
//
// Por que não deixar no fuso da máquina: o <input type="datetime-local"> e o
// toLocaleString() falam sempre no fuso de quem está rodando. No browser do
// organizador (BRT) isso dá certo por acidente, mas o mesmo código no servidor
// da Vercel roda em UTC e imprimia "13:00" para uma planilha marcada às 10:00.
// A prova acontece no horário de Brasília — é ele que tem que aparecer, não
// importa onde o código roda nem onde o competidor está.
//
// O instante em si (a comparação que libera ou não a planilha) é sempre absoluto:
// guardamos ISO UTC e comparamos epoch com epoch. Isto aqui é só entrada e saída.

export const FUSO_BRASILIA = "America/Sao_Paulo";

const pad = (n: number) => String(n).padStart(2, "0");

/** Componentes de um instante já convertidos para o horário de Brasília. */
function partesEmBrasilia(d: Date) {
  const fmt = new Intl.DateTimeFormat("en-US", {
    timeZone: FUSO_BRASILIA, hour12: false,
    year: "numeric", month: "2-digit", day: "2-digit",
    hour: "2-digit", minute: "2-digit", second: "2-digit",
  });
  const p: Record<string, string> = {};
  for (const parte of fmt.formatToParts(d)) {
    if (parte.type !== "literal") p[parte.type] = parte.value;
  }
  return {
    year: Number(p.year), month: Number(p.month), day: Number(p.day),
    // hour12:false devolve 24 para meia-noite em alguns runtimes
    hour: Number(p.hour) % 24, minute: Number(p.minute), second: Number(p.second),
  };
}

/**
 * Offset de Brasília em minutos no instante dado (hoje sempre -180; o Brasil não
 * usa mais horário de verão, mas isto continua certo se um dia voltar).
 */
function offsetBrasiliaMin(d: Date): number {
  const p = partesEmBrasilia(d);
  const comoSeFosseUtc = Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute, p.second);
  return (comoSeFosseUtc - Math.floor(d.getTime() / 1000) * 1000) / 60000;
}

/** ISO UTC -> "YYYY-MM-DDTHH:mm" para preencher um <input type="datetime-local">. */
export function isoParaInputBrasilia(iso?: string | null): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (isNaN(d.getTime())) return "";
  const p = partesEmBrasilia(d);
  return `${p.year}-${pad(p.month)}-${pad(p.day)}T${pad(p.hour)}:${pad(p.minute)}`;
}

/**
 * "YYYY-MM-DDTHH:mm" digitado (lido SEMPRE como horário de Brasília) -> ISO UTC.
 * Duas passadas porque o offset depende do próprio instante que estamos calculando.
 */
export function inputBrasiliaParaIso(valor?: string | null): string | null {
  if (!valor) return null;
  const m = String(valor).match(/^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})/);
  if (!m) return null;
  const [, ano, mes, dia, hora, minuto] = m.map(Number) as unknown as number[];

  const palpite = Date.UTC(ano, mes - 1, dia, hora, minuto, 0);
  let instante = palpite - offsetBrasiliaMin(new Date(palpite)) * 60000;
  // segunda passada: corrige a virada de horário de verão, se um dia existir
  instante = palpite - offsetBrasiliaMin(new Date(instante)) * 60000;

  const d = new Date(instante);
  return isNaN(d.getTime()) ? null : d.toISOString();
}

/**
 * Data vinda de coluna `timestamp without time zone` (events.startDate e afins).
 *
 * Esse tipo guarda relógio de parede, sem fuso: o banco tem "2026-08-02 09:00:00"
 * porque a largada é 09:00 em Salto de Pirapora, ponto. O drizzle devolve isso
 * como se fosse 09:00 UTC, então QUALQUER conversão de fuso em cima estraga o
 * valor — formatarBrasilia() jogaria pra 06:00.
 *
 * Aqui os componentes são lidos direto em UTC, que são exatamente os dígitos
 * gravados. Nada de conversão.
 */
export function formatarDataDoBanco(valor?: string | Date | null, opts?: { comHora?: boolean }): string {
  if (!valor) return "";
  const d = valor instanceof Date ? valor : new Date(valor);
  if (isNaN(d.getTime())) return "";

  const data = `${pad(d.getUTCDate())}/${pad(d.getUTCMonth() + 1)}/${d.getUTCFullYear()}`;
  if (!opts?.comHora) return data;
  return `${data} às ${pad(d.getUTCHours())}:${pad(d.getUTCMinutes())}`;
}

/** "01/08/2026 às 10:00" — sempre em Brasília, rode no browser ou no servidor. */
export function formatarBrasilia(iso?: string | null, opts?: { comAno?: boolean }): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (isNaN(d.getTime())) return "";
  const p = partesEmBrasilia(d);
  const data = opts?.comAno === false
    ? `${pad(p.day)}/${pad(p.month)}`
    : `${pad(p.day)}/${pad(p.month)}/${p.year}`;
  return `${data} às ${pad(p.hour)}:${pad(p.minute)}`;
}
