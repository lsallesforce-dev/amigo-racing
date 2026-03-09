import "dotenv/config";
import { getDb } from "./api/server/db.js";
import { users } from "./api/server/drizzle/schema.js";
import { like, or } from "drizzle-orm";

async function debug() {
    const db = await getDb();
    if (!db) return;
    const welitons = await db.select().from(users).where(
        or(
            like(users.name, "%Weliton%"),
            like(users.name, "%Wéliton%"),
            like(users.name, "%Wellington%"),
            like(users.openId, "%mock%")
        )
    );
    console.log("Welitons found:", JSON.stringify(welitons, null, 2));
    process.exit(0);
}
debug();
