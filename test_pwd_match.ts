import 'dotenv/config';
import { getDb } from './api/_server/db.js';
import { users } from './api/_server/schema.js';
import { eq } from 'drizzle-orm';
import { verifyPassword } from './api/_server/oauth.js';

async function testPassword() {
    const email = 'projeto@lstecnologias.com.br';
    const testPassword = 'admin';
    const db = await getDb();
    if (!db) {
        console.error("Database connection failed.");
        process.exit(1);
    }

    const result = await db.select().from(users).where(eq(users.openId, email));
    if (result.length === 0) {
        console.log("User not found");
        return;
    }

    const user = result[0];
    const hash = user.password;
    console.log(`Testing password "${testPassword}" against hash: ${hash}`);

    if (!hash) {
        console.log("User has no password.");
        return;
    }

    const isValid = verifyPassword(testPassword, hash);
    console.log(`Is valid: ${isValid}`);
}

testPassword().catch(console.error).finally(() => process.exit(0));
