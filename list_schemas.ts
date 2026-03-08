import postgres from "postgres";
import "dotenv/config";

async function listSchemas() {
    const url = process.env.DATABASE_URL;
    if (!url) return;
    const sql = postgres(url);

    try {
        const schemas = await sql`SELECT schema_name FROM information_schema.schemata WHERE schema_name NOT IN ('information_schema', 'pg_catalog');`;
        console.log("--- Schemas ---");
        schemas.forEach(s => console.log(`- ${s.schema_name}`));
        process.exit(0);
    } catch (err) {
        console.error("Failed to list schemas:", err);
        process.exit(1);
    }
}

listSchemas();
