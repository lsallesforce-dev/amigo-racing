const postgres = require('postgres');
async function main() {
    console.log("Connecting to default postgres database...");
    const sql = postgres('postgresql://postgres:postgres123@localhost:5432/postgres');
    try {
        console.log("Checking if amigo_racing exists...");
        const dbs = await sql`SELECT datname FROM pg_database WHERE datname = 'amigo_racing'`;
        if (dbs.length === 0) {
            console.log("Creating database amigo_racing...");
            await sql`CREATE DATABASE amigo_racing`;
            console.log("Database created successfully!");
        } else {
            console.log("Database amigo_racing already exists.");
        }
    } catch (err) {
        console.error("Error creating database:", err);
    } finally {
        await sql.end();
    }
}
main();
