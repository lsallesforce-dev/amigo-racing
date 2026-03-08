import { getDb } from './server/db';
import { users } from './drizzle/schema';
import { sql } from 'drizzle-orm';

async function checkBankData() {
  try {
    const db = await getDb();
    if (!db) {
      console.log('❌ Database not available');
      process.exit(1);
    }

    console.log('\n📊 VERIFICANDO DADOS BANCÁRIOS NO BANCO:');
    
    // Query usando Drizzle
    const result = await db.select({
      id: users.id,
      email: users.email,
      bankDocument: users.bankDocument,
      bankCode: users.bankCode,
      bankAgency: users.bankAgency,
      bankAgencyDv: users.bankAgencyDv,
      bankAccount: users.bankAccount,
      bankAccountDv: users.bankAccountDv,
      recipientId: users.recipientId,
    }).from(users).limit(5);

    console.log('\n✅ Resultado da query:');
    console.log(JSON.stringify(result, null, 2));

    // Procurar especificamente por Wéliton
    const welton = await db.select({
      id: users.id,
      email: users.email,
      bankDocument: users.bankDocument,
      bankAccount: users.bankAccount,
      bankAccountDv: users.bankAccountDv,
      recipientId: users.recipientId,
    }).from(users).where(sql`email LIKE '%projeto%'`).limit(1);

    console.log('\n🔍 Dados de Wéliton (projeto@lstecnologias.com.br):');
    console.log(JSON.stringify(welton, null, 2));

  } catch (error) {
    console.error('❌ Erro:', error);
    process.exit(1);
  }
  process.exit(0);
}

checkBankData();
