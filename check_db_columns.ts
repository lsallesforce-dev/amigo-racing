import { ENV } from './api/_server/env.js';
import postgres from 'postgres';

async function checkColumns() {
    let cleanConnectionString = ENV.databaseUrl;
    try {
        const url = new URL(ENV.databaseUrl);
        if (url.searchParams.has("pgbouncer")) {
            url.searchParams.delete("pgbouncer");
            cleanConnectionString = url.toString();
        }
    } catch (e) {
        cleanConnectionString = ENV.databaseUrl.replace(/[\?&]pgbouncer=true/g, "");
    }

    const sql = postgres(cleanConnectionString, { ssl: 'require', prepare: false });

    try {
        const columns = await sql`
            SELECT column_name 
            FROM information_schema.columns 
            WHERE table_name = 'events'
        `;
        console.log("Columns in 'events' table:");
        console.log(columns.map(c => c.column_name));
    } catch (err) {
        console.error("Error fetching columns:", err);
    } finally {
        await sql.end();
    }
}

checkColumns();
