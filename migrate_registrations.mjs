import postgres from "postgres";

const sql = postgres("postgresql://postgres:postgres123@localhost:5432/amigo_racing");

async function migrate() {
    try {
        console.log("Adding missing columns to registrations table...");
        await sql`
      ALTER TABLE registrations 
      ADD COLUMN IF NOT EXISTS "vehicleYear" integer,
      ADD COLUMN IF NOT EXISTS "vehicleColor" varchar(50),
      ADD COLUMN IF NOT EXISTS "vehiclePlate" varchar(20)
    `;
        console.log("Migration successful!");
    } catch (error) {
        console.error("Migration failed:", error);
    } finally {
        await sql.end();
    }
}

migrate();
LineContent:
LineNumber:
MatchPerLine: false
Query:
SearchPath:
waitForPreviousTools: true
