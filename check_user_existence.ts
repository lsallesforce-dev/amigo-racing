
import { getDb } from "./api/_server/db.js";
import { users } from "./api/_server/schema.js";
import { eq } from "drizzle-orm";

async function checkUser() {
    const db = await getDb();
    if (!db) {
        console.error("Database not available");
        process.exit(1);
    }

    const email = "lsallesforce@gmail.com";
    const user = await db.select().from(users).where(eq(users.email, email)).limit(1);

    if (user.length > 0) {
        console.log(`User found: ID ${user[0].id}, Name: ${user[0].name}, Email: ${user[0].email}`);
    } else {
        console.log(`User ${email} NOT found.`);
    }
    process.exit(0);
}

checkUser().catch(err => {
    console.error(err);
    process.exit(1);
});
