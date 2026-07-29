// Régua de cobrança da inscrição pendente: marcos e texto padrão do lembrete.
// Compartilhado entre o cron que dispara e a tela onde o organizador edita.

export const COBRANCA_ASSUNTO_PADRAO =
  "Sua inscrição no {{evento}} ainda não foi confirmada";

export const COBRANCA_CORPO_PADRAO = `Olá {{piloto}}, tudo bem?

Sua inscrição na categoria {{categoria}} do {{evento}} está registrada, mas o pagamento ainda não foi confirmado — ou seja, sua vaga ainda não está garantida.

O evento acontece em {{data_evento}}, em {{local}}.

É só acessar seu painel para concluir o pagamento. Se você já pagou nas últimas horas, pode ignorar este e-mail.

Qualquer dúvida, é só responder aqui.`;

/**
 * Marcos da régua. `dias` conta a partir da criação da inscrição;
 * `vespera` é o dia anterior ao evento, independente de quando a pessoa se inscreveu.
 */
export const MARCOS_COBRANCA = [
  { stage: "d1", tipo: "apos_inscricao", dias: 1 },
  { stage: "d3", tipo: "apos_inscricao", dias: 3 },
  { stage: "vespera", tipo: "antes_evento", dias: 1 },
] as const;

export type MarcoCobranca = typeof MARCOS_COBRANCA[number]["stage"];

const DIA_MS = 24 * 60 * 60 * 1000;

/** Dias inteiros entre duas datas (a - b), ignorando a hora. */
function diffDias(a: Date, b: Date): number {
  const dia = (d: Date) => Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate());
  return Math.floor((dia(a) - dia(b)) / DIA_MS);
}

/**
 * Qual marco a inscrição atingiu HOJE, ou null se nenhum.
 * `jaEnviados` são os marcos que ela já recebeu — o mesmo lembrete nunca repete,
 * então rodar o cron duas vezes no mesmo dia não duplica nada.
 */
export function marcoDevidoHoje(args: {
  criadaEm: Date;
  dataEvento: Date;
  jaEnviados: string[];
  agora?: Date;
}): MarcoCobranca | null {
  const agora = args.agora || new Date();
  const desdeInscricao = diffDias(agora, args.criadaEm);
  const ateEvento = diffDias(args.dataEvento, agora);

  if (ateEvento < 0) return null; // evento já passou

  for (const marco of MARCOS_COBRANCA) {
    if (args.jaEnviados.includes(marco.stage)) continue;

    const atingiu = marco.tipo === "apos_inscricao"
      ? desdeInscricao >= marco.dias
      : ateEvento <= marco.dias;

    // A véspera só dispara na janela dela; os de inscrição valem de lá pra frente
    // (inscrição feita durante um período sem cron não perde o lembrete).
    if (atingiu) return marco.stage;
  }
  return null;
}
