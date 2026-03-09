import "dotenv/config";
import { getDb } from "./db.js";
import { events, organizers, users } from "./drizzle/schema.js";
import { eq, and } from "drizzle-orm";

const externalEventsData = [
    // Mitsubishi Cup 2026
    { name: "MIT Cup 2026 - 3ª Etapa", startDate: "2026-06-28", city: "São Pedro", state: "SP" },
    { name: "MIT Cup 2026 - 4ª Etapa", startDate: "2026-09-06", city: "Mogi Guaçu", state: "SP" },
    { name: "MIT Cup 2026 - 5ª Etapa", startDate: "2026-10-04", city: "Ponta Grossa", state: "PR" },
    { name: "MIT Cup 2026 - 6ª Etapa", startDate: "2026-11-01", city: "São João da Boa Vista", state: "SP" },
    { name: "MIT Cup 2026 - 7ª Etapa", startDate: "2026-11-29", city: "Mogi Guaçu", state: "SP" },

    // Mitsubishi Motorsports 2026
    { name: "Mitsubishi Motorsports 2026 - 1ª Etapa", startDate: "2026-04-25", city: "Mogi Guaçu", state: "SP" },
    { name: "Mitsubishi Motorsports 2026 - 2ª Etapa", startDate: "2026-05-23", city: "Ibirá", state: "SP" },
    { name: "Mitsubishi Motorsports 2026 - 3ª Etapa", startDate: "2026-06-27", city: "Holambra", state: "SP" },
    { name: "Mitsubishi Motorsports 2026 - 4ª Etapa", startDate: "2026-07-25", city: "Santa Bárbara D'Oeste", state: "SP" },
    { name: "Mitsubishi Motorsports 2026 - 5ª Etapa", startDate: "2026-09-19", city: "Canitar", state: "SP" },
    { name: "Mitsubishi Motorsports 2026 - 6ª Etapa", startDate: "2026-10-17", city: "Limeira", state: "SP" },
    { name: "Mitsubishi Motorsports 2026 - 7ª Etapa", startDate: "2026-11-14", city: "Mogi Guaçu", state: "SP" },

    // Paulista Off-Road
    { name: "Paulista Off-Road 2026 - 1ª Etapa", startDate: "2026-03-07", city: "A definir", state: "SP" },

    // Outros Rallys 2026
    { name: "Rally Cerapió 2026", startDate: "2026-01-25", endDate: "2026-01-30", city: "Piauí/Ceará", state: "PI" },
    { name: "Rally do Cerrado 2026", startDate: "2026-07-03", endDate: "2026-07-06", city: "Caldas Novas", state: "GO" },
    { name: "Rally dos Sertões 2026", startDate: "2026-08-22", endDate: "2026-08-30", city: "A definir", state: "BR" },
    { name: "Rally Aparados (CBA) 2026", startDate: "2026-09-28", city: "A definir", state: "RS" },
];

async function seed() {
    const db = await getDb();
    if (!db) {
        console.error("Database not available");
        process.exit(1);
    }

    try {
        console.log("=== INICIANDO RESGATE DE EVENTOS EXTERNOS ===");

        // 1. Encontrar ou criar o organizador admin/sistema
        let organizer = await db.select().from(organizers).limit(1).then(res => res[0]);

        if (!organizer) {
            console.log("Nenhum organizador encontrado. Criando organizador de sistema...");
            // Precisamos de um usuário admin
            let admin = await db.select().from(users).where(eq(users.role, 'admin')).limit(1).then(res => res[0]);
            if (!admin) {
                // Pegar qualquer usuário ou criar um mock
                admin = await db.select().from(users).limit(1).then(res => res[0]);
            }

            if (!admin) {
                throw new Error("Não foi possível encontrar um usuário para associar como organizador.");
            }

            const [newOrg] = await db.insert(organizers).values({
                name: "Amigo Racing",
                description: "Organizador padrão do sistema para eventos externos.",
                ownerId: admin.openId,
                active: true,
            }).returning();
            organizer = newOrg;
        }

        console.log(`Usando organizador: ${organizer.name} (ID: ${organizer.id})`);

        let importedCount = 0;
        let skippedCount = 0;

        for (const data of externalEventsData) {
            const startDate = new Date(data.startDate);
            const endDate = new Date(data.endDate || data.startDate);

            // Checar se já existe (mesmo nome nesta data)
            const existing = await db.select().from(events).where(
                and(
                    eq(events.name, data.name),
                    eq(events.startDate, startDate)
                )
            ).limit(1);

            if (existing.length > 0) {
                console.log(`- Pulando: ${data.name} (já existe)`);
                skippedCount++;
                continue;
            }

            await db.insert(events).values({
                name: data.name,
                description: `Evento Externo: ${data.name}. Local: ${data.city}.`,
                startDate,
                endDate,
                location: data.city,
                city: data.city,
                state: data.state,
                status: 'open',
                organizerId: organizer.id,
                isExternal: true,
                showInListing: true,
                showRegistrations: false, // Evento externo geralmente não tem inscrição na plataforma
            });

            console.log(`✓ Importado: ${data.name}`);
            importedCount++;
        }

        console.log(`\n=== RELATÓRIO FINAL ===`);
        console.log(`Importados: ${importedCount}`);
        console.log(`Pulados (duplicados): ${skippedCount}`);
        console.log(`Total processado: ${externalEventsData.length}`);
        console.log(`========================`);

    } catch (error) {
        console.error("Erro durante o seed:", error);
    } finally {
        process.exit(0);
    }
}

seed();
