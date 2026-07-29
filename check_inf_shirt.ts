// check_inf_shirt.ts - run with: npx tsx check_inf_shirt.ts
import { neon } from '@neondatabase/serverless';
import dotenv from 'dotenv';
dotenv.config();

const sql = neon(process.env.DATABASE_URL!);

async function main() {
  // Inscrições com pilotShirtSize ou navigatorShirtSize = INF
  const regs = await sql`
    SELECT id, "pilotName", "navigatorName", "pilotShirtSize", "navigatorShirtSize", "purchasedProducts", status, "eventId"
    FROM registrations
    WHERE (UPPER("pilotShirtSize") = 'INF' OR UPPER("navigatorShirtSize") = 'INF')
    AND status != 'cancelled'
  `;
  console.log('=== INSCRIÇÕES com tamanho INF ===');
  console.log(JSON.stringify(regs, null, 2));

  // Inscrições com INF em purchasedProducts
  const regs2 = await sql`
    SELECT id, "pilotName", "purchasedProducts", status
    FROM registrations
    WHERE "purchasedProducts"::text ILIKE '%"INF"%'
    AND status != 'cancelled'
  `;
  console.log('\n=== INSCRIÇÕES com INF em extras ===');
  console.log(JSON.stringify(regs2, null, 2));

  // Pedidos avulsos da loja com INF
  const orders = await sql`
    SELECT po.id, po."buyerName", po."buyerEmail", po.sizes, po.status, po."eventId"
    FROM product_orders po
    WHERE po.sizes::text ILIKE '%INF%'
    AND po.status != 'CANCELLED'
  `;
  console.log('\n=== PEDIDOS DA LOJA com INF ===');
  console.log(JSON.stringify(orders, null, 2));
}

main().catch(console.error);
