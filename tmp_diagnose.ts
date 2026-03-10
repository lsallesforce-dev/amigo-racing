import "dotenv/config";
import { getDb } from "./api/_server/db.js";
import { users, organizers, events } from "./api/_server/schema.js";
import { eq, ilike, or } from "drizzle-orm";

async function diagnose() {
    const db = await getDb();
    if (!db) {
        console.error("Database not available");
        process.exit(1);
    }

    console.log("=== DIAGNOSING LUCAS ===");
    const lucasUsers = await db.select().from(users).where(
        or(
            ilike(users.name, "%Lucas%"),
            ilike(users.email, "administracao@lstecnologias.com.br")
        )
    );

    for (const u of lucasUsers) {
        console.log(`User: ID=${u.id}, OpenID=${u.openId}, Name=${u.name}, Email=${u.email}, Role=${u.role}, RecipientId=${u.recipientId}`);

        const orgs = await db.select().from(organizers).where(eq(organizers.ownerId, u.openId));
        for (const o of orgs) {
            console.log(`  Organizer: ID=${o.id}, Name=${o.name}, OwnerId=${o.ownerId}`);

            const evs = await db.select().from(events).where(eq(events.organizerId, o.id));
            for (const e of evs) {
                console.log(`    Event: ID=${e.id}, Name=${e.name}, OrganizerId=${e.organizerId}`);
            }
        }
    }

    console.log("\n=== CHECKING FOR WELITON REFERENCES ===");
    const welitonUsers = await db.select().from(users).where(
        or(
            ilike(users.name, "%Weliton%"),
            ilike(users.name, "%Wéliton%")
        )
    );
    for (const u of welitonUsers) {
        console.log(`Weliton User: ID=${u.id}, OpenID=${u.openId}, RecipientId=${u.recipientId}`);
    }

    process.exit(0);
}

diagnose().catch(console.error);
