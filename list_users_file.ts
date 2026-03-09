import "dotenv/config";
import { getDb } from "./api/server/db.js";
import { users } from "./api/server/schema.js";
import fs from "fs";
import { desc } from "drizzle-orm";

async function listAllUsers() {
    const db = await getDb();
    if (!db) {
        fs.writeFileSync("users_list.txt", "Database not available");
        process.exit(1);
    }

    const allUsers = await db.select().from(users).orderBy(desc(users.createdAt));
    let output = `Total Users: ${allUsers.length}\n\n`;

    for (const u of allUsers) {
        output += `- ID: ${u.id}, Email: ${u.email}, OpenID: ${u.openId}, Name: ${u.name}, Role: ${u.role}, loginMethod: ${u.loginMethod}\n`;
    }

    fs.writeFileSync("users_list.txt", output);
    console.log("Users listed in users_list.txt");
    process.exit(0);
}

listAllUsers().catch(err => {
    fs.writeFileSync("users_list.txt", err.stack || String(err));
    process.exit(1);
});
