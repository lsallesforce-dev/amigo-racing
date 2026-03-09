import "dotenv/config";
import { getDb } from "./api/_server/db.js";
import { organizers } from "./api/_server/schema.js";

async function debug() {
    const db = await getDb();
    if (!db) return;
    const allOrgs = await db.select().from(organizers);
    console.log("Organizers:", JSON.stringify(allOrgs, null, 2));
    process.exit(0);
}
debug();
