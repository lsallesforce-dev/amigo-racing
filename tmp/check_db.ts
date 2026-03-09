import { getDb } from "../api/_server/db.js";
import { sql } from "drizzle-orm";

async function diagnose() {
    console.log("--- DB DIAGNOSTIC ---");
    const db = await getDb();
    if (!db) {
        console.error("Could not initialize DB object.");
        return;
    }

    try {
        console.log("Testing basic connectivity (SELECT 1)...");
        const resultOne = await db.execute(sql`SELECT 1 as test`);
        console.log("Connectivity OK:", resultOne);

        console.log("\nListing all tables in 'public' schema...");
        const tables = await db.execute(sql`
      SELECT table_name 
      FROM information_schema.tables 
      WHERE table_schema = 'public'
    `);
        console.log("--- TABLE LIST START ---");
        tables.forEach(t => console.log(`TABLE: ${t.table_name}`));
        console.log("--- TABLE LIST END ---");

        console.log("\nChecking 'users' table columns...");
        const columns = await db.execute(sql`
      SELECT column_name, data_type 
      FROM information_schema.columns 
      WHERE table_name = 'users'
    `);

        if (columns.length === 0) {
            console.error("ERROR: Table 'users' NOT FOUND!");
        } else {
            console.log("Columns found in 'users' table:");
            columns.forEach(c => console.log(`- ${c.column_name} (${c.data_type})`));
        }

    } catch (error: any) {
        console.error("DIAGNOSTIC FAILED!");
        console.error("Error Message:", error.message);
        console.error("Error Code:", error.code);
        console.error("Raw Error:", JSON.stringify(error, Object.getOwnPropertyNames(error), 2));
        if (error.stack) console.error(error.stack);
    } finally {
        process.exit(0);
    }
}

diagnose();
