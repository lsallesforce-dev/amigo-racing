import "dotenv/config";
import { getDb } from "./api/_server/db.js";
import { users, registrations } from "./api/_server/schema.js";
import { eq, or, ilike } from "drizzle-orm";
import fs from "fs";

async function diagnoseAccounts() {
    const db = await getDb();
    if (!db) {
        fs.writeFileSync("diagnose_output.txt", "Database not available");
        process.exit(1);
    }

    let output = "--- Account Analysis ---\n";
    const allUsers = await db.select().from(users);

    const manuscriptUsers = allUsers.filter(u => u.openId.length > 20 && !u.openId.includes("@"));
    output += `Manus Users: ${manuscriptUsers.length}\n`;

    const localUsers = allUsers.filter(u => u.openId.includes("@"));
    output += `Local Users: ${localUsers.length}\n`;

    const emailMap = new Map<string, typeof allUsers>();
    allUsers.forEach(u => {
        if (!u.email) return;
        const list = emailMap.get(u.email) || [];
        list.push(u);
        emailMap.set(u.email, list);
    });

    output += "--- Duplicate Emails (Manus + Local) ---\n";
    for (const [email, userList] of emailMap) {
        if (userList.length > 1) {
            output += `Email: ${email}\n`;
            userList.forEach(u => {
                output += `  - ID: ${u.id}, OpenID: ${u.openId}, Name: ${u.name}\n`;
            });
        }
    }

    output += "--- Registrations Linked to Manus Users ---\n";
    for (const u of manuscriptUsers) {
        const regs = await db.select().from(registrations).where(eq(registrations.userId, u.id));
        if (regs.length > 0) {
            output += `User ID: ${u.id} (${u.name}), Regs: ${regs.length}\n`;
            regs.forEach(r => {
                output += `    - Reg ID: ${r.id}, Pilot: ${r.pilotName}\n`;
            });
        }
    }

    fs.writeFileSync("diagnose_output.txt", output);
    process.exit(0);
}

diagnoseAccounts().catch(err => {
    fs.writeFileSync("diagnose_output.txt", err.stack || String(err));
    process.exit(1);
});
