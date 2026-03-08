import 'dotenv/config';
import { getDb } from './server/db.ts';
import { users } from './server/drizzle/schema.ts';
import { eq } from 'drizzle-orm';

async function makeOrganizer() {
    const db = await getDb();
    if (!db) {
        console.error("Database connection failed.");
        process.exit(1);
    }

    const result = await db.update(users).set({ role: 'organizer' }).where(eq(users.openId, 'lsallesforce@gmail.com'));
    console.log("Updated user to organizer.", result);
}

makeOrganizer().catch(console.error).finally(() => process.exit(0));
