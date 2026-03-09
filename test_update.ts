import { getDb } from './api/_server/db.js';
import { events } from './api/_server/schema.js';
import { eq } from 'drizzle-orm';

async function testUpdate() {
    const db = await getDb();
    if (!db) {
        console.error("No DB");
        return;
    }

    // Find an event
    const allEvents = await db.select().from(events).limit(1);
    if (allEvents.length === 0) {
        console.log("No events to test");
        return;
    }

    const eventIdx = allEvents[0];
    console.log(`Testing with event ID: ${eventIdx.id}`);

    const testDocs = JSON.stringify([{ name: "Test Doc", url: "http://test.com", type: "pdf" }]);
    const testNav = [{ name: "Test Nav", url: "http://nav.com", type: "nbp" }];

    console.log("Updating event...");
    await db.update(events).set({
        documents: testDocs,
        navigationFiles: testNav
    }).where(eq(events.id, eventIdx.id));

    const updatedEvents = await db.select().from(events).where(eq(events.id, eventIdx.id)).limit(1);
    const updatedEvent = updatedEvents[0];
    console.log("Results:");
    console.log("Documents:", updatedEvent.documents);
    console.log("NavigationFiles:", JSON.stringify(updatedEvent.navigationFiles));

    if (updatedEvent.documents === testDocs && JSON.stringify(updatedEvent.navigationFiles) === JSON.stringify(testNav)) {
        console.log("SUCCESS: Backend correctly persists documents and navigationFiles.");
    } else {
        console.log("FAILURE: Data mismatch.");
    }
}

testUpdate().catch(console.error);
