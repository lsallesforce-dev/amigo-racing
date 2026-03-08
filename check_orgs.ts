import "dotenv/config";
import { getDb } from "./server/db.ts";
import { organizers } from "./server/drizzle/schema.ts";

async function checkOrganizers() {
    const db = await getDb();
    if (!db) {
        console.error("Database not available");
        process.exit(1);
    }

    const allOrgs = await db.select().from(organizers);
    console.log(`--- Organizers ---`);
    console.log(`Total Organizers: ${allOrgs.length}`);
    allOrgs.forEach(o => console.log(`- ID: ${o.id}, Name: ${o.name}, OwnerID: ${o.ownerId}`));
    process.exit(0);
}

checkOrganizers();
