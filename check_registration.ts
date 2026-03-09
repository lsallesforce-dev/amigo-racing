import { getDb } from "./api/server/db.js";
import { registrations, events } from "./api/server/drizzle/schema.js";
import { ilike, eq } from "drizzle-orm";
import * as fs from "fs";

async function run() {
    const db = await getDb();
    if (!db) return;
    const regs = await db.select().from(registrations).where(ilike(registrations.pilotName, '%WELITON%'));

    let out = "Registrations for WELITON:\n";
    for (const r of regs) {
        out += `- Reg ID: ${r.id}, EventID: ${r.eventId}, CategoryID: ${r.categoryId}\n`;
        if (r.eventId) {
            const evt = await db.select().from(events).where(eq(events.id, r.eventId));
            out += `  Event ${r.eventId}: ` + (evt.length ? "FOUND (" + evt[0].name + ")\n" : "NOT FOUND (Event might be deleted)\n");
        } else {
            out += `  Reg ${r.id} has NO eventId!\n`;
        }
    }

    fs.writeFileSync("check_out_utf8.txt", out);
    console.log("Written to check_out_utf8.txt");
    process.exit(0);
}
run();
