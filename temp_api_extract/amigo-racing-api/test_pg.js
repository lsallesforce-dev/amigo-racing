const { Client } = require('pg');

const connectionString = 'postgresql://postgres:2411well123456%40@db.rjcdkasnipxcdrlmkskm.supabase.co:6543/postgres?sslmode=no-verify';

const client = new Client({
    connectionString: connectionString,
});

async function test() {
    try {
        console.log('Connecting...');
        await client.connect();
        console.log('Connected!');
        const res = await client.query('SELECT 1');
        console.log('Result:', res.rows);
    } catch (err) {
        console.error('Connection error:', err);
    } finally {
        await client.end();
    }
}

test();
