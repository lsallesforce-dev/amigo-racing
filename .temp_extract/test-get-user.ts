import { getDb } from './server/db';
import { users } from './drizzle/schema';
import { eq } from 'drizzle-orm';

async function testGetUser() {
  const db = await getDb();
  if (!db) {
    console.log('Database not available');
    process.exit(1);
  }

  try {
    const openId = 'weliton-openid'; // Substitua pelo openId real
    
    console.log('=== TESTE DE getUserByOpenId ===\n');
    
    // Tentar buscar o usuário
    console.log('Procurando usuário com openId:', openId);
    
    const result = await db.select({
      id: users.id,
      openId: users.openId,
      bankDocument: users.bankDocument,
      bankCode: users.bankCode,
      bankAgency: users.bankAgency,
      bankAgencyDv: users.bankAgencyDv,
      bankAccount: users.bankAccount,
      bankAccountDv: users.bankAccountDv,
    }).from(users).where(eq(users.openId, openId)).limit(1);
    
    console.log('Resultado da query:', JSON.stringify(result, null, 2));
    
    if (result.length > 0) {
      const user = result[0];
      console.log('\n✅ Usuário encontrado!');
      console.log('bankAccountDv:', user.bankAccountDv);
      console.log('bankAgencyDv:', user.bankAgencyDv);
    } else {
      console.log('\n❌ Usuário NÃO encontrado!');
      console.log('Procurando todos os usuários...');
      
      const allUsers = await db.select({
        id: users.id,
        openId: users.openId,
        email: users.email,
      }).from(users).limit(5);
      
      console.log('Primeiros 5 usuários:', JSON.stringify(allUsers, null, 2));
    }
    
  } catch (error) {
    console.error('Erro:', error);
  }
  
  process.exit(0);
}

testGetUser();
