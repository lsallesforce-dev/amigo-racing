
import { getDb } from "./server/db.ts";
import { events, users, organizers } from "./server/drizzle/schema.ts";
import { eq, and } from "drizzle-orm";

async function seed() {
    const db = await getDb();
    if (!db) {
        console.error("Database not available");
        process.exit(1);
    }

    const organizerEmail = "lsallesforce@gmail.com";

    // 1. Find user and their organizer record
    const userResult = await db.select().from(users).where(eq(users.email, organizerEmail)).limit(1);
    if (userResult.length === 0) {
        console.error(`User ${organizerEmail} not found`);
        process.exit(1);
    }
    const user = userResult[0];

    // In this system, organizers might be linked by ownerId (which is users.openId)
    const organizerResult = await db.select().from(organizers).where(eq(organizers.ownerId, user.openId)).limit(1);
    if (organizerResult.length === 0) {
        console.error(`Organizer record not found for user ${organizerEmail}`);
        process.exit(1);
    }
    const organizer = organizerResult[0];

    console.log(`Using Organizer: ${organizer.name} (ID: ${organizer.id}) for User: ${user.email}`);

    const eventData = [
        {
            name: "Paulista Off-Road - 1ª Etapa (Brotas/SP)",
            startDate: new Date("2026-03-07T09:00:00"),
            endDate: new Date("2026-03-07T18:00:00"),
            city: "Brotas",
            state: "SP",
            location: "Brotas/SP",
            imageUrl: "/Paulista.png",
        },
        {
            name: "Mitsubishi Motorsports - 1ª Etapa (Goiânia/GO)",
            startDate: new Date("2026-04-11T09:00:00"),
            endDate: new Date("2026-04-11T18:00:00"),
            city: "Goiânia",
            state: "GO",
            location: "Goiânia/GO",
            imageUrl: "/mitsubishi-motorsports-2021-260x265.jpg",
        },
        {
            name: "Mitsubishi Motorsports - 2ª Etapa (Campo Alegre/SC)",
            startDate: new Date("2026-05-16T09:00:00"),
            endDate: new Date("2026-05-16T18:00:00"),
            city: "Campo Alegre",
            state: "SC",
            location: "Campo Alegre/SC",
            imageUrl: "/mitsubishi-motorsports-2021-260x265.jpg",
        },
    ];

    for (const data of eventData) {
        // Check if event already exists to avoid duplicates
        const existing = await db.select().from(events).where(
            and(
                eq(events.name, data.name),
                eq(events.startDate, data.startDate)
            )
        ).limit(1);

        if (existing.length > 0) {
            console.log(`Event "${data.name}" already exists. Updating...`);
            await db.update(events).set({
                ...data,
                organizerId: organizer.id,
                status: "open",
                isExternal: false,
                showInListing: true,
                updatedAt: new Date(),
            }).where(eq(events.id, existing[0].id));
        } else {
            console.log(`Creating event "${data.name}"...`);
            await db.insert(events).values({
                ...data,
                organizerId: organizer.id,
                status: "open",
                isExternal: false,
                showInListing: true,
                showRegistrations: true,
                createdAt: new Date(),
                updatedAt: new Date(),
            } as any);
        }
    }

    console.log("Seed completed successfully!");
    process.exit(0);
}

seed().catch(err => {
    console.error(err);
    process.exit(1);
});
