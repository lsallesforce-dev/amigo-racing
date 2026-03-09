import postgres from 'postgres';

const sql = postgres('postgresql://postgres:2411welL123456@db.rjcdkasnipxcdrlmkskm.supabase.co:6543/postgres');

async function test() {
    try {
        console.log('Attempting to connect...');
        const result = await sql`SELECT 1 as connected`;
        console.log('Connection successful:', result);
    } catch (error) {
        console.error('Connection failed:', error);
    } finally {
        await sql.end();
    }
}

test();
