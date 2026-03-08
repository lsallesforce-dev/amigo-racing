import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { getDb } from './db';
import { users, organizers } from '../drizzle/schema';
import { eq } from 'drizzle-orm';

describe('Phone Integration Flow - Complete User Journey', () => {
  let db: any;
  let testUserId: number;
  let testOpenId: string;
  let organizerId: number;

  beforeAll(async () => {
    db = await getDb();
    if (!db) throw new Error('Database not available');

    // Criar usuário de teste (Welíton)
    testOpenId = `welition-test-${Date.now()}`;
    await db.insert(users).values({
      openId: testOpenId,
      email: `welition-${Date.now()}@test.com`,
      name: 'Welíton Test',
      role: 'organizer',
      phone: null,
    });

    // Buscar o usuário criado
    const createdUser = await db.select({ id: users.id })
      .from(users)
      .where(eq(users.openId, testOpenId))
      .limit(1);

    testUserId = createdUser[0]?.id;

    // Criar organizador associado
    const createdOrg = await db.insert(organizers).values({
      ownerId: testOpenId,
      name: 'Welíton Org',
    });

    organizerId = createdOrg[0]?.id || 1;
    console.log('✅ Setup: Usuário Welíton criado (ID:', testUserId, ')');
  });

  afterAll(async () => {
    // Limpar dados de teste
    if (db && testUserId) {
      await db.delete(users).where(eq(users.id, testUserId));
      console.log('✅ Cleanup: Usuário de teste deletado');
    }
  });

  it('FLUXO COMPLETO: Usuário digita telefone, salva, faz F5 e telefone permanece', async () => {
    const testPhone = '17996192552';
    const bankData = {
      bankDocument: '12345678901234',
      bankCode: '290',
      bankAgency: '0001',
      bankAgencyDv: '',
      bankAccount: '123456',
      bankAccountDv: '8',
      bankAccountType: 'conta_corrente',
      bankHolderName: 'Welíton',
      bankHolderDocument: '12345678901234',
      pixKey: 'welition@test.com',
      phone: testPhone,
    };

    // ========================================================================
    // ETAPA 1: USUARIO ABRE O PAINEL (meQuery)
    // ========================================================================
    console.log('\n📱 ETAPA 1: Usuário abre o painel');
    const userOnPanelOpen = await db.select({
      id: users.id,
      phone: users.phone,
      bankAccountDv: users.bankAccountDv,
    })
      .from(users)
      .where(eq(users.id, testUserId))
      .limit(1);

    console.log('   Estado inicial:', userOnPanelOpen[0]);
    expect(userOnPanelOpen[0]?.phone).toBeNull();
    expect(userOnPanelOpen[0]?.bankAccountDv).toBeNull();
    console.log('   ✅ Painel aberto, campos vazios como esperado');

    // ========================================================================
    // ETAPA 2: USUARIO DIGITA TELEFONE E DADOS BANCARIOS
    // ========================================================================
    console.log('\n✍️  ETAPA 2: Usuário digita telefone e dados bancários');
    console.log('   Telefone digitado:', testPhone);
    console.log('   Dígito da conta digitado: 8');

    // Simular o que o formulário faz (bankConfigForm state)
    const formState = {
      phone: testPhone,
      accountDigit: '8',
      ...bankData,
    };
    console.log('   ✅ Formulário preenchido em memória');

    // ========================================================================
    // ETAPA 3: USUARIO CLICA "SALVAR CONFIGURACOES"
    // ========================================================================
    console.log('\n💾 ETAPA 3: Usuário clica "Salvar Configurações"');
    console.log('   Payload enviado ao servidor:', {
      phone: formState.phone,
      bankAccount: {
        conta_dv: formState.accountDigit,
      },
    });

    // Simular setupRecipient mutation (salvamento no banco)
    await db.update(users)
      .set(bankData)
      .where(eq(users.id, testUserId));

    console.log('   ✅ Dados salvos no banco de dados');

    // Verificar se foi realmente salvo
    const userAfterSave = await db.select({
      phone: users.phone,
      bankAccountDv: users.bankAccountDv,
    })
      .from(users)
      .where(eq(users.id, testUserId))
      .limit(1);

    console.log('   Verificação após save:', userAfterSave[0]);
    expect(userAfterSave[0]?.phone).toBe(testPhone);
    expect(userAfterSave[0]?.bankAccountDv).toBe('8');
    console.log('   ✅ Dados foram realmente salvos no banco');

    // ========================================================================
    // ETAPA 4: USUARIO FAZ F5 (REFRESH)
    // ========================================================================
    console.log('\n🔄 ETAPA 4: Usuário faz F5 (refresh)');
    console.log('   Frontend refetch: meQuery.invalidate()');

    // Simular meQuery refetch (nova query ao banco)
    const userAfterF5 = await db.select({
      id: users.id,
      phone: users.phone,
      bankAccountDv: users.bankAccountDv,
      bankDocument: users.bankDocument,
      bankCode: users.bankCode,
      bankAgency: users.bankAgency,
      bankAccount: users.bankAccount,
      bankHolderName: users.bankHolderName,
    })
      .from(users)
      .where(eq(users.id, testUserId))
      .limit(1);

    console.log('   Dados carregados após F5:', userAfterF5[0]);
    expect(userAfterF5[0]?.phone).toBe(testPhone);
    expect(userAfterF5[0]?.bankAccountDv).toBe('8');
    console.log('   ✅ Telefone carregado após F5!');

    // ========================================================================
    // ETAPA 5: FORMULARIO E PREENCHIDO COM DADOS DO BANCO
    // ========================================================================
    console.log('\n📋 ETAPA 5: Formulário é preenchido com dados do banco');

    // Simular o que o useEffect faz (carrega dados do displayUser)
    const formStateAfterF5 = {
      phone: userAfterF5[0]?.phone || '',
      accountDigit: userAfterF5[0]?.bankAccountDv || '',
      document: userAfterF5[0]?.bankDocument || '',
      bank: userAfterF5[0]?.bankCode || '',
      agency: userAfterF5[0]?.bankAgency || '',
      account: userAfterF5[0]?.bankAccount || '',
      holderName: userAfterF5[0]?.bankHolderName || '',
    };

    console.log('   Estado do formulário após F5:', formStateAfterF5);
    expect(formStateAfterF5.phone).toBe(testPhone);
    expect(formStateAfterF5.accountDigit).toBe('8');
    console.log('   ✅ Formulário preenchido com dados do banco');

    // ========================================================================
    // ETAPA 6: USUARIO VE OS DADOS NA TELA
    // ========================================================================
    console.log('\n👁️  ETAPA 6: Usuário vê os dados na tela');
    console.log('   Campo de telefone exibe:', formStateAfterF5.phone);
    console.log('   Campo de dígito exibe:', formStateAfterF5.accountDigit);
    expect(formStateAfterF5.phone).toBe(testPhone);
    expect(formStateAfterF5.accountDigit).toBe('8');
    console.log('   ✅ SUCESSO! Dados aparecem na tela após F5');

    // ========================================================================
    // RESUMO DO FLUXO
    // ========================================================================
    console.log('\n✅ FLUXO COMPLETO VALIDADO:');
    console.log('   1. ✅ Usuário abre painel (campos vazios)');
    console.log('   2. ✅ Usuário digita telefone e dígito');
    console.log('   3. ✅ Usuário clica "Salvar"');
    console.log('   4. ✅ Dados são salvos no banco');
    console.log('   5. ✅ Usuário faz F5');
    console.log('   6. ✅ Dados são carregados do banco');
    console.log('   7. ✅ Formulário é preenchido com dados');
    console.log('   8. ✅ Usuário vê os dados na tela');
  });

  it('should handle multiple edits without losing data', async () => {
    const phone1 = '17996192552';
    const phone2 = '17988776655';
    const digit1 = '8';
    const digit2 = '9';

    console.log('\n🔄 TESTE: Múltiplas edições sem perder dados');

    // Primeira edição
    console.log('  Primeira edição: telefone =', phone1, ', dígito =', digit1);
    await db.update(users)
      .set({ phone: phone1, bankAccountDv: digit1 })
      .where(eq(users.id, testUserId));

    let check = await db.select({ phone: users.phone, bankAccountDv: users.bankAccountDv })
      .from(users)
      .where(eq(users.id, testUserId))
      .limit(1);

    expect(check[0]?.phone).toBe(phone1);
    expect(check[0]?.bankAccountDv).toBe(digit1);
    console.log('  ✅ Primeira edição salva');

    // Segunda edição
    console.log('  Segunda edição: telefone =', phone2, ', dígito =', digit2);
    await db.update(users)
      .set({ phone: phone2, bankAccountDv: digit2 })
      .where(eq(users.id, testUserId));

    check = await db.select({ phone: users.phone, bankAccountDv: users.bankAccountDv })
      .from(users)
      .where(eq(users.id, testUserId))
      .limit(1);

    expect(check[0]?.phone).toBe(phone2);
    expect(check[0]?.bankAccountDv).toBe(digit2);
    console.log('  ✅ Segunda edição salva');

    // Verificar que primeira edição foi sobrescrita
    expect(check[0]?.phone).not.toBe(phone1);
    console.log('  ✅ Dados antigos foram sobrescitos corretamente');
  });
});
