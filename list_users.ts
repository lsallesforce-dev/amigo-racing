import "dotenv/config";
import { getDb } from "./api/server/db.js";
import { users, registrations } from "./api/server/drizzle/schema.js";

async function debugData() {
    const db = await getDb();
    if (!db) {
        console.error("Database not available");
        process.exit(1);
    }

    const allUsers = await db.select().from(users);
    console.log("--- Registered Users (Last 50) ---");
    allUsers.slice(-50).forEach(u => {
        console.log(`- ID: ${u.id}, OpenID: ${u.openId}, Name: ${u.name}, Email: ${u.email}, Role: ${u.role}`);
    });

    const allRegs = await db.select().from(registrations).limit(10);
    console.log("--- Sample Registrations ---");
    allRegs.forEach(r => {
        console.log(`- ID: ${r.id}, UserID: ${r.userId}, Pilot: ${r.pilotName}`);
    });

    process.exit(0);
}

debugData().catch(err => {
    console.error(err);
    process.exit(1);
});
