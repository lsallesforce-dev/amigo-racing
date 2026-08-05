import { z } from "zod";
import { router, publicProcedure, protectedProcedure } from "../_core/trpc.js";
import { getDb, getOrganizerContext } from "../db.js";
import {
    championships,
    championshipStages,
    championshipResults,
    championshipRequests,
    championshipNameAliases,
    championshipCompetitorEmails,
    events,
    registrations,
    users
} from "../schema.js";
import { eq, and, desc, inArray, ne } from "drizzle-orm";
import { TRPCError } from "@trpc/server";
import {
    resolverTabela,
    normalizarTabela,
    calcularPontos,
} from "../../../shared/pontuacaoCampeonato.js";
import {
    calcularClassificacao,
    nomeDeCompetidorValido,
    type CompetidorClassificado,
    type CategoriaClassificacao,
} from "../../../shared/classificacaoCampeonato.js";
import {
    importarPlanilhaCampeonato,
    normalizarCabecalho,
    planejarProvas,
    type AbaPlanilha,
    type CelulaPlanilha,
    type ProvaExistente,
} from "../../../shared/importarPlanilhaCampeonato.js";
import {
    normalizarNome,
    normalizarEmail,
    conciliarNomes,
    sugerirUnificacoes,
    type DecisaoAlias,
    type DicaEmail,
} from "../../../shared/nomesCampeonato.js";

type Banco = NonNullable<Awaited<ReturnType<typeof getDb>>>;

/** @deprecated o tipo de verdade agora é `CompetidorClassificado` (shared/classificacaoCampeonato.ts). */
export type CompetitorStandings = CompetidorClassificado;

// ------------------------------------------------------------------ ferramentas

async function conectar(): Promise<Banco> {
    const db = await getDb();
    if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database error" });
    return db;
}

/**
 * Gate genérico de permissão (o mesmo que o resto do arquivo usa).
 * Só diz que a PESSOA pode mexer em campeonato — não diz em QUAL.
 */
async function exigirPermissaoDeEventos(user: any) {
    const organizerCtx = await getOrganizerContext(user);
    if (organizerCtx.type === "MEMBER" && !organizerCtx.permissions.includes("events")) {
        throw new TRPCError({ code: "FORBIDDEN", message: "Not authorized to manage championships" });
    }
    return organizerCtx;
}

/**
 * O gate acima sozinho deixava qualquer organizador editar/apagar o campeonato de
 * QUALQUER outro — bastava mandar o id na chamada (updateChampionship e
 * deleteChampionship não checavam dono nenhum). Toda rota que escreve no
 * campeonato passa por aqui.
 */
async function exigirDonoDoCampeonato(db: Banco, user: any, championshipId: number) {
    const organizerCtx = await exigirPermissaoDeEventos(user);

    const [champ] = await db
        .select()
        .from(championships)
        .where(eq(championships.id, championshipId))
        .limit(1);

    if (!champ) throw new TRPCError({ code: "NOT_FOUND", message: "Campeonato não encontrado" });
    if (champ.organizerId !== organizerCtx.principalUserId) {
        throw new TRPCError({ code: "FORBIDDEN", message: "Apenas o dono do campeonato pode fazer isso" });
    }

    return { champ, organizerCtx };
}

/** Etapas do campeonato já com o nome resolvido (evento da plataforma ou prova externa). */
async function carregarEtapas(db: Banco, championshipId: number) {
    const etapas = await db
        .select({
            id: championshipStages.id,
            championshipId: championshipStages.championshipId,
            eventId: championshipStages.eventId,
            customName: championshipStages.customName,
            isExternal: championshipStages.isExternal,
            stageNumber: championshipStages.stageNumber,
            eventoNome: championshipStages.eventoNome,
            provaNumber: championshipStages.provaNumber,
            event: {
                name: events.name,
            }
        })
        .from(championshipStages)
        .leftJoin(events, eq(championshipStages.eventId, events.id))
        .where(eq(championshipStages.championshipId, championshipId))
        .orderBy(championshipStages.stageNumber);

    return etapas;
}

function nomeDaEtapa(e: { customName: string | null; stageNumber: number; event: { name: string | null } | null }) {
    return e.customName || e.event?.name || `Etapa ${e.stageNumber}`;
}

/**
 * Linhas cruas de resultado das etapas.
 *
 * A ordem NÃO é decorativa: quando o mesmo competidor aparece duas vezes na mesma
 * etapa (dupla que trocou de parceiro, planilha com o nome repetido), a
 * classificação fica com a PRIMEIRA linha. Trazendo resultado real antes de
 * DNS/DSQ, quem vale é a corrida que ele de fato fez.
 */
async function carregarResultados(db: Banco, stageIds: number[]) {
    if (stageIds.length === 0) return [];
    return await db
        .select({
            stageId: championshipResults.stageId,
            category: championshipResults.category,
            pilotName: championshipResults.pilotName,
            navigatorName: championshipResults.navigatorName,
            position: championshipResults.position,
            isDisqualified: championshipResults.isDisqualified,
            isDns: championshipResults.isDns,
        })
        .from(championshipResults)
        .where(inArray(championshipResults.stageId, stageIds))
        .orderBy(
            championshipResults.stageId,
            championshipResults.isDns,
            championshipResults.isDisqualified,
            championshipResults.position,
        );
}

const limparNome = (nome: string | null | undefined) => String(nome ?? "").replace(/\s+/g, " ").trim();

/** Nomes distintos já gravados no campeonato (piloto + navegador, sem o lixo do importador antigo). */
function nomesDosResultados(linhas: { pilotName: string | null; navigatorName: string | null }[]): string[] {
    const vistos = new Set<string>();
    for (const r of linhas) {
        for (const bruto of [r.pilotName, r.navigatorName]) {
            if (!nomeDeCompetidorValido(bruto)) continue;
            vistos.add(limparNome(bruto));
        }
    }
    return [...vistos].sort((a, b) => a.localeCompare(b, "pt-BR"));
}

function categoriasDosResultados(linhas: { category: string | null }[]): string[] {
    const vistas = new Set<string>();
    for (const r of linhas) {
        const c = limparNome(r.category);
        if (c) vistas.add(c);
    }
    return [...vistas].sort((a, b) => a.localeCompare(b, "pt-BR"));
}

/**
 * A aba de CLASSIFICAÇÃO é relatório, não entrada: ela sai no exportWorkbook e
 * seria lida de volta como se fosse mais uma categoria (tem NOME e FUNÇÃO). Fica
 * de fora da leitura para o round-trip exportar→importar não inventar competidor.
 */
const ABA_CLASSIFICACAO = "CLASSIFICAÇÃO";
const ehAbaDeRelatorio = (nome: string) => normalizarCabecalho(nome) === normalizarCabecalho(ABA_CLASSIFICACAO);

/**
 * Monta a aba de relatório: pontos por etapa, com o descarte entre parênteses.
 * As colunas são "PTS ETAPA-n" de propósito — "ETAPA-n" faria o importador ler
 * esta aba como se fosse resultado.
 *
 * Só sai daqui o que a vitrine pública já mostra (nome, posição, pontos). Nada de
 * e-mail/CPF: é por isso que a exportação pública consegue reusar esta função.
 */
function montarLinhasClassificacao(
    standings: CategoriaClassificacao[],
    numerosDeEtapa: number[],
): (string | number)[][] {
    const linhas: (string | number)[][] = [[
        "CATEGORIA", "POSIÇÃO", "NOME", "FUNÇÃO",
        ...numerosDeEtapa.map(n => `PTS ETAPA-${n}`),
        "PONTOS BRUTOS", "DESCARTES", "PONTOS LÍQUIDOS",
    ]];

    for (const cat of standings) {
        const emitir = (c: CompetidorClassificado, funcao: string) => {
            const porEtapa = new Map(c.stageResults.map(sr => [sr.stageNumber, sr]));
            const pontos = numerosDeEtapa.map(n => {
                const sr = porEtapa.get(n);
                if (!sr) return "";
                return sr.isDiscarded ? `(${sr.points})` : sr.points;
            });
            const descartadas = c.stageResults.filter(sr => sr.isDiscarded).map(sr => `Etapa ${sr.stageNumber}`);
            linhas.push([
                cat.name, c.posicao, c.name, funcao,
                ...pontos,
                c.grossPoints, descartadas.join(", "), c.netPoints,
            ]);
        };
        cat.pilots.forEach(p => emitir(p, "Piloto"));
        cat.navigators.forEach(n => emitir(n, "Navegador"));
    }

    return linhas;
}

/** Base64 -> abas em matriz. Quem entende de planilha é o servidor; o parser é puro. */
async function lerAbasDaPlanilha(arquivoBase64: string): Promise<AbaPlanilha[]> {
    const XLSX = await import("xlsx");

    // O front costuma mandar o resultado de readAsDataURL ("data:...;base64,XXXX").
    const puro = String(arquivoBase64 || "").replace(/^data:[^,]*,/, "").trim();
    if (!puro) throw new TRPCError({ code: "BAD_REQUEST", message: "Arquivo vazio" });

    let wb: any;
    try {
        wb = XLSX.read(Buffer.from(puro, "base64"), { type: "buffer" });
    } catch (e: any) {
        throw new TRPCError({ code: "BAD_REQUEST", message: `Não consegui abrir a planilha: ${e?.message || e}` });
    }

    const abas: AbaPlanilha[] = [];
    for (const nome of wb.SheetNames || []) {
        if (ehAbaDeRelatorio(nome)) continue;
        const sheet = wb.Sheets[nome];
        if (!sheet) continue;
        const linhas = XLSX.utils.sheet_to_json(sheet, { header: 1, raw: true, defval: null }) as unknown as CelulaPlanilha[][];
        abas.push({ nome, linhas });
    }

    if (abas.length === 0) {
        throw new TRPCError({ code: "BAD_REQUEST", message: "A planilha não tem nenhuma aba para importar" });
    }
    return abas;
}

/** Decisões de nome já gravadas, no formato que a conciliação entende. */
async function carregarDecisoes(db: Banco, championshipId: number): Promise<DecisaoAlias[]> {
    const linhas = await db
        .select()
        .from(championshipNameAliases)
        .where(eq(championshipNameAliases.championshipId, championshipId));

    return linhas.map(l => ({
        aliasNorm: l.aliasNorm,
        canonicalName: l.canonicalName,
        isDistinct: l.isDistinct,
    }));
}

/** Nomes distintos que a planilha trouxe (piloto + navegador). */
function nomesDaPlanilha(resultados: { pilotName: string | null; navigatorName: string | null }[]): string[] {
    const vistos = new Set<string>();
    for (const r of resultados) {
        for (const bruto of [r.pilotName, r.navigatorName]) {
            const nome = limparNome(bruto);
            if (nome && nomeDeCompetidorValido(nome)) vistos.add(nome);
        }
    }
    return [...vistos];
}

// ------------------------------------------------------------------ evento x prova
//
// Cada ARQUIVO de planilha é UM EVENTO ("Campeonato - 7º Rally do Cavalo") e as
// colunas ETAPA-N são as PROVAS dele. Duas planilhas no mesmo campeonato têm
// ETAPA-1 e ETAPA-2 cada uma, e são quatro provas diferentes — tratar o ETAPA-N
// como número global fazia o dado de um arquivo cair na prova do outro.

/** "Campeonato - 7º Rally do Cavalo.xlsx" -> "7º Rally do Cavalo". */
function nomeDoEventoDoArquivo(nomeArquivo: string): string {
    let nome = String(nomeArquivo || "").replace(/\.[a-z0-9]+$/i, "");
    nome = nome.replace(/^\s*campeonato\s*(\([^)]*\))?\s*[-–—]\s*/i, "");
    // "(3)", "(1)" de download repetido do navegador.
    nome = nome.replace(/\s*\(\d+\)\s*$/, "");
    return limparNome(nome);
}

/**
 * Identidade do EVENTO dentro do campeonato: o id quando é evento da plataforma,
 * senão o nome normalizado. É metade da chave da prova — a outra é o provaNumber.
 */
function chaveDoEvento(eventId: number | null | undefined, eventoNome: string | null | undefined): string {
    if (eventId) return `evt:${eventId}`;
    return `nome:${normalizarNome(eventoNome)}`;
}

/** Chave de identidade de uma PROVA: (evento, provaNumber). */
function chaveDaProva(eventId: number | null | undefined, eventoNome: string | null | undefined, provaNumber: number): string {
    return `${chaveDoEvento(eventId, eventoNome)}#${provaNumber}`;
}

type EtapaComEvento = {
    id: number;
    eventId: number | null;
    customName: string | null;
    eventoNome: string | null;
    provaNumber: number;
    stageNumber: number;
    event?: { name: string | null } | null;
};

/**
 * Nome do evento de uma prova já gravada. Linha antiga (anterior à migração) não
 * tem `eventoNome`: cai no nome do evento da plataforma e, por último, no
 * customName — que era exatamente onde o nome da prova morava antes.
 */
function eventoDaEtapa(e: EtapaComEvento): string {
    return limparNome(e.eventoNome) || limparNome(e.event?.name) || limparNome(e.customName) || `Etapa ${e.stageNumber}`;
}

/** Agrupa as provas do campeonato por evento, na ordem global (stageNumber). */
function agruparPorEvento(etapas: EtapaComEvento[]) {
    const grupos = new Map<string, { chave: string; nome: string; eventId: number | null; provas: { stageId: number; provaNumber: number }[] }>();
    for (const e of [...etapas].sort((a, b) => a.stageNumber - b.stageNumber)) {
        const nome = eventoDaEtapa(e);
        const chave = chaveDoEvento(e.eventId, e.eventoNome || nome);
        if (!grupos.has(chave)) grupos.set(chave, { chave, nome, eventId: e.eventId, provas: [] });
        grupos.get(chave)!.provas.push({ stageId: e.id, provaNumber: e.provaNumber });
    }
    for (const g of grupos.values()) g.provas.sort((a, b) => a.provaNumber - b.provaNumber);
    return [...grupos.values()];
}

/**
 * As dicas de e-mail que a planilha trouxe, escopadas por PAPEL.
 *
 * ⚠️ O e-mail da coluna EMAIL é o contato da DUPLA, não da pessoa (o piloto "Zé
 * do Café" traz o e-mail do navegador "Vado"). Por isso ele nunca casa nome
 * sozinho — só sugere, e só dentro do mesmo papel.
 */
function dicasDaPlanilha(
    resultados: { pilotName: string | null; navigatorName: string | null; pilotEmail: string | null; navigatorEmail: string | null }[],
): DicaEmail[] {
    const vistos = new Set<string>();
    const dicas: DicaEmail[] = [];
    const juntar = (nome: string | null, email: string | null, papel: "pilot" | "navigator") => {
        const limpo = limparNome(nome);
        if (!limpo || !nomeDeCompetidorValido(limpo)) return;
        const emailNorm = normalizarEmail(email);
        if (!emailNorm) return;
        const chave = `${limpo}|${emailNorm}|${papel}`;
        if (vistos.has(chave)) return;
        vistos.add(chave);
        dicas.push({ nome: limpo, emailNorm, papel });
    };
    for (const r of resultados) {
        juntar(r.pilotName, r.pilotEmail, "pilot");
        juntar(r.navigatorName, r.navigatorEmail, "navigator");
    }
    return dicas;
}

/**
 * Dicas de e-mail já conhecidas do campeonato.
 *
 * ⚠️ Só é lido dentro de procedure PROTEGIDO. `championship_competitor_emails`
 * é dado pessoal e não pode sair por rota pública — por isso o e-mail nunca
 * encosta em `championship_results` (getStageResults é publicProcedure).
 */
async function carregarDicasEmail(db: Banco, championshipId: number): Promise<DicaEmail[]> {
    const linhas = await db
        .select({
            emailNorm: championshipCompetitorEmails.emailNorm,
            papel: championshipCompetitorEmails.papel,
            canonicalName: championshipCompetitorEmails.canonicalName,
        })
        .from(championshipCompetitorEmails)
        .where(eq(championshipCompetitorEmails.championshipId, championshipId));

    return linhas
        .filter(l => l.papel === "pilot" || l.papel === "navigator")
        .map(l => ({ nome: l.canonicalName, emailNorm: l.emailNorm, papel: l.papel as "pilot" | "navigator" }));
}

/** Insert em lotes: uma planilha inteira passa fácil de mil linhas. */
async function inserirResultadosEmLotes(tx: any, linhas: any[]) {
    const TAMANHO = 500;
    for (let i = 0; i < linhas.length; i += TAMANHO) {
        await tx.insert(championshipResults).values(linhas.slice(i, i + TAMANHO));
    }
}

// ------------------------------------------------------------------ classificação

/**
 * Casca fina: carrega campeonato + etapas + resultados e entrega para o motor puro
 * (shared/classificacaoCampeonato.ts). Os pontos são calculados AQUI, na leitura —
 * `championship_results.points` virou cache legado e não é mais lido.
 */
export async function calculateChampionshipStandings(championshipId: number) {
    const db = await conectar();

    const [champ] = await db
        .select()
        .from(championships)
        .where(eq(championships.id, championshipId));

    if (!champ) throw new TRPCError({ code: "NOT_FOUND", message: "Campeonato não encontrado" });

    const stagesData = await carregarEtapas(db, championshipId);
    const stageIds = stagesData.map(s => s.id);
    if (stageIds.length === 0) return { standings: [], stages: stagesData, championship: champ };

    // Era um SELECT por etapa (N+1); com inArray é uma consulta só.
    const resultados = await carregarResultados(db, stageIds);

    const { categorias } = calcularClassificacao({
        etapas: stagesData.map(s => ({ id: s.id, stageNumber: s.stageNumber, nome: nomeDaEtapa(s) })),
        resultados,
        config: {
            discardRule: champ.discardRule,
            allowDiscardMissedStages: champ.allowDiscardMissedStages,
            allowDiscardDisqualified: champ.allowDiscardDisqualified,
            tabela: resolverTabela(champ.pointsPreset, champ.pointsTable),
        },
    });

    return {
        stages: stagesData,
        standings: categorias,
        championship: champ
    };
}

/**
 * Uma implementação só para os dois nomes: `getPublicClassification` era cópia
 * literal de `getStandings`, e as duas divergiam a cada mexida. O front público
 * chama pelo nome público, o painel pelo outro — o corpo é o mesmo.
 */
const consultarClassificacao = publicProcedure
    .input(z.object({ championshipId: z.number().int() }))
    .query(async ({ input }) => {
        return await calculateChampionshipStandings(input.championshipId);
    });

export const championshipRouter = router({
    // Cria um novo campeonato vinculado a um organizador
    create: protectedProcedure
        .input(
            z.object({
                name: z.string().min(1, "Name is required"),
                year: z.number().min(2000),
                organizerId: z.number().int(),
                discardRule: z.number().int().default(0),
                allowDiscardMissedStages: z.boolean().default(true),
                allowDiscardDisqualified: z.boolean().default(false),
                pointsPreset: z.enum(["regulamento", "cba", "custom"]).default("regulamento"),
                pointsTable: z.any().optional(),
            })
        )
        .mutation(async ({ input, ctx }) => {
            const db = await conectar();
            const organizerCtx = await exigirPermissaoDeEventos(ctx.user);

            // O organizerId vinha do INPUT sem conferência: dava para criar campeonato
            // no nome de outro organizador. Quem manda é o contexto; o input só é
            // aceito se apontar para a mesma conta (o membro pode mandar o próprio id).
            if (input.organizerId !== organizerCtx.principalUserId && input.organizerId !== ctx.user.id) {
                throw new TRPCError({ code: "FORBIDDEN", message: "Não é possível criar campeonato para outro organizador" });
            }

            const [result] = await db
                .insert(championships)
                .values({
                    name: input.name,
                    year: input.year,
                    organizerId: organizerCtx.principalUserId,
                    discardRule: input.discardRule,
                    allowDiscardMissedStages: input.allowDiscardMissedStages,
                    allowDiscardDisqualified: input.allowDiscardDisqualified,
                    pointsPreset: input.pointsPreset,
                    // Tabela custom só existe no preset custom — nos outros o json fica nulo.
                    pointsTable: input.pointsPreset === "custom" ? normalizarTabela(input.pointsTable) : null,
                })
                .returning();

            return result;
        }),

    // Lista todos os campeonatos de um organizador específico
    getAllByOrganizer: publicProcedure
        .input(z.object({ organizerId: z.number().int() }))
        .query(async ({ input }) => {
            const db = await conectar();

            // 1. Campeonatos onde o usuário é o DONO
            const owned = await db
                .select()
                .from(championships)
                .where(
                    and(
                        eq(championships.organizerId, input.organizerId),
                        eq(championships.active, true)
                    )
                );

            // 2. Campeonatos onde o usuário PARTICIPA via alguma etapa (evento dele vinculado)
            const participating = await db
                .select({
                    id: championships.id,
                    name: championships.name,
                    year: championships.year,
                    organizerId: championships.organizerId,
                    active: championships.active,
                    discardRule: championships.discardRule,
                    sponsorBannerUrl: championships.sponsorBannerUrl,
                    imageUrl: championships.imageUrl,
                    allowDiscardMissedStages: championships.allowDiscardMissedStages,
                    allowDiscardDisqualified: championships.allowDiscardDisqualified,
                    pointsPreset: championships.pointsPreset,
                    pointsTable: championships.pointsTable,
                    createdAt: championships.createdAt,
                    updatedAt: championships.updatedAt
                })
                .from(championships)
                .innerJoin(championshipStages, eq(championships.id, championshipStages.championshipId))
                .innerJoin(events, eq(championshipStages.eventId, events.id))
                .where(
                    and(
                        eq(events.organizerId, input.organizerId),
                        eq(championships.active, true),
                        ne(championships.organizerId, input.organizerId) // Evita duplicar os que já estão no "owned"
                    )
                )
                .groupBy(championships.id); // Agrupa por ID do campeonato caso tenha múltiplas etapas no mesmo campeonato

            // Combina os resultados e ordena por ano descrescente
            const combined = [...owned, ...participating].sort((a, b) => b.year - a.year);

            return combined;
        }),

    // Lista todos os campeonatos ativos na plataforma (para vínculo entre organizadores)
    getAllActive: publicProcedure
        .query(async () => {
            const db = await conectar();

            return await db
                .select({
                    id: championships.id,
                    name: championships.name,
                    year: championships.year,
                    organizerId: championships.organizerId,
                    organizerName: users.name
                })
                .from(championships)
                .innerJoin(users, eq(championships.organizerId, users.id))
                .where(eq(championships.active, true))
                .orderBy(desc(championships.year));
        }),

    /**
     * Adiciona um EVENTO ao campeonato, com as N provas dele de uma vez.
     *
     * Antes isto era "adicionar uma etapa" com o "Nº da etapa" digitado na mão —
     * resíduo do modelo errado, em que ETAPA-N era numeração global. Agora o
     * organizador escolhe o evento e quantas provas ele tem; o `stageNumber`
     * global é atribuído aqui, em sequência.
     *
     * Idempotente: prova que já exista para (evento, provaNumber) é reaproveitada,
     * então chamar de novo não duplica.
     *
     * ⚠️ Continua sem checagem de dono DE PROPÓSITO — fechar aqui quebraria o
     * organizador "participante", que adiciona a própria prova ao campeonato de
     * outro. Não foi piorado nesta mudança.
     */
    addStage: protectedProcedure
        .input(
            z.object({
                championshipId: z.number().int(),
                eventId: z.number().int().optional(),
                customName: z.string().optional(),
                /** Quantas provas criar neste evento (1..N). */
                provas: z.number().int().min(1).max(20).default(1),
                /**
                 * Compat com o front antigo: quando vem, é o `stageNumber` global da
                 * 1ª prova em vez do "próximo da fila". Não use em código novo.
                 */
                stageNumber: z.number().int().optional(),
            }).refine(data => data.eventId || data.customName, {
                message: "Forneça o eventId da plataforma OU o customName da prova externa",
                path: ["eventId"]
            })
        )
        .mutation(async ({ input, ctx }) => {
            const db = await conectar();
            await exigirPermissaoDeEventos(ctx.user);

            const eventoId = input.customName ? null : (input.eventId || null);
            let eventoNome = limparNome(input.customName);
            if (!eventoNome && eventoId) {
                const [evento] = await db
                    .select({ name: events.name })
                    .from(events)
                    .where(eq(events.id, eventoId))
                    .limit(1);
                eventoNome = limparNome(evento?.name);
            }
            if (!eventoNome) eventoNome = `Evento ${eventoId ?? ""}`.trim();

            const provasCriadas: { stageId: number; provaNumber: number }[] = [];

            await db.transaction(async (tx) => {
                const etapasAtuais = await tx
                    .select({
                        id: championshipStages.id,
                        eventId: championshipStages.eventId,
                        customName: championshipStages.customName,
                        eventoNome: championshipStages.eventoNome,
                        provaNumber: championshipStages.provaNumber,
                        stageNumber: championshipStages.stageNumber,
                    })
                    .from(championshipStages)
                    .where(eq(championshipStages.championshipId, input.championshipId));

                const existentes: ProvaExistente[] = etapasAtuais.map(e => ({
                    stageId: e.id,
                    eventoChave: chaveDoEvento(e.eventId, limparNome(e.eventoNome) || limparNome(e.customName)),
                    provaNumber: e.provaNumber,
                    stageNumber: e.stageNumber,
                }));

                const plano = planejarProvas({
                    provasDoArquivo: Array.from({ length: input.provas }, (_, i) => i + 1),
                    eventoChave: chaveDoEvento(eventoId, eventoNome),
                    existentes,
                });

                // Compat: `stageNumber` explícito manda na 1ª prova nova; as
                // seguintes continuam a partir dele.
                let forcado = input.stageNumber;

                for (const p of plano.provas) {
                    if (!p.criada) {
                        provasCriadas.push({ stageId: p.stageId!, provaNumber: p.provaNumber });
                        continue;
                    }
                    const stageNumber = forcado !== undefined ? forcado++ : p.stageNumber;
                    const [criada] = await tx
                        .insert(championshipStages)
                        .values({
                            championshipId: input.championshipId,
                            eventId: eventoId,
                            customName: input.provas > 1 ? `${eventoNome} — Prova ${p.provaNumber}` : (input.customName || null),
                            isExternal: !eventoId,
                            stageNumber,
                            eventoNome,
                            provaNumber: p.provaNumber,
                        })
                        .returning({ id: championshipStages.id });
                    provasCriadas.push({ stageId: criada.id, provaNumber: p.provaNumber });
                }
            });

            return { eventoNome, provasCriadas };
        }),

    // Obtém a etapa vinculada a um evento específico (para edição de evento)
    getStageByEventId: publicProcedure
        .input(z.object({ eventId: z.number().int() }))
        .query(async ({ input }) => {
            const db = await conectar();

            const [stage] = await db
                .select()
                .from(championshipStages)
                .where(eq(championshipStages.eventId, input.eventId))
                .limit(1);

            return stage || null;
        }),

    // Obtém as etapas de um campeonato
    getStages: publicProcedure
        .input(z.object({ championshipId: z.number().int() }))
        .query(async ({ input }) => {
            const db = await conectar();

            const stages = await db
                .select({
                    id: championshipStages.id,
                    championshipId: championshipStages.championshipId,
                    eventId: championshipStages.eventId,
                    customName: championshipStages.customName,
                    isExternal: championshipStages.isExternal,
                    stageNumber: championshipStages.stageNumber,
                    eventoNome: championshipStages.eventoNome,
                    provaNumber: championshipStages.provaNumber,
                    createdAt: championshipStages.createdAt,
                    event: {
                        name: events.name,
                        startDate: events.startDate,
                        city: events.city,
                        state: events.state,
                        organizerId: events.organizerId,
                    }
                })
                .from(championshipStages)
                .leftJoin(events, eq(championshipStages.eventId, events.id))
                .where(eq(championshipStages.championshipId, input.championshipId))
                .orderBy(championshipStages.stageNumber);

            // Fetch categories for each stage in a separate query to avoid complex join duplication
            const stageIds = stages.map(s => s.id);
            if (stageIds.length === 0) return [];

            const allCategories = await db
                .select({
                    stageId: championshipResults.stageId,
                    category: championshipResults.category,
                })
                .from(championshipResults)
                .where(inArray(championshipResults.stageId, stageIds))
                .groupBy(championshipResults.stageId, championshipResults.category);

            // Map categories back to stages
            const results = stages.map(stage => ({
                ...stage,
                categories: allCategories
                    .filter(c => c.stageId === stage.id)
                    .map(c => c.category)
            }));

            return results;
        }),

    // OBTÉM OS RESULTADOS JÁ SALVOS DE UMA ETAPA
    getStageResults: publicProcedure
        .input(z.object({ stageId: z.number().int() }))
        .query(async ({ input }) => {
            const db = await conectar();

            return await db
                .select()
                .from(championshipResults)
                .where(eq(championshipResults.stageId, input.stageId))
                .orderBy(championshipResults.position);
        }),

    // OBTÉM AS CATEGORIAS QUE JÁ POSSUEM RESULTADOS EM UMA ETAPA
    getStageUploadedCategories: publicProcedure
        .input(z.object({ stageId: z.number().int() }))
        .query(async ({ input }) => {
            const db = await conectar();

            const results = await db
                .select({ category: championshipResults.category })
                .from(championshipResults)
                .where(eq(championshipResults.stageId, input.stageId))
                .groupBy(championshipResults.category);

            return results.map(r => r.category);
        }),

    // SALVA OS RESULTADOS DE UMA ETAPA (EXCLUI OS ANTIGOS PARA EVITAR DUPLICIDADE)
    saveStageResults: protectedProcedure
        .input(
            z.object({
                stageId: z.number().int(),
                results: z.array(z.object({
                    category: z.string().optional(),
                    pilotName: z.string().nullable(),
                    navigatorName: z.string().nullable(),
                    position: z.number().int(),
                    isDisqualified: z.boolean(),
                    isDns: z.boolean().default(false),
                })).min(1, "O array de resultados não pode estar vazio"),
            })
        )
        .mutation(async ({ input, ctx }) => {
            const db = await conectar();
            const organizerCtx = await exigirPermissaoDeEventos(ctx.user);

            // --- PERMISSION CHECK ---
            const [stage] = await db.select().from(championshipStages).where(eq(championshipStages.id, input.stageId)).limit(1);
            if (!stage) throw new TRPCError({ code: "NOT_FOUND", message: "Etapa não encontrada" });

            const [champ] = await db.select().from(championships).where(eq(championships.id, stage.championshipId)).limit(1);
            if (!champ) throw new TRPCError({ code: "NOT_FOUND", message: "Campeonato não encontrado" });

            const isChampOwner = champ.organizerId === organizerCtx.principalUserId;
            let isStageOwner = false;

            if (stage.eventId) {
                const [event] = await db.select().from(events).where(eq(events.id, stage.eventId)).limit(1);
                if (event && event.organizerId === organizerCtx.principalUserId) {
                    isStageOwner = true;
                }
            }

            if (!isChampOwner && !isStageOwner) {
                throw new TRPCError({ code: "FORBIDDEN", message: "Você não tem permissão para gerenciar esta etapa" });
            }
            // -------------------------

            // `points` virou cache: quem manda na classificação é o cálculo da leitura.
            // A coluna continua NOT NULL, então gravamos o valor pela tabela DESTE
            // campeonato (não mais pela CBA cravada no código).
            const tabela = resolverTabela(champ.pointsPreset, champ.pointsTable);
            const resultsWithPoints = input.results.map(r => ({
                stageId: input.stageId,
                category: r.category || "Geral",
                pilotName: r.pilotName,
                navigatorName: r.navigatorName,
                position: r.position,
                isDisqualified: r.isDisqualified,
                isDns: r.isDns,
                points: calcularPontos(r.position, r.isDisqualified, r.isDns, tabela),
                isDiscarded: false, // Will be computed globally later
            }));

            // Perform inside a transaction to ensure data integrity
            await db.transaction(async (tx) => {
                // Determine categories being uploaded
                const categoriesToClear = [...new Set(resultsWithPoints.map(r => r.category))];

                // Remove older results ONLY for the categories being uploaded
                if (categoriesToClear.length > 0) {
                    await tx.delete(championshipResults)
                        .where(
                            and(
                                eq(championshipResults.stageId, input.stageId),
                                inArray(championshipResults.category, categoriesToClear)
                            )
                        );
                }

                // Insert new results in bulk
                await inserirResultadosEmLotes(tx, resultsWithPoints);
            });

            return { success: true, count: resultsWithPoints.length };
        }),

    // LIMPA OS RESULTADOS DE UMA CATEGORIA ESPECÍFICA EM UMA ETAPA
    clearStageResultsByCategory: protectedProcedure
        .input(
            z.object({
                stageId: z.number().int(),
                category: z.string(),
            })
        )
        .mutation(async ({ input, ctx }) => {
            const db = await conectar();
            const organizerCtx = await exigirPermissaoDeEventos(ctx.user);

            // --- PERMISSION CHECK ---
            const [stage] = await db.select().from(championshipStages).where(eq(championshipStages.id, input.stageId)).limit(1);
            if (!stage) throw new TRPCError({ code: "NOT_FOUND", message: "Etapa não encontrada" });

            const [champ] = await db.select().from(championships).where(eq(championships.id, stage.championshipId)).limit(1);
            if (!champ) throw new TRPCError({ code: "NOT_FOUND", message: "Campeonato não encontrado" });

            const isChampOwner = champ.organizerId === organizerCtx.principalUserId;
            let isStageOwner = false;

            if (stage.eventId) {
                const [event] = await db.select().from(events).where(eq(events.id, stage.eventId)).limit(1);
                if (event && event.organizerId === organizerCtx.principalUserId) {
                    isStageOwner = true;
                }
            }

            if (!isChampOwner && !isStageOwner) {
                throw new TRPCError({ code: "FORBIDDEN", message: "Você não tem permissão para gerenciar esta etapa" });
            }
            // -------------------------

            await db.delete(championshipResults)
                .where(
                    and(
                        eq(championshipResults.stageId, input.stageId),
                        eq(championshipResults.category, input.category)
                    )
                );

            return { success: true };
        }),

    // UNIFICA COMPETIDORES (MESCLA NOMES)
    mergeCompetitors: protectedProcedure
        .input(
            z.object({
                championshipId: z.number().int(),
                targetName: z.string(),
                sourceNames: z.array(z.string()).min(1, "Selecione ao menos um nome para unificar"),
            })
        )
        .mutation(async ({ input, ctx }) => {
            const db = await conectar();
            // Antes só passava pelo gate genérico: qualquer organizador unificava
            // nomes no campeonato alheio.
            await exigirDonoDoCampeonato(db, ctx.user, input.championshipId);

            // 1. Get all stage IDs for this championship
            const stages = await db
                .select({ id: championshipStages.id })
                .from(championshipStages)
                .where(eq(championshipStages.championshipId, input.championshipId));

            const stageIds = stages.map(s => s.id);
            if (stageIds.length === 0) return { success: true };

            const alvo = limparNome(input.targetName);
            const origens = input.sourceNames.map(limparNome).filter(n => n && n !== alvo);

            await db.transaction(async (tx) => {
                // 2. Update Pilot Names
                await tx
                    .update(championshipResults)
                    .set({ pilotName: alvo })
                    .where(
                        and(
                            inArray(championshipResults.stageId, stageIds),
                            inArray(championshipResults.pilotName, input.sourceNames)
                        )
                    );

                // 3. Update Navigator Names
                await tx
                    .update(championshipResults)
                    .set({ navigatorName: alvo })
                    .where(
                        and(
                            inArray(championshipResults.stageId, stageIds),
                            inArray(championshipResults.navigatorName, input.sourceNames)
                        )
                    );

                // 4. A unificação vira MEMÓRIA: sem isso a próxima planilha traz o nome
                //    antigo de novo e o competidor se parte em dois outra vez.
                for (const origem of origens) {
                    const aliasNorm = normalizarNome(origem);
                    if (!aliasNorm) continue;
                    await tx
                        .insert(championshipNameAliases)
                        .values({
                            championshipId: input.championshipId,
                            aliasNorm,
                            canonicalName: alvo,
                            isDistinct: false,
                        })
                        .onConflictDoUpdate({
                            target: [championshipNameAliases.championshipId, championshipNameAliases.aliasNorm],
                            set: { canonicalName: alvo, isDistinct: false },
                        });
                }
            });

            return { success: true };
        }),

    // Get Final Standings
    getStandings: consultarClassificacao,

    // --- PHASE 7: MULTI-ORGANIZER CUPS COLLAB ---

    // For Local Organizer: list all available championships in the platform
    listAvailableChampionships: protectedProcedure
        .query(async ({ ctx }) => {
            const db = await conectar();

            // Fetch all active championships excluding current user's ones
            const available = await db
                .select({
                    id: championships.id,
                    name: championships.name,
                    year: championships.year,
                    masterOrganizerName: users.name,
                    discardRule: championships.discardRule
                })
                .from(championships)
                .innerJoin(users, eq(championships.organizerId, users.id))
                .where(
                    and(
                        eq(championships.active, true),
                        ne(championships.organizerId, ctx.user.id)
                    )
                )
                .orderBy(desc(championships.year));

            return available;
        }),

    // For Local Organizer: get requests for a specific event to show status (Pending/Approved)
    getChampionshipRequestsByEvent: protectedProcedure
        .input(z.object({ eventId: z.number().int() }))
        .query(async ({ input }) => {
            const db = await conectar();

            return await db.select().from(championshipRequests).where(eq(championshipRequests.eventId, input.eventId));
        }),

    // For Local Organizer: request to join a championship
    requestToJoinChampionship: protectedProcedure
        .input(z.object({
            eventId: z.number().int(),
            championshipId: z.number().int(),
        }))
        .mutation(async ({ input, ctx }) => {
            const db = await conectar();
            await exigirPermissaoDeEventos(ctx.user);

            // Check if request already exists
            const existing = await db.select().from(championshipRequests)
                .where(and(
                    eq(championshipRequests.championshipId, input.championshipId),
                    eq(championshipRequests.eventId, input.eventId)
                ));

            if (existing.length > 0) {
                throw new TRPCError({ code: "BAD_REQUEST", message: "Solicitação já enviada para esta etapa" });
            }

            const [result] = await db.insert(championshipRequests).values({
                championshipId: input.championshipId,
                eventId: input.eventId,
                requestingOrganizerId: ctx.user.id,
                status: "PENDING"
            }).returning();

            return result;
        }),

    // For Master Organizer: view pending requests for their championships
    getPendingStageRequests: protectedProcedure
        .input(z.object({ organizerId: z.number().int() }))
        .query(async ({ input, ctx }) => {
            const db = await conectar();
            await exigirPermissaoDeEventos(ctx.user);

            const pending = await db
                .select({
                    id: championshipRequests.id,
                    championshipName: championships.name,
                    eventName: events.name,
                    eventCity: events.city,
                    eventDate: events.startDate,
                    status: championshipRequests.status,
                    createdAt: championshipRequests.createdAt
                })
                .from(championshipRequests)
                .innerJoin(championships, eq(championshipRequests.championshipId, championships.id))
                .innerJoin(events, eq(championshipRequests.eventId, events.id))
                .where(
                    and(
                        eq(championships.organizerId, input.organizerId),
                        eq(championshipRequests.status, "PENDING")
                    )
                );

            return pending;
        }),

    // For Master Organizer: Accept or Reject requests
    respondToStageRequest: protectedProcedure
        .input(z.object({
            requestId: z.string(),
            status: z.enum(["APPROVED", "REJECTED"])
        }))
        .mutation(async ({ input, ctx }) => {
            const db = await conectar();

            // Get Request details
            const [request] = await db.select().from(championshipRequests).where(eq(championshipRequests.id, input.requestId));
            if (!request) throw new TRPCError({ code: "NOT_FOUND", message: "Request not found" });

            // Quem aceita a etapa no campeonato é o DONO do campeonato.
            await exigirDonoDoCampeonato(db, ctx.user, request.championshipId);

            await db.transaction(async (tx) => {
                // Update the request status
                await tx.update(championshipRequests)
                    .set({ status: input.status, updatedAt: new Date() })
                    .where(eq(championshipRequests.id, input.requestId));

                // If approved, create the stage
                if (input.status === "APPROVED") {
                    // Find the current max stage Number
                    const existingStages = await tx.select().from(championshipStages)
                        .where(eq(championshipStages.championshipId, request.championshipId));

                    const nextStageNumber = existingStages.length > 0
                        ? Math.max(...existingStages.map(s => s.stageNumber)) + 1
                        : 1;

                    await tx.insert(championshipStages).values({
                        championshipId: request.championshipId,
                        eventId: request.eventId,
                        stageNumber: nextStageNumber
                    });
                }
            });

            return { success: true };
        }),

    // --- PHASE 11: REVERSE GEAR (Exclusion of Results/Stages) ---

    // Deletes all results of a specific stage
    clearStageResults: protectedProcedure
        .input(z.object({ stageId: z.number().int() }))
        .mutation(async ({ input, ctx }) => {
            const db = await conectar();
            const organizerCtx = await exigirPermissaoDeEventos(ctx.user);

            // --- PERMISSION CHECK ---
            const [stage] = await db.select().from(championshipStages).where(eq(championshipStages.id, input.stageId)).limit(1);
            if (!stage) throw new TRPCError({ code: "NOT_FOUND", message: "Etapa não encontrada" });

            const [champ] = await db.select().from(championships).where(eq(championships.id, stage.championshipId)).limit(1);
            if (!champ) throw new TRPCError({ code: "NOT_FOUND", message: "Campeonato não encontrado" });

            const isChampOwner = champ.organizerId === organizerCtx.principalUserId;
            let isStageOwner = false;

            if (stage.eventId) {
                const [event] = await db.select().from(events).where(eq(events.id, stage.eventId)).limit(1);
                if (event && event.organizerId === organizerCtx.principalUserId) {
                    isStageOwner = true;
                }
            }

            if (!isChampOwner && !isStageOwner) {
                throw new TRPCError({ code: "FORBIDDEN", message: "Você não tem permissão para gerenciar esta etapa" });
            }
            // -------------------------

            await db.delete(championshipResults)
                .where(eq(championshipResults.stageId, input.stageId));

            return { success: true };
        }),

    // Deletes the stage and its results in cascade
    deleteStage: protectedProcedure
        .input(z.object({ stageId: z.number().int() }))
        .mutation(async ({ input, ctx }) => {
            const db = await conectar();

            // --- PERMISSION CHECK --- (só o dono do campeonato exclui etapa)
            const [stage] = await db.select().from(championshipStages).where(eq(championshipStages.id, input.stageId)).limit(1);
            if (!stage) throw new TRPCError({ code: "NOT_FOUND", message: "Etapa não encontrada" });

            await exigirDonoDoCampeonato(db, ctx.user, stage.championshipId);

            await db.transaction(async (tx) => {
                // Delete results first
                await tx.delete(championshipResults)
                    .where(eq(championshipResults.stageId, input.stageId));

                // Delete stage
                await tx.delete(championshipStages)
                    .where(eq(championshipStages.id, input.stageId));
            });

            return { success: true };
        }),

    // --- PHASE 12: CHAMPIONSHIP MANAGEMENT (Edit/Delete) ---

    // Updates name, discard rules and points table
    updateChampionship: protectedProcedure
        .input(z.object({
            id: z.number().int(),
            name: z.string().min(3).optional(),
            discardRule: z.number().int().min(0).optional(),
            allowDiscardMissedStages: z.boolean().optional(),
            allowDiscardDisqualified: z.boolean().optional(),
            pointsPreset: z.enum(["regulamento", "cba", "custom"]).optional(),
            pointsTable: z.any().optional(),
            sponsorBannerUrl: z.string().optional().nullable(),
            imageUrl: z.string().optional().nullable(),
        }))
        .mutation(async ({ input, ctx }) => {
            const db = await conectar();
            // Não checava dono nenhum: com o gate genérico, qualquer organizador
            // editava o campeonato de qualquer outro.
            const { champ } = await exigirDonoDoCampeonato(db, ctx.user, input.id);

            const updateData: any = {};
            if (input.name) updateData.name = input.name;
            if (input.discardRule !== undefined) updateData.discardRule = input.discardRule;
            if (input.allowDiscardMissedStages !== undefined) updateData.allowDiscardMissedStages = input.allowDiscardMissedStages;
            if (input.allowDiscardDisqualified !== undefined) updateData.allowDiscardDisqualified = input.allowDiscardDisqualified;
            if (input.sponsorBannerUrl !== undefined) updateData.sponsorBannerUrl = input.sponsorBannerUrl;
            if (input.imageUrl !== undefined) updateData.imageUrl = input.imageUrl;

            if (input.pointsPreset !== undefined) {
                updateData.pointsPreset = input.pointsPreset;
                // Sair do custom limpa o json: tabela órfã confunde na próxima leitura.
                if (input.pointsPreset !== "custom") updateData.pointsTable = null;
            }
            if (input.pointsTable !== undefined) {
                const presetFinal = input.pointsPreset ?? champ.pointsPreset;
                if (presetFinal === "custom") {
                    updateData.pointsTable = input.pointsTable === null ? null : normalizarTabela(input.pointsTable);
                }
            }

            updateData.updatedAt = new Date();

            await db.update(championships)
                .set(updateData)
                .where(eq(championships.id, input.id));

            return { success: true };
        }),

    // Deletes the entire championship and all its links
    deleteChampionship: protectedProcedure
        .input(z.object({ id: z.number().int() }))
        .mutation(async ({ input, ctx }) => {
            const db = await conectar();
            // Idem updateChampionship: apagava campeonato alheio.
            await exigirDonoDoCampeonato(db, ctx.user, input.id);

            await db.transaction(async (tx) => {
                // 1. Get all stages
                const stagesList = await tx.select({ id: championshipStages.id })
                    .from(championshipStages)
                    .where(eq(championshipStages.championshipId, input.id));

                const stageIds = stagesList.map(s => s.id);

                // 2. Delete results of those stages
                if (stageIds.length > 0) {
                    await tx.delete(championshipResults)
                        .where(inArray(championshipResults.stageId, stageIds));
                }

                // 3. Delete stages
                await tx.delete(championshipStages)
                    .where(eq(championshipStages.championshipId, input.id));

                // 4. Delete requests
                await tx.delete(championshipRequests)
                    .where(eq(championshipRequests.championshipId, input.id));

                // 5. Delete name aliases
                await tx.delete(championshipNameAliases)
                    .where(eq(championshipNameAliases.championshipId, input.id));

                // 6. Delete the championship
                await tx.delete(championships)
                    .where(eq(championships.id, input.id));
            });

            return { success: true };
        }),

    // --- PHASE 17: PUBLIC SHOWCASE ---

    // Publicly accessible classification (no login required) — mesmo corpo do getStandings
    getPublicClassification: consultarClassificacao,

    // --- IMPORTAÇÃO / EXPORTAÇÃO DE PLANILHA ---

    /**
     * Lê a planilha e devolve o que ACONTECERIA se ela fosse importada: o evento
     * sugerido, as PROVAS do arquivo, avisos, categorias e as dúvidas de nome.
     * Não escreve nada.
     *
     * O arquivo inteiro é UM EVENTO — o wizard pergunta o evento UMA vez, e não
     * uma etapa por coluna ETAPA-N (era isso que criava "E1, E1, E2, E2").
     *
     * É `mutation` (e não `query`) por causa do transporte: query do tRPC vai por
     * GET com o input na URL, e um .xlsx em base64 não cabe numa query string.
     */
    previewImport: protectedProcedure
        .input(z.object({
            championshipId: z.number().int(),
            arquivoBase64: z.string(),
            nomeArquivo: z.string(),
        }))
        .mutation(async ({ input, ctx }) => {
            const db = await conectar();
            const { organizerCtx } = await exigirDonoDoCampeonato(db, ctx.user, input.championshipId);

            const etapasBanco = await carregarEtapas(db, input.championshipId);
            const jaGravados = await carregarResultados(db, etapasBanco.map(s => s.id));

            const categoriasExistentes = categoriasDosResultados(jaGravados);
            const nomesExistentes = nomesDosResultados(jaGravados);

            const abas = await lerAbasDaPlanilha(input.arquivoBase64);
            const parse = importarPlanilhaCampeonato(abas, { categoriasConhecidas: categoriasExistentes });

            const conciliacao = conciliarNomes({
                novos: nomesDaPlanilha(parse.resultados),
                existentes: nomesExistentes,
                decisoes: await carregarDecisoes(db, input.championshipId),
                dicasNovos: dicasDaPlanilha(parse.resultados),
                dicasExistentes: await carregarDicasEmail(db, input.championshipId),
            });

            // Eventos do organizador, para o wizard oferecer o vínculo.
            const eventosDaPlataforma = await db
                .select({ id: events.id, name: events.name })
                .from(events)
                .where(eq(events.organizerId, organizerCtx.principalUserId))
                .orderBy(desc(events.startDate));

            // Evento sugerido: sai do nome do arquivo e, se bater com um evento da
            // plataforma, já vem vinculado.
            const nomeSugerido = nomeDoEventoDoArquivo(input.nomeArquivo) || limparNome(abas[0]?.nome) || "Evento";
            const normSugerido = normalizarNome(nomeSugerido);
            const daPlataforma = eventosDaPlataforma.find(e => normalizarNome(e.name) === normSugerido);
            const eventoSugerido = { nome: daPlataforma?.name || nomeSugerido, eventId: daPlataforma?.id ?? null };

            // Quantas duplas e quais categorias em cada PROVA do arquivo — é o
            // número que o organizador confere antes de mandar gravar.
            const porProva = new Map<number, { provaNumber: number; duplas: number; categorias: Set<string> }>();
            for (const r of parse.resultados) {
                if (!porProva.has(r.provaNumber)) {
                    porProva.set(r.provaNumber, { provaNumber: r.provaNumber, duplas: 0, categorias: new Set() });
                }
                const atual = porProva.get(r.provaNumber)!;
                atual.duplas++;
                atual.categorias.add(limparNome(r.categoria) || "Geral");
            }
            const provas = [...porProva.values()]
                .sort((a, b) => a.provaNumber - b.provaNumber)
                .map(p => ({
                    provaNumber: p.provaNumber,
                    duplas: p.duplas,
                    categorias: [...p.categorias].sort((a, b) => a.localeCompare(b, "pt-BR")),
                }));

            return {
                eventoSugerido,
                provas,
                abas: parse.abas,
                avisos: parse.avisos,
                conciliacao,
                eventosDoCampeonato: agruparPorEvento(etapasBanco),
                eventosDaPlataforma,
                categoriasExistentes,
            };
        }),

    /**
     * Grava a planilha inteira numa transação.
     *
     * O arquivo é UM EVENTO e cada ETAPA-N é uma PROVA dele: o evento vem UMA vez
     * no input (id da plataforma OU nome), e cada prova é achada por
     * (evento, provaNumber) ou criada com um `stageNumber` global novo. Os
     * resultados são gravados PROVA A PROVA — importar duas planilhas no mesmo
     * campeonato misturava o dado exatamente aqui.
     *
     * Repetir o MESMO arquivo é idempotente: mesmo evento, mesmas provas, mesma
     * contagem de linhas (cada prova apaga só as categorias que o arquivo traz,
     * igual ao saveStageResults).
     */
    importWorkbook: protectedProcedure
        .input(z.object({
            championshipId: z.number().int(),
            arquivoBase64: z.string(),
            nomeArquivo: z.string(),
            /** O evento do arquivo: um evento da plataforma OU um nome digitado. */
            evento: z.object({
                eventId: z.number().int().optional(),
                nome: z.string().optional(),
            }),
            decisoes: z.array(z.object({
                novo: z.string(),
                /** string = "é a mesma pessoa, use este nome"; null = "é outra pessoa". */
                canonico: z.string().nullable(),
            })).default([]),
            /**
             * Quais provaNumber do arquivo entram. Ausente ou vazio = TODAS.
             * Serve para o caso "a P2 ainda não rodou, mas a coluna já está lá":
             * importa a P1 agora e a P2 depois, sem duplicar nada (a chave
             * (evento, provaNumber) reaproveita a prova já criada).
             */
            provas: z.array(z.number().int()).optional(),
        }))
        .mutation(async ({ input, ctx }) => {
            const db = await conectar();
            const { champ, organizerCtx } = await exigirDonoDoCampeonato(db, ctx.user, input.championshipId);

            // ---- 1) de que EVENTO é este arquivo
            let eventoId: number | null = null;
            let eventoNome = limparNome(input.evento.nome);

            if (input.evento.eventId) {
                const [evento] = await db
                    .select({ id: events.id, name: events.name, organizerId: events.organizerId })
                    .from(events)
                    .where(eq(events.id, input.evento.eventId))
                    .limit(1);
                if (!evento) throw new TRPCError({ code: "NOT_FOUND", message: "Evento não encontrado" });
                if (evento.organizerId !== organizerCtx.principalUserId) {
                    throw new TRPCError({ code: "FORBIDDEN", message: "Este evento é de outro organizador" });
                }
                eventoId = evento.id;
                eventoNome = eventoNome || limparNome(evento.name);
            }
            if (!eventoNome) eventoNome = nomeDoEventoDoArquivo(input.nomeArquivo);
            if (!eventoNome) {
                throw new TRPCError({
                    code: "BAD_REQUEST",
                    message: "Diga de que evento é esta planilha (eventId da plataforma ou nome)",
                });
            }

            const etapasBanco = await carregarEtapas(db, input.championshipId);
            const jaGravados = await carregarResultados(db, etapasBanco.map(s => s.id));
            const categoriasExistentes = categoriasDosResultados(jaGravados);
            const nomesExistentes = nomesDosResultados(jaGravados);

            const abas = await lerAbasDaPlanilha(input.arquivoBase64);
            const parse = importarPlanilhaCampeonato(abas, { categoriasConhecidas: categoriasExistentes });

            // ---- 2) QUAIS provas do arquivo entram (ausente/vazio = todas).
            // O filtro vem ANTES de tudo: prova não selecionada não é criada, não
            // grava resultado e nem entra na conciliação de nomes.
            const pedidas = [...new Set(input.provas || [])];
            const desconhecidas = pedidas.filter(p => !parse.provas.includes(p)).sort((a, b) => a - b);
            if (desconhecidas.length > 0) {
                throw new TRPCError({
                    code: "BAD_REQUEST",
                    message: `Esta planilha não tem a prova ${desconhecidas.join(", ")}. Provas do arquivo: ${parse.provas.join(", ") || "nenhuma"}.`,
                });
            }
            const provasImportadas = pedidas.length > 0 ? parse.provas.filter(p => pedidas.includes(p)) : [...parse.provas];
            const resultadosSelecionados = parse.resultados.filter(r => provasImportadas.includes(r.provaNumber));

            const novos = nomesDaPlanilha(resultadosSelecionados);

            const decisoesGravadas = await carregarDecisoes(db, input.championshipId);
            const dicasNovos = dicasDaPlanilha(resultadosSelecionados);
            const dicasExistentes = await carregarDicasEmail(db, input.championshipId);

            // As decisões desta importação viram registro permanente. O "é outra
            // pessoa" não diz contra QUEM foi a pergunta, então refazemos a
            // conciliação para recuperar os candidatos que o wizard ofereceu — sem
            // isso o popup voltaria na planilha seguinte.
            const duvidasOferecidas = conciliarNomes({
                novos,
                existentes: nomesExistentes,
                decisoes: decisoesGravadas,
                dicasNovos,
                dicasExistentes,
            }).duvidas;

            const novasDecisoes: DecisaoAlias[] = [];
            for (const d of input.decisoes) {
                const novo = limparNome(d.novo);
                const aliasNorm = normalizarNome(novo);
                if (!aliasNorm) continue;

                const canonico = limparNome(d.canonico);
                if (canonico) {
                    novasDecisoes.push({ aliasNorm, canonicalName: canonico, isDistinct: false });
                    continue;
                }
                const duvida = duvidasOferecidas.find(x => x.novo === novo);
                for (const candidato of duvida?.candidatos || []) {
                    novasDecisoes.push({ aliasNorm, canonicalName: candidato.nome, isDistinct: true });
                }
            }

            const conciliacao = conciliarNomes({
                novos,
                existentes: nomesExistentes,
                decisoes: [...decisoesGravadas, ...novasDecisoes],
                dicasNovos,
                dicasExistentes,
            });
            // "exato"/"normalizado"/"alias": tudo que resolve sozinho vira tradução.
            const traducao = new Map(conciliacao.automaticos.map(a => [a.novo, a.canonico]));
            const traduzir = (bruto: string | null): string | null => {
                const nome = limparNome(bruto);
                if (!nome) return null;
                return traducao.get(nome) ?? nome;
            };
            const nomesConciliados = [...traducao.entries()].filter(([novo, canonico]) => novo !== canonico).length;

            const tabela = resolverTabela(champ.pointsPreset, champ.pointsTable);

            let provasCriadas = 0;
            let provasReaproveitadas = 0;
            let resultadosGravados = 0;
            const categoriasGravadas = new Set<string>();

            await db.transaction(async (tx) => {
                const etapasAtuais = await tx
                    .select({
                        id: championshipStages.id,
                        eventId: championshipStages.eventId,
                        customName: championshipStages.customName,
                        eventoNome: championshipStages.eventoNome,
                        provaNumber: championshipStages.provaNumber,
                        stageNumber: championshipStages.stageNumber,
                    })
                    .from(championshipStages)
                    .where(eq(championshipStages.championshipId, input.championshipId));

                // Identidade da prova: (evento, provaNumber). Linha antiga sem
                // `eventoNome` cai no customName, que era onde o nome morava antes.
                const existentes: ProvaExistente[] = etapasAtuais.map(e => ({
                    stageId: e.id,
                    eventoChave: chaveDoEvento(e.eventId, limparNome(e.eventoNome) || limparNome(e.customName)),
                    provaNumber: e.provaNumber,
                    stageNumber: e.stageNumber,
                }));

                const plano = planejarProvas({
                    provasDoArquivo: parse.provas,
                    eventoChave: chaveDoEvento(eventoId, eventoNome),
                    existentes,
                    selecionadas: provasImportadas,
                });

                const idPorProva = new Map<number, number>();
                for (const p of plano.provas) {
                    if (!p.criada) {
                        idPorProva.set(p.provaNumber, p.stageId!);
                        provasReaproveitadas++;
                        continue;
                    }
                    const [criada] = await tx
                        .insert(championshipStages)
                        .values({
                            championshipId: input.championshipId,
                            eventId: eventoId,
                            customName: `${eventoNome} — Prova ${p.provaNumber}`,
                            isExternal: !eventoId,
                            stageNumber: p.stageNumber,
                            eventoNome,
                            provaNumber: p.provaNumber,
                        })
                        .returning({ id: championshipStages.id });

                    idPorProva.set(p.provaNumber, criada.id);
                    provasCriadas++;
                }

                // Resultados PROVA A PROVA: cada linha vai só para a sua prova.
                // Era aqui que o dado de um arquivo caía na etapa do outro.
                type LinhaResultado = {
                    stageId: number; category: string;
                    pilotName: string | null; navigatorName: string | null;
                    position: number; isDisqualified: boolean; isDns: boolean;
                    points: number; isDiscarded: boolean;
                };
                const linhas: LinhaResultado[] = [];
                for (const provaNumber of provasImportadas) {
                    const stageId = idPorProva.get(provaNumber);
                    if (!stageId) continue;
                    for (const r of resultadosSelecionados) {
                        if (r.provaNumber !== provaNumber) continue;
                        const category = limparNome(r.categoria) || "Geral";
                        categoriasGravadas.add(category);
                        linhas.push({
                            stageId,
                            category,
                            pilotName: traduzir(r.pilotName),
                            navigatorName: traduzir(r.navigatorName),
                            position: r.position,
                            isDisqualified: r.isDisqualified,
                            isDns: r.isDns,
                            // Cache legado (coluna NOT NULL); a classificação recalcula na leitura.
                            points: calcularPontos(r.position, r.isDisqualified, r.isDns, tabela),
                            isDiscarded: false,
                        });
                    }
                }

                // Mesma semântica do saveStageResults: por PROVA, limpa só as
                // categorias que o arquivo traz — categoria que não veio fica intacta.
                const porProva = new Map<number, Set<string>>();
                for (const l of linhas) {
                    if (!porProva.has(l.stageId)) porProva.set(l.stageId, new Set());
                    porProva.get(l.stageId)!.add(l.category);
                }
                for (const [stageId, categorias] of porProva) {
                    await tx.delete(championshipResults).where(
                        and(
                            eq(championshipResults.stageId, stageId),
                            inArray(championshipResults.category, [...categorias]),
                        )
                    );
                }

                await inserirResultadosEmLotes(tx, linhas);
                resultadosGravados = linhas.length;

                // Dicas de e-mail, já com o nome CONCILIADO. É upsert por
                // (championshipId, emailNorm, papel): o e-mail identifica dupla +
                // posição, e o último nome visto naquela posição é o que vale.
                const dicasParaGravar = dicasDaPlanilha(
                    resultadosSelecionados.map(r => ({
                        pilotName: traduzir(r.pilotName),
                        navigatorName: traduzir(r.navigatorName),
                        pilotEmail: r.pilotEmail,
                        navigatorEmail: r.navigatorEmail,
                    })),
                );
                for (const d of dicasParaGravar) {
                    await tx
                        .insert(championshipCompetitorEmails)
                        .values({
                            championshipId: input.championshipId,
                            emailNorm: d.emailNorm,
                            papel: d.papel,
                            canonicalName: d.nome,
                        })
                        .onConflictDoUpdate({
                            target: [
                                championshipCompetitorEmails.championshipId,
                                championshipCompetitorEmails.emailNorm,
                                championshipCompetitorEmails.papel,
                            ],
                            set: { canonicalName: d.nome },
                        });
                }

                for (const d of novasDecisoes) {
                    await tx
                        .insert(championshipNameAliases)
                        .values({
                            championshipId: input.championshipId,
                            aliasNorm: d.aliasNorm,
                            canonicalName: d.canonicalName,
                            isDistinct: d.isDistinct,
                        })
                        .onConflictDoUpdate({
                            target: [championshipNameAliases.championshipId, championshipNameAliases.aliasNorm],
                            set: { canonicalName: d.canonicalName, isDistinct: d.isDistinct },
                        });
                }
            });

            return {
                eventoNome,
                provasImportadas,
                provasCriadas,
                provasReaproveitadas,
                resultadosGravados,
                categorias: [...categoriasGravadas].sort((a, b) => a.localeCompare(b, "pt-BR")),
                nomesConciliados,
            };
        }),

    /**
     * Exporta no MESMO formato que a importação lê (uma aba por categoria, layout
     * longo NOME + FUNÇÃO), para o round-trip fechar: exportar, corrigir no Excel,
     * importar de volta. A aba CLASSIFICAÇÃO é relatório e é ignorada na releitura.
     *
     * ⚠️ UM EVENTO POR ARQUIVO. As colunas ETAPA-N do arquivo são as PROVAS de um
     * evento, e a importação pergunta o evento uma vez por arquivo — juntar dois
     * eventos num arquivo só quebraria a releitura (o ETAPA-1 de um viraria o
     * ETAPA-1 do outro, que é exatamente o bug que estamos consertando). Sem
     * `evento` no input sai o primeiro evento do campeonato; `eventosDisponiveis`
     * volta na resposta para a tela oferecer os outros.
     */
    exportWorkbook: protectedProcedure
        .input(z.object({
            championshipId: z.number().int(),
            /** Qual evento exportar. Omitido = o primeiro (menor stageNumber). */
            evento: z.object({
                eventId: z.number().int().optional(),
                nome: z.string().optional(),
            }).optional(),
        }))
        .mutation(async ({ input, ctx }) => {
            const db = await conectar();
            const { champ } = await exigirDonoDoCampeonato(db, ctx.user, input.championshipId);
            const XLSX = await import("xlsx");

            const { standings, stages } = await calculateChampionshipStandings(input.championshipId);

            const eventos = agruparPorEvento(stages);
            if (eventos.length === 0) {
                throw new TRPCError({ code: "BAD_REQUEST", message: "Este campeonato ainda não tem nenhuma prova" });
            }
            const chavePedida = input.evento
                ? chaveDoEvento(input.evento.eventId ?? null, input.evento.nome ?? null)
                : null;
            const evento = (chavePedida && eventos.find(e => e.chave === chavePedida)) || eventos[0];
            if (chavePedida && !eventos.some(e => e.chave === chavePedida)) {
                throw new TRPCError({ code: "NOT_FOUND", message: "Evento não encontrado neste campeonato" });
            }

            // Só as provas DESTE evento saem no arquivo, e a coluna vira
            // "ETAPA-<provaNumber>" — é assim que a releitura reencontra a prova.
            const doEvento = stages.filter(s => evento.provas.some(p => p.stageId === s.id));
            const stageIds = doEvento.map(s => s.id);
            const brutos = await carregarResultados(db, stageIds);

            const numeroDaEtapa = new Map(doEvento.map(s => [s.id, s.provaNumber]));
            const numerosDeEtapa = [...new Set(doEvento.map(s => s.provaNumber))].sort((a, b) => a - b);

            // Os campos de ficha (email, CPF, veículo...) não moram no resultado —
            // vêm da inscrição do evento, casada pelo nome normalizado. Etapa externa
            // não tem inscrição, então a coluna sai vazia mesmo.
            type Ficha = { email: string; cpf: string; cidade: string; uf: string; veiculo: string; equipe: string };
            const fichaPorNome = new Map<string, Ficha>();
            const eventIds = stages.map(s => s.eventId).filter((id): id is number => !!id);
            if (eventIds.length > 0) {
                const inscricoes = await db
                    .select({
                        pilotName: registrations.pilotName,
                        pilotEmail: registrations.pilotEmail,
                        pilotCpf: registrations.pilotCpf,
                        pilotCity: registrations.pilotCity,
                        pilotState: registrations.pilotState,
                        navigatorName: registrations.navigatorName,
                        navigatorEmail: registrations.navigatorEmail,
                        navigatorCpf: registrations.navigatorCpf,
                        navigatorCity: registrations.navigatorCity,
                        navigatorState: registrations.navigatorState,
                        team: registrations.team,
                        vehicleBrand: registrations.vehicleBrand,
                        vehicleModel: registrations.vehicleModel,
                    })
                    .from(registrations)
                    .where(inArray(registrations.eventId, eventIds));

                for (const i of inscricoes) {
                    const veiculo = `${i.vehicleBrand || ""} ${i.vehicleModel || ""}`.trim();
                    const equipe = i.team || "";
                    const guardar = (nome: string | null, ficha: Ficha) => {
                        const chave = normalizarNome(nome);
                        if (!chave || fichaPorNome.has(chave)) return;
                        fichaPorNome.set(chave, ficha);
                    };
                    guardar(i.pilotName, {
                        email: i.pilotEmail || "", cpf: i.pilotCpf || "",
                        cidade: i.pilotCity || "", uf: i.pilotState || "", veiculo, equipe,
                    });
                    guardar(i.navigatorName, {
                        email: i.navigatorEmail || "", cpf: i.navigatorCpf || "",
                        cidade: i.navigatorCity || "", uf: i.navigatorState || "", veiculo, equipe,
                    });
                }
            }
            const VAZIA: Ficha = { email: "", cpf: "", cidade: "", uf: "", veiculo: "", equipe: "" };
            const ficha = (nome: string | null) => fichaPorNome.get(normalizarNome(nome)) || VAZIA;

            // Uma linha da planilha = uma dupla. O agrupamento é por (piloto,
            // navegador) como a dupla de fato correu: quem trocou de parceiro no meio
            // do campeonato vira duas linhas, cada uma com as suas etapas.
            interface Dupla {
                pilotName: string | null;
                navigatorName: string | null;
                celulas: Map<number, string | number>;
            }
            const duplasPorCategoria = new Map<string, Map<string, Dupla>>();

            for (const r of brutos) {
                const categoria = limparNome(r.category) || "Geral";
                const stageNumber = numeroDaEtapa.get(r.stageId);
                if (stageNumber === undefined) continue;

                const pilotName = nomeDeCompetidorValido(r.pilotName) ? limparNome(r.pilotName) : null;
                const navigatorName = nomeDeCompetidorValido(r.navigatorName) ? limparNome(r.navigatorName) : null;
                if (!pilotName && !navigatorName) continue;

                if (!duplasPorCategoria.has(categoria)) duplasPorCategoria.set(categoria, new Map());
                const daCategoria = duplasPorCategoria.get(categoria)!;
                const chave = `${pilotName || ""}|${navigatorName || ""}`;
                if (!daCategoria.has(chave)) daCategoria.set(chave, { pilotName, navigatorName, celulas: new Map() });

                // "NC" para desclassificado e 0 para quem não largou: é exatamente o
                // que o parser da importação sabe ler de volta.
                const valor = r.isDisqualified ? "NC" : (!r.isDns && r.position > 0 ? r.position : 0);
                daCategoria.get(chave)!.celulas.set(stageNumber, valor);
            }

            const wb = XLSX.utils.book_new();
            const nomesDeAbaUsados = new Set<string>();
            const nomeDeAba = (bruto: string) => {
                // Excel: 31 caracteres, sem : \ / ? * [ ]
                let base = (bruto || "Categoria").replace(/[:\\/?*[\]]/g, "-").slice(0, 31).trim() || "Categoria";
                let nome = base;
                let n = 2;
                while (nomesDeAbaUsados.has(nome.toLowerCase())) {
                    const sufixo = ` (${n++})`;
                    nome = base.slice(0, 31 - sufixo.length) + sufixo;
                }
                nomesDeAbaUsados.add(nome.toLowerCase());
                return nome;
            };

            const cabecalho = [
                "NOME", "FUNÇÃO", "EMAIL", "CPF", "CIDADE", "UF",
                "VEÍCULO", "EQUIPE", "PATROCÍNIO", "CATEGORIA",
                ...numerosDeEtapa.map(n => `ETAPA-${n}`),
            ];

            const categoriasOrdenadas = [...duplasPorCategoria.keys()].sort((a, b) => a.localeCompare(b, "pt-BR"));

            for (const categoria of categoriasOrdenadas) {
                const classificacao = standings.find(c => c.name === categoria);
                const posicaoDoPiloto = new Map<string, number>();
                for (const p of classificacao?.pilots || []) posicaoDoPiloto.set(p.name, p.posicao);

                const duplas = [...duplasPorCategoria.get(categoria)!.values()].sort((a, b) => {
                    const pa = posicaoDoPiloto.get(a.pilotName || "") ?? Number.MAX_SAFE_INTEGER;
                    const pb = posicaoDoPiloto.get(b.pilotName || "") ?? Number.MAX_SAFE_INTEGER;
                    return pa - pb
                        || (a.pilotName || "").localeCompare(b.pilotName || "", "pt-BR")
                        || (a.navigatorName || "").localeCompare(b.navigatorName || "", "pt-BR");
                });

                const linhas: (string | number)[][] = [cabecalho];
                for (const d of duplas) {
                    const celulas = numerosDeEtapa.map(n => d.celulas.get(n) ?? 0);
                    const linhaDe = (nome: string, funcao: "Piloto" | "Navegador") => {
                        const f = ficha(nome);
                        return [nome, funcao, f.email, f.cpf, f.cidade, f.uf, f.veiculo, f.equipe, "", categoria, ...celulas];
                    };
                    // Piloto primeiro, navegador logo abaixo: é assim que o layout
                    // longo amarra a dupla na releitura.
                    if (d.pilotName) linhas.push(linhaDe(d.pilotName, "Piloto"));
                    if (d.navigatorName) linhas.push(linhaDe(d.navigatorName, "Navegador"));
                }

                XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(linhas), nomeDeAba(categoria));
            }

            // A aba de relatório continua sendo do CAMPEONATO inteiro (é onde o
            // organizador vê a temporada), então ela usa o stageNumber GLOBAL — não
            // os provaNumber do evento exportado. Ela é ignorada na releitura.
            const linhasClassificacao = montarLinhasClassificacao(standings, stages.map(s => s.stageNumber));
            XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(linhasClassificacao), nomeDeAba(ABA_CLASSIFICACAO));

            const buffer = XLSX.write(wb, { type: "buffer", bookType: "xlsx" });
            const limpar = (s: string) => s.replace(/[\\/:*?"<>|]/g, "").replace(/\s+/g, "-");

            return {
                success: true as const,
                data: Buffer.from(buffer).toString("base64"),
                // O nome do arquivo é o do EVENTO, no mesmo padrão que a importação
                // lê de volta ("Campeonato - <evento>.xlsx").
                filename: `Campeonato - ${evento.nome}.xlsx`,
                eventoNome: evento.nome,
                eventoChave: evento.chave,
                eventosDisponiveis: eventos.map(e => ({ chave: e.chave, nome: e.nome, eventId: e.eventId })),
                campeonato: `${limpar(champ.name || "campeonato")}-${champ.year}`,
            };
        }),

    /**
     * Versão pública do export, para o competidor baixar a classificação da vitrine.
     *
     * NÃO é o mesmo arquivo do exportWorkbook: aquele carrega e-mail, CPF, cidade e
     * estado vindos da inscrição, para fechar o round-trip de importação — dado
     * pessoal que não pode sair numa rota sem login. Aqui sai só a aba de
     * CLASSIFICAÇÃO, exatamente o que a vitrine e o PDF público já mostram na tela.
     */
    exportClassificacaoPublica: publicProcedure
        .input(z.object({ championshipId: z.number().int() }))
        .mutation(async ({ input }) => {
            const XLSX = await import("xlsx");

            const { standings, stages, championship } = await calculateChampionshipStandings(input.championshipId);
            const numerosDeEtapa = stages.map(s => s.stageNumber);

            const wb = XLSX.utils.book_new();
            const linhas = montarLinhasClassificacao(standings, numerosDeEtapa);
            // Aba única e de nome fixo: não precisa do saneamento de nome que o
            // exportWorkbook faz para as categorias (limite de 31 chars do Excel).
            XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(linhas), ABA_CLASSIFICACAO);

            const buffer = XLSX.write(wb, { type: "buffer", bookType: "xlsx" });
            const nomeLimpo = (championship.name || "campeonato").replace(/[\\/:*?"<>|]/g, "").replace(/\s+/g, "-");

            return {
                success: true as const,
                data: Buffer.from(buffer).toString("base64"),
                filename: `classificacao-${nomeLimpo}-${championship.year}.xlsx`,
            };
        }),

    /** Renomeia uma categoria em TODAS as etapas do campeonato de uma vez. */
    renameCategory: protectedProcedure
        .input(z.object({
            championshipId: z.number().int(),
            de: z.string().min(1),
            para: z.string().min(1),
        }))
        .mutation(async ({ input, ctx }) => {
            const db = await conectar();
            await exigirDonoDoCampeonato(db, ctx.user, input.championshipId);

            const de = limparNome(input.de);
            const para = limparNome(input.para);
            if (!de || !para) throw new TRPCError({ code: "BAD_REQUEST", message: "Informe o nome atual e o novo nome da categoria" });
            if (de === para) return { atualizados: 0 };

            const etapas = await db
                .select({ id: championshipStages.id })
                .from(championshipStages)
                .where(eq(championshipStages.championshipId, input.championshipId));

            const stageIds = etapas.map(e => e.id);
            if (stageIds.length === 0) return { atualizados: 0 };

            const atualizados = await db
                .update(championshipResults)
                .set({ category: para })
                .where(
                    and(
                        inArray(championshipResults.stageId, stageIds),
                        eq(championshipResults.category, de),
                    )
                )
                .returning({ id: championshipResults.id });

            return { atualizados: atualizados.length };
        }),

    /**
     * Nomes que provavelmente são a mesma pessoa. Público porque a classificação
     * também é: não expõe nada que a vitrine já não mostre.
     */
    sugestoesUnificacao: publicProcedure
        .input(z.object({ championshipId: z.number().int() }))
        .query(async ({ input }) => {
            const db = await conectar();

            const etapas = await db
                .select({ id: championshipStages.id })
                .from(championshipStages)
                .where(eq(championshipStages.championshipId, input.championshipId));

            const linhas = await carregarResultados(db, etapas.map(e => e.id));

            // Com repetição de propósito: a frequência é o que elege o nome canônico.
            const nomes: string[] = [];
            for (const r of linhas) {
                for (const bruto of [r.pilotName, r.navigatorName]) {
                    if (nomeDeCompetidorValido(bruto)) nomes.push(limparNome(bruto));
                }
            }

            return sugerirUnificacoes(nomes);
        }),

    /** Decisões de nome já tomadas neste campeonato (o que o wizard não vai reperguntar). */
    listarAliases: protectedProcedure
        .input(z.object({ championshipId: z.number().int() }))
        .query(async ({ input, ctx }) => {
            const db = await conectar();
            await exigirDonoDoCampeonato(db, ctx.user, input.championshipId);

            const linhas = await db
                .select({
                    aliasNorm: championshipNameAliases.aliasNorm,
                    canonicalName: championshipNameAliases.canonicalName,
                    isDistinct: championshipNameAliases.isDistinct,
                })
                .from(championshipNameAliases)
                .where(eq(championshipNameAliases.championshipId, input.championshipId))
                .orderBy(championshipNameAliases.aliasNorm);

            return linhas;
        }),
});
