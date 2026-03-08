import { getDb } from './server/db';
import { users } from './drizzle/schema';
import { eq } from 'drizzle-orm';

async function testMutationFlow() {
  const db = await getDb();
  if (!db) {
    console.log('Database not available');
    process.exit(1);
  }

  try {
    const userId = 2820172; // Wéliton
    
    console.log('=== TESTE DO FLUXO DA MUTAÇÃO ===\n');
    
    // SIMULAR O QUE A MUTAÇÃO FAZ
    console.log('PASSO 1: Simular input da mutação');
    const input = {
      document: '82751056849',
      pixKey: '17996192552',
      holderName: 'Weliton Luiz de Oliveira',
      holderEmail: 'projeto@lstecnologias.com.br',
      bankAccount: {
        bank_code: '237',
        agencia: '2740',
        agencia_dv: '',  // Vazio porque é Bradesco
        conta: '21603',
        conta_dv: '8',   // O DÍGITO QUE DEVE SER SALVO
        type: 'conta_corrente',
        legal_name: 'Weliton Luiz de Oliveira',
        document_number: '82751056849',
      },
    };
    
    console.log('Input da mutação:', JSON.stringify(input, null, 2));
    
    // PASSO 2: Simular updateUserBankData
    console.log('\nPASSO 2: Chamando updateUserBankData');
    const bankDataToSave = {
      bankDocument: input.document,
      bankCode: input.bankAccount.bank_code,
      bankAgency: input.bankAccount.agencia,
      bankAgencyDv: input.bankAccount.agencia_dv || '',
      bankAccount: input.bankAccount.conta,
      bankAccountDv: input.bankAccount.conta_dv,
      bankAccountType: input.bankAccount.type,
      bankHolderName: input.bankAccount.legal_name,
      bankHolderDocument: input.bankAccount.document_number,
      pixKey: input.pixKey,
    };
    
    console.log('Dados a salvar:', JSON.stringify(bankDataToSave, null, 2));
    console.log('bankAccountDv sendo salvo:', bankDataToSave.bankAccountDv);
    
    await db.update(users).set(bankDataToSave).where(eq(users.id, userId));
    console.log('✅ UPDATE executado');
    
    // PASSO 3: Simular getUserById (como faz o retorno)
    console.log('\nPASSO 3: Chamando getUserById para retorno');
    const finalUserData = await db.select({
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
      bankAccountDv: users.bankAccountDv,
      bankAccountType: users.bankAccountType,
      bankHolderName: users.bankHolderName,
      bankHolderDocument: users.bankHolderDocument,
      createdAt: users.createdAt,
      updatedAt: users.updatedAt,
      lastSignedIn: users.lastSignedIn,
    }).from(users).where(eq(users.id, userId)).limit(1);
    
    console.log('Resultado do getUserById:');
    console.log(JSON.stringify(finalUserData, null, 2));
    
    if (finalUserData.length > 0) {
      const user = finalUserData[0];
      console.log('\n✅ VERIFICAÇÃO FINAL:');
      console.log('bankAccountDv retornado:', user.bankAccountDv);
      console.log('bankAgencyDv retornado:', user.bankAgencyDv);
      
      if (user.bankAccountDv === '8') {
        console.log('\n🎉 SUCESSO! O dígito foi salvo e lido corretamente!');
      } else {
        console.log('\n❌ ERRO! O dígito NÃO foi salvo ou não está sendo lido!');
        console.log('Valor esperado: "8"');
        console.log('Valor recebido:', user.bankAccountDv);
      }
      
      // PASSO 4: Simular o retorno da mutação
      console.log('\nPASSO 4: Simulando retorno da mutação');
      const mutationReturn = {
        success: true,
        recipientId: null,
        localDataSaved: true,
        pagarmeError: null,
        message: 'Dados bancarios salvos!',
        userData: user,
      };
      
      console.log('Retorno da mutação:');
      console.log(JSON.stringify(mutationReturn, null, 2));
      
      console.log('\nCampos bancários no retorno:');
      console.log('bankAccountDv:', mutationReturn.userData.bankAccountDv);
      console.log('bankAgencyDv:', mutationReturn.userData.bankAgencyDv);
    }
    
  } catch (error) {
    console.error('Erro:', error);
  }
  
  process.exit(0);
}

testMutationFlow();
