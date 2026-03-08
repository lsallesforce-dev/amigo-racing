import 'dotenv/config';
import { getDb } from './server/db.ts';
import { users } from './server/drizzle/schema.ts';
import { eq } from 'drizzle-orm';

async function setupDevUser() {
    const db = await getDb();
    if (!db) {
        console.error("Database connection failed.");
        process.exit(1);
    }

    const existingUsers = await db.select().from(users).where(eq(users.id, 1));
    if (existingUsers.length === 0) {
        await db.insert(users).values({
            id: 1,
            openId: 'localdev@test.com',
            name: 'Admin Local',
            email: 'localdev@test.com',
            role: 'admin',
            createdAt: new Date(),
            updatedAt: new Date(),
            lastSignedIn: new Date()
        });
        console.log("Created user ID 1 as admin");
    } else {
        await db.update(users).set({ role: 'admin' }).where(eq(users.id, 1));
        console.log("Updated existing user ID 1 to admin");
    }
}

setupDevUser().catch(console.error).finally(() => process.exit(0));
