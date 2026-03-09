import "dotenv/config";
import { getDb } from "./api/server/db.js";
import { users, registrations } from "./api/server/schema.js";
import { ilike, or } from "drizzle-orm";

async function findWeliton() {
    const db = await getDb();
    if (!db) {
        console.error("Database not available");
        process.exit(1);
    }

    console.log("Searching for Weliton...");
    const welitonUsers = await db.select().from(users).where(
        or(
            ilike(users.name, "%Wéliton%"),
            ilike(users.name, "%Weliton%"),
            ilike(users.email, "%weliton%"),
            ilike(users.email, "%oliveira%")
        )
    );

    console.log(`Found ${welitonUsers.length} users:`);
    for (const u of welitonUsers) {
        console.log(`- ID: ${u.id}, OpenID: ${u.openId}, Name: ${u.name}, Email: ${u.email}, Role: ${u.role}`);

        const regs = await db.select().from(registrations).where(eq(registrations.userId, u.id));
        console.log(`  Registrations: ${regs.length}`);
        regs.forEach(r => console.log(`    - Reg ID: ${r.id}, Pilot: ${r.pilotName}`));
    }

    process.exit(0);
}

import { eq } from "drizzle-orm";
findWeliton().catch(console.error);
