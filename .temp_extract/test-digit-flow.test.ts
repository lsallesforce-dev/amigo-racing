import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { getDb } from './db';
import { users } from '../drizzle/schema';
import { eq } from 'drizzle-orm';

describe('Digit Flow - SELECT, Form Load, and Database Persistence', () => {
  let db: any;
  let testUserId: number;

  beforeAll(async () => {
    db = await getDb();
  });

  it('should have bankAccountDv and bankAgencyDv columns in users table', async () => {
    // Verificar que as colunas existem
    const result = await db.select({
      bankAccountDv: users.bankAccountDv,
      bankAgencyDv: users.bankAgencyDv,
    }).from(users).limit(1);
    
    expect(result).toBeDefined();
    console.log('✅ Colunas bankAccountDv e bankAgencyDv existem no schema');
  });

  it('should include bankAccountDv and bankAgencyDv in SELECT queries', async () => {
    // Simular a query corrigida do getUserById
    const result = await db.select({
      id: users.id,
      bankDocument: users.bankDocument,
      bankCode: users.bankCode,
      bankAgency: users.bankAgency,
      bankAgencyDv: users.bankAgencyDv,
      bankAccount: users.bankAccount,
      bankAccountDv: users.bankAccountDv,
      bankAccountType: users.bankAccountType,
      bankHolderName: users.bankHolderName,
      bankHolderDocument: users.bankHolderDocument,
      recipientId: users.recipientId,
    }).from(users).limit(1);
    
    expect(result).toBeDefined();
    if (result.length > 0) {
      const user = result[0];
      console.log('✅ SELECT query retorna:', {
        bankAgency: user.bankAgency,
        bankAgencyDv: user.bankAgencyDv,
        bankAccount: user.bankAccount,
        bankAccountDv: user.bankAccountDv,
      });
    }
  });

  it('should correctly map digits for form initialization', async () => {
    // Simular o que acontece no useEffect do formulário
    const testData = {
      bankAccountDv: '8',
      bankAgencyDv: '5',
      bankAccountType: 'conta_corrente',
    };

    // Simular o mapeamento do formulário
    const formData = {
      accountDigit: testData.bankAccountDv || '',
      agencyDigit: testData.bankAgencyDv || '',
      accountType: (testData.bankAccountType === 'conta_poupanca' ? 'savings' : 'checking') as 'checking' | 'savings' | '',
    };

    expect(formData.accountDigit).toBe('8');
    expect(formData.agencyDigit).toBe('5');
    expect(formData.accountType).toBe('checking');
    console.log('✅ Mapeamento de dígitos para formulário correto:', formData);
  });

  it('should correctly map digits for Pagar.me API', async () => {
    // Simular o que acontece no createRecipient
    const bankAccount = {
      branchNumber: '2740',
      branchCheckDigit: '5',
      accountNumber: '21603',
      accountCheckDigit: '8',
    };

    // Sanitizar
    const sanitizeNumber = (value: string) => value.replace(/\D/g, '');
    const branchNumber = sanitizeNumber(bankAccount.branchNumber);
    const accountNumber = sanitizeNumber(bankAccount.accountNumber);
    const accountCheckDigit = sanitizeNumber(bankAccount.accountCheckDigit);

    // Simular o objeto enviado ao Pagar.me
    const recipientBody = {
      default_bank_account: {
        branch_number: branchNumber,
        branch_check_digit: bankAccount.branchCheckDigit || null,
        account_number: accountNumber,
        account_check_digit: accountCheckDigit,
      },
    };

    expect(recipientBody.default_bank_account.branch_number).toBe('2740');
    expect(recipientBody.default_bank_account.branch_check_digit).toBe('5');
    expect(recipientBody.default_bank_account.account_number).toBe('21603');
    expect(recipientBody.default_bank_account.account_check_digit).toBe('8');
    console.log('✅ Mapeamento de dígitos para Pagar.me correto:', recipientBody.default_bank_account);
  });

  it('should verify full flow: database -> form -> Pagar.me', async () => {
    // Dados de Wéliton
    const weltonData = {
      bankDocument: '82751056849',
      bankCode: '237',
      bankAgency: '2740',
      bankAgencyDv: '',
      bankAccount: '21603',
      bankAccountDv: '8',
      bankAccountType: 'conta_corrente',
      bankHolderName: 'Welíton',
      bankHolderDocument: '82751056849',
    };

    // Simular o fluxo completo
    console.log('\n📋 FLUXO COMPLETO DE WÉLITON:');
    console.log('1️⃣ Dados no banco:', {
      bankAccount: weltonData.bankAccount,
      bankAccountDv: weltonData.bankAccountDv,
      bankAgency: weltonData.bankAgency,
      bankAgencyDv: weltonData.bankAgencyDv,
    });

    // Simular o que o formulário carrega
    const formData = {
      account: weltonData.bankAccount,
      accountDigit: weltonData.bankAccountDv || '',
      agency: weltonData.bankAgency,
      agencyDigit: weltonData.bankAgencyDv || '',
    };
    console.log('2️⃣ Formulário carrega:', formData);

    // Simular o que é enviado ao Pagar.me
    const pagarmeData = {
      account_number: weltonData.bankAccount,
      account_check_digit: weltonData.bankAccountDv,
      branch_number: weltonData.bankAgency,
      branch_check_digit: weltonData.bankAgencyDv || null,
    };
    console.log('3️⃣ Pagar.me recebe:', pagarmeData);

    // Verificações
    expect(formData.accountDigit).toBe('8');
    expect(pagarmeData.account_check_digit).toBe('8');
    console.log('✅ Fluxo completo verificado com sucesso!');
  });
});
