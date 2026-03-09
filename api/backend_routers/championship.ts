import { z } from "zod";
import { router, publicProcedure, protectedProcedure } from "../_core/trpc.js";
import { getDb, getOrganizerContext, getUserById } from "../db.js";
import {
    championships,
    championshipStages,
    championshipResults,
    championshipRequests,
    events,
    organizers,
    users
} from "../schema.js";
import { eq, and, desc, sql, inArray, not, ne } from "drizzle-orm";
import { TRPCError } from "@trpc/server";
import { calculateCbaPoints } from "../utils/cbaRules.js";

export type CompetitorStandings = {
    name: string;
    category: string;
    role: "pilot" | "navigator";
    stageResults: { stageId: number; points: number; position: number; isDisqualified: boolean; isDiscarded: boolean }[];
    grossPoints: number;
    netPoints: number;
    positionHistory: number[];
};

export async function calculateChampionshipStandings(championshipId: number) {
    const db = await getDb();
    if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database error" });

    // 1. Get Championship Discard Rule
    const [champ] = await db
        .select()
        .from(championships)
        .where(eq(championships.id, championshipId));

    if (!champ) throw new TRPCError({ code: "NOT_FOUND", message: "Campeonato não encontrado" });

    // 2. Get Stages & Results
    const stagesData = await db
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

    const stageIds = stagesData.map(s => s.id);
    if (stageIds.length === 0) return { standings: [], stages: [], championship: champ };

    // 3. Process All Results (since no simple inArray, get all results for these stages manually)
    const allResultsList = await Promise.all(
        stageIds.map(stId => db.select().from(championshipResults).where(eq(championshipResults.stageId, stId)))
    );
    const allResults = allResultsList.flat();

    const competitorsMap = new Map<string, CompetitorStandings>();

    const getCompetitorKey = (name: string, category: string, role: string) => `${name}|${category}|${role}`;

    for (const r of allResults) {
        const cat = r.category || "Geral";

        // Pilot Entry
        if (r.pilotName && r.pilotName !== "-" && r.pilotName.toLowerCase() !== "false") {
            const key = getCompetitorKey(r.pilotName, cat, "pilot");
            if (!competitorsMap.has(key)) competitorsMap.set(key, { name: r.pilotName, category: cat, role: "pilot", stageResults: [], grossPoints: 0, netPoints: 0, positionHistory: [] });
            competitorsMap.get(key)!.stageResults.push({ stageId: r.stageId, points: r.points, position: r.position, isDisqualified: r.isDisqualified, isDiscarded: false });
        }

        // Navigator Entry
        if (r.navigatorName && r.navigatorName !== "-" && r.navigatorName.toLowerCase() !== "false") {
            const key = getCompetitorKey(r.navigatorName, cat, "navigator");
            if (!competitorsMap.has(key)) competitorsMap.set(key, { name: r.navigatorName, category: cat, role: "navigator", stageResults: [], grossPoints: 0, netPoints: 0, positionHistory: [] });
            competitorsMap.get(key)!.stageResults.push({ stageId: r.stageId, points: r.points, position: r.position, isDisqualified: r.isDisqualified, isDiscarded: false });
        }
    }

    // 4. Apply Discard Logic & Calculations
    const competitorsArray = Array.from(competitorsMap.values());

    for (const comp of competitorsArray) {
        comp.grossPoints = comp.stageResults.reduce((sum, sr) => sum + sr.points, 0);
        comp.positionHistory = comp.stageResults.filter(sr => !sr.isDisqualified && sr.position > 0).map(sr => sr.position);

        if (champ.discardRule > 0) {
            // Build a list of all potential results for discard
            // We need to look at EVERY stage in the championship
            const potentialDiscards: { points: number; stageId: number; isDNS: boolean; isDSQ: boolean; isEligible: boolean }[] = [];

            for (const stage of stagesData) {
                const result = comp.stageResults.find(sr => sr.stageId === stage.id);
                if (result) {
                    potentialDiscards.push({
                        points: result.points,
                        stageId: stage.id,
                        isDNS: false,
                        isDSQ: result.isDisqualified,
                        isEligible: !result.isDisqualified || champ.allowDiscardMissedStages // If rule is ON, even NC/DSQ can be discarded
                    });
                } else {
                    // Missing stage (DNS)
                    potentialDiscards.push({
                        points: 0,
                        stageId: stage.id,
                        isDNS: true,
                        isDSQ: false,
                        isEligible: champ.allowDiscardMissedStages // DNS eligibility depends on rule
                    });
                }
            }

            // Sort eligible discards by points ascending
            const eligibleToDiscard = potentialDiscards
                .filter(pd => pd.isEligible)
                .sort((a, b) => a.points - b.points);

            // Mark the worst ones as discarded
            for (let i = 0; i < Math.min(champ.discardRule, eligibleToDiscard.length); i++) {
                const targetId = eligibleToDiscard[i].stageId;
                const sr = comp.stageResults.find(res => res.stageId === targetId);
                // If the target was a real result (not a DNS), mark it as discarded
                if (sr) {
                    sr.isDiscarded = true;
                }
                // Note: If the target was a DNS (virtual), it doesn't have an 'sr' object,
                // which is fine because it's already 0 and not in grossPoints.
            }
        }

        // Calculate Net Points
        comp.netPoints = comp.stageResults.reduce((sum, sr) => sum + (sr.isDiscarded ? 0 : sr.points), 0);
    }

    // 5. Build Grouped Results
    const categoriesSet = new Set<string>();
    competitorsArray.forEach(c => categoriesSet.add(c.category));

    const categories = Array.from(categoriesSet).sort();

    const groupedByCat = categories.map(cat => {
        const pilots = competitorsArray.filter(c => c.category === cat && c.role === "pilot");
        const navigators = competitorsArray.filter(c => c.category === cat && c.role === "navigator");

        const sortFn = (a: CompetitorStandings, b: CompetitorStandings) => {
            if (b.netPoints !== a.netPoints) return b.netPoints - a.netPoints;
            if (b.grossPoints !== a.grossPoints) return b.grossPoints - a.grossPoints;

            // Tiebreaker: More 1sts, 2nds, etc.
            const maxPos = Math.max(...a.positionHistory, ...b.positionHistory, 0);
            for (let pos = 1; pos <= maxPos; pos++) {
                const countA = a.positionHistory.filter(p => p === pos).length;
                const countB = b.positionHistory.filter(p => p === pos).length;
                if (countA !== countB) return countB - countA;
            }

            const lastA = Math.max(...a.stageResults.map(sr => sr.stageId), 0);
            const lastB = Math.max(...b.stageResults.map(sr => sr.stageId), 0);
            if (lastA !== lastB) return lastB - lastA;

            return 0;
        };

        return {
            name: cat,
            pilots: pilots.sort(sortFn),
            navigators: navigators.sort(sortFn)
        };
    });

    return {
        stages: stagesData,
        standings: groupedByCat,
        championship: champ
    };
}

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
            })
        )
        .mutation(async ({ input, ctx }) => {
            const db = await getDb();
            if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database error" });

            const organizerCtx = await getOrganizerContext(ctx.user);

            // Simple permission check: must be owner or have events permission
            if (
                organizerCtx.type === "MEMBER" &&
                !organizerCtx.permissions.includes("events")
            ) {
                throw new TRPCError({ code: "FORBIDDEN", message: "Not authorized to manage championships" });
            }

            const [result] = await db
                .insert(championships)
                .values({
                    name: input.name,
                    year: input.year,
                    organizerId: input.organizerId,
                    discardRule: input.discardRule,
                    allowDiscardMissedStages: input.allowDiscardMissedStages,
                })
                .returning();

            return result;
        }),

    // Lista todos os campeonatos de um organizador específico
    getAllByOrganizer: publicProcedure
        .input(z.object({ organizerId: z.number().int() }))
        .query(async ({ input }) => {
            const db = await getDb();
            if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database error" });

            return await db
                .select()
                .from(championships)
                .where(
                    and(
                        eq(championships.organizerId, input.organizerId),
                        eq(championships.active, true)
                    )
                )
                .orderBy(desc(championships.year));
        }),

    // Lista todos os campeonatos ativos na plataforma (para vínculo entre organizadores)
    getAllActive: publicProcedure
        .query(async () => {
            const db = await getDb();
            if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database error" });

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
            const db = await getDb();
            if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database error" });

            const organizerCtx = await getOrganizerContext(ctx.user);
            if (
                organizerCtx.type === "MEMBER" &&
                !organizerCtx.permissions.includes("events")
            ) {
                throw new TRPCError({ code: "FORBIDDEN", message: "Not authorized to manage championships" });
            }

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
            const db = await getDb();
            if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database error" });

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
            const db = await getDb();
            if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database error" });

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
            const db = await getDb();
            if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database error" });

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
            const db = await getDb();
            if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database error" });

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
                })).min(1, "O array de resultados não pode estar vazio"),
            })
        )
        .mutation(async ({ input, ctx }) => {
            const db = await getDb();
            if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database error" });

            const organizerCtx = await getOrganizerContext(ctx.user);
            if (
                organizerCtx.type === "MEMBER" &&
                !organizerCtx.permissions.includes("events")
            ) {
                throw new TRPCError({ code: "FORBIDDEN", message: "Not authorized to manage championships" });
            }

            // Calculates the points for each result using the cbaRules pure function logic
            const resultsWithPoints = input.results.map(r => ({
                stageId: input.stageId,
                category: r.category || "Geral",
                pilotName: r.pilotName,
                navigatorName: r.navigatorName,
                position: r.position,
                isDisqualified: r.isDisqualified,
                points: calculateCbaPoints(r.position, r.isDisqualified),
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
                await tx.insert(championshipResults)
                    .values(resultsWithPoints);
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
            const db = await getDb();
            if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database error" });

            const organizerCtx = await getOrganizerContext(ctx.user);
            if (
                organizerCtx.type === "MEMBER" &&
                !organizerCtx.permissions.includes("events")
            ) {
                throw new TRPCError({ code: "FORBIDDEN", message: "Not authorized to manage championships" });
            }

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
            const db = await getDb();
            if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database error" });

            const organizerCtx = await getOrganizerContext(ctx.user);
            if (
                organizerCtx.type === "MEMBER" &&
                !organizerCtx.permissions.includes("events")
            ) {
                throw new TRPCError({ code: "FORBIDDEN", message: "Not authorized to manage championships" });
            }

            // 1. Get all stage IDs for this championship
            const stages = await db
                .select({ id: championshipStages.id })
                .from(championshipStages)
                .where(eq(championshipStages.championshipId, input.championshipId));

            const stageIds = stages.map(s => s.id);
            if (stageIds.length === 0) return { success: true };

            await db.transaction(async (tx) => {
                // 2. Update Pilot Names
                await tx
                    .update(championshipResults)
                    .set({ pilotName: input.targetName })
                    .where(
                        and(
                            inArray(championshipResults.stageId, stageIds),
                            inArray(championshipResults.pilotName, input.sourceNames)
                        )
                    );

                // 3. Update Navigator Names
                await tx
                    .update(championshipResults)
                    .set({ navigatorName: input.targetName })
                    .where(
                        and(
                            inArray(championshipResults.stageId, stageIds),
                            inArray(championshipResults.navigatorName, input.sourceNames)
                        )
                    );
            });

            return { success: true };
        }),

    // Get Final Standings
    getStandings: publicProcedure
        .input(z.object({ championshipId: z.number().int() }))
        .query(async ({ input }) => {
            return await calculateChampionshipStandings(input.championshipId);
        }),

    // --- PHASE 7: MULTI-ORGANIZER CUPS COLLAB ---

    // For Local Organizer: list all available championships in the platform
    listAvailableChampionships: protectedProcedure
        .query(async ({ ctx }) => {
            const db = await getDb();
            if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database error" });

            const organizerCtx = await getOrganizerContext(ctx.user);

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
            const db = await getDb();
            if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database error" });

            return await db.select().from(championshipRequests).where(eq(championshipRequests.eventId, input.eventId));
        }),

    // For Local Organizer: request to join a championship
    requestToJoinChampionship: protectedProcedure
        .input(z.object({
            eventId: z.number().int(),
            championshipId: z.number().int(),
        }))
        .mutation(async ({ input, ctx }) => {
            const db = await getDb();
            if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database error" });

            const organizerCtx = await getOrganizerContext(ctx.user);
            if (organizerCtx.type === "MEMBER" && !organizerCtx.permissions.includes("events")) {
                throw new TRPCError({ code: "FORBIDDEN", message: "Not authorized" });
            }

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
            const db = await getDb();
            if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database error" });

            const organizerCtx = await getOrganizerContext(ctx.user);
            if (organizerCtx.type === "MEMBER" && !organizerCtx.permissions.includes("events")) {
                throw new TRPCError({ code: "FORBIDDEN", message: "Not authorized" });
            }

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
            const db = await getDb();
            if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database error" });

            const organizerCtx = await getOrganizerContext(ctx.user);
            if (organizerCtx.type === "MEMBER" && !organizerCtx.permissions.includes("events")) {
                throw new TRPCError({ code: "FORBIDDEN", message: "Not authorized" });
            }

            // Get Request details
            const [request] = await db.select().from(championshipRequests).where(eq(championshipRequests.id, input.requestId));
            if (!request) throw new TRPCError({ code: "NOT_FOUND", message: "Request not found" });

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
            const db = await getDb();
            if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database error" });

            const organizerCtx = await getOrganizerContext(ctx.user);
            if (organizerCtx.type === "MEMBER" && !organizerCtx.permissions.includes("events")) {
                throw new TRPCError({ code: "FORBIDDEN", message: "Not authorized" });
            }

            await db.delete(championshipResults)
                .where(eq(championshipResults.stageId, input.stageId));

            return { success: true };
        }),

    // Deletes the stage and its results in cascade
    deleteStage: protectedProcedure
        .input(z.object({ stageId: z.number().int() }))
        .mutation(async ({ input, ctx }) => {
            const db = await getDb();
            if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database error" });

            const organizerCtx = await getOrganizerContext(ctx.user);
            if (organizerCtx.type === "MEMBER" && !organizerCtx.permissions.includes("events")) {
                throw new TRPCError({ code: "FORBIDDEN", message: "Not authorized" });
            }

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

    // Updates name and discard rule
    updateChampionship: protectedProcedure
        .input(z.object({
            id: z.number().int(),
            name: z.string().min(3).optional(),
            discardRule: z.number().int().min(0).optional(),
            allowDiscardMissedStages: z.boolean().optional(),
            sponsorBannerUrl: z.string().optional().nullable(),
            imageUrl: z.string().optional().nullable(),
        }))
        .mutation(async ({ input, ctx }) => {
            const db = await getDb();
            if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database error" });

            const organizerCtx = await getOrganizerContext(ctx.user);
            if (organizerCtx.type === "MEMBER" && !organizerCtx.permissions.includes("events")) {
                throw new TRPCError({ code: "FORBIDDEN", message: "Not authorized" });
            }

            const updateData: any = {};
            if (input.name) updateData.name = input.name;
            if (input.discardRule !== undefined) updateData.discardRule = input.discardRule;
            if (input.allowDiscardMissedStages !== undefined) updateData.allowDiscardMissedStages = input.allowDiscardMissedStages;
            if (input.sponsorBannerUrl !== undefined) updateData.sponsorBannerUrl = input.sponsorBannerUrl;
            if (input.imageUrl !== undefined) updateData.imageUrl = input.imageUrl;
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
            const db = await getDb();
            if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database error" });

            const organizerCtx = await getOrganizerContext(ctx.user);
            if (organizerCtx.type === "MEMBER" && !organizerCtx.permissions.includes("events")) {
                throw new TRPCError({ code: "FORBIDDEN", message: "Not authorized" });
            }

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

                // 5. Delete the championship
                await tx.delete(championships)
                    .where(eq(championships.id, input.id));
            });

            return { success: true };
        }),

    // --- PHASE 17: PUBLIC SHOWCASE ---

    // Publicly accessible classification (no login required)
    getPublicClassification: publicProcedure
        .input(z.object({ championshipId: z.number().int() }))
        .query(async ({ input }) => {
            return calculateChampionshipStandings(input.championshipId);
        }),
});
