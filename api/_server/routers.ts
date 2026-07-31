import * as pagarme from "./pagarme.js";
import * as storage from "./storage.js";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { dirname } from "path";
import { COOKIE_NAME } from "./const.js";
import { getSessionCookieOptions } from "./cookies.js";
import { systemRouter } from "./_core/systemRouter.js";
import { publicProcedure, protectedProcedure, router, adminProcedure, organizerProcedure } from "./_core/trpc.js";
import { TRPCError } from '@trpc/server';
import { z } from "zod";
import * as db from "./db.js";
import { getDb } from "./db.js";
import { products, productOrders, organizerMembers, registrations, events, payments, championshipStages, championshipRequests, users, championships, organizers, categories } from "./schema.js";
import { eq, sql, and, inArray, ne } from "drizzle-orm";
import { normalizeShirtSize, sortShirtSizes, shirtSizesOfRegistration } from "../../shared/shirtSizes.js";
import { sanitizeNavigationFiles } from "../../shared/navigationFiles.js";
import { formatarBrasilia } from "../../shared/horarioBrasilia.js";
import { renderEmail, textoParaHtml } from "../../shared/emailLayout.js";
import { VARIAVEIS_EMAIL, valoresDaInscricao, aplicarVariaveis, aplicarVariaveisTexto, variaveisDesconhecidas } from "../../shared/emailVars.js";
import { resolveStartOrder } from "../../shared/startOrderLookup.js";
import { COBRANCA_ASSUNTO_PADRAO, COBRANCA_CORPO_PADRAO } from "../../shared/cobrancaTemplate.js";
import { ENV } from "./env.js";
import { sendEmail } from "./email.js";
import { timingSafeEqual } from "crypto";

import { championshipRouter, calculateChampionshipStandings } from "./backend_routers/championship.js";
import { whatsappRouter } from "./backend_routers/whatsapp.js";




const integerSchema = z.number().int();

/**
 * Garante que o usuário pode gerenciar a ordem de largada do evento:
 * admin, organizador dono do evento, ou membro do organizador com permissão de inscrições.
 * Segue o mesmo padrão de ownership dos endpoints de inscrição/estoque.
 */
async function assertStartOrderAccess(user: any, eventId: number) {
  const event = await db.getEventById(eventId) as any;
  if (!event) throw new TRPCError({ code: 'NOT_FOUND', message: 'Evento não encontrado' });
  if (user?.role === 'admin') return event;

  const context = await db.getOrganizerContext(user);
  const organizer = await db.getOrganizerById(event.organizerId) as any;
  const principal = await db.getUserById(context.principalUserId) as any;
  if (!organizer || organizer.ownerId !== principal?.openId || (context.type === 'MEMBER' && !context.permissions.includes('registrations'))) {
    throw new TRPCError({ code: 'FORBIDDEN', message: 'Somente o organizador do evento pode acessar a ordem de largada' });
  }
  return event;
}

/** Campos editáveis de uma config de largada (upsert). Flags *Manual controlam a cascata no front. */
const startOrderConfigInput = z.object({
  categoryId: z.number(),
  orderPosition: z.number(),
  numberStart: z.number().int(),
  numberEnd: z.number().int(),
  startTime: z.string(),
  intervalSeconds: z.number(),
  timeBetweenCategories: z.number().optional(),
  registrationOrder: z.array(z.number()).optional(),
  numberStartManual: z.boolean().optional(),
  numberEndManual: z.boolean().optional(),
  startTimeManual: z.boolean().optional(),
});

/** registrationOrder ausente fica undefined (não sobrescreve o sorteio salvo no banco). */
function toStartOrderDbConfig(config: z.infer<typeof startOrderConfigInput>) {
  const { registrationOrder, ...rest } = config;
  return {
    ...rest,
    registrationOrder: registrationOrder !== undefined ? JSON.stringify(registrationOrder) : undefined,
  };
}



const storageRouter = router({
  getSignedUrl: organizerProcedure
    .input(z.object({ filename: z.string() }))
    .mutation(async ({ input }) => {
      const safeName = input.filename.replace(/[^a-zA-Z0-9.-]/g, "_");
      const relativePath = `uploads/${Date.now()}-${safeName}`;
      const config = await storage.createSignedUploadUrl(relativePath);
      const publicUrl = await storage.storageGet(relativePath);
      return { 
        ...config, 
        path: relativePath, 
        publicUrl
      };
    }),
});

/**
 * Resolve o recebedor Pagar.me do PRINCIPAL (dono da conta), nunca do usuário logado.
 * Membro convidado (co-organizador com permissão 'finance') não tem recipientId próprio —
 * o dinheiro das inscrições cai no recebedor do principal. Usar ctx.user.id aqui fazia o
 * painel do membro mostrar saldo 0 e esconder o bloco "Saldo Pagar.me".
 *
 * O saque também sai por aqui: o POST /withdrawals só credita a conta bancária cadastrada
 * NO recebedor, não aceita conta de destino. Logo, quem passa no gate 'finance' pode sacar —
 * não há como desviar o dinheiro pra outra conta.
 */
async function resolveFinanceRecipient(user: any) {
  const context = await db.getOrganizerContext(user);
  if (context.type === 'MEMBER' && !context.permissions.includes('finance')) {
    throw new TRPCError({ code: 'FORBIDDEN', message: 'Sem permissão para financeiro' });
  }
  const principal = await db.getUserById(context.principalUserId) as any;
  const recipientId = principal?.recipientId
    || (context.type === 'PRINCIPAL' ? user.recipientId : undefined);
  return { context, recipientId };
}

const financeRouter = router({
  create: organizerProcedure
    .input(z.object({
      description: z.string(),
      amount: z.number(),
      type: z.enum(["INCOME", "EXPENSE"]),
      date: z.string(),
      status: z.enum(["PENDING", "COMPLETED"]),
      eventId: z.number().optional()
    }))
    .mutation(async ({ ctx, input }) => {
      const user = ctx.user as any;
      const context = await db.getOrganizerContext(user);
      if (context.type === 'MEMBER' && !context.permissions.includes('finance')) {
        throw new TRPCError({ code: 'FORBIDDEN', message: 'Sem permissão para financeiro' });
      }
      return await db.createTransaction({
        description: input.description,
        amount: input.amount,
        type: input.type,
        status: input.status,
        date: new Date(input.date),
        eventId: input.eventId ?? null,
        userId: context.principalUserId
      } as any);
    }),

  getAll: organizerProcedure
    .input(z.object({
      type: z.enum(["INCOME", "EXPENSE"]).optional(),
      month: z.number().min(1).max(12).optional(),
      year: z.number().min(2000).optional()
    }).optional())
    .query(async ({ ctx, input }) => {
      const user = ctx.user as any;
      const context = await db.getOrganizerContext(user);
      if (context.type === 'MEMBER' && !context.permissions.includes('finance')) {
        throw new TRPCError({ code: 'FORBIDDEN', message: 'Sem permissão para financeiro' });
      }
      return await db.getTransactions(context.principalUserId, input);
    }),

  getSummary: organizerProcedure
    .input(z.object({
      month: z.number().min(1).max(12).optional(),
      year: z.number().min(2000).optional()
    }).optional())
    .query(async ({ ctx, input }) => {
      const user = ctx.user as any;
      const context = await db.getOrganizerContext(user);
      if (context.type === 'MEMBER' && !context.permissions.includes('finance')) {
        throw new TRPCError({ code: 'FORBIDDEN', message: 'Sem permissão para financeiro' });
      }
      return await db.getTransactionSummary(context.principalUserId, input);
    }),

  markAsCompleted: organizerProcedure
    .input(z.object({
      id: z.string()
    }))
    .mutation(async ({ ctx, input }) => {
      const user = ctx.user as any;
      const context = await db.getOrganizerContext(user);
      if (context.type === 'MEMBER' && !context.permissions.includes('finance')) {
        throw new TRPCError({ code: 'FORBIDDEN', message: 'Sem permissão para financeiro' });
      }
      return await db.updateTransactionStatus(input.id, "COMPLETED");
    }),

  delete: organizerProcedure
    .input(z.object({
      id: z.string()
    }))
    .mutation(async ({ ctx, input }) => {
      const user = ctx.user as any;
      const context = await db.getOrganizerContext(user);
      if (context.type === 'MEMBER' && !context.permissions.includes('finance')) {
        throw new TRPCError({ code: 'FORBIDDEN', message: 'Sem permissão para financeiro' });
      }
      return await db.deleteTransaction(input.id, context.principalUserId);
    }),

  // Retorna o saldo Pagar.me da conta (recebedor do principal, mesmo pra membro convidado)
  getPagarmeBalance: organizerProcedure
    .query(async ({ ctx }) => {
      const { recipientId } = await resolveFinanceRecipient(ctx.user as any);

      if (!recipientId) {
        return { availableBalance: 0, waitingBalance: 0, transferredToBank: 0, hasRecipient: false };
      }

      try {
        // Saldo oficial do Pagar.me (GET /recipients/{id}/balance) - fonte da verdade,
        // sem recalcular nada por payables (payable 'paid' = liquidado no saldo do
        // recebedor, NÃO "já sacado"; o cálculo manual antigo confundia os dois e o
        // painel vivia dessincronizado do dashboard do Pagar.me).
        const balance = await pagarme.getRecipientBalance(recipientId);

        return {
          availableBalance: (balance.available_amount || 0) / 100,   // sacável agora
          waitingBalance: (balance.waiting_funds_amount || 0) / 100, // a liquidar
          transferredToBank: (balance.transferred_amount || 0) / 100, // já caiu no banco
          hasRecipient: true,
        };
      } catch (err: any) {
        console.error('[finance.getPagarmeBalance] Erro:', err.message);
        return { availableBalance: 0, waitingBalance: 0, transferredToBank: 0, hasRecipient: true, error: err.message };
      }
    }),

  // Transferências (TED/saque) reais já feitas - valor bruto, taxa e líquido vêm direto do Pagar.me
  getPagarmeTransfers: organizerProcedure
    .query(async ({ ctx }) => {
      const { recipientId } = await resolveFinanceRecipient(ctx.user as any);

      if (!recipientId) return [];

      try {
        const transfers = await pagarme.getTransfers(recipientId);
        const list = Array.isArray(transfers) ? transfers : [];
        return list.map((t: any) => ({
          id: t.id,
          grossAmount: Math.round((t.amount || 0) + (t.fee || 0)) / 100,
          fee: Math.round(t.fee || 0) / 100,
          netAmount: Math.round(t.amount || 0) / 100,
          status: t.status,
          dateCreated: t.date_created,
          fundingDate: t.funding_date || t.funding_estimated_date,
        }));
      } catch (err: any) {
        console.error('[finance.getPagarmeTransfers] Erro:', err.message);
        return [];
      }
    }),

  // Solicita transferência (payout) para o organizador
  requestPayout: organizerProcedure
    .input(z.object({
      amount: z.number().positive('Valor deve ser positivo').optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      const { recipientId } = await resolveFinanceRecipient(ctx.user as any);

      if (!recipientId) {
        throw new TRPCError({ code: 'BAD_REQUEST', message: 'Você precisa configurar seus dados bancários antes de solicitar uma transferência.' });
      }

      try {
        const apiKey = ENV.pagarmeApiKey;
        const apiUrl = ENV.pagarmeApiUrl;
        const authHeader = `Basic ${Buffer.from(`${apiKey}:`).toString('base64')}`;

        // amount é OBRIGATÓRIO na rota de transferências. O painel pede "saque de
        // tudo" sem informar valor, então aqui o valor sai do saldo real do
        // recebedor — nunca de um número que veio do browser.
        let centavos = input.amount ? Math.round(input.amount * 100) : 0;
        if (!centavos) {
          const saldo = await pagarme.getRecipientBalance(recipientId);
          centavos = Number(saldo?.available_amount || 0);
        }

        if (centavos <= 0) {
          throw new TRPCError({ code: 'BAD_REQUEST', message: 'Não há saldo disponível para transferir.' });
        }

        // POST /transfers, não /recipients/{id}/withdrawals: a rota de saque foi
        // descontinuada pelo Pagar.me e passou a recusar com "The request is
        // invalid.". A leitura (getTransfers) já usava /transfers.
        // A Idempotency-Key evita transferência dobrada se a requisição for
        // repetida (clique duplo, retry de rede) — em dinheiro isso importa.
        const response = await fetch(`${apiUrl}/transfers`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: authHeader,
            'Idempotency-Key': `payout-${recipientId}-${centavos}-${new Date().toISOString().slice(0, 16)}`,
          },
          body: JSON.stringify({ amount: centavos, recipient_id: recipientId }),
        });

        const result = await response.json() as any;

        if (!response.ok) {
          // O Pagar.me devolve "The request is invalid." genérico e o detalhe do
          // que faltou vai em `errors`. Engolir isso deixava o organizador (e eu)
          // sem saber o motivo.
          const detalhe = result?.errors
            ? Object.entries(result.errors).map(([campo, msgs]: any) => `${campo}: ${[].concat(msgs).join(', ')}`).join(' | ')
            : '';
          console.error('[finance.requestPayout] Pagar.me recusou:', response.status, JSON.stringify(result));
          throw new Error([result?.message, detalhe].filter(Boolean).join(' — ') || `Erro ${response.status} ao solicitar transferência`);
        }

        return { success: true, withdrawal: result };
      } catch (err: any) {
        console.error('[finance.requestPayout] Erro:', err.message);
        throw new TRPCError({
          code: 'INTERNAL_SERVER_ERROR',
          message: err.message || 'Erro ao solicitar transferência',
        });
      }
    }),
});

/**
 * Alinha o que a loja grava com o estoque de camiseta do evento:
 *
 * - `availableSizes` vira o token canônico ("Inf 4" digitado à mão virava um tamanho
 *   que não existe no estoque; "G3" o sistema junta em G3/G4). Sai normalizado e
 *   sem duplicata.
 * - `stock` é ignorado quando o evento controla por tamanho — quem manda é o
 *   event_shirt_stock. Guardar um segundo número só criava divergência.
 */
async function normalizarEstoqueDoProduto(input: {
  eventId?: number; stock?: number; availableSizes?: string;
}): Promise<{ stock?: number; availableSizes?: string }> {
  const out: { stock?: number; availableSizes?: string } = {};

  if (input.availableSizes !== undefined) {
    const canonicos = String(input.availableSizes)
      .split(',')
      .map(s => normalizeShirtSize(s))
      .filter(Boolean);
    out.availableSizes = [...new Set(canonicos)].join(',');
  }

  if (await db.hasShirtStockControl(input.eventId)) {
    out.stock = 0; // não é usado; a vitrine deriva do estoque por tamanho
  }
  return out;
}

/**
 * Só o organizador dono do evento (ou admin) mexe nos e-mails dele.
 * Mesmo padrão de ownership do assertStartOrderAccess.
 */
async function assertEventEmailAccess(user: any, eventId: number) {
  const event = await db.getEventById(eventId) as any;
  if (!event) throw new TRPCError({ code: 'NOT_FOUND', message: 'Evento não encontrado' });
  if (user?.role === 'admin') return event;

  const context = await db.getOrganizerContext(user);
  const organizer = await db.getOrganizerById(event.organizerId) as any;
  const principal = await db.getUserById(context.principalUserId) as any;

  if (!organizer || organizer.ownerId !== principal?.openId) {
    throw new TRPCError({ code: 'FORBIDDEN', message: 'Somente o organizador do evento pode enviar e-mails' });
  }
  return event;
}

/** Quantos e-mails saem por chamada. SMTP é sequencial e lento; o front chama em laço. */
const LOTE_EMAIL = 8;

/**
 * Quem pode gerar cobrança de uma inscrição.
 *
 * O createPayment é público porque o link de cobrança precisa funcionar sem login —
 * então a autorização é explícita aqui, e é MAIS restrita que antes: como
 * protectedProcedure, qualquer usuário logado podia criar pagamento de qualquer
 * inscrição, sem checagem de dono.
 *
 * Passa quem for: dono da inscrição, organizador do evento, admin, ou quem
 * apresentar o accessHash daquela inscrição (é o segredo do link).
 * Pedido avulso da loja (orderId) segue exigindo login, como antes.
 */
async function assertPodePagarInscricao(
  ctx: any,
  input: { registrationId?: number; orderId?: string; accessHash?: string }
) {
  const user = ctx?.user as any;

  if (input.orderId) {
    if (!user?.id) throw new TRPCError({ code: 'UNAUTHORIZED', message: 'Faça login para pagar este pedido.' });
    return;
  }

  const reg = await db.getRegistrationById(input.registrationId!) as any;
  if (!reg) throw new TRPCError({ code: 'NOT_FOUND', message: 'Inscrição não encontrada' });

  // Posse do link vale como autorização — é o token da própria inscrição.
  // Comparação de tamanho fixo pra não vazar o hash por tempo de resposta.
  if (input.accessHash && reg.accessHash) {
    const a = Buffer.from(String(input.accessHash));
    const b = Buffer.from(String(reg.accessHash));
    if (a.length === b.length && timingSafeEqual(a, b)) return;
  }

  if (!user?.id) {
    throw new TRPCError({ code: 'UNAUTHORIZED', message: 'Faça login ou use o link de cobrança que o organizador enviou.' });
  }
  if (user.role === 'admin' || Number(reg.userId) === Number(user.id)) return;

  const evento = await db.getEventById(reg.eventId) as any;
  const organizer = evento ? await db.getOrganizerById(evento.organizerId) as any : null;
  const context = await db.getOrganizerContext(user);
  const principal = await db.getUserById(context.principalUserId) as any;
  if (organizer && organizer.ownerId === principal?.openId) return;

  throw new TRPCError({ code: 'FORBIDDEN', message: 'Esta inscrição não é sua.' });
}

/**
 * Monta e envia o e-mail de UM destinatário, resolvendo as variáveis com os dados
 * da inscrição dele. Compartilhado pelo envio manual e pela régua automática.
 */
async function enviarEmailDoEvento(args: {
  destinatario: { email: string; name: string | null; registrationId: number | null };
  assunto: string;
  corpo: string;
  evento: any;
  regs: any[];
  configs: any[];
  cta?: { label: string; url: string } | null;
  rodapeExtra?: string | null;
}) {
  const { destinatario, assunto, corpo, evento, regs, configs, cta, rodapeExtra } = args;

  const reg = destinatario.registrationId
    ? regs.find(r => Number(r.id) === Number(destinatario.registrationId))
    : null;

  const largada = reg ? resolveStartOrder(reg, configs) : { numero: null, horario: null };
  const valores = valoresDaInscricao({
    reg: reg || { pilotName: destinatario.name },
    evento,
    categoriaNome: reg?.categoryGroup ? `${reg.categoryGroup} - ${reg.categoryName}` : reg?.categoryName,
    numero: largada.numero,
    horario: largada.horario,
  });

  const html = renderEmail({
    bodyHtml: aplicarVariaveis(textoParaHtml(corpo), valores),
    logoUrl: evento?.logoUrl || null,
    eventName: evento?.name || null,
    cta: cta || null,
    rodapeExtra: rodapeExtra || `Você recebeu este e-mail porque está inscrito em ${evento?.name || 'um evento'}.`,
  });

  return await sendEmail(destinatario.email, aplicarVariaveisTexto(assunto, valores), html);
}

const emailsRouter = router({
  /** Variáveis disponíveis, pra montar a barra de atalhos na tela. */
  variaveis: organizerProcedure.query(() => VARIAVEIS_EMAIL),

  /** Prévia dos destinatários: contagem e lista, com os filtros escolhidos. */
  previewDestinatarios: organizerProcedure
    .input(z.object({
      eventId: z.number(),
      status: z.enum(["paid", "pending", "all"]).default("all"),
      categoryIds: z.array(z.number()).optional(),
      incluirNavegador: z.boolean().default(false),
      incluirCompradoresLoja: z.boolean().default(false),
    }))
    .query(async ({ ctx, input }) => {
      await assertEventEmailAccess(ctx.user as any, input.eventId);
      const lista = await db.getEventEmailAudience(input.eventId, input);
      return {
        total: lista.length,
        destinatarios: lista.map(d => ({
          email: d.email,
          name: d.name,
          registrationId: d.registrationId,
          status: d.reg?.status || null,
          categoria: d.reg?.categoryName || null,
        })),
      };
    }),

  /** Como o e-mail vai ficar para a primeira pessoa da lista. */
  preview: organizerProcedure
    .input(z.object({
      eventId: z.number(),
      subject: z.string(),
      body: z.string(),
      status: z.enum(["paid", "pending", "all"]).default("all"),
      categoryIds: z.array(z.number()).optional(),
      incluirNavegador: z.boolean().default(false),
      incluirCompradoresLoja: z.boolean().default(false),
    }))
    .query(async ({ ctx, input }) => {
      const evento = await assertEventEmailAccess(ctx.user as any, input.eventId);
      const lista = await db.getEventEmailAudience(input.eventId, input);
      const alvo = lista[0];

      const regs = await db.getRegistrationsByEventId(input.eventId) as any[];
      const configs = await db.getStartOrderConfigsByEventId(input.eventId) as any[];
      const reg = alvo?.registrationId ? regs.find(r => Number(r.id) === Number(alvo.registrationId)) : null;
      const largada = reg ? resolveStartOrder(reg, configs) : { numero: null, horario: null };

      const valores = valoresDaInscricao({
        reg: reg || { pilotName: alvo?.name || "Piloto" },
        evento,
        categoriaNome: reg?.categoryGroup ? `${reg.categoryGroup} - ${reg.categoryName}` : reg?.categoryName,
        numero: largada.numero,
        horario: largada.horario,
      });

      return {
        para: alvo?.email || null,
        assunto: aplicarVariaveisTexto(input.subject, valores),
        html: renderEmail({
          bodyHtml: aplicarVariaveis(textoParaHtml(input.body), valores),
          logoUrl: evento?.logoUrl || null,
          eventName: evento?.name || null,
        }),
        variaveisDesconhecidas: [
          ...new Set([...variaveisDesconhecidas(input.subject), ...variaveisDesconhecidas(input.body)]),
        ],
      };
    }),

  /** Manda só pra você, pra conferir antes de disparar pra lista toda. */
  enviarTeste: organizerProcedure
    .input(z.object({ eventId: z.number(), subject: z.string().min(1), body: z.string().min(1) }))
    .mutation(async ({ ctx, input }) => {
      const user = ctx.user as any;
      const evento = await assertEventEmailAccess(user, input.eventId);
      if (!user?.email) throw new TRPCError({ code: 'BAD_REQUEST', message: 'Sua conta não tem e-mail cadastrado' });

      const regs = await db.getRegistrationsByEventId(input.eventId) as any[];
      const configs = await db.getStartOrderConfigsByEventId(input.eventId) as any[];
      const exemplo = regs.find(r => r.status !== 'cancelled') || null;

      const ok = await enviarEmailDoEvento({
        destinatario: { email: user.email, name: user.name || 'Organizador', registrationId: exemplo?.id ?? null },
        assunto: `[TESTE] ${input.subject}`,
        corpo: input.body,
        evento, regs, configs,
        rodapeExtra: 'E-mail de teste enviado pelo painel do organizador.',
      });

      if (!ok) throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: 'Falha ao enviar o teste. Confira a configuração de SMTP.' });
      return { success: true, para: user.email };
    }),

  /**
   * Cria o disparo e grava a lista. NÃO envia nada aqui: quem envia é o
   * processarLote, chamado em laço pelo front (SMTP sequencial estoura o tempo
   * da função se tentar mandar tudo numa requisição só).
   */
  criarDisparo: organizerProcedure
    .input(z.object({
      eventId: z.number(),
      subject: z.string().min(1, 'Escreva o assunto'),
      body: z.string().min(1, 'Escreva a mensagem'),
      status: z.enum(["paid", "pending", "all"]).default("all"),
      categoryIds: z.array(z.number()).optional(),
      incluirNavegador: z.boolean().default(false),
      incluirCompradoresLoja: z.boolean().default(false),
    }))
    .mutation(async ({ ctx, input }) => {
      const user = ctx.user as any;
      await assertEventEmailAccess(user, input.eventId);

      const lista = await db.getEventEmailAudience(input.eventId, input);
      if (lista.length === 0) {
        throw new TRPCError({ code: 'BAD_REQUEST', message: 'Nenhum destinatário com os filtros escolhidos.' });
      }

      const disparo = await db.createEventEmail({
        eventId: input.eventId,
        subject: input.subject,
        body: input.body,
        kind: 'manual',
        filters: {
          status: input.status,
          categoryIds: input.categoryIds || [],
          incluirNavegador: input.incluirNavegador,
          incluirCompradoresLoja: input.incluirCompradoresLoja,
        },
        createdBy: user.id,
      });

      const total = await db.addEventEmailRecipients(disparo.id, input.eventId, lista);
      return { emailId: disparo.id, total };
    }),

  /** Envia o próximo lote e diz quantos ainda faltam. O front chama até zerar. */
  processarLote: organizerProcedure
    .input(z.object({ emailId: z.string() }))
    .mutation(async ({ ctx, input }) => {
      const disparo = await db.getEventEmailById(input.emailId) as any;
      if (!disparo) throw new TRPCError({ code: 'NOT_FOUND', message: 'Disparo não encontrado' });

      const evento = await assertEventEmailAccess(ctx.user as any, disparo.eventId);
      const pendentes = await db.getPendingRecipients(input.emailId, LOTE_EMAIL);

      if (pendentes.length > 0) {
        const regs = await db.getRegistrationsByEventId(disparo.eventId) as any[];
        const configs = await db.getStartOrderConfigsByEventId(disparo.eventId) as any[];

        await Promise.all(pendentes.map(async (p: any) => {
          try {
            const ok = await enviarEmailDoEvento({
              destinatario: { email: p.email, name: p.name, registrationId: p.registrationId },
              assunto: disparo.subject,
              corpo: disparo.body,
              evento, regs, configs,
            });
            await db.markRecipientResult(p.id, ok, ok ? undefined : 'SMTP recusou o envio');
          } catch (err: any) {
            await db.markRecipientResult(p.id, false, err?.message);
          }
        }));
      }

      const contadores = await db.refreshEventEmailCounters(input.emailId) as any;
      return {
        enviadosAgora: pendentes.length,
        pendentes: contadores?.pending ?? 0,
        sent: contadores?.sentCount ?? 0,
        failed: contadores?.failedCount ?? 0,
        total: contadores?.totalRecipients ?? 0,
      };
    }),

  /** Histórico de disparos do evento. */
  historico: organizerProcedure
    .input(z.object({ eventId: z.number() }))
    .query(async ({ ctx, input }) => {
      await assertEventEmailAccess(ctx.user as any, input.eventId);
      return await db.getEventEmails(input.eventId);
    }),

  /** Relatório de um disparo: quem recebeu, quem falhou e por quê. */
  detalhes: organizerProcedure
    .input(z.object({ emailId: z.string() }))
    .query(async ({ ctx, input }) => {
      const disparo = await db.getEventEmailById(input.emailId) as any;
      if (!disparo) throw new TRPCError({ code: 'NOT_FOUND', message: 'Disparo não encontrado' });
      await assertEventEmailAccess(ctx.user as any, disparo.eventId);
      return {
        disparo,
        destinatarios: await db.getEventEmailRecipients(input.emailId),
      };
    }),

  /** Liga/desliga a régua de cobrança e guarda o texto do lembrete. */
  configCobranca: organizerProcedure
    .input(z.object({ eventId: z.number() }))
    .query(async ({ ctx, input }) => {
      const evento = await assertEventEmailAccess(ctx.user as any, input.eventId);
      return {
        enabled: !!evento.autoChargeEnabled,
        subject: evento.autoChargeSubject || COBRANCA_ASSUNTO_PADRAO,
        body: evento.autoChargeBody || COBRANCA_CORPO_PADRAO,
      };
    }),

  salvarConfigCobranca: organizerProcedure
    .input(z.object({
      eventId: z.number(),
      enabled: z.boolean(),
      subject: z.string().min(1),
      body: z.string().min(1),
    }))
    .mutation(async ({ ctx, input }) => {
      await assertEventEmailAccess(ctx.user as any, input.eventId);
      await db.updateEvent(input.eventId, {
        autoChargeEnabled: input.enabled,
        autoChargeSubject: input.subject,
        autoChargeBody: input.body,
      } as any);
      return { success: true };
    }),
});

const storeRouter = router({
  create: organizerProcedure
    .input(z.object({
      name: z.string().min(1, "Nome é obrigatório"),
      description: z.string().optional(),
      price: z.number().min(0, "Preço inválido"),
      stock: z.number().int().min(0, "Estoque não pode ser negativo"),
      availableSizes: z.string().optional(),
      imageUrl: z.string().optional(),
      eventId: z.number().optional()
    }))
    .mutation(async ({ ctx, input }) => {
      const user = ctx.user as any;
      const context = await db.getOrganizerContext(user);
      if (context.type === 'MEMBER' && !context.permissions.includes('store')) {
        throw new TRPCError({ code: 'FORBIDDEN', message: 'Sem permissão para loja' });
      }
      return await db.createProduct({
        ...input,
        ...(await normalizarEstoqueDoProduto(input)),
        userId: context.principalUserId
      } as any);
    }),

  getAll: organizerProcedure
    .input(z.object({ eventId: z.number().optional() }).optional())
    .query(async ({ ctx, input }) => {
      const user = ctx.user as any;
      const context = await db.getOrganizerContext(user);
      if (context.type === 'MEMBER' && !context.permissions.includes('store')) {
        throw new TRPCError({ code: 'FORBIDDEN', message: 'Sem permissão para loja' });
      }
      return await db.getProductsByUserId(context.principalUserId, input?.eventId);
    }),

  getAvailable: publicProcedure
    .input(z.object({ eventId: z.number().int().optional(), organizerId: z.number().int().optional() }).optional())
    .query(async ({ input }) => {
      return await db.getAvailableProducts(input);
    }),

  getById: publicProcedure
    .input(z.object({ id: z.string() }))
    .query(async ({ input }) => {
      const product = await db.getProductById(input.id);
      if (!product) throw new TRPCError({ code: 'NOT_FOUND', message: 'Produto não encontrado' });
      return product;
    }),

  update: organizerProcedure
    .input(z.object({
      id: z.string(),
      description: z.string().optional(),
      name: z.string().optional(),
      price: z.number().optional(),
      stock: z.number().int().optional(),
      availableSizes: z.string().optional(),
      imageUrl: z.string().optional(),
      eventId: z.number().optional()
    }))
    .mutation(async ({ ctx, input }) => {
      const user = ctx.user as any;
      const context = await db.getOrganizerContext(user);
      if (context.type === 'MEMBER' && !context.permissions.includes('store')) {
        throw new TRPCError({ code: 'FORBIDDEN', message: 'Sem permissão para loja' });
      }
      const { id, ...data } = input;
      const result = await db.updateProduct(id, context.principalUserId, {
        ...data,
        ...(await normalizarEstoqueDoProduto(input)),
      } as any);
      if (!result) throw new TRPCError({ code: 'NOT_FOUND', message: 'Produto não encontrado ou você não tem permissão' });
      return result;
    }),

  delete: organizerProcedure
    .input(z.object({
      id: z.string()
    }))
    .mutation(async ({ ctx, input }) => {
      const user = ctx.user as any;
      const context = await db.getOrganizerContext(user);
      if (context.type === 'MEMBER' && !context.permissions.includes('store')) {
        throw new TRPCError({ code: 'FORBIDDEN', message: 'Sem permissão para loja' });
      }
      const result = await db.deleteProduct(input.id, context.principalUserId);
      if (!result) throw new TRPCError({ code: 'NOT_FOUND', message: 'Produto não encontrado ou você não tem permissão' });
      return { success: true };
    }),

  createStandaloneOrder: publicProcedure
    .input(z.object({
      buyerName: z.string().min(1, "Nome é obrigatório"),
      buyerEmail: z.string().email("E-mail inválido"),
      buyerCpf: z.string().optional(),
      buyerPhone: z.string().optional(),
      productId: z.string(),
      eventId: z.number().optional(),
      quantity: z.number().int().min(1, "Quantidade inválida"),
      sizes: z.array(z.string()).optional()
    }))
    .mutation(async ({ input }) => {
      const dbInstance = await getDb();
      if (!dbInstance) throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: 'Database connection failed' });

      // Get the product to fetch the price and check stock
      const productResult = await dbInstance.select().from(products).where(eq(products.id, input.productId)).limit(1);
      const product = productResult[0];

      if (!product) {
        throw new TRPCError({ code: 'NOT_FOUND', message: 'Produto não encontrado' });
      }

      const eventId = input.eventId ?? product.eventId ?? undefined;
      // Evento que controla camiseta por tamanho: quem manda é o event_shirt_stock.
      // Antes o pedido avulso só olhava products.stock e furava o estoque por
      // tamanho (foi assim que o M zerou sem ninguém ver).
      const controlaPorTamanho = await db.hasShirtStockControl(eventId);

      if (controlaPorTamanho) {
        const sizes = input.sizes || [];
        if (sizes.filter(Boolean).length < input.quantity) {
          throw new TRPCError({ code: 'BAD_REQUEST', message: 'Selecione o tamanho de cada camiseta do pedido.' });
        }
        const conflito = await db.checkShirtSizesAvailable(eventId!, sizes);
        if (conflito) {
          throw new TRPCError({
            code: 'BAD_REQUEST',
            message: `Estoque de camiseta esgotado para o tamanho ${conflito.size} (disponível: ${conflito.disponivel}, pedido: ${conflito.pedido}). Escolha outro tamanho disponível.`,
          });
        }
      } else if (product.stock < input.quantity) {
        throw new TRPCError({ code: 'BAD_REQUEST', message: 'Estoque insuficiente' });
      }

      const totalAmount = product.price * input.quantity;

      // products.stock só é decrementado quando ele É o controle. Com estoque por
      // tamanho, o próprio pedido (product_orders) já conta como reservado —
      // decrementar os dois contava a mesma camiseta duas vezes.
      if (!controlaPorTamanho) {
        await dbInstance.update(products)
          .set({ stock: sql`${products.stock} - ${input.quantity}` })
          .where(eq(products.id, input.productId));
      }

      // Create the order
      const newOrder = await dbInstance.insert(productOrders).values({
        productId: input.productId,
        eventId: input.eventId,
        quantity: input.quantity,
        sizes: input.sizes ? JSON.stringify(input.sizes) : null,
        totalAmount,
        buyerName: input.buyerName,
        buyerEmail: input.buyerEmail,
        buyerPhone: input.buyerPhone,
        buyerCpf: input.buyerCpf ? input.buyerCpf.replace(/\D/g, '') : null,
        status: "PENDING"
      }).returning();

      return { success: true, order: newOrder[0] };
    }),

  getOrganizerOrders: organizerProcedure
    .input(z.object({ eventId: z.number().optional() }).optional())
    .query(async ({ ctx, input }) => {
      const user = ctx.user as any;
      const context = await db.getOrganizerContext(user);
      if (context.type === 'MEMBER' && !context.permissions.includes('store')) {
        throw new TRPCError({ code: 'FORBIDDEN', message: 'Sem permissão para loja' });
      }
      const dbInstance = await getDb();
      if (!dbInstance) throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: 'Database connection failed' });

      let baseCondition = eq(products.userId, context.principalUserId);
      if (input?.eventId) {
        baseCondition = and(baseCondition, eq(productOrders.eventId, input.eventId)) as any;
      }

      const orders = await dbInstance.select({
        order: productOrders,
        product: products
      })
        .from(productOrders)
        .innerJoin(products, eq(productOrders.productId, products.id))
        .where(baseCondition)
        .orderBy(sql`${productOrders.createdAt} DESC`);

      return orders;
    }),

  getMyOrders: protectedProcedure
    .query(async ({ ctx }) => {
      const user = ctx.user as any;
      if (!user?.email) return [];

      const dbInstance = await getDb();
      if (!dbInstance) throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: 'Database connection failed' });

      const orders = await dbInstance.select({
        order: productOrders,
        product: products
      })
        .from(productOrders)
        .innerJoin(products, eq(productOrders.productId, products.id))
        .where(eq(productOrders.buyerEmail, user.email))
        .orderBy(sql`${productOrders.createdAt} DESC`);

      return orders;
    }),

  deleteOrder: organizerProcedure
    .input(z.object({ orderId: z.string() }))
    .mutation(async ({ ctx, input }) => {
      const user = ctx.user as any;
      const context = await db.getOrganizerContext(user);
      if (context.type === 'MEMBER' && !context.permissions.includes('store')) {
        throw new TRPCError({ code: 'FORBIDDEN', message: 'Sem permissão para loja' });
      }
      const dbInstance = await getDb();
      if (!dbInstance) throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: 'Database connection failed' });

      // Verifica que o pedido pertence a um produto do organizador
      const existing = await dbInstance
        .select({ id: productOrders.id })
        .from(productOrders)
        .innerJoin(products, eq(productOrders.productId, products.id))
        .where(
          and(
            eq(productOrders.id, input.orderId),
            eq(products.userId, context.principalUserId)
          )
        )
        .limit(1);

      if (!existing.length) {
        throw new TRPCError({ code: 'NOT_FOUND', message: 'Pedido não encontrado ou sem permissão' });
      }

      await dbInstance.delete(productOrders).where(eq(productOrders.id, input.orderId));
      return { success: true };
    }),
});

export const competitorRouter = router({
  getMyChampionships: protectedProcedure
    .query(async ({ ctx }) => {
      const dbInstance = await getDb();
      if (!dbInstance) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database error" });

      const userId = ctx.user.id;
      const user = await dbInstance.select().from(users).where(eq(users.id, userId)).limit(1);
      if (user.length === 0) throw new TRPCError({ code: "NOT_FOUND", message: "User not found" });

      // 1. Get all registrations for this user to identify participating events
      const userRegistrations = await dbInstance.select().from(registrations).where(eq(registrations.userId, userId));
      const eventIds = [...new Set(userRegistrations.map(r => r.eventId))];

      if (eventIds.length === 0) return [];

      // 2. Identify championships linked to these events
      const linkedStages = await dbInstance
        .select({ championshipId: championshipStages.championshipId })
        .from(championshipStages)
        .where(inArray(championshipStages.eventId, eventIds));

      const champIds = [...new Set(linkedStages.map(s => s.championshipId))];

      if (champIds.length === 0) return [];

      // 3. For each championship, calculate standings and extract user data
      const myChampData = [];

      for (const champId of champIds) {
        const { standings, stages, championship } = await calculateChampionshipStandings(champId);

        // Find user in standings (matching by name from user profile or registrations)
        const possibleNames = new Set<string>();
        if (user[0].name) possibleNames.add(user[0].name.toLowerCase());

        const champEventIds = stages.filter(s => s.eventId !== null).map(s => s.eventId as number);
        const relevantRegs = userRegistrations.filter(r => champEventIds.includes(r.eventId));

        relevantRegs.forEach(r => {
          if (r.pilotName) possibleNames.add(r.pilotName.toLowerCase());
          if (r.navigatorName) possibleNames.add(r.navigatorName.toLowerCase());
        });

        let myEntry = null;
        let myPosition = 0;

        // Search in all categories and roles from calculated standings
        for (const cat of standings) {
          const pilotEntry = cat.pilots.find(p => possibleNames.has(p.name.toLowerCase()));
          if (pilotEntry) {
            myEntry = pilotEntry;
            myPosition = cat.pilots.indexOf(pilotEntry) + 1;
            break;
          }
          const navEntry = cat.navigators.find(n => possibleNames.has(n.name.toLowerCase()));
          if (navEntry) {
            myEntry = navEntry;
            myPosition = cat.navigators.indexOf(navEntry) + 1;
            break;
          }
        }

        if (myEntry) {
          // Scenario A: User has results in the championship
          myChampData.push({
            id: championship.id,
            name: championship.name,
            imageUrl: (championship as any).imageUrl,
            category: myEntry.category,
            role: myEntry.role,
            position: myPosition,
            totalPoints: myEntry.netPoints,
            grossPoints: myEntry.grossPoints,
            stages: stages.map(s => {
              const result = myEntry!.stageResults.find(sr => sr.stageId === s.id);
              return {
                id: s.id,
                number: s.stageNumber,
                name: s.customName || s.event?.name || `Etapa ${s.stageNumber}`,
                points: result?.points || 0,
                position: result?.position || 0,
                isDiscarded: result?.isDiscarded || false,
                isDisqualified: result?.isDisqualified || false,
                hasResult: !!result
              };
            })
          });
        } else if (relevantRegs.length > 0) {
          // Scenario B: User is registered but has no results calculated yet
          const latestReg = relevantRegs.sort((a, b) => (b.id || 0) - (a.id || 0))[0];
          const isPilot = user[0].name && latestReg.pilotName && user[0].name.toLowerCase() === latestReg.pilotName.toLowerCase();

          myChampData.push({
            id: championship.id,
            name: championship.name,
            imageUrl: (championship as any).imageUrl,
            category: "Inscrito",
            role: isPilot ? 'pilot' : 'navigator',
            position: null,
            totalPoints: 0,
            grossPoints: 0,
            stages: stages.map(s => ({
              id: s.id,
              number: s.stageNumber,
              name: s.customName || s.event?.name || `Etapa ${s.stageNumber}`,
              points: 0,
              position: 0,
              isDiscarded: false,
              isDisqualified: false,
              hasResult: false
            }))
          });
        }
      }

      return myChampData;
    })
});

// --- ZEQUINHA AI AGENT LOGIC ---
async function generateGeminiEmbedding(text: string) {
  if (!ENV.geminiApiKey) {
    console.error('[Gemini] ERRO: Chave GEMINI_API_KEY não encontrada no ENV');
    throw new Error('Configuração de IA incompleta (Chave faltando)');
  }
  const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-embedding-001:embedContent?key=${ENV.geminiApiKey}`;
  const response = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      model: "models/gemini-embedding-001",
      content: { parts: [{ text }] },
      task_type: "RETRIEVAL_DOCUMENT",
    })
  });

  if (!response.ok) {
    const err = await response.text();
    throw new Error(`Gemini Embedding Error: ${err}`);
  }

  const data = await response.json() as any;
  return data.embedding.values;
}

async function generateGeminiResponse(prompt: string, systemPrompt: string, history: { role: 'user' | 'model', content: string }[]) {
  if (!ENV.geminiApiKey) {
    throw new Error('Configuração de IA incompleta (Chave faltando)');
  }
  const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-flash-latest:generateContent?key=${ENV.geminiApiKey}`;
  
  const contents = [
    ...history.map(h => ({
      role: h.role,
      parts: [{ text: h.content }]
    })),
    {
      role: 'user',
      parts: [{ text: prompt }]
    }
  ];

  const response = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      contents,
      system_instruction: {
        parts: [{ text: systemPrompt }]
      },
      generationConfig: {
        temperature: 0.7,
        maxOutputTokens: 800,
      }
    })
  });

  if (!response.ok) {
    const err = await response.text();
    throw new Error(`Gemini Chat Error: ${err}`);
  }

  const data = await response.json() as any;
  if (!data.candidates?.[0]?.content?.parts?.[0]?.text) {
    throw new Error('Gemini returned an empty response.');
  }
  return data.candidates[0].content.parts[0].text;
}

const zequinhaRouter = router({
  ask: publicProcedure
    .input(z.object({
      question: z.string().min(1),
      history: z.array(z.object({
        role: z.enum(['user', 'model']),
        content: z.string()
      })).optional()
    }))
    .mutation(async ({ input }) => {
      try {
        // 1. Get embedding for the question
        const embedding = await generateGeminiEmbedding(input.question);
        
        // 2. Search knowledge base
        const dbInstance = await getDb();
        if (!dbInstance) throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: 'Falha na conexão com o banco de dados.' });

        const vectorString = `[${embedding.join(",")}]`;
        const matches = await dbInstance.execute(sql`
          SELECT * FROM match_knowledge_chunks(
            ${vectorString}::vector,
            0.4,
            4
          )
        `) as any[];

        const context = matches.map(m => m.content).join("\n\n---\n\n");

        // 3. System Prompt
        const systemPrompt = `Você é o Zequinha, o assistente técnico especialista e mascote da Amigo Racing.
Sua personalidade é amigável, técnica, prestativa e um pouco "off-road" (usa termos como "bora pro grid", "na trilha", etc).
Sua principal função é ajudar pilotos e organizadores com dúvidas sobre a plataforma e regras de rally.

Responda SEMPRE com base nos CONHECIMENTOS TÉCNICOS fornecidos abaixo.
Se a informação não estiver no contexto, seja honesto e diga que não sabe sobre esse assunto específico, mas incentive o usuário a entrar em contato com o suporte da Amigo Racing via WhatsApp.
Mantenha as respostas concisas, organizadas por tópicos se necessário, e em Português do Brasil.

CONHECIMENTOS TÉCNICOS:
${context || 'Nenhum conhecimento específico encontrado para esta pergunta.'}`;

        // 4. Generate response
        const answer = await generateGeminiResponse(input.question, systemPrompt, (input.history || []) as any);

        return {
          answer,
          hasContext: matches.length > 0
        };
      } catch (error: any) {
        console.error('[zequinha.ask] Error:', error);
        throw new TRPCError({
          code: 'INTERNAL_SERVER_ERROR',
          message: error.message || 'Erro ao processar sua pergunta.'
        });
      }
    })
});

export const appRouter = router({
  system: systemRouter,
  finance: financeRouter,
  emails: emailsRouter,
  store: storeRouter,
  championships: championshipRouter,
  competitor: competitorRouter,
  storage: storageRouter,
  zequinha: zequinhaRouter,
  whatsapp: whatsappRouter,

  shirtStock: router({
    // Disponibilidade por tamanho (público: o formulário de inscrição lê pra
    // saber o que ofertar). Ordenado PP,P,M,G,GG,G1..G4 → infantis → outros.
    getByEvent: publicProcedure
      .input(z.object({ eventId: z.number() }))
      .query(async ({ input }) => {
        const rows = await db.getShirtAvailability(input.eventId);
        return sortShirtSizes(rows, (r) => r.size);
      }),
    // Define/ajusta o estoque (organizador). Upsert por tamanho.
    setStock: protectedProcedure
      .input(z.object({
        eventId: z.number(),
        items: z.array(z.object({ size: z.string(), quantity: z.number().int().min(0) })),
      }))
      .mutation(async ({ ctx, input }) => {
        const user = ctx.user as any;
        const context = await db.getOrganizerContext(user);
        const event = await db.getEventById(input.eventId) as any;
        if (!event) throw new TRPCError({ code: 'NOT_FOUND', message: 'Evento não encontrado' });
        const organizer = await db.getOrganizerById(event.organizerId) as any;
        const principal = await db.getUserById(context.principalUserId) as any;
        if (!organizer || organizer.ownerId !== principal?.openId || (context.type === 'MEMBER' && !context.permissions.includes('registrations'))) {
          throw new TRPCError({ code: 'UNAUTHORIZED', message: 'Somente o organizador pode alterar o estoque' });
        }
        await db.setShirtStock(input.eventId, input.items);
        return sortShirtSizes(await db.getShirtAvailability(input.eventId), (r) => r.size);
      }),
  }),

  organizerMembers: router({
    invite: organizerProcedure
      .input(z.object({
        email: z.string().email(),
        permissions: z.array(z.string())
      }))
      .mutation(async ({ ctx, input }) => {
        const user = ctx.user as any;
        const dbInstance = await getDb();
        if (!dbInstance) throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: 'DB fail' });

        const memberEmail = input.email.toLowerCase().trim();

        // Ensure no cyclic or duplicate invitations
        const result = await dbInstance.insert(organizerMembers).values({
          organizerId: user.id, // Only Principal can invite
          memberEmail,
          permissions: JSON.stringify(input.permissions),
        }).returning();

        const loginUrl = `${ENV.siteUrl}/login`;
        const emailHtml = `
          <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; color: #333;">
            <h2 style="color: #ea580c;">Você foi convidado como organizador</h2>
            <p>Olá,</p>
            <p><strong>${user.name || user.email}</strong> te deu acesso ao painel de organizador no Amigo Racing.</p>
            <p>Entre com o e-mail <strong>${memberEmail}</strong> pra acessar as áreas liberadas pra você.</p>
            <div style="text-align: center; margin: 30px 0;">
              <a href="${loginUrl}" style="background-color: #ea580c; color: white; padding: 12px 24px; text-decoration: none; border-radius: 4px; font-weight: bold;">Acessar o Painel</a>
            </div>
            <p style="color: #666; font-size: 14px;">Se você ainda não tem conta com esse e-mail, crie uma em ${loginUrl} antes de entrar.</p>
            <hr style="border: none; border-top: 1px solid #eee; margin: 20px 0;" />
            <p style="color: #999; font-size: 12px; text-align: center;">🏁 Equipe Amigo Racing</p>
          </div>
        `;

        const emailSent = await sendEmail(memberEmail, "Você foi convidado como organizador - Amigo Racing", emailHtml);
        if (!emailSent) {
          console.warn(`[organizerMembers.invite] Convite salvo no banco mas e-mail NÃO enviado para ${memberEmail}`);
        }

        return result;
      }),

    list: organizerProcedure
      .query(async ({ ctx }) => {
        const user = ctx.user as any;
        const dbInstance = await getDb();
        if (!dbInstance) return [];

        return await dbInstance.select()
          .from(organizerMembers)
          .where(eq(organizerMembers.organizerId, user.id));
      }),

    remove: organizerProcedure
      .input(z.object({ id: z.number() }))
      .mutation(async ({ ctx, input }) => {
        const user = ctx.user as any;
        const dbInstance = await getDb();
        if (!dbInstance) return false;

        await dbInstance.delete(organizerMembers)
          .where(and(eq(organizerMembers.id, input.id), eq(organizerMembers.organizerId, user.id)));
        return { success: true };
      }),

    updatePermissions: organizerProcedure
      .input(z.object({
        id: z.number(),
        permissions: z.array(z.string())
      }))
      .mutation(async ({ ctx, input }) => {
        const user = ctx.user as any;
        const dbInstance = await getDb();
        if (!dbInstance) throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: 'DB fail' });

        await dbInstance.update(organizerMembers)
          .set({ permissions: JSON.stringify(input.permissions) })
          .where(and(eq(organizerMembers.id, input.id), eq(organizerMembers.organizerId, user.id)));

        return { success: true };
      }),

    myContext: protectedProcedure
      .query(async ({ ctx }) => {
        const user = ctx.user as any;
        return await db.getOrganizerContext(user);
      }),

    myPermissions: protectedProcedure
      .query(async ({ ctx }) => {
        const user = ctx.user as any;
        const context = await db.getOrganizerContext(user);
        if (context.type === 'PRINCIPAL') {
          return ['events', 'registrations', 'finance', 'store', 'principal'];
        }
        return context.permissions;
      })
  }),

  auth: router({
    me: publicProcedure.query(async ({ ctx }) => {
      ctx.res.setHeader('Cache-Control', 'no-store, max-age=0');
      if (!ctx.user) return null;
      const user = ctx.user as any;
      return {
        ...user,
        id: user.id || 1,
        openId: user.openId || "dev-user",
        name: user.name || "Competidor",
        email: user.email || "competidor@amigoracing.com.br"
      };
    }),
    logout: publicProcedure.mutation(({ ctx }) => {
      const cookieOptions = getSessionCookieOptions(ctx.req);
      ctx.res.clearCookie(COOKIE_NAME, cookieOptions);
      ctx.res.clearCookie(COOKIE_NAME); // Fallback: sem opções para garantir remoção em localhost
      ctx.res.setHeader('Clear-Site-Data', '"cache", "cookies", "storage"');
      return { success: true };
    }),
  }),
  events: router({
    resolveSlug: publicProcedure
      .input(z.object({ slug: z.string() }))
      .query(async ({ input }) => {
        const id = await db.getEventIdBySlug(input.slug);
        return id ? { id } : null;
      }),
    list: publicProcedure.query(async () => await db.getAllEvents() || []),
    listAll: publicProcedure.query(async () => {
      try {
        const result = await db.getAllEvents();
        return result || [];
      } catch (err: any) {
        const errDetails = err.message + ' | stack: ' + err.stack + ' | json: ' + JSON.stringify(err, Object.getOwnPropertyNames(err));
        console.error("[events.listAll] Error:", errDetails);
        throw new TRPCError({
          code: 'INTERNAL_SERVER_ERROR',
          message: errDetails
        });
      }
    }),
    listOpen: publicProcedure.query(async () => await db.getOpenEvents() || []),
    get: publicProcedure
      .input(z.object({ id: z.number() }))
      .query(async ({ input }) => {
        const event = await db.getEventById(input.id);
        if (!event) throw new TRPCError({ code: 'NOT_FOUND', message: 'Evento não encontrado' });
        return event;
      }),
    // Devolve o logo do evento já em base64 (data URL). O PDF é gerado no
    // browser e o logo mora no R2 (cross-origin) — buscar pelo backend evita
    // problema de CORS/canvas.
    getLogoDataUrl: publicProcedure
      .input(z.object({ eventId: z.number() }))
      .query(async ({ input }) => {
        const event = await db.getEventById(input.eventId) as any;
        if (!event?.logoUrl) return { dataUrl: null as string | null };
        try {
          const resp = await fetch(event.logoUrl);
          if (!resp.ok) return { dataUrl: null };
          const buf = Buffer.from(await resp.arrayBuffer());
          const contentType = resp.headers.get('content-type') || 'image/png';
          return { dataUrl: `data:${contentType};base64,${buf.toString('base64')}` };
        } catch {
          return { dataUrl: null };
        }
      }),
    myEvents: protectedProcedure.query(async ({ ctx }) => {
      const user = ctx.user as any;
      const context = await db.getOrganizerContext(user);
      if (context.type === 'MEMBER' && !context.permissions.includes('events')) return [];

      const principal = await db.getUserById(context.principalUserId) as any;
      const organizer = principal ? await db.getOrganizerByOwnerId(principal.openId) as any : null;
      if (!organizer) return [];
      const result = await db.getEventsByOrganizerId(organizer.id);
      return result;
    }),
    create: protectedProcedure
      .input(z.object({
        name: z.string(),
        description: z.string().optional(),
        startDate: z.string().or(z.date()),
        endDate: z.string().or(z.date()),
        location: z.string(),
        city: z.string(),
        state: z.string().optional(),
        imageUrl: z.string().optional(),
        logoUrl: z.string().optional(),
        isExternal: z.boolean().optional(),
        showInListing: z.boolean().optional(),
        showRegistrations: z.boolean().optional(),
        allowCancellation: z.boolean().optional(),
        hasShirts: z.boolean().optional(),
        notificationEmail: z.string().email().optional(),
        externalUrl: z.string().url().optional().nullable(),
        accepts_credit_card: z.boolean().optional(),
      }))
      .mutation(async ({ ctx, input }) => {
        const user = ctx.user as any;
        const context = await db.getOrganizerContext(user);
        if (context.type === 'MEMBER' && !context.permissions.includes('events')) {
          throw new TRPCError({ code: 'FORBIDDEN', message: 'Sem permissão para eventos' });
        }

        const principal = await db.getUserById(context.principalUserId) as any;
        const organizer = principal ? await db.getOrganizerByOwnerId(principal.openId) as any : null;
        if (!organizer) {
          throw new TRPCError({ code: 'FORBIDDEN', message: 'Usuário principal não possui um organizador válido' });
        }

        try {
          const startDate = new Date(input.startDate);
          const endDate = new Date(input.endDate);

          if (isNaN(startDate.getTime()) || isNaN(endDate.getTime())) {
            throw new Error("Datas inválidas fornecidas");
          }

          const result = await db.createEvent({
            ...input,
            startDate,
            endDate,
            organizerId: organizer.id,
            status: 'open',
            isExternal: input.isExternal || false,
            hasShirts: input.hasShirts !== false, // Defaults to true
            accepts_credit_card: input.accepts_credit_card !== false, // Defaults to true
          } as any);

          console.log(`[Events.create] Evento criado com sucesso. ID extraído de:`, result);
          return { success: true, message: "Evento criado com sucesso" };
        } catch (error) {
          console.error(`[Events.create Error]:`, error);
          throw new TRPCError({
            code: 'INTERNAL_SERVER_ERROR',
            message: error instanceof Error ? error.message : 'Erro ao criar evento'
          });
        }
      }),
    createExternal: protectedProcedure
      .input(z.object({
        name: z.string(),
        description: z.string().optional(),
        startDate: z.string().or(z.date()),
        endDate: z.string().or(z.date()),
        location: z.string(),
        city: z.string(),
        state: z.string().optional(),
        imageUrl: z.string().optional(),
        showInListing: z.boolean().optional(),
        allowCancellation: z.boolean().optional(),
        notificationEmail: z.string().email().optional(),
      }))
      .mutation(async ({ ctx, input }) => {
        const user = ctx.user as any;
        const context = await db.getOrganizerContext(user);

        let targetOrganizerId = 0;

        if (user.role === 'admin') {
          // Admin bypass
          const principal = await db.getUserById(context.principalUserId) as any;
          let organizer = principal ? await db.getOrganizerByOwnerId(principal.openId) as any : null;

          if (!organizer) {
            // Fallback for admin: pick any organizer or create a dummy one later if needed
            const drizzleDb = await db.getDb();
            const anyOrg = drizzleDb ? await drizzleDb.select().from(organizers).limit(1) : [];
            if (anyOrg.length > 0) {
              organizer = anyOrg[0];
            }
          }
          if (organizer) {
            targetOrganizerId = organizer.id;
          } else {
            throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: 'Nenhum organizador no banco para vincular ao evento externo.' });
          }
        } else {
          // Normal Organizer check
          if (context.type === 'MEMBER' && !context.permissions.includes('events')) {
            throw new TRPCError({ code: 'FORBIDDEN', message: 'Sem permissão para eventos' });
          }

          const principal = await db.getUserById(context.principalUserId) as any;
          const organizer = principal ? await db.getOrganizerByOwnerId(principal.openId) as any : null;
          if (!organizer) throw new TRPCError({ code: 'FORBIDDEN', message: 'Usuário não é um organizador' });
          targetOrganizerId = organizer.id;
        }

        return await db.createEvent({
          ...input,
          startDate: new Date(input.startDate),
          endDate: new Date(input.endDate),
          organizerId: targetOrganizerId,
          status: 'open',
          isExternal: true,
        } as any);
      }),
    update: protectedProcedure
      .input(z.object({
        id: z.number(),
        name: z.string().optional(),
        description: z.string().optional().nullable(),
        startDate: z.string().or(z.date()).optional(),
        endDate: z.string().or(z.date()).optional(),
        location: z.string().optional().nullable(),
        city: z.string().optional().nullable(),
        state: z.string().optional().nullable(),
        status: z.enum(['open', 'closed', 'cancelled']).optional(),
        imageUrl: z.string().optional().nullable(),
        logoUrl: z.string().optional().nullable(),
        isExternal: z.boolean().optional().nullable(),
        externalUrl: z.string().url().optional().nullable(),
        showInListing: z.boolean().optional().nullable(),
        showRegistrations: z.boolean().optional().nullable(),
        notifyOnNewRegistration: z.boolean().optional().nullable(),
        notificationEmail: z.string().email().optional().nullable(),
        allowCancellation: z.boolean().optional().nullable(),
        hasShirts: z.boolean().optional().nullable(),
        cancellationDeadlineDays: z.number().optional().nullable(),
        refundEnabled: z.boolean().optional().nullable(),
        terms: z.string().optional().nullable(),
        documents: z.string().optional().nullable(),
        championshipId: z.number().optional().nullable(),
        sponsors: z.array(z.string()).optional(),
        gallery: z.array(z.string()).optional(),
        navigationFiles: z.array(z.any()).optional(),
        accepts_credit_card: z.boolean().optional().nullable(),
      }))
      .mutation(async ({ ctx, input }) => {
        const { id, championshipId, ...data } = input;
        const updateData: any = { ...data };
        if (data.startDate) updateData.startDate = new Date(data.startDate);
        if (data.endDate) updateData.endDate = new Date(data.endDate);

        // Garantir que campos booleanos e opcionais sejam passados corretamente
        if (data.isExternal !== undefined) updateData.isExternal = data.isExternal;
        if (data.externalUrl !== undefined) updateData.externalUrl = data.externalUrl;
        if (data.showInListing !== undefined) updateData.showInListing = data.showInListing;
        if (data.showRegistrations !== undefined) updateData.showRegistrations = data.showRegistrations;
        if (data.hasShirts !== undefined && data.hasShirts !== null) updateData.hasShirts = data.hasShirts;
        if (data.accepts_credit_card !== undefined && data.accepts_credit_card !== null) updateData.accepts_credit_card = data.accepts_credit_card;

        const result = await db.updateEvent(id, updateData);

        // Handle Championship linking requests
        if (championshipId !== undefined) {
          const drizzleDb = await db.getDb();
          if (drizzleDb) {
            const currentOrganizerId = (ctx.user as any).id;

            if (championshipId === null) {
              // Remove explicit link and any pending requests
              await drizzleDb.delete(championshipStages).where(eq(championshipStages.eventId, id));
              await drizzleDb.delete(championshipRequests).where(eq(championshipRequests.eventId, id));
            } else {
              // Check if it's already an approved stage
              const existingStage = await drizzleDb.select().from(championshipStages).where(eq(championshipStages.eventId, id)).limit(1);

              if (existingStage.length > 0) {
                if (existingStage[0].championshipId !== championshipId) {
                  // Switching championship: Remove old stage and create a pending request for the new one
                  await drizzleDb.delete(championshipStages).where(eq(championshipStages.eventId, id));

                  // Check if a request already exists to avoid duplicates
                  const existingReq = await drizzleDb.select().from(championshipRequests)
                    .where(and(eq(championshipRequests.eventId, id), eq(championshipRequests.championshipId, championshipId))).limit(1);

                  if (existingReq.length === 0) {
                    await drizzleDb.insert(championshipRequests).values({
                      championshipId,
                      eventId: id,
                      requestingOrganizerId: currentOrganizerId,
                      status: "PENDING"
                    });
                  } else if (existingReq[0].status !== "PENDING") {
                    await drizzleDb.update(championshipRequests)
                      .set({ status: "PENDING" })
                      .where(eq(championshipRequests.id, existingReq[0].id));
                  }
                }
              } else {
                // Not an active stage. Handle request creation or update.
                const existingReq = await drizzleDb.select().from(championshipRequests).where(eq(championshipRequests.eventId, id)).limit(1);

                if (existingReq.length > 0) {
                  if (existingReq[0].championshipId !== championshipId) {
                    await drizzleDb.update(championshipRequests)
                      .set({ championshipId, status: "PENDING" })
                      .where(eq(championshipRequests.id, existingReq[0].id));
                  } else if (existingReq[0].status === "REJECTED") {
                    await drizzleDb.update(championshipRequests)
                      .set({ status: "PENDING" })
                      .where(eq(championshipRequests.id, existingReq[0].id));
                  }
                } else {
                  await drizzleDb.insert(championshipRequests).values({
                    championshipId,
                    eventId: id,
                    requestingOrganizerId: currentOrganizerId,
                    status: "PENDING"
                  });
                }
              }
            }
          }
        }

        return result;
      }),
    delete: protectedProcedure
      .input(z.object({ id: z.number() }))
      .mutation(async ({ ctx, input }) => {
        const user = ctx.user as any;
        const context = await db.getOrganizerContext(user);
        if (context.type === 'MEMBER' && !context.permissions.includes('events')) {
          throw new TRPCError({ code: 'FORBIDDEN', message: 'Sem permissão para eventos' });
        }
        return await db.deleteEvent(input.id);
      }),
    listImages: publicProcedure.input(z.any()).query(async () => []),

    updateDocuments: protectedProcedure
      .input(z.object({
        id: z.number(),
        documents: z.string(), // JSON array de {name, url, type}
      }))
      .mutation(async ({ ctx, input }) => {
        const user = ctx.user as any;
        const context = await db.getOrganizerContext(user);
        if (context.type === 'MEMBER' && !context.permissions.includes('events')) {
          throw new TRPCError({ code: 'FORBIDDEN', message: 'Sem permissão para eventos' });
        }
        await db.updateEvent(input.id, { documents: input.documents } as any);
        return { success: true };
      }),

    getDocuments: publicProcedure
      .input(z.object({ id: z.number() }))
      .query(async ({ input }) => {
        const event = await db.getEventById(input.id);
        if (!event) return [];
        try {
          const docs = JSON.parse((event as any).documents || '[]');
          return Array.isArray(docs) ? docs : [];
        } catch {
          return [];
        }
      }),

    getNavigationFiles: publicProcedure
      .input(z.object({ id: z.number() }))
      .query(async ({ input }) => {
        const event = await db.getEventById(input.id);
        if (!event) return [];
        try {
          const files = (event as any).navigationFiles || [];
          return Array.isArray(files) ? files : [];
        } catch {
          return [];
        }
      }),
  }),

  categories: router({
    listByEvent: publicProcedure
      .input(z.object({ eventId: z.number() }))
      .query(async ({ input }) => {
        return await db.getCategoriesByEventId(input.eventId) || [];
      }),
    create: protectedProcedure
      .input(z.any())
      .mutation(async ({ input }) => {
        try {
          return await db.createCategory(input as any);
        } catch (error) {
          return { success: true, id: 1 };
        }
      }),
    delete: protectedProcedure
      .input(z.object({ id: z.number() }))
      .mutation(async ({ input }) => {
        return await db.deleteCategory(input.id);
      }),
    update: protectedProcedure
      .input(z.object({
        id: z.number(),
        name: z.string().optional(),
        description: z.string().optional(),
        price: z.number().optional(),
        slots: z.number().optional()
      }))
      .mutation(async ({ input }) => {
        return await db.updateCategory(input.id, {
          name: input.name,
          description: input.description,
          price: input.price,
          slots: input.slots
        });
      }),
    listCategories: publicProcedure.input(z.any()).query(async () => []),
    reorder: protectedProcedure
      .input(z.object({ orderedIds: z.array(z.number()) }))
      .mutation(async ({ input }) => {
        const dbInstance = await getDb();
        if (!dbInstance) throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: 'DB fail' });

        await Promise.all(
          input.orderedIds.map((id, index) =>
            dbInstance.update(categories).set({ sortOrder: index }).where(eq(categories.id, id))
          )
        );

        return { success: true };
      }),
  }),
  registrations: router({
    create: protectedProcedure
      .input(z.object({
        eventId: z.number(),
        categoryId: z.number(),
        vehicleBrand: z.string(),
        vehicleModel: z.string(),
        pilotName: z.string(),
        pilotEmail: z.string(),
        pilotCpf: z.string(),
        pilotCity: z.string(),
        pilotState: z.string(),
        pilotShirtSize: z.string(),
        phone: z.string(),
        navigatorName: z.string().nullable().optional(),
        navigatorEmail: z.string().nullable().optional(),
        navigatorCpf: z.string().nullable().optional(),
        navigatorCity: z.string().nullable().optional(),
        navigatorState: z.string().nullable().optional(),
        navigatorShirtSize: z.string().nullable().optional(),
        team: z.string().optional(),
        notes: z.string().optional(),
        termsAccepted: z.boolean().optional(),
        purchasedProducts: z.any().optional(),
      }))
      .mutation(async ({ ctx, input }) => {
        const user = ctx.user as any;
        try {
          // Trava de estoque de camisetas: só quando o evento tem estoque
          // configurado (retrocompatível com eventos sem estoque). Confere se
          // os tamanhos desta inscrição (piloto + navegador + extras) cabem no
          // disponível. Conta a demanda da PRÓPRIA inscrição também, pra não
          // deixar 2 camisetas do mesmo tamanho passarem quando só resta 1.
          const pedidos: unknown[] = [input.pilotShirtSize];
          if (input.navigatorShirtSize) pedidos.push(input.navigatorShirtSize);
          if (Array.isArray(input.purchasedProducts)) {
            for (const item of input.purchasedProducts as any[]) {
              if (item && Array.isArray(item.sizes)) pedidos.push(...item.sizes);
            }
          }
          const conflito = await db.checkShirtSizesAvailable(input.eventId, pedidos);
          if (conflito) {
            throw new TRPCError({
              code: 'BAD_REQUEST',
              message: `Estoque de camiseta esgotado para o tamanho ${conflito.size} (disponível: ${conflito.disponivel}, pedido: ${conflito.pedido}). Escolha outro tamanho disponível.`,
            });
          }

          const result = await db.createRegistration({
            ...input,
            userId: user.id || 1,
            pilotCpf: input.pilotCpf.replace(/\D/g, ''),
            phone: input.phone.replace(/\D/g, ''),
            status: "pending",
            createdAt: new Date(),
            updatedAt: new Date(),
          } as any);

          const finalId = typeof result === 'number' ? result : (result as any)?.id || Date.now();

          // Notifica o organizador por e-mail a cada nova inscrição.
          // Não depende de "notifyOnNewRegistration" (campo existe no schema mas
          // não tem UI pra ligar/desligar) — sempre notifica, com override opcional
          // via event.notificationEmail se o organizador configurar um e-mail específico.
          (async () => {
            try {
              const event = await db.getEventById(input.eventId) as any;
              if (event) {
                const organizer = await db.getOrganizerById(event.organizerId) as any;
                const organizerUser = organizer ? await db.getUserByOpenId(organizer.ownerId) as any : null;
                const notifyEmail = event.notificationEmail || organizerUser?.email;

                if (notifyEmail) {
                  const categoryData = await db.getCategoryById(input.categoryId) as any;
                  const parentCategory = categoryData?.parentId ? await db.getCategoryById(categoryData.parentId) as any : null;
                  const categoryName = parentCategory ? `${parentCategory.name} - ${categoryData?.name}` : (categoryData?.name || 'Desconhecida');

                  const emailHtml = `
                    <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; color: #333;">
                      <h2 style="color: #00a19c;">Nova Inscrição Recebida! 🏁</h2>
                      <p>Uma nova inscrição foi feita no evento <strong>${event.name}</strong>.</p>
                      <ul>
                        <li><strong>Piloto:</strong> ${input.pilotName}</li>
                        <li><strong>E-mail:</strong> ${input.pilotEmail}</li>
                        <li><strong>Categoria:</strong> ${categoryName}</li>
                        <li><strong>Data:</strong> ${new Date().toLocaleDateString('pt-BR')}</li>
                      </ul>
                      <div style="text-align: center; margin: 30px 0;">
                        <a href="${ENV.oAuthServerUrl}/organizer" style="background-color: #00a19c; color: white; padding: 12px 24px; text-decoration: none; border-radius: 4px; font-weight: bold;">Ver Inscrições</a>
                      </div>
                      <hr style="border: none; border-top: 1px solid #eee; margin: 20px 0;" />
                      <p style="color: #999; font-size: 12px; text-align: center;">🏁 Equipe Amigo Racing</p>
                    </div>
                  `;
                  await sendEmail(notifyEmail, `[NOVA INSCRIÇÃO] ${input.pilotName} - ${event.name}`, emailHtml);
                }
              }
            } catch (error) {
              console.error('[registrations.create] Erro ao enviar notificação ao organizador:', error);
            }
          })();

          // Deduct stock for purchased products.
          // Com estoque por tamanho, os extras já entram no "reservado" via
          // purchasedProducts da própria inscrição — decrementar products.stock
          // também contaria a mesma camiseta duas vezes.
          if (input.purchasedProducts && Array.isArray(input.purchasedProducts)
              && !(await db.hasShirtStockControl(input.eventId))) {
            const dbInstance = await getDb();
            if (dbInstance) {
              for (const item of input.purchasedProducts) {
                if (item.productId && item.quantity > 0) {
                  await dbInstance.update(products)
                    .set({ stock: sql`${products.stock} - ${item.quantity}` })
                    .where(eq(products.id, item.productId));
                }
              }
            }
          }

          return { success: true, id: finalId, registrationId: finalId };
        } catch (error) {
          // Erros de negócio (ex: estoque de camiseta esgotado) devem chegar
          // ao usuário com a mensagem original, não viram "erro genérico".
          if (error instanceof TRPCError) throw error;
          console.error("[registrations.create Error]:", error);
          throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: 'Erro ao criar inscrição' });
        }
      }),
    listByEvent: publicProcedure.input(z.object({ eventId: z.number() })).query(async ({ input }) => {
      return await db.getRegistrationsByEventId(input.eventId) || [];
    }),
    get: publicProcedure.input(z.object({ id: z.number() })).query(async ({ input }) => {
      return await db.getRegistrationById(input.id);
    }),
    myRegistrations: protectedProcedure.query(async ({ ctx }) => {
      const regs = await db.getRegistrationsByUserId(ctx.user.id) || [];

      // Buscar startOrderConfig para calcular número/horário de largada.
      // Os campos registrations.startNumber / startTime podem estar null — o
      // valor real vive na startOrderConfig + registrationOrder.
      const eventIds = [...new Set((regs as any[]).map(r => r.eventId))];
      const configsByEvent = new Map<number, any[]>();
      for (const eid of eventIds) {
        try {
          const configs = await db.getStartOrderConfigsByEventId(eid);
          if (configs?.length) configsByEvent.set(eid, configs);
        } catch {}
      }

      // A query traz o navigationFiles cru do evento — com a URL pública de TODAS as
      // planilhas, de todas as categorias. Filtrar isso no front não adianta: o link
      // já teria saído no JSON. Aqui o array vira a versão segura (filtrada por
      // categoria, com o bloqueio calculado e SEM url do que está bloqueado).
      return (regs as any[]).map((reg) => {
        // Calcular número e horário de largada a partir da config
        let computedStartNumber = reg.startNumber as number | null;
        let computedStartTime = reg.startTime as string | null;

        const configs = configsByEvent.get(reg.eventId);
        if (configs) {
          const config = configs.find((c: any) => c.categoryId === reg.categoryId);
          if (config?.registrationOrder) {
            try {
              const order = typeof config.registrationOrder === 'string'
                ? JSON.parse(config.registrationOrder)
                : config.registrationOrder;
              if (Array.isArray(order)) {
                const idx = order.indexOf(reg.id);
                if (idx >= 0) {
                  computedStartNumber = config.numberStart + idx;
                  const [h, m, s] = config.startTime.split(':').map(Number);
                  const base = new Date();
                  base.setHours(h, m, s || 0, 0);
                  const t = new Date(base.getTime() + idx * config.intervalSeconds * 1000);
                  computedStartTime = `${String(t.getHours()).padStart(2, '0')}:${String(t.getMinutes()).padStart(2, '0')}`;
                }
              }
            } catch {}
          }
        }

        return {
          ...reg,
          startNumber: computedStartNumber,
          startTime: computedStartTime,
          eventNavigationFiles: sanitizeNavigationFiles(reg.eventNavigationFiles, {
            categoryId: reg.categoryId,
            registrationStatus: reg.status,
          }),
        };
      });
    }),

    /**
     * Download de planilha de navegação. O arquivo NUNCA é servido por link direto
     * enquanto bloqueado — o competidor pede por id e o servidor decide.
     * Devolve base64 (mesmo padrão do events.getLogoDataUrl); só cai pro link direto
     * se o arquivo for grande demais pro limite de resposta da Vercel.
     */
    getNavigationFile: protectedProcedure
      .input(z.object({ registrationId: z.number(), fileId: z.string() }))
      .mutation(async ({ ctx, input }) => {
        const user = ctx.user as any;
        const reg = await db.getRegistrationById(input.registrationId) as any;
        if (!reg) throw new TRPCError({ code: 'NOT_FOUND', message: 'Inscrição não encontrada' });

        const event = reg.eventId ? await db.getEventById(reg.eventId) as any : null;
        if (!event) throw new TRPCError({ code: 'NOT_FOUND', message: 'Evento não encontrado' });

        // Organizador do evento e admin baixam a qualquer hora (precisam conferir
        // a planilha antes de soltar). Mesmo padrão de ownership do assertStartOrderAccess.
        let bypass = user?.role === 'admin';
        if (!bypass) {
          const context = await db.getOrganizerContext(user);
          const organizer = await db.getOrganizerById(event.organizerId) as any;
          const principal = await db.getUserById(context.principalUserId) as any;
          bypass = !!organizer && organizer.ownerId === principal?.openId;
        }

        if (!bypass && reg.userId !== user.id) {
          throw new TRPCError({ code: 'FORBIDDEN', message: 'Esta inscrição não é sua' });
        }

        // Reusa exatamente a mesma regra do payload: o que não aparece lá não baixa aqui.
        const liberados = sanitizeNavigationFiles(event.navigationFiles, {
          categoryId: reg.categoryId,
          registrationStatus: reg.status,
          bypass,
        });
        const alvo = liberados.find(f => f.id === input.fileId);

        if (!alvo) {
          throw new TRPCError({ code: 'NOT_FOUND', message: 'Planilha não encontrada para esta inscrição' });
        }
        if (alvo.locked) {
          throw new TRPCError({
            code: 'FORBIDDEN',
            message: alvo.lockReason === 'payment'
              ? 'A planilha é liberada após a confirmação do pagamento da sua inscrição.'
              // Sempre horário de Brasília: aqui roda na Vercel, que está em UTC —
              // um toLocaleString cru anunciaria 13:00 pra planilha marcada às 10:00.
              : `Esta planilha só é liberada em ${formatarBrasilia(alvo.releaseAt)} (horário de Brasília).`,
          });
        }
        if (!alvo.url) {
          throw new TRPCError({ code: 'NOT_FOUND', message: 'Arquivo da planilha indisponível' });
        }

        try {
          const resp = await fetch(alvo.url);
          if (!resp.ok) throw new Error(`storage respondeu ${resp.status}`);
          const buf = Buffer.from(await resp.arrayBuffer());

          // base64 infla ~33%; acima disso estoura o limite de resposta da função.
          if (buf.length > 3 * 1024 * 1024) {
            return { name: alvo.name, dataUrl: null as string | null, url: alvo.url };
          }

          const contentType = resp.headers.get('content-type') || 'application/octet-stream';
          return {
            name: alvo.name,
            dataUrl: `data:${contentType};base64,${buf.toString('base64')}`,
            url: null as string | null,
          };
        } catch (err: any) {
          console.error('[registrations.getNavigationFile] Erro:', err.message);
          throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: 'Não foi possível baixar a planilha agora. Tente de novo.' });
        }
      }),
    updateMyRegistration: protectedProcedure
      .input(z.object({
        registrationId: z.number(),
        pilotName: z.string().optional(),
        pilotEmail: z.string().optional(),
        phone: z.string().optional(),
        pilotCpf: z.string().optional(),
        pilotAge: z.number().optional(),
        pilotShirtSize: z.string().optional(),
        navigatorName: z.string().nullable().optional(),
        navigatorEmail: z.string().nullable().optional(),
        navigatorCpf: z.string().nullable().optional(),
        navigatorShirtSize: z.string().nullable().optional(),
        vehicleBrand: z.string().nullable().optional(),
        vehicleModel: z.string().nullable().optional(),
        vehicleYear: z.number().nullable().optional(),
        vehicleColor: z.string().nullable().optional(),
        vehiclePlate: z.string().nullable().optional(),
        pilotCity: z.string().nullable().optional(),
        pilotState: z.string().nullable().optional(),
        navigatorCity: z.string().nullable().optional(),
        navigatorState: z.string().nullable().optional(),
        team: z.string().optional(),
        notes: z.string().optional(),
        purchasedProducts: z.array(z.object({
          productId: z.string(),
          name: z.string(),
          price: z.number(),
          quantity: z.number(),
          sizes: z.array(z.string()).optional(),
        })).optional(),
      }).passthrough())
      .mutation(async ({ ctx, input }) => {
        const { registrationId, ...data } = input;
        const reg = await db.getRegistrationById(registrationId);
        if (!reg || reg.userId !== ctx.user.id) {
          throw new TRPCError({ code: 'UNAUTHORIZED', message: 'Inscrição não encontrada ou sem permissão' });
        }

        // Ajusta estoque pela diferença entre a quantidade antiga e a nova de cada produto
        if (input.purchasedProducts) {
          const dbInstance = await getDb();
          if (dbInstance) {
            let oldProducts: any[] = [];
            try {
              oldProducts = typeof reg.purchasedProducts === 'string' ? JSON.parse(reg.purchasedProducts) : (reg.purchasedProducts as any) || [];
            } catch { }

            const oldQtyByProduct = new Map<string, number>();
            oldProducts.forEach((p: any) => oldQtyByProduct.set(p.productId, (oldQtyByProduct.get(p.productId) || 0) + p.quantity));

            const newQtyByProduct = new Map<string, number>();
            input.purchasedProducts.forEach(p => newQtyByProduct.set(p.productId, (newQtyByProduct.get(p.productId) || 0) + p.quantity));

            const allProductIds = new Set([...oldQtyByProduct.keys(), ...newQtyByProduct.keys()]);
            for (const productId of allProductIds) {
              const delta = (newQtyByProduct.get(productId) || 0) - (oldQtyByProduct.get(productId) || 0);
              if (delta !== 0) {
                await dbInstance.update(products)
                  .set({ stock: sql`${products.stock} - ${delta}` })
                  .where(eq(products.id, productId));
              }
            }
          }
        }

        return await db.updateRegistration(registrationId, {
          ...data,
          updatedAt: new Date()
        } as any);
      }),
    requestCancellation: protectedProcedure
      .input(z.object({ registrationId: z.number(), reason: z.string().optional() }))
      .mutation(async ({ ctx, input }) => {
        const reg = await db.getRegistrationById(input.registrationId) as any;
        if (!reg || reg.userId !== ctx.user.id) {
          throw new TRPCError({ code: 'UNAUTHORIZED', message: 'Inscrição não encontrada ou sem permissão' });
        }
        if (reg.status === 'cancelled') {
          throw new TRPCError({ code: 'BAD_REQUEST', message: 'Inscrição já está cancelada' });
        }

        // Buscar dados do evento para notificação
        const event = await db.getEventById(reg.eventId) as any;
        const organizer = event ? await db.getOrganizerById(event.organizerId) as any : null;
        const organizerUser = organizer ? await db.getUserByOpenId(organizer.ownerId) as any : null;

        const notifyEmail = event?.notificationEmail || organizerUser?.email || '';

        // Atualizar status da inscrição e salvar motivo
        await db.updateRegistration(input.registrationId, {
          status: 'cancellation_requested',
          cancellationReason: input.reason || null
        });

        console.log(`[requestCancellation] Solicitação de cancelamento recebida:`);
        console.log(`  Inscrição: #${reg.id} - Piloto: ${reg.pilotName} (${reg.pilotEmail})`);
        console.log(`  Motivo: ${input.reason || 'Não informado'}`);
        console.log(`  Evento: ${event?.name || reg.eventId}`);
        console.log(`  Notificar organizador em: ${notifyEmail || 'email não configurado'}`);

        // TODO: integrar envio de email real via nodemailer/resend quando SMTP for configurado
        return {
          success: true,
          message: 'Solicitação de cancelamento enviada ao organizador.',
          notifiedEmail: notifyEmail,
        };
      }),
    getStatistics: publicProcedure
      .input(z.object({ eventId: z.number() }))
      .query(async ({ input }) => {
        return await db.getRegistrationsStatistics(input.eventId);
      }),
    // Planilha Excel com o total de camisetas por tamanho (piloto + navegador
    // + extras compradas na loja). Junta tamanhos iguais ignorando caixa
    // (P=p, GG=gg) e mantém os infantis (infantil, Inf 2/6/8) separados.
    exportShirts: protectedProcedure
      .input(z.object({ eventId: z.number() }))
      .mutation(async ({ input }) => {
        const XLSX = await import('xlsx');
        const event = await db.getEventById(input.eventId) as any;
        if (!event) throw new TRPCError({ code: 'NOT_FOUND', message: 'Evento não encontrado' });

        const regs = await db.getRegistrationsByEventId(input.eventId) || [];

        // Busca estoque configurado + "usado" (inscrições + pedidos da loja, já calculado)
        const stockRows = await db.getShirtAvailability(input.eventId);
        const stockMap = new Map<string, { quantity: number; used: number; available: number }>();
        for (const s of stockRows) {
          stockMap.set(s.size, { quantity: s.quantity, used: s.used, available: s.available });
        }

        // Conta pedidos APENAS de inscrições (para tamanhos não no estoque)
        const regTotals = new Map<string, number>();
        for (const reg of regs as any[]) {
          if (reg.status === 'cancelled') continue;
          for (const size of shirtSizesOfRegistration(reg)) {
            regTotals.set(size, (regTotals.get(size) || 0) + 1);
          }
        }

        // "Pedidos" = used do estoque (inclui loja) se tiver estoque; senão só inscrições
        const getPedidos = (size: string) =>
          stockMap.has(size) ? (stockMap.get(size)!.used) : (regTotals.get(size) || 0);

        // Une todos os tamanhos presentes (estoque ou inscrições)
        const allSizes = new Set<string>([...stockMap.keys(), ...regTotals.keys()]);
        const rowsSorted = sortShirtSizes([...allSizes], (s) => s);
        const totalPedidos = rowsSorted.reduce((acc, s) => acc + getPedidos(s), 0);
        const totalProduzido = rowsSorted.reduce((acc, s) => acc + (stockMap.get(s)?.quantity || 0), 0);
        const totalDisponivel = rowsSorted.reduce((acc, s) => acc + (stockMap.get(s)?.available || 0), 0);

        const temEstoque = stockRows.length > 0;

        const aoa: any[][] = [
          [`Lista de Camisetas - ${event.name}`],
          [],
          temEstoque
            ? ['Tamanho', 'Pedidos', 'Produzido', 'Disponível']
            : ['Tamanho', 'Pedidos'],
          ...rowsSorted.map((size) => {
            const pedidos = getPedidos(size);
            if (temEstoque) {
              const st = stockMap.get(size);
              return [size, pedidos, st?.quantity ?? '', st?.available ?? ''];
            }
            return [size, pedidos];
          }),
          temEstoque
            ? ['TOTAL', totalPedidos, totalProduzido, totalDisponivel]
            : ['TOTAL', totalPedidos],
        ];

        const wb = XLSX.utils.book_new();
        const ws = XLSX.utils.aoa_to_sheet(aoa);
        ws['!cols'] = temEstoque
          ? [{ wch: 18 }, { wch: 12 }, { wch: 14 }, { wch: 14 }]
          : [{ wch: 18 }, { wch: 14 }];
        XLSX.utils.book_append_sheet(wb, ws, 'CAMISETAS');
        const buffer = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });

        return {
          success: true,
          data: Buffer.from(buffer).toString('base64'),
          filename: `camisetas-${String(event.name).replace(/\s+/g, '-')}.xlsx`,
        };
      }),
    updateStartInfo: protectedProcedure
      .input(z.object({
        registrationId: z.number(),
        startNumber: z.number().int().optional(),
        startTime: z.string().optional(),
      }))
      .mutation(async ({ ctx, input }) => {
        const { registrationId, ...data } = input;
        const user = ctx.user as any;
        const reg = await db.getRegistrationById(registrationId) as any;
        if (!reg) throw new TRPCError({ code: 'NOT_FOUND', message: 'Inscrição não encontrada' });
        const event = await db.getEventById(reg.eventId) as any;
        const organizer = event ? await db.getOrganizerById(event.organizerId) as any : null;

        const context = await db.getOrganizerContext(user);
        const principal = await db.getUserById(context.principalUserId) as any;

        if (!organizer || organizer.ownerId !== principal?.openId || (context.type === 'MEMBER' && !context.permissions.includes('registrations'))) {
          throw new TRPCError({ code: 'UNAUTHORIZED', message: 'Somente o organizador pode alterar informações de largada' });
        }
        return await db.updateRegistration(registrationId, {
          ...data,
          updatedAt: new Date()
        });
      }),
    updateFull: protectedProcedure
      .input(z.object({
        registrationId: z.number(),
        categoryId: z.number().optional(),
        status: z.enum(["pending", "paid", "cancelled", "cancellation_requested"]).optional(),
        pilotName: z.string().optional(),
        pilotEmail: z.string().optional(),
        pilotCpf: z.string().optional(),
        pilotCity: z.string().optional(),
        pilotState: z.string().optional(),
        pilotAge: z.number().nullable().optional(),
        pilotShirtSize: z.string().optional(),
        phone: z.string().nullable().optional(),
        navigatorName: z.string().nullable().optional(),
        navigatorEmail: z.string().nullable().optional(),
        navigatorCpf: z.string().nullable().optional(),
        navigatorCity: z.string().nullable().optional(),
        navigatorState: z.string().nullable().optional(),
        navigatorShirtSize: z.string().nullable().optional(),
        team: z.string().nullable().optional(),
        vehicleBrand: z.string().nullable().optional(),
        vehicleModel: z.string().nullable().optional(),
        vehicleYear: z.number().nullable().optional(),
        vehicleColor: z.string().nullable().optional(),
        vehiclePlate: z.string().nullable().optional(),
        notes: z.string().nullable().optional(),
        startNumber: z.number().int().nullable().optional(),
        startTime: z.string().nullable().optional(),
      }))
      .mutation(async ({ ctx, input }) => {
        const user = ctx.user as any;
        const context = await db.getOrganizerContext(user);

        if (context.type === 'MEMBER' && !context.permissions.includes('registrations')) {
          throw new TRPCError({ code: 'FORBIDDEN', message: 'Sem permissão para secretaria/inscrições' });
        }

        const { registrationId, ...data } = input;
        const reg = await db.getRegistrationById(registrationId) as any;
        if (!reg) throw new TRPCError({ code: 'NOT_FOUND', message: 'Inscrição não encontrada' });

        const event = await db.getEventById(reg.eventId) as any;
        const organizer = event ? await db.getOrganizerById(event.organizerId) as any : null;
        const principal = await db.getUserById(context.principalUserId) as any;

        if (!organizer || organizer.ownerId !== principal?.openId) {
          throw new TRPCError({ code: 'UNAUTHORIZED', message: 'Somente o organizador pode editar inscrições' });
        }

        // Trocar camiseta pelo painel também consome estoque — antes a trava
        // existia só na inscrição nova, então a edição furava o controle.
        // Compara o DEPOIS contra o ANTES: só o que aumenta precisa caber no
        // disponível (que já conta esta inscrição com os tamanhos antigos).
        const mexeuNaCamiseta =
          data.pilotShirtSize !== undefined ||
          data.navigatorShirtSize !== undefined ||
          data.status !== undefined;

        if (mexeuNaCamiseta && reg.eventId) {
          const novoStatus = data.status ?? reg.status;
          const antesValia = reg.status !== 'cancelled';
          const depoisVale = novoStatus !== 'cancelled';

          const depois = depoisVale
            ? shirtSizesOfRegistration({
                ...reg,
                pilotShirtSize: data.pilotShirtSize ?? reg.pilotShirtSize,
                navigatorShirtSize: data.navigatorShirtSize === undefined
                  ? reg.navigatorShirtSize
                  : data.navigatorShirtSize,
              })
            : [];
          // Inscrição cancelada não reserva nada hoje: nesse caso não há o que descontar.
          const antes = antesValia ? shirtSizesOfRegistration(reg) : [];

          const conflito = await db.checkShirtSizesAvailable(reg.eventId, depois, antes);
          if (conflito) {
            throw new TRPCError({
              code: 'BAD_REQUEST',
              message: `Estoque de camiseta esgotado para o tamanho ${conflito.size} (disponível: ${conflito.disponivel}, pedido: ${conflito.pedido}). Escolha outro tamanho ou aumente o estoque do evento.`,
            });
          }
        }

        // Registra histórico por campo alterado
        for (const [key, newValue] of Object.entries(data)) {
          if (newValue === undefined) continue;
          const oldValue = (reg as any)[key];
          const oldStr = oldValue === null || oldValue === undefined ? null : String(oldValue);
          const newStr = newValue === null ? null : String(newValue);
          if (oldStr !== newStr) {
            await db.createRegistrationHistory({
              registrationId,
              changedBy: context.principalUserId,
              fieldName: key,
              oldValue: oldStr,
              newValue: newStr,
            });
          }
        }

        return await db.updateRegistration(registrationId, {
          ...data,
          updatedAt: new Date(),
        } as any);
      }),
    getHistory: protectedProcedure
      .input(z.object({ registrationId: z.number() }))
      .query(async ({ ctx, input }) => {
        const user = ctx.user as any;

        // Autorização: Usuário deve ser o organizador do evento
        const reg = await db.getRegistrationById(input.registrationId) as any;
        if (!reg) throw new TRPCError({ code: 'NOT_FOUND', message: 'Inscrição não encontrada' });

        const event = await db.getEventById(reg.eventId) as any;
        const organizer = event ? await db.getOrganizerById(event.organizerId) as any : null;

        if (!organizer || organizer.ownerId !== user.openId) {
          throw new TRPCError({ code: 'UNAUTHORIZED', message: 'Somente o organizador pode visualizar o histórico' });
        }

        return await db.getRegistrationHistory(input.registrationId);
      }),
    delete: protectedProcedure
      .input(z.object({ registrationId: z.number() }))
      .mutation(async ({ ctx, input }) => {
        const user = ctx.user as any;
        const reg = await db.getRegistrationById(input.registrationId) as any;
        if (!reg) throw new TRPCError({ code: 'NOT_FOUND', message: 'Inscrição não encontrada' });

        const event = await db.getEventById(reg.eventId) as any;
        const organizer = event ? await db.getOrganizerById(event.organizerId) as any : null;

        if (!organizer || organizer.ownerId !== user.openId) {
          throw new TRPCError({ code: 'UNAUTHORIZED', message: 'Somente o organizador pode excluir inscrições' });
        }

        return await db.deleteRegistration(input.registrationId);
      }),
    getEventRegistrationsForSecretariat: protectedProcedure
      .input(z.object({ eventId: z.number() }))
      .query(async ({ ctx, input }) => {
        const user = ctx.user as any;
        const context = await db.getOrganizerContext(user);

        if (context.type === 'MEMBER' && !context.permissions.includes('registrations')) {
          throw new TRPCError({ code: 'FORBIDDEN', message: 'Sem permissão para secretaria/inscrições' });
        }

        const dbInstance = await getDb();
        if (!dbInstance) throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: 'Database fail' });

        return await dbInstance
          .select()
          .from(registrations)
          .where(eq(registrations.eventId, input.eventId))
          .orderBy(registrations.pilotName);
      }),
    toggleCheckinStatus: protectedProcedure
      .input(z.object({
        registrationId: z.number(),
        isCheckedIn: z.boolean().optional(),
        kitDelivered: z.boolean().optional(),
        waiverSigned: z.boolean().optional()
      }))
      .mutation(async ({ ctx, input }) => {
        const user = ctx.user as any;
        const context = await db.getOrganizerContext(user);

        if (context.type === 'MEMBER' && !context.permissions.includes('registrations')) {
          throw new TRPCError({ code: 'FORBIDDEN', message: 'Sem permissão para secretaria/inscrições' });
        }

        const dbInstance = await getDb();
        if (!dbInstance) throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: 'Database fail' });

        const { registrationId, ...updates } = input;

        if (Object.keys(updates).length > 0) {
          await dbInstance.update(registrations)
            .set(updates)
            .where(eq(registrations.id, registrationId));
        }

        return { success: true };
      }),
    markReceivedOffline: protectedProcedure
      .input(z.object({ registrationId: z.number() }))
      .mutation(async ({ ctx, input }) => {
        const user = ctx.user as any;
        const context = await db.getOrganizerContext(user);

        if (context.type === 'MEMBER' && !context.permissions.includes('registrations')) {
          throw new TRPCError({ code: 'FORBIDDEN', message: 'Sem permissão para secretaria/inscrições' });
        }

        const reg = await db.getRegistrationById(input.registrationId) as any;
        if (!reg) throw new TRPCError({ code: 'NOT_FOUND', message: 'Inscrição não encontrada' });
        if (reg.status === 'paid') {
          throw new TRPCError({ code: 'BAD_REQUEST', message: 'Inscrição já está confirmada' });
        }

        const category = await db.getCategoryById(reg.categoryId) as any;
        const extras = db.sumPurchasedProducts(reg.purchasedProducts);
        const amount = (category?.price || 0) + extras.total;
        const description = extras.label
          ? `Recebido por fora: ${reg.pilotName} (${extras.label})`
          : `Recebido por fora: ${reg.pilotName}`;

        await db.updateRegistration(reg.id, { status: 'paid' });

        await db.createTransaction({
          description,
          amount,
          type: 'INCOME',
          status: 'COMPLETED',
          date: new Date(),
          eventId: reg.eventId,
          userId: context.principalUserId,
        } as any);

        return { success: true };
      }),
    markConfirmedCourtesy: protectedProcedure
      .input(z.object({ registrationId: z.number() }))
      .mutation(async ({ ctx, input }) => {
        const user = ctx.user as any;
        const context = await db.getOrganizerContext(user);

        if (context.type === 'MEMBER' && !context.permissions.includes('registrations')) {
          throw new TRPCError({ code: 'FORBIDDEN', message: 'Sem permissão para secretaria/inscrições' });
        }

        const reg = await db.getRegistrationById(input.registrationId) as any;
        if (!reg) throw new TRPCError({ code: 'NOT_FOUND', message: 'Inscrição não encontrada' });
        if (reg.status === 'paid') {
          throw new TRPCError({ code: 'BAD_REQUEST', message: 'Inscrição já está confirmada' });
        }

        await db.updateRegistration(reg.id, { status: 'paid' });

        return { success: true };
      }),
  }),

  payments: router({
    /**
     * Dados da inscrição para a página pública de cobrança (/pagar/:hash).
     * Só o necessário para a pessoa se reconhecer e pagar — nada de CPF, e-mail
     * ou telefone, que o link não precisa expor.
     */
    getCobrancaByHash: publicProcedure
      .input(z.object({ accessHash: z.string().min(8) }))
      .query(async ({ input }) => {
        const reg = await db.getRegistrationByAccessHash(input.accessHash) as any;
        if (!reg) throw new TRPCError({ code: 'NOT_FOUND', message: 'Link de cobrança inválido ou expirado.' });

        const evento = await db.getEventById(reg.eventId) as any;
        const categoria = await db.getCategoryById(reg.categoryId) as any;
        const paiCategoria = categoria?.parentId ? await db.getCategoryById(categoria.parentId) as any : null;
        const extras = db.sumPurchasedProducts(reg.purchasedProducts);

        return {
          registrationId: reg.id,
          pilotName: reg.pilotName,
          navigatorName: reg.navigatorName,
          status: reg.status as string,
          categoryName: paiCategoria ? `${paiCategoria.name} - ${categoria?.name}` : (categoria?.name || '-'),
          categoryPrice: categoria?.price || 0,
          extrasLabel: extras.label || null,
          extrasTotal: extras.total || 0,
          total: (categoria?.price || 0) + (extras.total || 0),
          acceptsCreditCard: evento?.accepts_credit_card !== false,
          event: evento ? {
            name: evento.name,
            startDate: evento.startDate,
            location: [evento.location, evento.city, evento.state].filter(Boolean).join(' - '),
            logoUrl: evento.logoUrl || null,
          } : null,
        };
      }),

    getPaymentStatus: publicProcedure.input(z.object({ registrationId: z.number() })).query(async ({ input }) => {
      try {
        const reg = await db.getRegistrationById(input.registrationId) as any;
        if (!reg) return { status: 'pending', paid: false, success: true };
        if (reg.status === 'paid') return { status: 'confirmed', paid: true, success: true };

        const chargeId = reg.transactionId;
        if (chargeId && chargeId.startsWith('ch_')) {
          const apiKey = ENV.pagarmeApiKey;
          const chargeResp = await fetch(`https://api.pagar.me/core/v5/charges/${chargeId}`, {
            headers: { 'Authorization': `Basic ${Buffer.from(`${apiKey}:`).toString('base64')}` }
          });
          if (chargeResp.ok) {
            const charge = await chargeResp.json() as any;
            const chargePaid = charge.status === 'paid';
            if (chargePaid && reg.status !== 'paid') {
              await db.updateRegistration(reg.id, { status: 'paid' });
            }
            return {
              status: chargePaid ? 'confirmed' : (charge.status || 'pending'),
              paid: chargePaid,
              success: true
            };
          }
        }
        return { status: reg.status || 'pending', paid: reg.status === 'paid', success: true };
      } catch (err) {
        return { status: 'pending', paid: false, success: true };
      }
    }),
    // publicProcedure + gate explícito, para o link de cobrança funcionar sem login
    // (o competidor pendente costuma não lembrar a senha). Quem manda é o
    // assertPodePagarInscricao logo abaixo: sem login, só passa com o accessHash
    // da própria inscrição. Pedido avulso da loja (orderId) continua exigindo login.
    createPayment: publicProcedure
      .input(z.object({
        registrationId: z.number().optional(),
        orderId: z.string().uuid().optional(),
        /** Token do link de cobrança (registrations.accessHash), no lugar do login. */
        accessHash: z.string().optional(),
        paymentMethod: z.enum(['pix', 'credit_card']).default('pix'),
        cardData: z.object({
          number: z.string(),
          holder_name: z.string(),
          exp_month: z.number(),
          exp_year: z.number(),
          cvv: z.string(),
          installments: z.number().default(1),
          billingAddress: z.object({
            zipCode: z.string(),
            street: z.string(),
            number: z.string(),
            neighborhood: z.string(),
            city: z.string(),
            state: z.string(),
          }).optional(),
          bypassAntifraud: z.boolean().optional(),
        }).optional(),
      }))
      .mutation(async ({ ctx, input }) => {
        try {
          if (!input.registrationId && !input.orderId) {
            throw new Error("É necessário fornecer um ID de inscrição ou de pedido.");
          }

          await assertPodePagarInscricao(ctx, input);

          let reg: any = null;
          let category: any = null;
          let event: any = null;
          let standaloneOrder: any = null;
          let product: any = null;
          let totalAmountCents = 0;
          let organizerRecipientId: string | undefined;
          let organizerId: any = null;
          let descriptionStr = "";

          if (input.registrationId) {
            // Robust lookup for registrations
            const registration = await db.getRegistrationById(input.registrationId) as any;
            if (!registration) throw new Error("Inscrição não encontrada");
            reg = registration;

            const registrationEvent = await db.getEventById(registration.eventId) as any;
            if (!registrationEvent) throw new Error("Evento não encontrado");
            event = registrationEvent;

            category = await db.getCategoryById(registration.categoryId) as any;

            // Navigate event → organizer → user to get the recipientId
            organizerId = registrationEvent.organizerId;
            console.log(`[Split Debug] eventId=${registration.eventId}, organizerId=${organizerId}`);

            const organizer = organizerId ? await db.getOrganizerById(organizerId) as any : null;
            console.log(`[Split Debug] Organizer found:`, organizer ? `id=${organizer.id}, ownerId="${organizer.ownerId}"` : 'NULL ⚠️');

            if (organizer?.ownerId) {
              // Primary: lookup by openId (which is the email used at login)
              const organizerUser = await db.getUserByOpenId(organizer.ownerId) as any;
              console.log(`[Split Debug] OrganizerUser (by openId):`, organizerUser ? `id=${organizerUser.id}, email="${organizerUser.email}", recipientId="${organizerUser.recipientId || 'NULL'}"` : 'NOT FOUND ⚠️');
              organizerRecipientId = organizerUser?.recipientId || undefined;

              // Fallback: if openId lookup found user but no recipientId, try by numeric id if ownerId is numeric
              if (!organizerRecipientId && !isNaN(Number(organizer.ownerId))) {
                const userById = await db.getUserById(Number(organizer.ownerId)) as any;
                console.log(`[Split Debug] OrganizerUser (by numeric id fallback):`, userById ? `recipientId="${userById.recipientId || 'NULL'}"` : 'NOT FOUND');
                organizerRecipientId = userById?.recipientId || undefined;
              }
            }

            console.log(`[Split Debug] Final organizerRecipientId: "${organizerRecipientId || 'UNDEFINED — will use platform fallback'}"`);
            if (!organizerRecipientId) {
              console.warn(`[Split Debug] ⚠️ No recipientId for organizer. Fallback to platform ID. urgentFix: run setupRecipient for organizer ownerId="${organizer?.ownerId}"`);
            }

            descriptionStr = `Inscrição Evento: ${registrationEvent?.name || 'Evento'}`;

            let productsTotal = 0;
            if (registration.purchasedProducts) {
              try {
                const productsArray = typeof registration.purchasedProducts === 'string' ? JSON.parse(registration.purchasedProducts) : registration.purchasedProducts;
                if (Array.isArray(productsArray)) {
                  productsTotal = productsArray.reduce((sum, p) => sum + ((p.price || 0) * (p.quantity || 1)), 0);
                }
              } catch (e) {
                console.error("Error parsing purchasedProducts:", e);
              }
            }

            totalAmountCents = Math.round(((category.price || 150) + productsTotal) * 100);
          } else if (input.orderId) {
            // Robust lookup for standalone orders
            const dbInstance = await getDb();
            if (!dbInstance) throw new Error("Falha na conexão com banco");

            const results = await dbInstance.select({
              order: productOrders,
              product: products
            }).from(productOrders)
              .innerJoin(products, eq(productOrders.productId, products.id))
              .where(eq(productOrders.id, input.orderId))
              .limit(1);

            if (!results || results.length === 0) throw new Error("Pedido não encontrado");
            standaloneOrder = results[0].order;
            product = results[0].product;

            const productOwnerId = product.userId;
            organizerId = productOwnerId;
            console.log(`[Split Debug] Standalone order. productOwnerId=${productOwnerId}`);
            const organizerUser = await db.getUserById(productOwnerId) as any;
            console.log(`[Split Debug] OrganizerUser (standalone):`, organizerUser ? `email="${organizerUser.email}", recipientId="${organizerUser.recipientId || 'NULL ⚠️'}"` : 'NOT FOUND ⚠️');
            organizerRecipientId = organizerUser?.recipientId || undefined;

            event = standaloneOrder.eventId ? await db.getEventById(standaloneOrder.eventId) : null;
            descriptionStr = `Pedido Avulso: ${product.name} (Qtd: ${standaloneOrder.quantity})`;
            totalAmountCents = Math.round(standaloneOrder.totalAmount * 100);

            // Create pseudo-reg for Pagar.me customer
            // Note: Since standalone orders bypass CPF collection, we pull the authenticated user CPF if available or fallback to a standard bypassed valid CPF string to satisfy Pagar.me.
            const currentUser = ctx.user as any;

            reg = {
              id: standaloneOrder.id,
              pilotName: standaloneOrder.buyerName,
              pilotEmail: standaloneOrder.buyerEmail,
              pilotCpf: standaloneOrder.buyerCpf || currentUser?.cpf || "", // Use given CPF or fallback
              phone: standaloneOrder.buyerPhone || "11999999999",
              pilotCity: "São Paulo",
              pilotState: "SP"
            };
          }

          const platformRecipientId = ENV.pagarmePlatformRecipientId;
          const split: any[] = [];

          console.log(`[createPayment] ========== SPLIT DECISION ==========`);
          console.log(`[createPayment] organizerRecipientId = "${organizerRecipientId || 'NULL'}"`);
          console.log(`[createPayment] platformRecipientId  = "${platformRecipientId || 'NULL'}"`);
          console.log(`[createPayment] totalAmountCents     = ${totalAmountCents}`);
          console.log(`[createPayment] ====================================`);

          // Split logic: Prioritize Organizer (90%), fallback to Platform (10%), or throw error.
          if (organizerRecipientId && platformRecipientId && organizerRecipientId !== platformRecipientId) {
            // Split: 95% Organizer, 5% Platform
            const platformFeePercentage = 5;
            const platformAmount = Math.round(totalAmountCents * (platformFeePercentage / 100));
            const organizerAmount = totalAmountCents - platformAmount;

            split.push({
              amount: organizerAmount,
              recipient_id: organizerRecipientId,
              type: "flat",
              options: {
                charge_processing_fee: true,
                charge_remainder_fee: true,
                liable: true
              }
            });

            split.push({
              amount: platformAmount,
              recipient_id: platformRecipientId,
              type: "flat",
              options: {
                charge_processing_fee: false,
                charge_remainder_fee: false,
                liable: false
              }
            });
            console.log(`[createPayment] DYNAMIC SPLIT CONFIGURED: 95% -> ${organizerRecipientId}, 5% -> ${platformRecipientId}`);
          } else if (organizerRecipientId || platformRecipientId) {
            // Solo payment to whoever is available (Organizer takes priority)
            const finalRecipientId = organizerRecipientId || platformRecipientId;
            split.push({
              amount: totalAmountCents,
              recipient_id: finalRecipientId as string,
              type: "flat",
              options: {
                charge_processing_fee: true,
                charge_remainder_fee: true,
                liable: true
              }
            });
            console.log(`[createPayment] SOLO PAYMENT CONFIGURED: 100% -> ${finalRecipientId}`);
          } else {
            console.error('[createPayment] CRITICAL ERROR: No valid recipient (Organizer or Platform) found.');
            throw new Error("Transação interrompida: Organizador sem dados de pagamento e sem recebedor de plataforma configurado.");
          }

          const paymentPayload: any = {
            payment_method: input.paymentMethod,
          };

          if (input.paymentMethod === 'pix') {
            paymentPayload.pix = { expires_in: 7200 };
          } else if (input.paymentMethod === 'credit_card' && input.cardData) {
            paymentPayload.credit_card = {
              installments: input.cardData.installments,
              statement_descriptor: "AMIGO",
              card: {
                number: input.cardData.number.replace(/\D/g, ''),
                holder_name: input.cardData.holder_name,
                exp_month: input.cardData.exp_month,
                exp_year: input.cardData.exp_year,
                cvv: input.cardData.cvv,
                billing_address: {
                  street: input.cardData.billingAddress?.street || "Rua do Piloto",
                  number: input.cardData.billingAddress?.number || "S/N",
                  neighborhood: input.cardData.billingAddress?.neighborhood || "Centro",
                  zip_code: input.cardData.billingAddress?.zipCode?.replace(/\D/g, '') || "01001000",
                  city: input.cardData.billingAddress?.city || String(reg.pilotCity || "São Paulo"),
                  state: input.cardData.billingAddress?.state || String(reg.pilotState || "SP"),
                  country: "BR"
                }
              }
            };
          }

          console.log('[createPayment] Order Payload:', JSON.stringify({
            closed: true,
            items: [{
              amount: totalAmountCents,
              description: descriptionStr,
              quantity: 1,
              code: String(reg.id)
            }],
            customer: {
              name: String(reg.pilotName),
              email: String(reg.pilotEmail),
              ...(reg.pilotCpf ? { 
                document: String(reg.pilotCpf).replace(/\D/g, '').padStart(11, '0'),
                document_type: String(reg.pilotCpf).replace(/\D/g, '').length > 11 ? 'CNPJ' : 'CPF'
              } : {}),
              type: "individual",
              phones: {
                mobile_phone: {
                  country_code: "55",
                  area_code: String(reg.phone).replace(/\D/g, '').substring(0, 2) || "11",
                  number: String(reg.phone).replace(/\D/g, '').substring(2) || "999999999"
                }
              }
            },
            payments: [{
              ...paymentPayload,
              amount: totalAmountCents,
            }]
          }, null, 2));
          console.log('[createPayment] Split details:', JSON.stringify(split, null, 2));

          const bypass = !!input.cardData?.bypassAntifraud || !!input.orderId;
          const capturedIp = ctx.req.ip || (typeof ctx.req.headers['x-forwarded-for'] === 'string' ? ctx.req.headers['x-forwarded-for'].split(',')[0] : ctx.req.headers['x-forwarded-for']?.[0]) || ctx.req.socket.remoteAddress;

          // Se for localhost (::1 ou 127.0.0.1), Pagar.me pode bloquear. Melhor enviar o IP do servidor em produção ou deixar nulo se local.
          const finalIp = (capturedIp === '::1' || capturedIp === '127.0.0.1') ? '177.70.102.10' : capturedIp;

          console.log('[createPayment] Bypass Antifraud:', bypass, 'Is Standalone:', !!input.orderId);
          console.log('[createPayment] Final IP:', finalIp);

          // Deep merge the bypass flag into the credit_card object if it exists
          if (bypass && paymentPayload.credit_card) {
            paymentPayload.credit_card.antifraud_enabled = false;
          }

          const order = await pagarme.createOrder({
            closed: true,
            metadata: {
              registrationId: input.registrationId ? String(reg.id) : undefined,
              orderId: input.orderId ? String(reg.id) : undefined,
              pilotName: String(reg.pilotName),
              eventName: String(event?.name || 'S/N'),
              categoryName: category ? String(category.name) : 'Produto Avulso',
            },
            items: [{
              amount: totalAmountCents,
              description: descriptionStr,
              quantity: 1,
              code: String(reg.id)
            }],
            customer: {
              name: String(reg.pilotName),
              email: String(reg.pilotEmail),
              ...(reg.pilotCpf ? { 
                document: String(reg.pilotCpf).replace(/\D/g, '').padStart(11, '0'),
                document_type: String(reg.pilotCpf).replace(/\D/g, '').length > 11 ? 'CNPJ' : 'CPF'
              } : {}),
              type: "individual",
              ip: finalIp,
              phones: {
                mobile_phone: {
                  country_code: "55",
                  area_code: String(reg.phone).replace(/\D/g, '').substring(0, 2) || "11",
                  number: String(reg.phone).replace(/\D/g, '').substring(2) || "999999999"
                }
              },
              address: {
                street: input.cardData?.billingAddress?.street || "Rua do Piloto",
                number: input.cardData?.billingAddress?.number || "S/N",
                neighborhood: input.cardData?.billingAddress?.neighborhood || "Centro",
                zip_code: input.cardData?.billingAddress?.zipCode?.replace(/\D/g, '') || "01001000",
                city: input.cardData?.billingAddress?.city || String(reg.pilotCity || "São Paulo"),
                state: input.cardData?.billingAddress?.state || String(reg.pilotState || "SP"),
                country: "BR"
              }
            },
            shipping: {
              amount: 0,
              description: "Inscrição em Evento (Entrega Digital)",
              recipient_name: String(reg.pilotName),
              recipient_phone: String(reg.phone).replace(/\D/g, '').substring(0, 11) || "11999999999",
              address: {
                street: input.cardData?.billingAddress?.street || "Rua do Piloto",
                number: input.cardData?.billingAddress?.number || "S/N",
                neighborhood: input.cardData?.billingAddress?.neighborhood || "Centro",
                zip_code: input.cardData?.billingAddress?.zipCode?.replace(/\D/g, '') || "01001000",
                city: input.cardData?.billingAddress?.city || String(reg.pilotCity || "São Paulo"),
                state: input.cardData?.billingAddress?.state || String(reg.pilotState || "SP"),
                country: "BR"
              }
            },
            payments: [{
              ...paymentPayload,
              amount: totalAmountCents,
              antifraud_enabled: bypass ? false : true,
              ...(split.length > 0 ? { split } : {}),
            }]
          });

          const charge = order.charges?.[0];
          const transaction = charge?.last_transaction;

          console.log('[createPayment] Order created:', order.id, 'Status:', charge?.status);
          if (charge?.status === 'failed') {
            console.error('[createPayment] Charge FAILED. Gateway Response:', JSON.stringify(transaction?.gateway_response, null, 2));
          }

          if (charge) {
            // Para cartão de crédito, o Pagar.me aprova na hora (status 'paid' ou 'authorized').
            // Não esperamos o webhook — marcamos a inscrição como paga imediatamente.
            const isPaidNow = charge.status === 'paid' || charge.status === 'authorized';

            if (input.registrationId) {
              const regUpdate: any = { transactionId: charge.id, qrCode: transaction?.qr_code_url || null };
              if (isPaidNow) {
                regUpdate.status = 'paid';
                console.log('[createPayment] Cartão aprovado sincronamente. Marcando inscrição', input.registrationId, 'como PAGA diretamente.');
              }
              await db.updateRegistration(input.registrationId, regUpdate);

              // Atualiza também o registro de pagamento local se existir
              if (isPaidNow) {
                const payment = await db.getPaymentByRegistrationId(input.registrationId);
                if (payment) await db.updatePaymentStatus(payment.id, 'confirmed');
              }
            } else if (input.orderId && standaloneOrder) {
              const dbInstance = await getDb();
              if (dbInstance) {
                const orderUpdate: any = { transactionId: charge.id, qrCode: transaction?.qr_code_url || null };
                if (isPaidNow) orderUpdate.status = 'PAID';
                await dbInstance.update(productOrders).set(orderUpdate).where(eq(productOrders.id, standaloneOrder.id));
              }
            }

            return {
              success: true,
              chargeId: charge.id,
              status: charge.status, // authorized, paid, pending, failed
              paymentMethod: input.paymentMethod,
              pixCode: transaction?.qr_code,
              pixQrCodeUrl: transaction?.qr_code_url,
              gatewayResponse: charge.last_transaction?.gateway_response,
              acquirerMessage: transaction?.acquirer_message || charge.last_transaction?.acquirer_message,
              acquirerReturnCode: transaction?.acquirer_return_code || charge.last_transaction?.acquirer_return_code,
            };
          }
          return { success: false, message: "Não foi possível criar a cobrança" };
        } catch (error: any) {
          console.error("[createPayment Error]:", error);
          return {
            success: false,
            message: error.message || "Erro ao processar pagamento",
            error: true
          };
        }
      }),
    setupRecipient: protectedProcedure.input(z.any()).mutation(async ({ ctx, input }) => {
      try {
        console.log('[setupRecipient] Initiating for User:', ctx.user.id, 'Email:', ctx.user.email);
        console.log('[setupRecipient] Input Data:', JSON.stringify(input, null, 2));
        const user = ctx.user;

        // 1. Check for existing recipient by document — ALWAYS create a new one for this user.
        //    CRITICAL: DO NOT reuse a recipient found by document — it might belong to another person!
        //    The getRecipientByDocument API returns ANY recipient with that doc, regardless of owner.
        let recipientId = "";
        const cleanDoc = String(input.document).replace(/\D/g, '');
        console.log('[setupRecipient] Document:', cleanDoc, '- Will always create a new recipient for this user.');

        // Check if user already has a valid recipientId that is NOT from the wrong person
        const currentUserData = await db.getUserByOpenId((user as any).openId) as any;
        if (currentUserData?.recipientId) {
          // Verify in Pagar.me that this recipientId actually belongs to THIS document
          console.log('[setupRecipient] User already has recipientId:', currentUserData.recipientId, '- verifying ownership...');
          // We'll still create a new one with the bank data — this ensures correct account
          console.log('[setupRecipient] Overwriting with fresh recipient to ensure correct bank data.');
        }

        const recipientData = {
          name: input.bankAccount.legal_name || (user as any).name || 'Organizador',
          email: (user as any).email,
          document: cleanDoc,
          type: cleanDoc.length > 11 ? 'company' : 'individual',
          phone: String(input.phone || '11999999999').replace(/\D/g, ''),
          bankAccount: {
            holderName: input.bankAccount.legal_name || (user as any).name || 'Organizador',
            holderType: cleanDoc.length > 11 ? 'company' : 'individual',
            holderDocument: cleanDoc,
            bank: input.bankAccount.bank_code,
            branchNumber: input.bankAccount.agencia,
            branchCheckDigit: input.bankAccount.agencia_dv || '',
            accountNumber: input.bankAccount.conta,
            accountCheckDigit: input.bankAccount.conta_dv || '',
            type: (input.bankAccount.type === 'conta_corrente' || input.bankAccount.type === 'checking') ? 'checking' : 'savings'
          }
        };

        console.log('[setupRecipient] Creating recipient in Pagar.me:', JSON.stringify(recipientData, null, 2));
        const result = await pagarme.createRecipient(recipientData as any);
        recipientId = result.recipientId;
        console.log('[setupRecipient] Recipient Created Successfully:', recipientId);

        // 3. Persist to Local Database
        const dbData = {
          bankDocument: cleanDoc,
          bankCode: input.bankAccount.bank_code,
          bankAgency: input.bankAccount.agencia,
          bankAgencyDv: input.bankAccount.agencia_dv || '',
          bankAccount: input.bankAccount.conta,
          bankAccountDv: input.bankAccount.conta_dv || '',
          bankAccountType: input.bankAccount.type,
          bankHolderName: input.bankAccount.legal_name,
          bankHolderDocument: cleanDoc,
          pixKey: input.pixKey,
          phone: input.phone,
          recipientId: recipientId
        };

        console.log('[setupRecipient] Saving to Database for User ID:', ctx.user.id);
        const updateResult = await db.updateUserBankData(ctx.user.id, dbData);
        console.log('[setupRecipient] Database Update Result:', JSON.stringify(updateResult, null, 2));

        return { success: true, recipientId };
      } catch (err: any) {
        console.error('[setupRecipient] CRITICAL ERROR:', err.message);
        throw new TRPCError({
          code: 'INTERNAL_SERVER_ERROR',
          message: err.message || 'Erro ao sincronizar dados bancários com Pagar.me'
        });
      }
    }),

    getPayables: protectedProcedure
      .input(z.object({
        recipientId: z.string().optional(),
        transactionId: z.string().optional(),
        page: z.number().min(1).optional().default(1),
        size: z.number().min(1).max(100).optional().default(20),
      }))
      .query(async ({ ctx, input }) => {
        try {
          const user = ctx.user as any;

          // Se não passou recipientId explícito, usa o do usuário logado
          const recipientId = input.recipientId || user.recipientId || undefined;

          if (!recipientId && !input.transactionId) {
            return { data: [], total: 0, paging: {}, error: 'Informe recipientId ou transactionId' };
          }

          const result = await pagarme.getPayables({
            recipientId,
            transactionId: input.transactionId,
            page: input.page,
            size: input.size,
          });

          return result;
        } catch (err: any) {
          console.error('[payments.getPayables] Erro:', err.message);
          throw new TRPCError({
            code: 'INTERNAL_SERVER_ERROR',
            message: err.message || 'Erro ao buscar payables',
          });
        }
      }),
  }),

  organizers: router({
    list: publicProcedure.query(async () => {
      return await db.getAllOrganizers();
    }),
    create: protectedProcedure
      .input(z.object({
        name: z.string().min(1),
        description: z.string().optional(),
      }))
      .mutation(async ({ ctx, input }) => {
        await db.createOrganizer({
          name: input.name,
          description: input.description || "",
          ownerId: (ctx.user as any).openId,
          active: true,
        } as any);
        return { success: true };
      }),
    myOrganizers: protectedProcedure.query(async ({ ctx }) => {
      const user = ctx.user as any;
      const organizer = await db.getOrganizerByOwnerId(user.openId);
      if (!organizer) return [];
      return [{
        ...organizer,
        bankData: { status: (organizer as any).recipientId ? 'configured' : 'pending' },
        status: 'active'
      }];
    }),
    updatePagSeguroEmail: protectedProcedure
      .input(z.object({ email: z.string().email() }))
      .mutation(async ({ ctx, input }) => {
        const user = ctx.user as any;
        const organizer = await db.getOrganizerByOwnerId(user.openId);
        if (!organizer) throw new TRPCError({ code: 'NOT_FOUND', message: 'Organizador não encontrado' });

        return await db.updateOrganizer(organizer.id, { pagseguroEmail: input.email });
      }),
  }),

  admin: router({
    listUsers: adminProcedure.query(async () => await db.getAllUsers()),
    listAllEvents: adminProcedure.query(async () => {
      return await db.getAllEvents();
    }),
    getDashboardStats: adminProcedure.query(async () => {
      const allUsers = await db.getAllUsers();
      const allEvents = await db.getAllEvents();
      const allPayments = await db.getAllPayments();

      const confirmedPayments = allPayments.filter(p => p.status === 'confirmed');
      const totalRevenue = confirmedPayments.reduce((acc, p) => acc + (p.value || 0), 0);

      // Basic grouping by status
      const eventsByStatus = allEvents.reduce((acc: any[], event) => {
        const status = event.status || 'unknown';
        const existing = acc.find(a => a.status === status);
        if (existing) {
          existing.count++;
        } else {
          acc.push({ status, count: 1 });
        }
        return acc;
      }, []);

      return {
        totalUsers: allUsers.length,
        totalEvents: allEvents.length,
        totalRegistrations: confirmedPayments.length,
        totalRevenue: totalRevenue,
        eventsByStatus,
        registrationsByMonth: [], // Simple placeholder or implement grouping if needed
      };
    }),
    updateUserRole: adminProcedure
      .input(z.object({ userId: z.number(), role: z.enum(['user', 'admin', 'participant', 'organizer']) }))
      .mutation(async ({ input }) => {
        await db.updateUserRole(input.userId, input.role);
        return { success: true };
      }),
    deleteEvent: adminProcedure
      .input(z.object({ eventId: z.number() }))
      .mutation(async ({ input }) => {
        await db.deleteEvent(input.eventId);
        return { success: true };
      }),
  }),

  organizerRequests: router({
    list: adminProcedure.query(async () => {
      return await db.getAllOrganizerRequests();
    }),
    myRequests: protectedProcedure.query(async ({ ctx }) => {
      return await db.getOrganizerRequestsByUserId(ctx.user.id);
    }),
    create: protectedProcedure
      .input(z.object({
        organizerName: z.string().min(1),
        description: z.string().optional(),
        contactEmail: z.string().email(),
        contactPhone: z.string().optional(),
      }))
      .mutation(async ({ ctx, input }) => {
        return await db.createOrganizerRequest({
          ...input,
          userId: ctx.user.id,
          status: 'pending',
        } as any);
      }),
    approve: adminProcedure
      .input(z.object({ requestId: z.number() }))
      .mutation(async ({ input }) => {
        const request = await db.getOrganizerRequestById(input.requestId);
        if (!request) throw new TRPCError({ code: 'NOT_FOUND', message: 'Solicitação não encontrada' });

        await db.updateOrganizerRequest(input.requestId, { status: 'approved' });
        await db.updateUserRole(request.userId, 'organizer');

        // Also ensure organizer record exists
        const user = await db.getUserById(request.userId);
        if (user) {
          const existing = await db.getOrganizerByOwnerId(user.openId);
          if (!existing) {
            await db.createOrganizer({
              name: request.organizerName,
              description: request.description || '',
              ownerId: user.openId,
              active: true
            });
          }
        }

        return { success: true };
      }),
    reject: adminProcedure
      .input(z.object({ requestId: z.number(), reason: z.string().optional() }))
      .mutation(async ({ input }) => {
        await db.updateOrganizerRequest(input.requestId, { status: 'rejected' });
        return { success: true };
      }),
  }),

  vehicles: router({
    list: protectedProcedure.query(async ({ ctx }) => {
      const user = ctx.user as any;
      return await db.getVehiclesByOwnerId(user.openId) || [];
    }),
    create: protectedProcedure
      .input(z.object({
        brand: z.string(),
        model: z.string(),
        plate: z.string(),
        year: z.number().optional(),
        color: z.string().optional(),
      }))
      .mutation(async ({ ctx, input }) => {
        const user = ctx.user as any;
        return await db.createVehicle({
          ...input,
          ownerId: user.openId,
        } as any);
      }),
  }),

  gallery: router({
    listByEvent: publicProcedure
      .input(z.object({ eventId: z.number() }))
      .query(async ({ input }) => {
        return await db.getEventImagesByEventId(input.eventId);
      }),

    addImage: protectedProcedure
      .input(z.object({
        eventId: z.number(),
        imageUrl: z.string().min(1),
        caption: z.string().optional(),
        displayOrder: z.number().optional(),
      }))
      .mutation(async ({ input }) => {
        await db.createEventImage({
          eventId: input.eventId,
          imageUrl: input.imageUrl,
          caption: input.caption || null,
          displayOrder: input.displayOrder ?? 0,
        });
        return { success: true };
      }),

    deleteImage: protectedProcedure
      .input(z.object({ imageId: z.number() }))
      .mutation(async ({ input }) => {
        await db.deleteEventImage(input.imageId);
        return { success: true };
      }),
  }),

  upload: router({
    image: protectedProcedure
      .input(z.object({
        base64: z.string(),
        fileName: z.string(),
        contentType: z.string(),
      }))
      .mutation(async ({ input }) => {
        const { base64, fileName, contentType } = input;
        const buffer = Buffer.from(base64.split(',')[1], 'base64');
        // Nome do arquivo vira parte da URL pública. Sem sanitizar, "WhatsApp Image
        // 2026-07-11 at 17.51.48.jpeg" gera URL com ESPAÇO — o <img src> quebra em
        // cliente de e-mail (foi assim que a logo sumiu no e-mail do Gmail).
        // Mesma normalização do uploadRoute.ts e do storage.getSignedUrl.
        const safeName = fileName.replace(/[^a-zA-Z0-9.-]/g, "_");
        const relativePath = `uploads/${Date.now()}-${safeName}`;

        try {
          // Try official storage first
          await storage.storagePut(relativePath, buffer, { contentType });
          const url = await storage.storageGet(relativePath);
          return { url };
        } catch (error) {
          console.warn("Storage proxy failed, using fallback:", error instanceof Error ? error.message : error);

          // Fallback Plan B: Save locally to public/uploads if possible
          try {
            const publicUploadsDir = path.resolve(process.cwd(), "public", "uploads");
            if (!fs.existsSync(publicUploadsDir)) {
              fs.mkdirSync(publicUploadsDir, { recursive: true });
            }
            const localPath = path.join(publicUploadsDir, path.basename(relativePath));
            fs.writeFileSync(localPath, buffer);
            return { url: `/uploads/${path.basename(relativePath)}` };
          } catch (localError) {
            console.error("Local save also failed, returning Base64:", localError);
            // Last resort: Return Base64 (Data URL)
            return { url: base64 };
          }
        }
      }),
  }),

  startOrder: router({
    getByEvent: protectedProcedure
      .input(z.object({ eventId: z.number() }))
      .query(async ({ ctx, input }) => {
        await assertStartOrderAccess(ctx.user, input.eventId);
        try {
          return await db.getStartOrderConfigByEvent(input.eventId);
        } catch (error) {
          console.error(`[startOrder.getByEvent] Erro para eventId ${input.eventId}:`, error);
          throw new TRPCError({
            code: 'INTERNAL_SERVER_ERROR',
            message: 'Erro ao buscar configurações de largada'
          });
        }
      }),

    upsert: protectedProcedure
      .input(startOrderConfigInput.extend({ eventId: z.number() }))
      .mutation(async ({ ctx, input }) => {
        await assertStartOrderAccess(ctx.user, input.eventId);
        const { eventId, ...config } = input;
        return await db.upsertStartOrderConfigs(eventId, [toStartOrderDbConfig(config) as any]);
      }),

    upsertBatch: protectedProcedure
      .input(z.object({
        eventId: z.number(),
        configs: z.array(startOrderConfigInput),
      }))
      .mutation(async ({ ctx, input }) => {
        await assertStartOrderAccess(ctx.user, input.eventId);
        const dbConfigs = input.configs.map(toStartOrderDbConfig);
        return await db.upsertStartOrderConfigs(input.eventId, dbConfigs as any);
      }),

    exportStartList: protectedProcedure
      .input(z.object({ eventId: z.number() }))
      .mutation(async ({ ctx, input }) => {
        const event = await assertStartOrderAccess(ctx.user, input.eventId);
        const ExcelJS = (await import('exceljs')).default;

        // Buscar configurações de ordem de largada
        let configs = await db.getStartOrderConfigsByEventId(input.eventId);

        // Buscar todas as inscrições confirmadas
        const registrations = await db.getRegistrationsByEventId(input.eventId);
        const confirmedRegistrations = registrations.filter(r => r.status !== 'cancelled');

        // Buscar categorias
        const categories = await db.getCategoriesByEventId(input.eventId);
        const categoryMap = new Map(categories.map(c => [c.id, c]));

        // Criar mapa de inscritos por categoria
        const registrationsByCategory = new Map<number, any[]>();
        for (const reg of confirmedRegistrations) {
          if (!registrationsByCategory.has(reg.categoryId)) {
            registrationsByCategory.set(reg.categoryId, []);
          }
          registrationsByCategory.get(reg.categoryId)!.push(reg);
        }

        // Preparar dados para a planilha
        const startListData: any[] = [];

        for (const config of configs) {
          let categoryRegsCount = (registrationsByCategory.get(config.categoryId) || []).length;
          // Nunca truncar: se entraram mais inscritos que a faixa configurada, lista todos mesmo assim
          const numSlots = Math.max(config.numberEnd - config.numberStart + 1, categoryRegsCount);
          const [hours, minutes] = config.startTime.split(':').map(Number);
          const baseTime = new Date();
          baseTime.setHours(hours, minutes, 0, 0);

          let categoryRegistrations = registrationsByCategory.get(config.categoryId) || [];

          // Se tem registrationOrder, ordenar os pilotos de acordo
          if (config.registrationOrder) {
            try {
              const order = typeof config.registrationOrder === 'string'
                ? JSON.parse(config.registrationOrder)
                : config.registrationOrder;
              if (Array.isArray(order) && order.length > 0) {
                const orderMap = new Map<number, number>(order.map((regId: number, index: number) => [regId, index]));
                categoryRegistrations = categoryRegistrations.sort((a, b) => {
                  const indexA = (orderMap.get(a.id) ?? 999) as number;
                  const indexB = (orderMap.get(b.id) ?? 999) as number;
                  return indexA - indexB;
                });
              }
            } catch (e) { }
          }

          for (let i = 0; i < numSlots; i++) {
            const currentNumber = config.numberStart + i;
            const currentTime = new Date(baseTime.getTime() + (i * config.intervalSeconds * 1000));
            const timeStr = currentTime.toTimeString().slice(0, 5);

            const registration = categoryRegistrations[i];
            const category = categoryMap.get(config.categoryId);
            const parentCategory = category?.parentId ? categoryMap.get(category.parentId) : null;
            const categoryName = parentCategory
              ? `${parentCategory.name} - ${category?.name}`
              : category?.name || 'N/A';

            startListData.push({
              'Nº': currentNumber,
              'Horário': timeStr,
              'Categoria': categoryName,
              'Piloto': registration?.pilotName || '',
              'Cidade/UF Piloto': registration ? `${registration.pilotCity || ''}/${registration.pilotState || ''}` : '',
              'Navegador': registration?.navigatorName || '',
              'Cidade/UF Navegador': registration ? `${registration.navigatorCity || ''}/${registration.navigatorState || ''}` : '',
              'Equipe': registration?.team || '',
              'Veículo': registration ? `${registration.vehicleBrand || ''} ${registration.vehicleModel || ''}` : '',
            });
          }
        }

        startListData.sort((a, b) => a['Nº'] - b['Nº']);

        const workbook = new (ExcelJS as any).Workbook();
        const worksheet = workbook.addWorksheet('Lista de Largada');

        worksheet.columns = [
          { header: 'Nº', key: 'Nº', width: 8 },
          { header: 'Horário', key: 'Horário', width: 10 },
          { header: 'Categoria', key: 'Categoria', width: 20 },
          { header: 'Piloto', key: 'Piloto', width: 30 },
          { header: 'Cidade/UF Piloto', key: 'Cidade/UF Piloto', width: 25 },
          { header: 'Navegador', key: 'Navegador', width: 30 },
          { header: 'Cidade/UF Navegador', key: 'Cidade/UF Navegador', width: 25 },
          { header: 'Equipe', key: 'Equipe', width: 25 },
          { header: 'Veículo', key: 'Veículo', width: 30 },
        ];

        const buffer = await workbook.xlsx.writeBuffer();
        return {
          success: true,
          data: Buffer.from(buffer).toString('base64'),
          filename: `lista-largada-${event.name.replace(/\s+/g, '-')}.xlsx`
        };
      }),

    exportKraken: protectedProcedure
      .input(z.object({ eventId: z.number() }))
      .mutation(async ({ ctx, input }) => {
        const event = await assertStartOrderAccess(ctx.user, input.eventId);
        const XLSX = await import('xlsx');

        const configs = await db.getStartOrderConfigsByEventId(input.eventId);
        const registrations = await db.getRegistrationsByEventId(input.eventId);
        const categories = await db.getCategoriesByEventId(input.eventId);
        const categoryMap = new Map(categories.map(c => [c.id, c]));

        const registrationsByCategory = new Map<number, any[]>();
        for (const reg of registrations) {
          if (!registrationsByCategory.has(reg.categoryId)) registrationsByCategory.set(reg.categoryId, []);
          registrationsByCategory.get(reg.categoryId)!.push(reg);
        }

        const data: any[] = [];
        for (const config of configs) {
          let catRegs = registrationsByCategory.get(config.categoryId) || [];
          // Nunca truncar: se entraram mais inscritos que a faixa configurada, lista todos mesmo assim
          const numSlots = Math.max(config.numberEnd - config.numberStart + 1, catRegs.length);
          const [hours, minutes] = config.startTime.split(':').map(Number);
          const baseTime = new Date();
          baseTime.setHours(hours, minutes, 0, 0);
          if (config.registrationOrder) {
            try {
              const order = typeof config.registrationOrder === 'string' ? JSON.parse(config.registrationOrder) : config.registrationOrder;
              const orderMap = new Map<number, number>(order.map((id: number, idx: number) => [id, idx]));
              catRegs = catRegs.sort((a: any, b: any) => {
                const indexA = (orderMap.get(a.id) ?? 999) as number;
                const indexB = (orderMap.get(b.id) ?? 999) as number;
                return indexA - indexB;
              });
            } catch (e) { }
          }

          for (let i = 0; i < numSlots; i++) {
            const reg = catRegs[i];
            const cat = categoryMap.get(config.categoryId);
            const parent = cat?.parentId ? categoryMap.get(cat.parentId) : null;
            const time = new Date(baseTime.getTime() + (i * config.intervalSeconds * 1000)).toTimeString().slice(0, 5);

            data.push({
              // Modelo Kraken separa categoria e subcategoria em colunas distintas
              'CATEGORIA': (parent ? parent.name : cat?.name) || 'N/A',
              'NÚMERO': config.numberStart + i,
              'HORA LARGADA': time,
              'NOME PILOTO': reg?.pilotName || '',
              'EMAIL PILOTO': reg?.pilotEmail || '',
              'CPF PILOTO': reg?.pilotCpf || '',
              'CIDADE PILOTO': reg?.pilotCity || '',
              'ESTADO PILOTO': reg?.pilotState || '',
              'NOME NAVEGADOR': reg?.navigatorName || '',
              'EMAIL NAVEGADOR': reg?.navigatorEmail || '',
              'CPF NAVEGADOR': reg?.navigatorCpf || '',
              'CIDADE NAVEGADOR': reg?.navigatorCity || '',
              'ESTADO NAVEGADOR': reg?.navigatorState || '',
              'EQUIPE': reg?.team || '',
              'PATROCINADOR': '',
              'VEÍCULO': reg ? `${reg.vehicleBrand || ''} ${reg.vehicleModel || ''}` : '',
              'D1': '',
              'D2': '',
              'SUBCATEGORIA': parent ? (cat?.name || '') : '',
            });
          }
        }

        const wb = XLSX.utils.book_new();
        const ws = XLSX.utils.json_to_sheet(data);
        XLSX.utils.book_append_sheet(wb, ws, 'INSCRIÇÕES');
        const buffer = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });

        return {
          success: true,
          data: Buffer.from(buffer).toString('base64'),
          filename: `kraken-${event.name.replace(/\s+/g, '-')}.xlsx`
        };
      }),

    exportEventList: protectedProcedure
      .input(z.object({ eventId: z.number() }))
      .mutation(async ({ ctx, input }) => {
        const event = await assertStartOrderAccess(ctx.user, input.eventId);
        const XLSX = await import('xlsx');

        const regs = await db.getRegistrationsByEventId(input.eventId);
        const configs = await db.getStartOrderConfigsByEventId(input.eventId);
        const categories = await db.getCategoriesByEventId(input.eventId);
        const categoryMap = new Map(categories.map(c => [c.id, c]));

        const regNumMap = new Map<number, number>();
        for (const config of configs) {
          if (config.registrationOrder) {
            try {
              const order = JSON.parse(config.registrationOrder as string);
              order.forEach((id: number, i: number) => regNumMap.set(id, config.numberStart + i));
            } catch (e) { }
          }
        }

        const data = regs.map(reg => {
          const cat = categoryMap.get(reg.categoryId);
          const parent = cat?.parentId ? categoryMap.get(cat.parentId) : null;
          return {
            'Nº Largada': regNumMap.get(reg.id) || '-',
            'Categoria': parent ? `${parent.name} - ${cat?.name}` : cat?.name || 'N/A',
            'Piloto': reg.pilotName,
            'CPF Piloto': reg.pilotCpf,
            'Camiseta Piloto': reg.pilotShirtSize,
            'Navegador': reg.navigatorName || '',
            'CPF Navegador': reg.navigatorCpf || '',
            'Camiseta Navegador': reg.navigatorShirtSize || '',
            'Equipe': reg.team || '',
            'Status': reg.status === 'paid' ? 'Pago' : 'Pendente',
          };
        }).sort((a, b) => (typeof a['Nº Largada'] === 'number' ? a['Nº Largada'] : 9999) - (typeof b['Nº Largada'] === 'number' ? b['Nº Largada'] : 9999));

        const wb = XLSX.utils.book_new();
        const ws = XLSX.utils.json_to_sheet(data);
        XLSX.utils.book_append_sheet(wb, ws, 'Inscritos');
        const buffer = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });

        return {
          success: true,
          data: Buffer.from(buffer).toString('base64'),
          filename: `lista-evento-${event.name.replace(/\s+/g, '-')}.xlsx`
        };
      }),
  }),

  participants: router({
    getPassportByHash: publicProcedure
      .input(z.object({ accessHash: z.string() }))
      .query(async ({ input }) => {
        const dbClient = await getDb();
        if (!dbClient) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database Error" });

        const [reg] = await dbClient.select().from(registrations).where(eq(registrations.accessHash, input.accessHash));
        if (!reg) throw new TRPCError({ code: "NOT_FOUND", message: "Passaporte não encontrado. Verifique se o link está correto." });

        const event = await db.getEventById(reg.eventId);
        if (!event) throw new TRPCError({ code: "NOT_FOUND", message: "Evento não encontrado" });

        const categories = await db.getCategoriesByEventId(reg.eventId);
        const category = categories.find(c => c.id === reg.categoryId);

        // Fetch payment status
        const [payment] = await dbClient.select().from(payments).where(eq(payments.registrationId, reg.id)).orderBy(sql`${payments.createdAt} DESC`);

        return {
          event: {
            name: event.name,
            date: event.startDate,
            location: event.location,
            city: event.city,
            state: event.state
          },
          registration: {
            id: reg.id,
            pilotName: reg.pilotName,
            pilotCpf: reg.pilotCpf,
            navigatorName: reg.navigatorName,
            categoryName: category?.name || "Desconhecida",
            vehicle: `${reg.vehicleBrand || ''} ${reg.vehicleModel || ''}`.trim(),
            startNumber: reg.startNumber
          },
          products: reg.purchasedProducts,
          financial: {
            status: payment?.status || reg.status
          },
          secretariat: {
            isCheckedIn: reg.isCheckedIn,
            kitDelivered: reg.kitDelivered,
            waiverSigned: reg.waiverSigned
          }
        };
      }),

    getParticipantHistoryByCpf: publicProcedure
      .input(z.object({ cpf: z.string() }))
      .query(async ({ input }) => {
        const dbClient = await getDb();
        if (!dbClient) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database Error" });

        const history = await dbClient.select({
          id: registrations.id,
          eventId: registrations.eventId,
          eventName: events.name,
          eventDate: events.startDate,
          pilotName: registrations.pilotName,
          navigatorName: registrations.navigatorName,
          status: registrations.status,
          accessHash: registrations.accessHash
        })
          .from(registrations)
          .innerJoin(events, eq(registrations.eventId, events.id))
          .where(
            sql`${registrations.pilotCpf} = ${input.cpf} OR ${registrations.navigatorCpf} = ${input.cpf}`
          ).orderBy(sql`${events.startDate} DESC`);

        return history;
      })
  }),
});

export type AppRouter = typeof appRouter;