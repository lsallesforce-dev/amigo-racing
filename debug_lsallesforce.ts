import "dotenv/config";
import { getDb } from "./server/db.ts";
import { users } from "./server/drizzle/schema.ts";
import { eq } from "drizzle-orm";

async function debug() {
    const db = await getDb();
    if (!db) return;
    const email = "lsallesforce@gmail.com.br";
    const user = await db.select().from(users).where(eq(users.openId, email));

    if (user.length > 0) {
        console.log("FOUND_USER:");
        console.log("ID:", user[0].id);
        console.log("OpenID:", user[0].openId);
        console.log("Name:", user[0].name);
        console.log("Email:", user[0].email);
    } else {
        console.log("USER_NOT_FOUND");
    }
    process.exit(0);
}
debug();
