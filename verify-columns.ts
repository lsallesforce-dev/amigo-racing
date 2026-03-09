import { getDb } from './api/server/db.js';

async function verify() {
  const db = await getDb();
  if (!db) {
    console.log('Database not available');
    process.exit(1);
  }

  try {
    // Query simples para ver se as colunas existem
    const result = await db.execute(`
      SELECT 
        id,
        email,
        bankDocument,
        bankCode,
        bankAgency,
        bankAgencyDv,
        bankAccount,
        bankAccountDv
      FROM users 
      WHERE email = 'projeto@lstecnologias.com.br'
      LIMIT 1
    `);
    
    console.log('Resultado da query:');
    console.log(JSON.stringify(result, null, 2));
    
    if (result && result.length > 0) {
      console.log('\n✅ Colunas existem e têm dados!');
      console.log('bankAccountDv:', result[0].bankAccountDv);
      console.log('bankAgencyDv:', result[0].bankAgencyDv);
    }
  } catch (error) {
    console.error('Erro:', error);
  }
  
  process.exit(0);
}

verify();
