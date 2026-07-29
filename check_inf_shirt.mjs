import postgres from 'postgres';
import { readFileSync } from 'fs';

// Load env manually
const envFile = readFileSync('.env', 'utf-8');
const DATABASE_URL = envFile.match(/DATABASE_URL=(.+)/)?.[1]?.trim();

const sql = postgres(DATABASE_URL, { ssl: 'require' });

// Inscrições com pilotShirtSize ou navigatorShirtSize = 'INF'
const r1 = await sql`
  SELECT id, "pilotName", "navigatorName", "pilotShirtSize", "navigatorShirtSize", "purchasedProducts", status
  FROM registrations
  WHERE (UPPER("pilotShirtSize") = 'INF' OR UPPER("navigatorShirtSize") = 'INF')
  AND status != 'cancelled'
`;
console.log('=== INSCRIÇÕES tamanho INF ===');
console.log(JSON.stringify(r1, null, 2));

// Inscrições com INF em purchasedProducts
const r2 = await sql`
  SELECT id, "pilotName", "purchasedProducts", status
  FROM registrations
  WHERE "purchasedProducts"::text ILIKE '%"INF"%'
  AND status != 'cancelled'
`;
console.log('\n=== INSCRIÇÕES com INF em extras ===');
console.log(JSON.stringify(r2, null, 2));

// Pedidos da loja com INF
const r3 = await sql`
  SELECT po.id, po."buyerName", po."buyerEmail", po.sizes, po.status, po."eventId"
  FROM product_orders po
  WHERE po.sizes::text ILIKE '%INF%'
  AND po.status != 'CANCELLED'
`;
console.log('\n=== PEDIDOS DA LOJA com INF ===');
console.log(JSON.stringify(r3, null, 2));

await sql.end();
