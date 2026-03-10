import "dotenv/config";
import { getDb } from "./api/_server/db.js";
import { users } from "./api/_server/schema.js";
import { inArray } from "drizzle-orm";

async function diagnose() {
    const db = await getDb();
    if (!db) {
        console.error("Database not available");
        process.exit(1);
    }

    console.log("=== CHECKING BANK DOCUMENTS ===");
    const relevantUsers = await db.select().from(users).where(inArray(users.id, [1, 194]));
    for (const u of relevantUsers) {
        console.log(`User ID=${u.id}, Name=${u.name}, Document=${u.bankDocument}, RecipientId=${u.recipientId}`);
    }

    process.exit(0);
}

diagnose().catch(console.error);
