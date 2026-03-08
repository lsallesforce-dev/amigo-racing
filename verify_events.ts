import 'dotenv/config';
import { getDb } from './server/db.ts';
import { events } from './server/drizzle/schema.ts';

async function checkEvents() {
    const db = await getDb();
    if (!db) {
        console.error("Database connection failed.");
        process.exit(1);
    }

    const allEvents = await db.select().from(events);
    console.log("Current events in DB:", allEvents.length);

    if (allEvents.length === 0) {
        console.log("Creating a test event...");
        await db.insert(events).values({
            name: "Test Event",
            startDate: new Date(),
            endDate: new Date(Date.now() + 86400000),
            organizerId: 1, // Assumes there's an organizer with ID 1
            status: "open",
            location: "Virtual",
            city: "Test City",
            state: "TS",
            showInListing: true,
            createdAt: new Date(),
            updatedAt: new Date(),
        });
        console.log("Event created successfully.");
    } else {
        console.log("Test events exist. First event:", allEvents[0].name);
    }
}

checkEvents().catch(console.error).finally(() => process.exit(0));
