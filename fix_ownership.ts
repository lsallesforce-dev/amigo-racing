
import { getDb } from "./api/server/db.js";
import { users, events, organizers } from "./api/server/schema.js";
import { eq, inArray } from "drizzle-orm";

async function fixOwnership() {
    const db = await getDb();
    if (!db) {
        console.error("Database not available");
        process.exit(1);
    }

    const email = "lsallesforce@gmail.com";

    // 1. Find user
    const userResult = await db.select().from(users).where(eq(users.email, email)).limit(1);
    if (userResult.length === 0) {
        console.error(`User ${email} not found`);
        process.exit(1);
    }
    const user = userResult[0];

    // 2. Ensure user is admin (as requested "login admin")
    if (user.role !== 'admin') {
        console.log(`Updating user ${email} role from ${user.role} to admin...`);
        await db.update(users).set({ role: 'admin' }).where(eq(users.id, user.id));
    } else {
        console.log(`User ${email} is already an admin.`);
    }

    // 3. Find their organizer record
    const organizerResult = await db.select().from(organizers).where(eq(organizers.ownerId, user.openId)).limit(1);
    if (organizerResult.length === 0) {
        console.log(`No organizer profile found for user ${email}. Creating one...`);
        const [newOrganizer] = await db.insert(organizers).values({
            name: user.name || "Amigo Racing Organizer",
            ownerId: user.openId,
            active: true,
        }).returning();
        var organizerId = newOrganizer.id;
    } else {
        var organizerId = organizerResult[0].id;
        console.log(`Found organizer profile: ID ${organizerId}`);
    }

    // 4. Update events
    const eventNames = [
        "Paulista Off-Road - 1ª Etapa (Brotas/SP)",
        "Mitsubishi Motorsports - 1ª Etapa (Goiânia/GO)",
        "Mitsubishi Motorsports - 2ª Etapa (Campo Alegre/SC)"
    ];

    console.log(`Updating events to linked to organizer ${organizerId}...`);
    const result = await db.update(events)
        .set({ organizerId: organizerId })
        .where(inArray(events.name, eventNames));

    console.log("Ownership normalization completed!");
    process.exit(0);
}

fixOwnership().catch(err => {
    console.error(err);
    process.exit(1);
});
