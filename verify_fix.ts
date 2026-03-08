import "dotenv/config";
import { getDb } from "./server/db.ts";
import { events, organizers, users } from "./server/drizzle/schema.ts";
import { eq } from "drizzle-orm";

async function verify() {
    const db = await getDb();
    if (!db) return;

    const extEvents = await db.select().from(events).where(eq(events.isExternal, true));
    console.log(`External Events: ${extEvents.length}`);

    for (const e of extEvents) {
        console.log(`- ${e.name}: StartDate=${e.startDate.toISOString()}, OrgID=${e.organizerId}`);
    }
    process.exit(0);
}
verify();
