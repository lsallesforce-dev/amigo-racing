import postgres from "postgres";

const sql = postgres("postgresql://postgres:postgres123@localhost:5432/amigo_racing");

async function check() {
    try {
        const result = await sql`
      SELECT column_name
      FROM information_schema.columns 
      WHERE table_name = 'registrations'
      ORDER BY column_name
    `;
        console.log("COLUMNS_START");
        result.forEach(r => console.log(r.column_name));
        console.log("COLUMNS_END");
    } catch (error) {
        console.error("Error:", error);
    } finally {
        await sql.end();
    }
}

check();
LineContent:
LineNumber:
MatchPerLine: false
Query:
SearchPath:
waitForPreviousTools: true
