import { getDb } from './server/db';
import { sql } from 'drizzle-orm';

async function checkColumns() {
  const db = await getDb();
  if (!db) {
    console.log('Database not available');
    process.exit(1);
  }

  const result = await db.execute(sql`DESCRIBE users`);
  console.log('Colunas da tabela users:');
  console.log(JSON.stringify(result, null, 2));
  
  const bankColumns = result.filter((col: any) => col.Field && col.Field.includes('bank'));
  console.log('\n\nColunas bancárias:');
  console.log(JSON.stringify(bankColumns, null, 2));
  
  process.exit(0);
}

checkColumns();
