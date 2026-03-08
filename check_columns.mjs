import postgres from "postgres";
import "dotenv/config";

async function checkColumns() {
    const url = process.env.DATABASE_URL;
    if (!url) {
        console.error("DATABASE_URL is missing!");
        return;
    }
    const sql = postgres(url);

    try {
        console.log("--- Columns for 'events' table ---");
        const cols = await sql`
            SELECT column_name, data_type 
            FROM information_schema.columns 
            WHERE table_name = 'events'
            ORDER BY ordinal_position;
        `;
        cols.forEach(c => console.log(`- ${c.column_name} (${c.data_type})`));

        console.log("\n--- Columns for 'registrations' table ---");
        const regCols = await sql`
            SELECT column_name, data_type 
            FROM information_schema.columns 
            WHERE table_name = 'registrations'
            ORDER BY ordinal_position;
        `;
        regCols.forEach(c => console.log(`- ${c.column_name} (${c.data_type})`));
        process.exit(0);
    } catch (err) {
        console.error("Failed to list columns:", err);
        process.exit(1);
    }
}

checkColumns();
