import "dotenv/config";
import { getDb } from "./server/db.ts";
import { users, organizers } from "./server/drizzle/schema.ts";
import { eq } from "drizzle-orm";

async function main() {
    const db = await getDb();
    if (!db) return;

    const targetEmail = "lsallesforce@gmail.com";
    const user = await db.select().from(users).where(eq(users.email, targetEmail)).limit(1).then(res => res[0]);

    if (!user) {
        console.log(`User ${targetEmail} not found.`);
    } else {
        console.log(`User found: ID=${user.id}, OpenID=${user.openId}, Role=${user.role}`);

        const org = await db.select().from(organizers).where(eq(organizers.ownerId, user.openId)).limit(1).then(res => res[0]);
        if (org) {
            console.log(`Organizer found: ID=${org.id}, Name=${org.name}`);
        } else {
            console.log(`No organizer found for this user.`);
        }
    }
    process.exit(0);
}
main();
