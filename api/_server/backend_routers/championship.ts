import { z } from "zod";
import { router, publicProcedure, protectedProcedure } from "../_core/trpc.js";
import { getDb, getOrganizerContext } from "../db.js";
import {
    championships,
    championshipStages,
    championshipResults,
    championshipRequests,
    championshipNameAliases,
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
    type AbaPlanilha,
    type CelulaPlanilha,
} from "../../../shared/importarPlanilhaCampeonato.js";
import {
    normalizarNome,
    conciliarNomes,
    sugerirUnificacoes,
    type DecisaoAlias,
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

    // Adiciona uma etapa (conecta evento existente a um campeonato)
    addStage: protectedProcedure
        .input(
            z.object({
                championshipId: z.number().int(),
                eventId: z.number().int().optional(),
                customName: z.string().optional(),
                stageNumber: z.number().int(),
            }).refine(data => data.eventId || data.customName, {
                message: "Forneça o eventId da plataforma OU o customName da prova externa",
                path: ["eventId"]
            })
        )
        .mutation(async ({ input, ctx }) => {
            const db = await conectar();
            await exigirPermissaoDeEventos(ctx.user);

            const [result] = await db
                .insert(championshipStages)
                .values({
                    championshipId: input.championshipId,
                    eventId: input.customName ? null : (input.eventId || null),
                    customName: input.customName || null,
                    isExternal: !!input.customName,
                    stageNumber: input.stageNumber,
                })
                .returning();

            return result;
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
     * Lê a planilha e devolve o que ACONTECERIA se ela fosse importada: etapas,
     * avisos, categorias e as dúvidas de nome. Não escreve nada.
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
            await exigirDonoDoCampeonato(db, ctx.user, input.championshipId);

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
            });

            // Quantas duplas por categoria em cada etapa — é o número que o
            // organizador confere antes de mandar gravar.
            const contagem = new Map<string, { categoria: string; stageNumber: number; duplas: number }>();
            for (const r of parse.resultados) {
                const categoria = limparNome(r.categoria) || "Geral";
                const chave = `${categoria}|${r.stageNumber}`;
                const atual = contagem.get(chave) || { categoria, stageNumber: r.stageNumber, duplas: 0 };
                atual.duplas++;
                contagem.set(chave, atual);
            }
            const resumo = [...contagem.values()].sort(
                (a, b) => a.categoria.localeCompare(b.categoria, "pt-BR") || a.stageNumber - b.stageNumber,
            );

            return {
                etapas: parse.etapas,
                abas: parse.abas,
                avisos: parse.avisos,
                resumo,
                conciliacao,
                etapasExistentes: etapasBanco.map(s => ({ id: s.id, stageNumber: s.stageNumber, nome: nomeDaEtapa(s) })),
                categoriasExistentes,
            };
        }),

    /**
     * Grava a planilha inteira numa transação: cria as etapas que faltam, aplica os
     * apelidos (os já gravados + as decisões desta importação) e insere os
     * resultados. Repetir a mesma planilha não duplica nada — cada etapa apaga só
     * as categorias que o arquivo traz, igual ao saveStageResults.
     */
    importWorkbook: protectedProcedure
        .input(z.object({
            championshipId: z.number().int(),
            arquivoBase64: z.string(),
            nomeArquivo: z.string(),
            decisoes: z.array(z.object({
                novo: z.string(),
                /** string = "é a mesma pessoa, use este nome"; null = "é outra pessoa". */
                canonico: z.string().nullable(),
            })).default([]),
            mapaEtapas: z.array(z.object({
                stageNumber: z.number().int(),
                /** Etapa da plataforma já existente. */
                stageId: z.number().int().optional(),
                /** Prova externa a criar com este nome. */
                customName: z.string().optional(),
            })).default([]),
        }))
        .mutation(async ({ input, ctx }) => {
            const db = await conectar();
            const { champ } = await exigirDonoDoCampeonato(db, ctx.user, input.championshipId);

            const etapasBanco = await carregarEtapas(db, input.championshipId);
            const jaGravados = await carregarResultados(db, etapasBanco.map(s => s.id));
            const categoriasExistentes = categoriasDosResultados(jaGravados);
            const nomesExistentes = nomesDosResultados(jaGravados);

            const abas = await lerAbasDaPlanilha(input.arquivoBase64);
            const parse = importarPlanilhaCampeonato(abas, { categoriasConhecidas: categoriasExistentes });
            const novos = nomesDaPlanilha(parse.resultados);

            const decisoesGravadas = await carregarDecisoes(db, input.championshipId);

            // As decisões desta importação viram registro permanente. O "é outra
            // pessoa" não diz contra QUEM foi a pergunta, então refazemos a
            // conciliação para recuperar os candidatos que o wizard ofereceu — sem
            // isso o popup voltaria na planilha seguinte.
            const duvidasOferecidas = conciliarNomes({
                novos,
                existentes: nomesExistentes,
                decisoes: decisoesGravadas,
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
            const mapaPedido = new Map(input.mapaEtapas.map(m => [m.stageNumber, m]));

            let etapasCriadas = 0;
            let resultadosGravados = 0;
            const categoriasGravadas = new Set<string>();

            await db.transaction(async (tx) => {
                const etapasAtuais = await tx
                    .select({ id: championshipStages.id, stageNumber: championshipStages.stageNumber })
                    .from(championshipStages)
                    .where(eq(championshipStages.championshipId, input.championshipId));

                const idPorNumero = new Map<number, number>();

                for (const stageNumber of parse.etapas) {
                    const pedido = mapaPedido.get(stageNumber);

                    // 1) Etapa da plataforma escolhida a dedo — tem que ser DESTE campeonato.
                    if (pedido?.stageId) {
                        const daCasa = etapasAtuais.find(e => e.id === pedido.stageId);
                        if (!daCasa) {
                            throw new TRPCError({
                                code: "BAD_REQUEST",
                                message: `A etapa ${pedido.stageId} não pertence a este campeonato`,
                            });
                        }
                        idPorNumero.set(stageNumber, daCasa.id);
                        continue;
                    }

                    // 2) Já existe etapa com esse número: reaproveita (reimportar não duplica).
                    const existente = etapasAtuais.find(e => e.stageNumber === stageNumber);
                    if (existente) {
                        idPorNumero.set(stageNumber, existente.id);
                        continue;
                    }

                    // 3) Não existe: cria como prova externa.
                    const customName = limparNome(pedido?.customName) || `Etapa ${stageNumber}`;
                    const [criada] = await tx
                        .insert(championshipStages)
                        .values({
                            championshipId: input.championshipId,
                            eventId: null,
                            customName,
                            isExternal: true,
                            stageNumber,
                        })
                        .returning({ id: championshipStages.id, stageNumber: championshipStages.stageNumber });

                    etapasAtuais.push(criada);
                    idPorNumero.set(stageNumber, criada.id);
                    etapasCriadas++;
                }

                const linhas = parse.resultados.map(r => {
                    const stageId = idPorNumero.get(r.stageNumber);
                    if (!stageId) return null;
                    const category = limparNome(r.categoria) || "Geral";
                    categoriasGravadas.add(category);
                    return {
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
                    };
                }).filter((l): l is NonNullable<typeof l> => l !== null);

                // Mesma semântica do saveStageResults: por etapa, limpa só as
                // categorias que o arquivo traz — categoria que não veio fica intacta.
                const porEtapa = new Map<number, Set<string>>();
                for (const l of linhas) {
                    if (!porEtapa.has(l.stageId)) porEtapa.set(l.stageId, new Set());
                    porEtapa.get(l.stageId)!.add(l.category);
                }
                for (const [stageId, categorias] of porEtapa) {
                    await tx.delete(championshipResults).where(
                        and(
                            eq(championshipResults.stageId, stageId),
                            inArray(championshipResults.category, [...categorias]),
                        )
                    );
                }

                await inserirResultadosEmLotes(tx, linhas);
                resultadosGravados = linhas.length;

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
                etapasCriadas,
                resultadosGravados,
                categorias: [...categoriasGravadas].sort((a, b) => a.localeCompare(b, "pt-BR")),
                nomesConciliados,
            };
        }),

    /**
     * Exporta no MESMO formato que a importação lê (uma aba por categoria, layout
     * longo NOME + FUNÇÃO), para o round-trip fechar: exportar, corrigir no Excel,
     * importar de volta. A aba CLASSIFICAÇÃO é relatório e é ignorada na releitura.
     */
    exportWorkbook: protectedProcedure
        .input(z.object({ championshipId: z.number().int() }))
        .mutation(async ({ input, ctx }) => {
            const db = await conectar();
            const { champ } = await exigirDonoDoCampeonato(db, ctx.user, input.championshipId);
            const XLSX = await import("xlsx");

            const { standings, stages } = await calculateChampionshipStandings(input.championshipId);
            const stageIds = stages.map(s => s.id);
            const brutos = await carregarResultados(db, stageIds);

            const numeroDaEtapa = new Map(stages.map(s => [s.id, s.stageNumber]));
            const numerosDeEtapa = stages.map(s => s.stageNumber);

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

            const linhasClassificacao = montarLinhasClassificacao(standings, numerosDeEtapa);
            XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(linhasClassificacao), nomeDeAba(ABA_CLASSIFICACAO));

            const buffer = XLSX.write(wb, { type: "buffer", bookType: "xlsx" });
            const nomeLimpo = (champ.name || "campeonato").replace(/[\\/:*?"<>|]/g, "").replace(/\s+/g, "-");

            return {
                success: true as const,
                data: Buffer.from(buffer).toString("base64"),
                filename: `campeonato-${nomeLimpo}-${champ.year}.xlsx`,
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
