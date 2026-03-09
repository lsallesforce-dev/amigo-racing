
import { getDb } from "./api/server/db.js";
import { users, events, organizers } from "./api/server/schema.js";
import { eq, inArray } from "drizzle-orm";

async function verify() {
    const db = await getDb();
    if (!db) process.exit(1);

    const email = "lsallesforce@gmail.com";
    const user = (await db.select().from(users).where(eq(users.email, email)).limit(1))[0];
    const org = (await db.select().from(organizers).where(eq(organizers.ownerId, user.openId)).limit(1))[0];

    console.log(`User: ${user.email} (OpenID: ${user.openId})`);
    console.log(`Organizer: ${org.name} (ID: ${org.id}, OwnerID: ${org.ownerId})`);

    const eventNames = [
        "Paulista Off-Road - 1ª Etapa (Brotas/SP)",
        "Mitsubishi Motorsports - 1ª Etapa (Goiânia/GO)",
        "Mitsubishi Motorsports - 2ª Etapa (Campo Alegre/SC)"
    ];

    const dbEvents = await db.select().from(events).where(inArray(events.name, eventNames));

    dbEvents.forEach(e => {
        console.log(`Event: ${e.name}, OrganizerID: ${e.organizerId}, Match: ${e.organizerId === org.id}`);
    });

    process.exit(0);
}

verify().catch(console.error);
