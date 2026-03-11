import "dotenv/config";
import { getDb } from "./db.js";
import { events, organizers, users } from "./schema.js";
import { eq, and } from "drizzle-orm";

const MITSUBISHI_LOGO = "https://www.mitsubishimotorsportsbrasil.com.br/wp-content/uploads/2024/01/logo-mit-motorsports.png";

const mitsubishiEvents2025 = [
    {
        name: "Mitsubishi Motorsports - 1a Etapa",
        description: "1a Etapa do Mitsubishi Motorsports 4you4adventure 2025. Local: Goiania, GO.",
        startDate: "2025-04-10",
        endDate: "2025-04-11",
        location: "Goiania",
        city: "Goiania",
        state: "GO",
        externalUrl: "https://mitsubishimotorsports.com.br",
        imageUrl: MITSUBISHI_LOGO,
    },
    {
        name: "Mitsubishi Motorsports - 2a Etapa",
        description: "2a Etapa do Mitsubishi Motorsports 4you4adventure 2025. Local: Campo Alegre, SC.",
        startDate: "2025-05-15",
        endDate: "2025-05-16",
        location: "Campo Alegre",
        city: "Campo Alegre",
        state: "SC",
        externalUrl: "https://mitsubishimotorsports.com.br",
        imageUrl: MITSUBISHI_LOGO,
    },
    {
        name: "Mitsubishi Motorsports - 3a Etapa",
        description: "3a Etapa do Mitsubishi Motorsports 4you4adventure 2025. Local: Itaipava, RJ.",
        startDate: "2025-08-14",
        endDate: "2025-08-15",
        location: "Itaipava",
        city: "Itaipava",
        state: "RJ",
        externalUrl: "https://mitsubishimotorsports.com.br",
        imageUrl: MITSUBISHI_LOGO,
    },
    {
        name: "Mitsubishi Motorsports - 4a Etapa",
        description: "4a Etapa do Mitsubishi Motorsports 4you4adventure 2025. Local: Lagoa Santa, MG.",
        startDate: "2025-09-25",
        endDate: "2025-09-26",
        location: "Lagoa Santa",
        city: "Lagoa Santa",
        state: "MG",
        externalUrl: "https://mitsubishimotorsports.com.br",
        imageUrl: MITSUBISHI_LOGO,
    },
    {
        name: "Mitsubishi Motorsports - 5a Etapa Final Mit Rallies",
        description: "5a Etapa Final do Mitsubishi Motorsports 4you4adventure 2025 - Final Mit Rallies. Local: Autodromo Velocitta, Mogi Guacu, SP.",
        startDate: "2025-11-13",
        endDate: "2025-11-14",
        location: "Autodromo Velocitta - Mogi Guacu",
        city: "Mogi Guacu",
        state: "SP",
        externalUrl: "https://mitsubishimotorsports.com.br",
        imageUrl: MITSUBISHI_LOGO,
    },
];

async function seed() {
    const db = await getDb();
    if (!db) {
        console.error("Database not available");
        process.exit(1);
    }

    try {
        console.log("=== CRIANDO ETAPAS MITSUBISHI MOTORSPORTS 2025 ===");

        // Buscar o organizador do usuário admin (lsallesforce@gmail.com)
        const adminUser = await db.select().from(users)
            .where(eq(users.email, "lsallesforce@gmail.com"))
            .limit(1)
            .then(res => res[0]);

        if (!adminUser) {
            throw new Error("Usuário lsallesforce@gmail.com não encontrado.");
        }
        console.log(`Usuário admin encontrado: ${adminUser.name} (ID: ${adminUser.id})`);

        // Buscar o organizador associado ao admin
        let organizer = await db.select().from(organizers)
            .where(eq(organizers.ownerId, adminUser.openId))
            .limit(1)
            .then(res => res[0]);

        if (!organizer) {
            // Fallback: primeiro organizador disponível
            organizer = await db.select().from(organizers).limit(1).then(res => res[0]);
        }

        if (!organizer) {
            throw new Error("Nenhum organizador encontrado.");
        }

        console.log(`Usando organizador: ${organizer.name} (ID: ${organizer.id})`);

        let importedCount = 0;
        let skippedCount = 0;

        for (const data of mitsubishiEvents2025) {
            const startDate = new Date(data.startDate + "T12:00:00Z");
            const endDate = new Date(data.endDate + "T23:59:00Z");

            // Checar duplicata
            const existing = await db.select().from(events).where(
                eq(events.name, data.name)
            ).limit(1);

            if (existing.length > 0) {
                console.log(`- Pulando (já existe): ${data.name}`);
                skippedCount++;
                continue;
            }

            await db.insert(events).values({
                name: data.name,
                description: data.description,
                startDate,
                endDate,
                location: data.location,
                city: data.city,
                state: data.state,
                status: "open",
                organizerId: organizer.id,
                isExternal: true,
                showInListing: true,
                showRegistrations: false,
                imageUrl: data.imageUrl,
                externalUrl: data.externalUrl,
            });

            console.log(`✓ Criado: ${data.name}`);
            importedCount++;
        }

        console.log(`\n=== RESULTADO ===`);
        console.log(`Criados: ${importedCount}`);
        console.log(`Pulados (já existiam): ${skippedCount}`);
        console.log(`================`);

    } catch (error) {
        console.error("Erro:", error);
    } finally {
        process.exit(0);
    }
}

seed();
