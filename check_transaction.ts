import * as db from './api/server/db.js';
import { registrations } from './api/server/drizzle/schema.js';
import { desc } from 'drizzle-orm';

async function main() {
    const database = await db.getDb();
    if (!database) {
        console.error('No database');
        return;
    }

    const latest = await database.select()
        .from(registrations)
        .orderBy(desc(registrations.createdAt))
        .limit(5);

    console.log('--- LATEST REGISTRATIONS ---');
    latest.forEach(reg => {
        console.log(`ID: ${reg.id} | Status: ${reg.status} | TransactionId: ${reg.transactionId} | Pilot: ${reg.pilotName} | CreatedAt: ${reg.createdAt}`);
    });

    process.exit(0);
}

main().catch(console.error);
