import * as db from './server/db.ts';
import { registrations } from './server/drizzle/schema.ts';
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
