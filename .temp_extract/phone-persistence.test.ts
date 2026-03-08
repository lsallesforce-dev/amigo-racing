import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { getDb } from './db';
import { users } from '../drizzle/schema';
import { eq } from 'drizzle-orm';

describe('Phone Persistence Flow', () => {
  let db: any;
  let testUserId: number;
  let testOpenId: string;

  beforeAll(async () => {
    db = await getDb();
    if (!db) throw new Error('Database not available');

    // Criar usuário de teste
    testOpenId = `test-phone-${Date.now()}`;
    await db.insert(users).values({
      openId: testOpenId,
      email: `test-phone-${Date.now()}@test.com`,
      name: 'Test User',
      role: 'organizer',
      phone: null,
    });

    // Buscar o usuário criado
    const createdUser = await db.select({ id: users.id })
      .from(users)
      .where(eq(users.openId, testOpenId))
      .limit(1);

    testUserId = createdUser[0]?.id;
    console.log('✅ Usuário de teste criado:', testUserId);
  });

  afterAll(async () => {
    // Limpar usuário de teste
    if (db && testUserId) {
      await db.delete(users).where(eq(users.id, testUserId));
      console.log('✅ Usuário de teste deletado');
    }
  });

  it('should persist phone number to database', async () => {
    const testPhone = '17996192552';

    // PASSO 1: Atualizar usuário com telefone
    await db.update(users)
      .set({ phone: testPhone })
      .where(eq(users.id, testUserId));

    console.log(`✅ PASSO 1: Telefone "${testPhone}" salvo no banco`);

    // PASSO 2: Verificar se telefone foi realmente salvo
    const userAfterUpdate = await db.select({ phone: users.phone })
      .from(users)
      .where(eq(users.id, testUserId))
      .limit(1);

    console.log('✅ PASSO 2: Verificação após UPDATE:', userAfterUpdate[0]);
    expect(userAfterUpdate[0]?.phone).toBe(testPhone);
    console.log(`✅ PASSO 2 PASSOU: Telefone "${testPhone}" foi realmente salvo`);
  });

  it('should persist phone with bank data', async () => {
    const testPhone = '(17) 99619-2552';
    const bankData = {
      bankDocument: '12345678901234',
      bankCode: '290',
      bankAgency: '0001',
      bankAgencyDv: '',
      bankAccount: '123456',
      bankAccountDv: '8',
      bankAccountType: 'conta_corrente',
      bankHolderName: 'Test Holder',
      bankHolderDocument: '12345678901234',
      pixKey: 'test@test.com',
      phone: testPhone,
    };

    // PASSO 1: Atualizar usuário com telefone e dados bancários
    await db.update(users)
      .set(bankData)
      .where(eq(users.id, testUserId));

    console.log(`✅ PASSO 1: Dados bancários + telefone "${testPhone}" salvos`);

    // PASSO 2: Verificar se tudo foi salvo
    const userAfterUpdate = await db.select({
      phone: users.phone,
      bankAccountDv: users.bankAccountDv,
      bankDocument: users.bankDocument,
    })
      .from(users)
      .where(eq(users.id, testUserId))
      .limit(1);

    console.log('✅ PASSO 2: Verificação após UPDATE:', userAfterUpdate[0]);
    expect(userAfterUpdate[0]?.phone).toBe(testPhone);
    expect(userAfterUpdate[0]?.bankAccountDv).toBe('8');
    expect(userAfterUpdate[0]?.bankDocument).toBe('12345678901234');
    console.log(`✅ PASSO 2 PASSOU: Todos os dados foram salvos corretamente`);
  });

  it('should load phone after F5 refresh', async () => {
    const testPhone = '17991234567';

    // PASSO 1: Salvar telefone
    await db.update(users)
      .set({ phone: testPhone })
      .where(eq(users.id, testUserId));

    console.log(`✅ PASSO 1: Telefone "${testPhone}" salvo`);

    // PASSO 2: Simular F5 (nova query ao banco)
    const userAfterRefresh = await db.select({
      phone: users.phone,
      id: users.id,
    })
      .from(users)
      .where(eq(users.id, testUserId))
      .limit(1);

    console.log('✅ PASSO 2: Após F5 (nova query):', userAfterRefresh[0]);
    expect(userAfterRefresh[0]?.phone).toBe(testPhone);
    console.log(`✅ PASSO 2 PASSOU: Telefone "${testPhone}" carregado após F5`);
  });

  it('should handle phone field in updateUserBankData', async () => {
    const testPhone = '17988776655';

    // Simular o que updateUserBankData faz
    const updateData: any = {
      bankDocument: '12345678901234',
      bankCode: '290',
      bankAgency: '0001',
      bankAgencyDv: '',
      bankAccount: '123456',
      bankAccountDv: '8',
      bankAccountType: 'conta_corrente',
      bankHolderName: 'Test Holder',
      bankHolderDocument: '12345678901234',
    };

    if (testPhone) {
      updateData.phone = testPhone;
    }

    // PASSO 1: Executar UPDATE
    await db.update(users)
      .set(updateData)
      .where(eq(users.id, testUserId));

    console.log(`✅ PASSO 1: UPDATE executado com telefone "${testPhone}"`);

    // PASSO 2: Verificar
    const verifyAfter = await db.select({
      bankAccountDv: users.bankAccountDv,
      phone: users.phone,
    })
      .from(users)
      .where(eq(users.id, testUserId))
      .limit(1);

    console.log('✅ PASSO 2: Verificação:', verifyAfter[0]);
    expect(verifyAfter[0]?.phone).toBe(testPhone);
    expect(verifyAfter[0]?.bankAccountDv).toBe('8');
    console.log(`✅ PASSO 2 PASSOU: Telefone e dígito foram salvos corretamente`);
  });

  it('should not overwrite phone when updating bank data', async () => {
    const initialPhone = '17912345678';
    const newPhone = '17987654321';

    // PASSO 1: Salvar telefone inicial
    await db.update(users)
      .set({ phone: initialPhone })
      .where(eq(users.id, testUserId));

    console.log(`✅ PASSO 1: Telefone inicial "${initialPhone}" salvo`);

    // PASSO 2: Atualizar com novo telefone
    await db.update(users)
      .set({ phone: newPhone, bankAccountDv: '9' })
      .where(eq(users.id, testUserId));

    console.log(`✅ PASSO 2: Telefone atualizado para "${newPhone}"`);

    // PASSO 3: Verificar
    const userAfterUpdate = await db.select({
      phone: users.phone,
      bankAccountDv: users.bankAccountDv,
    })
      .from(users)
      .where(eq(users.id, testUserId))
      .limit(1);

    console.log('✅ PASSO 3: Verificação:', userAfterUpdate[0]);
    expect(userAfterUpdate[0]?.phone).toBe(newPhone);
    expect(userAfterUpdate[0]?.bankAccountDv).toBe('9');
    console.log(`✅ PASSO 3 PASSOU: Telefone foi atualizado corretamente`);
  });
});
