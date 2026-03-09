import 'dotenv/config';
import { getDb } from './api/server/db.js';
import { users } from './api/server/drizzle/schema.js';
import { eq } from 'drizzle-orm';
import { hashPassword } from './api/server/oauth.js';

async function resetPassword() {
    const email = 'projeto@lstecnologias.com.br';
    const newPassword = 'admin'; // Specific password for testing
    const db = await getDb();
    if (!db) {
        console.error("Database connection failed.");
        process.exit(1);
    }

    const hashedPassword = hashPassword(newPassword);

    await db.update(users)
        .set({ password: hashedPassword, loginMethod: 'local' })
        .where(eq(users.openId, email));

    console.log(`Password for ${email} reset to: ${newPassword}`);
}

resetPassword().catch(console.error).finally(() => process.exit(0));
