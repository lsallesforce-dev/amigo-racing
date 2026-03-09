import 'dotenv/config';
import { getDb } from './api/_server/db.js';
import { users } from './api/_server/schema.js';
import { eq } from 'drizzle-orm';

async function verifyUser() {
    const email = 'projeto@lstecnologias.com.br';
    const db = await getDb();
    if (!db) {
        console.error("Database connection failed.");
        process.exit(1);
    }

    const result = await db.select().from(users).where(eq(users.openId, email));
    if (result.length === 0) {
        console.log(`User ${email} NOT FOUND in database.`);
    } else {
        const user = result[0];
        console.log(`User ${email} FOUND:`);
        console.log(`- ID: ${user.id}`);
        console.log(`- Role: ${user.role}`);
        console.log(`- Has Password: ${!!user.password}`);
        console.log(`- Login Method: ${user.loginMethod}`);
    }
}

verifyUser().catch(console.error).finally(() => process.exit(0));
