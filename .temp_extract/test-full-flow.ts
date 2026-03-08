import { getDb } from './server/db';
import { users } from './drizzle/schema';
import { eq } from 'drizzle-orm';

async function testFullFlow() {
  const db = await getDb();
  if (!db) {
    console.log('Database not available');
    process.exit(1);
  }

  try {
    const userId = 2820172; // Wéliton
    
    console.log('=== TESTE DO FLUXO COMPLETO ===\n');
    
    // PASSO 1: Simular updateUserBankData
    console.log('PASSO 1: Chamando updateUserBankData com conta_dv: "8"');
    const bankDataToSave = {
      bankDocument: '82751056849',
      bankCode: '237',
      bankAgency: '2740',
      bankAgencyDv: '',
      bankAccount: '21603',
      bankAccountDv: '8',  // ← O DÍGITO QUE DEVE SER SALVO
      bankAccountType: 'conta_corrente',
      bankHolderName: 'Weliton Luiz de Oliveira',
      bankHolderDocument: '82751056849',
      pixKey: '17996192552',
    };
    
    console.log('Dados a salvar:', JSON.stringify(bankDataToSave, null, 2));
    
    await db.update(users).set(bankDataToSave).where(eq(users.id, userId));
    console.log('✅ UPDATE executado\n');
    
    // PASSO 2: Simular getUserByOpenId (como faz auth.me)
    console.log('PASSO 2: Chamando getUserByOpenId (como faz auth.me)');
    const result = await db.select({
      id: users.id,
      openId: users.openId,
      name: users.name,
      email: users.email,
      phone: users.phone,
      loginMethod: users.loginMethod,
      role: users.role,
      recipientId: users.recipientId,
      pixKey: users.pixKey,
      bankDocument: users.bankDocument,
      bankCode: users.bankCode,
      bankAgency: users.bankAgency,
      bankAgencyDv: users.bankAgencyDv,
      bankAccount: users.bankAccount,
      bankAccountDv: users.bankAccountDv,  // ← DEVE ESTAR AQUI
      bankAccountType: users.bankAccountType,
      bankHolderName: users.bankHolderName,
      bankHolderDocument: users.bankHolderDocument,
      createdAt: users.createdAt,
      updatedAt: users.updatedAt,
      lastSignedIn: users.lastSignedIn,
    }).from(users).where(eq(users.id, userId)).limit(1);
    
    console.log('Resultado do SELECT:');
    console.log(JSON.stringify(result, null, 2));
    
    if (result.length > 0) {
      const user = result[0];
      console.log('\n✅ VERIFICAÇÃO:');
      console.log('bankAccountDv retornado:', user.bankAccountDv);
      console.log('bankAgencyDv retornado:', user.bankAgencyDv);
      
      if (user.bankAccountDv === '8') {
        console.log('\n🎉 SUCESSO! O dígito foi salvo e lido corretamente!');
      } else {
        console.log('\n❌ ERRO! O dígito NÃO foi salvo ou não está sendo lido!');
        console.log('Valor esperado: "8"');
        console.log('Valor recebido:', user.bankAccountDv);
      }
    }
    
  } catch (error) {
    console.error('Erro:', error);
  }
  
  process.exit(0);
}

testFullFlow();
