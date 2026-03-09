import "dotenv/config";
import { getDb } from "./api/_server/db.js";
import { users } from "./api/_server/schema.js";
import { eq } from "drizzle-orm";

async function debug() {
    const db = await getDb();
    if (!db) return;
    const email = "lsallesforce@gmail.com.br";
    const user = await db.select().from(users).where(eq(users.openId, email));
    console.log("User for lsallesforce@gmail.com.br:", JSON.stringify(user, null, 2));

    const allUsers = await db.select().from(users);
    console.log("All users count:", allUsers.length);
    allUsers.forEach(u => console.log(`ID: ${u.id}, OpenID: ${u.openId}, Name: ${u.name}`));
    process.exit(0);
}
debug();
