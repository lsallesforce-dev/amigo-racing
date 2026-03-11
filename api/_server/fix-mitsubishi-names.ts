import "dotenv/config";
import { getDb } from "./db.js";
import { events } from "./schema.js";
import { eq } from "drizzle-orm";

const fixes = [
    { old: "Mitsubishi Motorsports - 1a Etapa", new: "Mitsubishi Motorsports - 1\u00aa Etapa" },
    { old: "Mitsubishi Motorsports - 2a Etapa", new: "Mitsubishi Motorsports - 2\u00aa Etapa" },
    { old: "Mitsubishi Motorsports - 3a Etapa", new: "Mitsubishi Motorsports - 3\u00aa Etapa" },
    { old: "Mitsubishi Motorsports - 4a Etapa", new: "Mitsubishi Motorsports - 4\u00aa Etapa" },
    { old: "Mitsubishi Motorsports - 5a Etapa Final Mit Rallies", new: "Mitsubishi Motorsports - 5\u00aa Etapa - Final Mit Rallies" },
];

async function fixNames() {
    const db = await getDb();
    if (!db) { console.error("No DB"); process.exit(1); }

    for (const fix of fixes) {
        const result = await db.update(events).set({ name: fix.new }).where(eq(events.name, fix.old));
        console.log(`\u2713 Renomeado: "${fix.new}"`);
    }
    console.log("Pronto!");
    process.exit(0);
}

fixNames().catch(e => { console.error(e); process.exit(1); });
