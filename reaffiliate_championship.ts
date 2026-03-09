import "dotenv/config";
import { getDb } from "./api/server/db.js";
import { championships } from "./api/server/schema.js";
import { eq } from "drizzle-orm";

async function run() {
    const db = await getDb();
    if (!db) {
        console.error("Database not available");
        process.exit(1);
    }

    try {
        console.log("=== RE-AFILIANDO CAMPEONATO ÓRFÃO ===");

        // ID 2 = Copa União Caipira
        // ID 3 = Amigo Racing Admin (LSalles)
        const result = await db.update(championships)
            .set({ organizerId: 3, updatedAt: new Date() })
            .where(eq(championships.id, 2))
            .returning();

        if (result.length > 0) {
            console.log("SUCESSO: Campeonato re-afiliado ao organizador Amigo Racing Admin (ID 3).");
            console.log("Dados atualizados:", result[0]);
        } else {
            console.log("ERRO: Campeonato ID 2 não encontrado.");
        }

    } catch (error) {
        console.error("Erro durante a atualização:", error);
    } finally {
        process.exit(0);
    }
}

run();
