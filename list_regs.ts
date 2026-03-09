import "dotenv/config";
import { getDb } from "./api/server/db.js";
import { registrations, users } from "./api/server/schema.js";
import fs from "fs";
import { eq } from "drizzle-orm";

async function listAllRegs() {
    const db = await getDb();
    if (!db) {
        fs.writeFileSync("regs_output.txt", "Database not available");
        process.exit(1);
    }

    const allRegs = await db.select().from(registrations);
    let output = `Total Registrations: ${allRegs.length}\n`;

    for (const r of allRegs) {
        const user = await db.select().from(users).where(eq(users.id, r.userId)).limit(1);
        const userName = user.length > 0 ? user[0].name : "UNKNOWN USER";
        const userEmail = user.length > 0 ? user[0].email : "N/A";
        output += `- ID: ${r.id}, UserID: ${r.userId}, Pilot: ${r.pilotName}, User: ${userName} (${userEmail})\n`;
    }

    fs.writeFileSync("regs_output.txt", output);
    process.exit(0);
}

listAllRegs().catch(err => {
    fs.writeFileSync("regs_output.txt", err.stack || String(err));
    process.exit(1);
});
