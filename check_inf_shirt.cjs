const { Client } = require('pg');
require('dotenv').config();

async function main() {
  const client = new Client({ connectionString: process.env.DATABASE_URL });
  await client.connect();

  // Inscrições com pilotShirtSize ou navigatorShirtSize = 'INF'
  const r1 = await client.query(`
    SELECT id, "pilotName", "navigatorName", "pilotShirtSize", "navigatorShirtSize", "purchasedProducts", status
    FROM registrations
    WHERE (UPPER("pilotShirtSize") = 'INF' OR UPPER("navigatorShirtSize") = 'INF')
    AND status != 'cancelled'
  `);
  console.log('=== INSCRIÇÕES tamanho INF ===');
  console.log(JSON.stringify(r1.rows, null, 2));

  // Inscrições com INF em purchasedProducts (extras)
  const r2 = await client.query(`
    SELECT id, "pilotName", "purchasedProducts", status
    FROM registrations
    WHERE "purchasedProducts"::text ILIKE '%"INF"%'
    AND status != 'cancelled'
  `);
  console.log('\n=== INSCRIÇÕES com INF em extras ===');
  console.log(JSON.stringify(r2.rows, null, 2));

  // Pedidos da loja com INF
  const r3 = await client.query(`
    SELECT po.id, po."buyerName", po."buyerEmail", po.sizes, po.status, po."eventId"
    FROM product_orders po
    WHERE po.sizes::text ILIKE '%INF%'
    AND po.status != 'CANCELLED'
  `);
  console.log('\n=== PEDIDOS DA LOJA com INF ===');
  console.log(JSON.stringify(r3.rows, null, 2));

  await client.end();
}

main().catch(console.error);
