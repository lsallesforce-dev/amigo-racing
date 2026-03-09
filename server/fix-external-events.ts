import "dotenv/config";
import { getDb } from "./db.js";
import { events, organizers, users } from "./drizzle/schema.js";
import { eq, and } from "drizzle-orm";

async function fix() {
    const db = await getDb();
    if (!db) {
        console.error("Database not available");
        process.exit(1);
    }

    try {
        console.log("=== INICIANDO CORREÇÃO DE EVENTOS EXTERNOS ===");

        // 1. Localizar o usuário administrador
        const targetEmail = "lsallesforce@gmail.com";
        const adminUser = await db.select().from(users).where(eq(users.email, targetEmail)).limit(1).then(res => res[0]);

        if (!adminUser) {
            console.error(`ERRO: Usuário ${targetEmail} não encontrado.`);
            process.exit(1);
        }

        console.log(`Admin encontrado: ${adminUser.name} (OpenID: ${adminUser.openId})`);

        // 2. Encontrar ou criar o organizador para este admin
        let adminOrg = await db.select().from(organizers).where(eq(organizers.ownerId, adminUser.openId)).limit(1).then(res => res[0]);

        if (!adminOrg) {
            console.log(`Criando organizador para ${adminUser.name}...`);
            const [newOrg] = await db.insert(organizers).values({
                name: "Amigo Racing Admin",
                description: "Organizador administrativo para eventos externos.",
                ownerId: adminUser.openId,
                active: true,
            }).returning();
            adminOrg = newOrg;
            console.log(`Organizador criado: ${adminOrg.name} (ID: ${adminOrg.id})`);
        } else {
            console.log(`Organizador existente: ${adminOrg.name} (ID: ${adminOrg.id})`);
        }

        // 3. Buscar eventos externos
        const externalEvents = await db.select().from(events).where(eq(events.isExternal, true));
        console.log(`Encontrados ${externalEvents.length} eventos externos para atualizar.`);

        let updatedCount = 0;

        for (const event of externalEvents) {
            // Corrigir data para 12:00:00 para evitar desvio de timezone
            const newStartDate = new Date(event.startDate);
            newStartDate.setUTCHours(12, 0, 0, 0);

            const newEndDate = new Date(event.endDate || event.startDate);
            newEndDate.setUTCHours(12, 0, 0, 0);

            await db.update(events).set({
                startDate: newStartDate,
                endDate: newEndDate,
                organizerId: adminOrg.id,
                updatedAt: new Date()
            }).where(eq(events.id, event.id));

            console.log(`✓ Atualizado: ${event.name} -> ${newStartDate.toISOString()}`);
            updatedCount++;
        }

        console.log(`\n=== RELATÓRIO DE CORREÇÃO ===`);
        console.log(`Total atualizado: ${updatedCount}`);
        console.log(`Admin Associado: ${adminOrg.name}`);
        console.log(`==============================`);

    } catch (error) {
        console.error("Erro durante a correção:", error);
    } finally {
        process.exit(0);
    }
}

fix();
