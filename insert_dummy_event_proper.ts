import "dotenv/config";
import { getDb } from "./api/server/db.js";
import { events } from "./api/server/schema.js";

async function main() {
    try {
        console.log("=== INICIANDO DB ===");
        const db = await getDb();
        if (!db) throw new Error("Sem DB");

        console.log("=== INSERINDO EVENT ===");
        await db.insert(events).values({
            name: "Rally 2026 Teste",
            description: "Criado pelo fluxo da API",
            startDate: new Date(),
            endDate: new Date(new Date().getTime() + 86400000), // +1 dia
            location: "Centro de Diagnóstico",
            city: "São Paulo",
            state: "SP",
            status: "open",
            organizerId: 1
        });

        console.log("SUCESSO: Dummy Event Inserido!");
        process.exit(0);
    } catch (err) {
        console.error("/// CRASH EVIDENCIA ///");
        console.error(err);
        process.exit(1);
    }
}
main();
