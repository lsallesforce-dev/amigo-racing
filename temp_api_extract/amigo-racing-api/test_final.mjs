import postgres from 'postgres';

const variations = [
    'postgresql://postgres:2411well123456%40@db.rjcdkasnipxcdrlmkskm.supabase.co:6543/postgres?pgbouncer=true',
    'postgresql://postgres:2411welL123456%40@db.rjcdkasnipxcdrlmkskm.supabase.co:6543/postgres?pgbouncer=true',
    'postgresql://postgres:2411well123456@db.rjcdkasnipxcdrlmkskm.supabase.co:6543/postgres?pgbouncer=true',
    'postgresql://postgres:2411well123456%40@db.rjcdkasnipxcdrlmkskm.supabase.co:5432/postgres'
];

async function test() {
    for (const url of variations) {
        console.log('Testing variation:', url.replace(/:.*@/, ':****@'));
        const sql = postgres(url, {
            connect_timeout: 5,
            ssl: 'require'
        });
        try {
            const result = await sql`SELECT 1 as connected`;
            console.log('SUCCESS!');
            await sql.end();
            process.exit(0);
        } catch (err) {
            console.log('FAILED:', err.message || err.code || err);
        } finally {
            await sql.end();
        }
    }
}

test();
