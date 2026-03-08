import { getDb } from './server/db.ts';

async function checkBankData() {
  try {
    const db = await getDb();
    if (!db) {
      console.log('❌ Database not available');
      return;
    }

    // Query raw SQL
    const result = await db.execute(`
      SELECT id, email, bankDocument, bankCode, bankAgency, bankAgencyDv, bankAccount, bankAccountDv, recipientId
      FROM users
      LIMIT 5
    `);

    console.log('\n📊 DADOS BANCÁRIOS NO BANCO:');
    console.log(JSON.stringify(result, null, 2));

  } catch (error) {
    console.error('❌ Erro:', error);
  }
  process.exit(0);
}

checkBankData();
