import postgres from "postgres";
import "dotenv/config";

async function listDbs() {
    const url = process.env.DATABASE_URL;
    if (!url) {
        console.error("DATABASE_URL not set");
        process.exit(1);
    }

    // Connect to postgres database (default) to list others
    const baseUrl = url.replace(/\/[^/]+$/, "/postgres");
    const sql = postgres(baseUrl);

    try {
        const databases = await sql`SELECT datname FROM pg_database WHERE datistemplate = false;`;
        console.log("--- Databases ---");
        databases.forEach(db => console.log(`- ${db.datname}`));
        process.exit(0);
    } catch (err) {
        console.error("Failed to list databases:", err);
        process.exit(1);
    }
}

listDbs();
