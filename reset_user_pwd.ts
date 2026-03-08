import 'dotenv/config';
import { getDb } from './server/db.ts';
import { users } from './server/drizzle/schema.ts';
import { eq } from 'drizzle-orm';
import { hashPassword } from './server/oauth.ts';

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
