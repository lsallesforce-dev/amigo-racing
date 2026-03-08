import postgres from "postgres";
import "dotenv/config";

async function listTables(dbName: string) {
    const url = process.env.DATABASE_URL;
    if (!url) return;
    const baseUrl = url.replace(/\/[^/]+$/, `/${dbName}`);
    const sql = postgres(baseUrl);

    try {
        const tables = await sql`
      SELECT table_name 
      FROM information_schema.tables 
      WHERE table_schema = 'public' 
      AND table_type = 'BASE TABLE';
    `;
        console.log(`--- Tables in ${dbName} ---`);
        tables.forEach(t => console.log(`- ${t.table_name}`));
        process.exit(0);
    } catch (err) {
        console.error(`Failed to list tables in ${dbName}:`, err);
        process.exit(1);
    }
}

const args = process.argv.slice(2);
listTables(args[0] || 'amigo-racing');
