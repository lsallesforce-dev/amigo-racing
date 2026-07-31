// Trava de edição da inscrição pelo competidor.
//
// Regra: a partir de `editDeadlineDays` dias antes do evento, o competidor não
// muda mais a própria inscrição — a organização precisa de dados estáveis pra
// fechar lista de largada, kits e camisetas. A organização continua editando por
// outro caminho (registrations.updateFull), inclusive depois do prazo.
//
// Mesmo cuidado de fuso do resto do projeto: events.startDate é `timestamp sem
// fuso` (relógio de parede) e o driver entrega como se fosse UTC. Por isso a
// conta é feita com os componentes UTC — ver formatarDataDoBanco().

export const PRAZO_EDICAO_PADRAO = 2;

/** Só a data (00:00 UTC) do instante, ignorando a hora. */
function soData(d: Date): number {
  return Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate());
}

export interface EstadoPrazoEdicao {
  bloqueado: boolean;
  /** Dias inteiros que faltam para o evento (negativo = já passou). */
  diasRestantes: number;
  prazoDias: number;
  motivo: "prazo" | "evento_passou" | null;
}

/**
 * `agora` entra como parâmetro para o teste conseguir simular a virada do prazo.
 * Sem data de evento, nada é bloqueado (evento sem data não trava ninguém).
 */
export function estadoPrazoEdicao(args: {
  startDate?: string | Date | null;
  editDeadlineDays?: number | null;
  agora?: Date;
}): EstadoPrazoEdicao {
  const prazoDias = args.editDeadlineDays ?? PRAZO_EDICAO_PADRAO;
  const agora = args.agora || new Date();

  // Sem data não dá pra calcular prazo nenhum: não trava.
  if (!args.startDate) {
    return { bloqueado: false, diasRestantes: Infinity, prazoDias, motivo: null };
  }

  const evento = args.startDate instanceof Date ? args.startDate : new Date(args.startDate);
  if (isNaN(evento.getTime())) {
    return { bloqueado: false, diasRestantes: Infinity, prazoDias, motivo: null };
  }

  const diasRestantes = Math.floor((soData(evento) - soData(agora)) / 86400000);

  // "Evento já passou" vem ANTES do atalho de prazo 0 — senão desligar a trava
  // deixaria editar inscrição de evento que já aconteceu.
  if (diasRestantes < 0) {
    return { bloqueado: true, diasRestantes, prazoDias, motivo: "evento_passou" };
  }
  if (prazoDias <= 0) {
    return { bloqueado: false, diasRestantes, prazoDias, motivo: null };
  }
  if (diasRestantes <= prazoDias) {
    return { bloqueado: true, diasRestantes, prazoDias, motivo: "prazo" };
  }
  return { bloqueado: false, diasRestantes, prazoDias, motivo: null };
}

/** Mensagem para o competidor, explicando por que não dá mais para editar. */
export function mensagemPrazoEdicao(estado: EstadoPrazoEdicao): string {
  if (!estado.bloqueado) return "";
  if (estado.motivo === "evento_passou") {
    return "Este evento já aconteceu — a inscrição não pode mais ser alterada.";
  }
  const quando = estado.prazoDias === 1 ? "1 dia" : `${estado.prazoDias} dias`;
  return `As alterações foram encerradas ${quando} antes do evento. Se precisar corrigir algo, fale com a organização.`;
}
