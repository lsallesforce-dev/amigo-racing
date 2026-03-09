import postgres from 'postgres';
import fs from 'fs';

const env = fs.readFileSync('.env', 'utf8');
const url = env.split('\n')[0].replace('DATABASE_URL=', '').trim();

console.log('Testing URL:', url.replace(/:.*@/, ':****@'));

const sql = postgres(url, {
    ssl: 'require',
    connect_timeout: 10
});

async function test() {
    try {
        console.log('Connecting...');
        const result = await sql`SELECT 1 as connected`;
        console.log('SUCCESS:', result);
    } catch (err) {
        console.error('FAILED:', err);
    } finally {
        await sql.end();
    }
}

test();
