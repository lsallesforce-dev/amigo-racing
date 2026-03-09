import "dotenv/config";
import { getDb } from "./api/server/db.js";
import { events, championshipStages, championshipResults } from "./api/server/drizzle/schema.js";
import { eq, inArray } from "drizzle-orm";

async function main() {
    try {
        console.log("=== INICIANDO OPERAÇÃO GRID LIMPO (CLEANUP) ===");
        const db = await getDb();
        if (!db) throw new Error("Não foi possível conectar ao banco de dados.");

        // 1. Identificar eventos externos
        const externalEvents = await db.select({ id: events.id, name: events.name })
            .from(events)
            .where(eq(events.isExternal, true));

        const externalEventIds = externalEvents.map(e => e.id);
        console.log(`Eventos externos identificados (${externalEvents.length}):`, externalEvents.map(e => e.name).join(", "));

        if (externalEventIds.length === 0) {
            console.log("Nenhum evento externo encontrado para limpar.");
        } else {
            // 2. Identificar etapas de campeonato externas
            const externalStages = await db.select({ id: championshipStages.id })
                .from(championshipStages)
                .where(eq(championshipStages.isExternal, true));

            const externalStageIds = externalStages.map(s => s.id);
            console.log(`Etapas externas identificadas: ${externalStageIds.length}`);

            if (externalStageIds.length > 0) {
                // 3. Deletar resultados de etapas externas
                console.log("Limpando resultados de campeonatos para etapas externas...");
                await db.delete(championshipResults)
                    .where(inArray(championshipResults.stageId, externalStageIds));

                // 4. Deletar etapas externas
                console.log("Limpando etapas de campeonato externas...");
                await db.delete(championshipStages)
                    .where(inArray(championshipStages.id, externalStageIds));
            }

            // 5. Deletar eventos externos
            console.log("Limpando eventos externos...");
            await db.delete(events)
                .where(inArray(events.id, externalEventIds));

            console.log("=== LIMPEZA CONCLUÍDA COM SUCESSO! ===");
        }

        // Verificação final dos eventos internos
        const internalEvents = await db.select({ id: events.id, name: events.name })
            .from(events)
            .where(eq(events.isExternal, false));

        console.log(`Eventos oficiais/internos remanescentes (${internalEvents.length}):`, internalEvents.map(e => e.name).join(", "));

        process.exit(0);
    } catch (err) {
        console.error("/// FALHA NA OPERAÇÃO ///");
        console.error(err);
        process.exit(1);
    }
}

main();
