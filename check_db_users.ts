import "dotenv/config";
import { getDb } from "./api/_server/db";
import { users } from "./api/_server/schema";
import { eq } from "drizzle-orm";

async function checkUser(openId: string) {
    const db = await getDb();
    if (!db) {
        console.error("No database connection");
        return;
    }

    const user = await db.select().from(users).where(eq(users.openId, openId)).limit(1);
    console.log("User data in DB:", JSON.stringify(user[0], null, 2));
}

// Substitute with the organizer's openid if known, or just list some users
async function listUsers() {
    const db = await getDb();
    if (!db) {
        console.error("No database connection");
        return;
    }

    const allUsers = await db.select().from(users).limit(10);
    console.log("Users in DB:");
    allUsers.forEach(u => console.log(`ID: ${u.id}, Name: ${u.name}, Phone: ${u.phone}`));
}

// checkUser("YOUR_OPENID");
listUsers();
