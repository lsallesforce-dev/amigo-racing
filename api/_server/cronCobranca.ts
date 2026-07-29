/**
 * Régua de cobrança da inscrição pendente.
 *
 * Roda 1x/dia pelo cron da Vercel (ver vercel.json). Para cada evento com a régua
 * ligada e que ainda não aconteceu, procura inscrições `pending` que atingiram um
 * marco (1 dia após a inscrição, 3 dias depois, véspera do evento) e manda o
 * lembrete.
 *
 * O que impede lembrete repetido: cada envio grava um event_email_recipients
 * ligado a um event_emails com kind='auto_pendente' e o marco em autoStage.
 * Antes de mandar, consulta os marcos já enviados daquela inscrição — então rodar
 * o cron duas vezes no mesmo dia não duplica nada.
 *
 * Para sozinho quando a inscrição vira 'paid' ou 'cancelled' (elas nem entram na
 * busca) e quando o evento passa.
 */
import { Request, Response } from "express";
import * as db from "./db.js";
import { sendEmail } from "./email.js";
import { ENV } from "./env.js";
import { renderEmail, textoParaHtml } from "../../shared/emailLayout.js";
import { valoresDaInscricao, aplicarVariaveis, aplicarVariaveisTexto } from "../../shared/emailVars.js";
import { resolveStartOrder } from "../../shared/startOrderLookup.js";
import {
  COBRANCA_ASSUNTO_PADRAO,
  COBRANCA_CORPO_PADRAO,
  marcoDevidoHoje,
} from "../../shared/cobrancaTemplate.js";

export interface ResultadoCobranca {
  eventosVerificados: number;
  pendentesVerificadas: number;
  enviados: number;
  falhas: number;
  detalhes: { evento: string; registrationId: number; email: string; stage: string; ok: boolean }[];
}

/** O trabalho em si, separado do handler HTTP pra poder ser testado a seco. */
export async function processarCobrancasPendentes(opts?: { dryRun?: boolean; agora?: Date }): Promise<ResultadoCobranca> {
  const agora = opts?.agora || new Date();
  const dryRun = !!opts?.dryRun;

  const resultado: ResultadoCobranca = {
    eventosVerificados: 0,
    pendentesVerificadas: 0,
    enviados: 0,
    falhas: 0,
    detalhes: [],
  };

  const eventos = await db.getEventsWithAutoCharge() as any[];
  resultado.eventosVerificados = eventos.length;

  for (const evento of eventos) {
    const regs = await db.getRegistrationsByEventId(evento.id) as any[];
    const pendentes = regs.filter(r => r.status === "pending");
    if (pendentes.length === 0) continue;

    const configs = await db.getStartOrderConfigsByEventId(evento.id) as any[];
    const assunto = evento.autoChargeSubject || COBRANCA_ASSUNTO_PADRAO;
    const corpo = evento.autoChargeBody || COBRANCA_CORPO_PADRAO;

    for (const reg of pendentes) {
      resultado.pendentesVerificadas++;
      if (!reg.pilotEmail) continue;

      const jaEnviados = await db.getAutoChargeStagesSent(reg.id);
      const stage = marcoDevidoHoje({
        criadaEm: new Date(reg.createdAt),
        dataEvento: new Date(evento.startDate),
        jaEnviados,
        agora,
      });
      if (!stage) continue;

      if (dryRun) {
        resultado.detalhes.push({ evento: evento.name, registrationId: reg.id, email: reg.pilotEmail, stage, ok: true });
        resultado.enviados++;
        continue;
      }

      // Um event_emails por (inscrição, marco): é o registro que documenta o envio
      // e alimenta o histórico junto com os disparos manuais.
      const disparo = await db.createEventEmail({
        eventId: evento.id,
        subject: assunto,
        body: corpo,
        kind: "auto_pendente",
        autoStage: stage,
        filters: { registrationId: reg.id },
      });

      await db.addEventEmailRecipients(disparo.id, evento.id, [{
        email: String(reg.pilotEmail).trim().toLowerCase(),
        name: reg.pilotName,
        registrationId: reg.id,
        reg,
      }]);

      const [destinatario] = await db.getPendingRecipients(disparo.id, 1);
      if (!destinatario) continue;

      const largada = resolveStartOrder(reg, configs);
      const valores = valoresDaInscricao({
        reg,
        evento,
        categoriaNome: reg.categoryGroup ? `${reg.categoryGroup} - ${reg.categoryName}` : reg.categoryName,
        numero: largada.numero,
        horario: largada.horario,
      });

      let ok = false;
      try {
        ok = await sendEmail(
          destinatario.email,
          aplicarVariaveisTexto(assunto, valores),
          renderEmail({
            bodyHtml: aplicarVariaveis(textoParaHtml(corpo), valores),
            logoUrl: evento.logoUrl || null,
            eventName: evento.name,
            cta: { label: "Concluir pagamento", url: `${ENV.oAuthServerUrl}/dashboard` },
            rodapeExtra: "Você recebeu este lembrete porque tem uma inscrição aguardando pagamento.",
          })
        );
      } catch (err: any) {
        await db.markRecipientResult(destinatario.id, false, err?.message);
      }

      if (ok) await db.markRecipientResult(destinatario.id, true);
      else await db.markRecipientResult(destinatario.id, false, "SMTP recusou o envio");

      await db.refreshEventEmailCounters(disparo.id);

      ok ? resultado.enviados++ : resultado.falhas++;
      resultado.detalhes.push({ evento: evento.name, registrationId: reg.id, email: destinatario.email, stage, ok });
    }
  }

  return resultado;
}

export async function cronCobrancaHandler(req: Request, res: Response) {
  // A Vercel assina a chamada do cron; em produção recusa quem não for ela.
  const secret = process.env.CRON_SECRET;
  if (secret) {
    const auth = req.headers.authorization || "";
    if (auth !== `Bearer ${secret}`) {
      res.status(401).json({ error: "não autorizado" });
      return;
    }
  }

  try {
    const dryRun = req.query.dryRun === "1";
    const resultado = await processarCobrancasPendentes({ dryRun });
    console.log("[cron/cobranca]", JSON.stringify({ ...resultado, detalhes: resultado.detalhes.length }));
    res.json({ ok: true, dryRun, ...resultado });
  } catch (error: any) {
    console.error("[cron/cobranca] erro:", error?.message);
    res.status(500).json({ ok: false, error: error?.message || "erro desconhecido" });
  }
}
