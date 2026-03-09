const { spawnSync } = require('child_process');

const project = 'rjcdkasnipxcdrlmkskm';
const host = 'db.rjcdkasnipxcdrlmkskm.supabase.co';
const port = '6543';
const db = 'postgres';

const users = ['postgres', `postgres.${project}`];
const pwds = [
    '2411well123456%40',
    '2411welL123456%40',
    '2411well123456',
    '2411welL123456',
    '2411welll23456%40',
    '2411welll23456'
];

for (const user of users) {
    for (const pwd of pwds) {
        const url = `postgresql://${user}:${pwd}@${host}:${port}/${db}?pgbouncer=true`;
        console.log(`Testing: ${user}:****@${host}:${port}`);

        const res = spawnSync('npx', ['prisma', 'db', 'push'], {
            env: { ...process.env, DATABASE_URL: url },
            stdio: 'pipe',
            shell: true
        });

        const out = res.stdout.toString() + res.stderr.toString();
        if (out.includes('Done') || out.includes('Already in sync') || out.includes('The database is already in sync')) {
            console.log('SUCCESS!');
            console.log('User:', user);
            console.log('Pwd:', pwd);
            process.exit(0);
        } else if (out.includes('SASL')) {
            console.log('AUTH FAIL');
        } else if (out.includes('P1001')) {
            console.log('CONN FAIL (P1001)');
        } else {
            console.log('OTHER ERROR:', out.slice(-100).replace(/\n/g, ' '));
        }
    }
}
process.exit(1);
