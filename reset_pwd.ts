import { getDb } from "./api/_server/db.js";
import { users } from "./api/_server/schema.js";
import { eq } from "drizzle-orm";
import { scryptSync, randomBytes } from "crypto";
import "dotenv/config";

// Local password hashing util (copy-pasted from oauth.ts to be sure)
function hashPassword(password: string): string {
    const salt = randomBytes(16).toString("hex");
    const derivedKey = scryptSync(password, salt, 64).toString("hex");
    return `${salt}:${derivedKey}`;
}

async function resetPassword() {
    const db = await getDb();
    if (!db) return;

    const email = "projeto@lstecnologias.com.br";
    const newPassword = "Password123!";
    const hashed = hashPassword(newPassword);

    await db.update(users)
        .set({ password: hashed })
        .where(eq(users.email, email));

    console.log(`Password reset for ${email} to ${newPassword}`);
    process.exit(0);
}

resetPassword();
