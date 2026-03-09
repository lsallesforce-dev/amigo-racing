import "dotenv/config";
import { getDb } from "./api/server/db.js";
import { events } from "./api/server/drizzle/schema.js";
import fs from "fs";

async function checkEvents() {
    const db = await getDb();
    if (!db) {
        console.error("Database not available");
        process.exit(1);
    }

    const allEvents = await db.select().from(events);
    console.log(`--- Events ---`);
    console.log(`Total Events: ${allEvents.length}`);
    allEvents.forEach(e => console.log(`- ID: ${e.id}, Name: ${e.name}`));
    process.exit(0);
}

checkEvents();
