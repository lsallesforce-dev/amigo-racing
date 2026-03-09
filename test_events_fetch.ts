import { getAllEvents } from './api/_server/db.js';

async function testListAll() {
    try {
        console.log("Fetching events...");
        const events = await getAllEvents();
        console.log("Events fetched:", events.length);
    } catch (err) {
        console.error("Error fetching events:", err);
    }
}

testListAll();
