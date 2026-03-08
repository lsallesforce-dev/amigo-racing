import "dotenv/config";
import { getDb } from "./server/db.ts";
import { users } from "./server/drizzle/schema.ts";
import { sql } from "drizzle-orm";

async function findManusUsers() {
    const db = await getDb();
    if (!db) return;

    // Search for openId that looks like hex (Manus uses 24-char hex strings)
    const allUsers = await db.select().from(users);
    const manusUsers = allUsers.filter(u => /^[0-9a-f]{24}$/i.test(u.openId));

    console.log(`--- Manus Users (Hex OpenId) ---`);
    console.log(`Total Found: ${manusUsers.length}`);
    manusUsers.forEach(u => console.log(`- ID: ${u.id}, Email: ${u.email}, OpenId: ${u.openId}, Name: ${u.name}`));

    process.exit(0);
}

findManusUsers();
