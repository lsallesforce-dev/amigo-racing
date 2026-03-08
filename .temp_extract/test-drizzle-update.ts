import { getDb } from './server/db';
import { users } from './drizzle/schema';
import { eq } from 'drizzle-orm';

async function testDrizzleUpdate() {
  const db = await getDb();
  if (!db) {
    console.log('Database not available');
    process.exit(1);
  }

  try {
    const userId = 2820172; // Wéliton
    
    console.log('=== TESTE DE UPDATE COM DRIZZLE ===\n');
    
    // ANTES DO UPDATE
    console.log('PASSO 1: Verificar dados ANTES do update');
    const beforeUpdate = await db.select({
      id: users.id,
      bankAccountDv: users.bankAccountDv,
      bankAgencyDv: users.bankAgencyDv,
      bankAccount: users.bankAccount,
    }).from(users).where(eq(users.id, userId)).limit(1);
    
    console.log('Dados ANTES:', JSON.stringify(beforeUpdate, null, 2));
    
    // FAZER UPDATE
    console.log('\nPASSO 2: Fazer UPDATE com Drizzle');
    const updateData = {
      bankAccountDv: '8',
      bankAgencyDv: '5',
    };
    
    console.log('Dados a atualizar:', JSON.stringify(updateData, null, 2));
    
    const result = await db
      .update(users)
      .set(updateData)
      .where(eq(users.id, userId));
    
    console.log('Resultado do UPDATE:', result);
    
    // DEPOIS DO UPDATE
    console.log('\nPASSO 3: Verificar dados DEPOIS do update');
    const afterUpdate = await db.select({
      id: users.id,
      bankAccountDv: users.bankAccountDv,
      bankAgencyDv: users.bankAgencyDv,
      bankAccount: users.bankAccount,
    }).from(users).where(eq(users.id, userId)).limit(1);
    
    console.log('Dados DEPOIS:', JSON.stringify(afterUpdate, null, 2));
    
    if (afterUpdate.length > 0) {
      const user = afterUpdate[0];
      console.log('\n✅ VERIFICAÇÃO:');
      console.log('bankAccountDv:', user.bankAccountDv);
      console.log('bankAgencyDv:', user.bankAgencyDv);
      
      if (user.bankAccountDv === '8' && user.bankAgencyDv === '5') {
        console.log('\n🎉 SUCESSO! O UPDATE funcionou corretamente!');
      } else {
        console.log('\n❌ ERRO! O UPDATE não salvou os dados corretamente!');
      }
    }
    
  } catch (error) {
    console.error('Erro:', error);
  }
  
  process.exit(0);
}

testDrizzleUpdate();
