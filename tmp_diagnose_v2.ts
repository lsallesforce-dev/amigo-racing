import "dotenv/config";
import { getDb } from "./api/_server/db.js";
import { users, organizers, organizerMembers, events } from "./api/_server/schema.js";
import { eq } from "drizzle-orm";

async function diagnose() {
    const db = await getDb();
    if (!db) {
        console.error("Database not available");
        process.exit(1);
    }

    console.log("=== CHECKING USER ID 303 ===");
    const user303 = await db.select().from(users).where(eq(users.id, 303)).limit(1);
    if (user303.length > 0) {
        const u = user303[0];
        console.log(`User 303: OpenID=${u.openId}, Name=${u.name}, Email=${u.email}, Role=${u.role}, RecipientId=${u.recipientId}`);
    } else {
        console.log("User 303 not found");
    }

    console.log("\n=== CHECKING ORGANIZER MEMBERS FOR LUCAS ===");
    const lucasEmail = "administracao@lstecnologias.com.br";
    const memberships = await db.select().from(organizerMembers).where(eq(organizerMembers.memberEmail, lucasEmail));
    for (const m of memberships) {
        console.log(`Lucas is a member of Organizer ID: ${m.organizerId}, Permissions: ${m.permissions}`);

        const orgOwner = await db.select().from(users).where(eq(users.id, m.organizerId)).limit(1);
        if (orgOwner.length > 0) {
            console.log(`  Organizer Owner: ${orgOwner[0].name} (${orgOwner[0].email}), RecipientId=${orgOwner[0].recipientId}`);
        }
    }

    process.exit(0);
}

diagnose().catch(console.error);
