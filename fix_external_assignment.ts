
import postgres from "postgres";

const connectionString = "postgresql://postgres:postgres123@localhost:5432/amigo_racing";

async function fixEvents() {
    const sql = postgres(connectionString);
    try {
        // 1. Find the admin user
        const adminUsers = await sql`SELECT id, "openId" FROM users WHERE email = 'lsallesforce@gmail.com' LIMIT 1`;
        if (adminUsers.length === 0) {
            console.error("Admin user not found!");
            return;
        }
        const adminUser = adminUsers[0];
        console.log(`Found admin user: ID=${adminUser.id}, openId=${adminUser.openId}`);

        // 2. Ensure they have an organizer record
        const existingOrgs = await sql`SELECT id FROM organizers WHERE "ownerId" = ${adminUser.openId} LIMIT 1`;
        let organizerId;
        if (existingOrgs.length === 0) {
            console.log("Creating organizer record for admin...");
            const [newOrg] = await sql`
                INSERT INTO organizers (name, description, active, "ownerId", "createdAt")
                VALUES ('Administrador', 'Organizador padrão para eventos externos', true, ${adminUser.openId}, NOW())
                RETURNING id
            `;
            organizerId = newOrg.id;
        } else {
            organizerId = existingOrgs[0].id;
        }
        console.log(`Using organizer ID: ${organizerId}`);

        // 3. Update all external events
        // Mark as external, linked to admin organizer, and ensure showInListing reflects the "calendario apenas" intent
        // (Note: based on previous conversation, "showInListing" determines if it's in the main cards or just calendar)
        const updatedEvents = await sql`
            UPDATE events 
            SET "organizerId" = ${organizerId},
                "isExternal" = true,
                "showInListing" = false,
                "status" = 'open'
            WHERE "isExternal" = true OR name ILIKE '%Mitsubishi%' OR name ILIKE '%Paulista%' OR name ILIKE '%Route%'
            RETURNING id, name
        `;

        console.log(`Updated ${updatedEvents.length} events:`);
        updatedEvents.forEach(e => console.log(`- ${e.name} (ID: ${e.id})`));

    } catch (error) {
        console.error("Error fixing events:", error);
    } finally {
        await sql.end();
    }
}

fixEvents();
