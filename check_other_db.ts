import postgres from "postgres";
import "dotenv/config";

async function checkOtherDb() {
    const url = process.env.DATABASE_URL;
    if (!url) {
        console.error("DATABASE_URL not set");
        process.exit(1);
    }

    // Swap amigo_racing with amigo-racing
    const otherUrl = url.replace("amigo_racing", "amigo-racing");
    const sql = postgres(otherUrl);

    try {
        const regsCount = await sql`SELECT count(*) FROM registrations;`;
        const usersCount = await sql`SELECT count(*) FROM users;`;

        console.log(`--- Database: amigo-racing ---`);
        console.log(`Registrations: ${regsCount[0].count}`);
        console.log(`Users: ${usersCount[0].count}`);

        if (Number(regsCount[0].count) > 0) {
            const topRegs = await sql`SELECT pilotName, eventId FROM registrations LIMIT 5;`;
            console.log("Sample Registrations:");
            topRegs.forEach(r => console.log(`- ${r.pilotname} (Event: ${r.eventid})`));
        }

        process.exit(0);
    } catch (err) {
        console.error("Failed to check amigo-racing:", err);
        process.exit(1);
    }
}

checkOtherDb();
