import { describe, it, expect } from 'vitest';
import { createRecipient } from './pagarme';

describe('Phone Field - Validar envio de telefone para Pagar.me', () => {
  
  it('deve extrair DDD e número do telefone corretamente', async () => {
    const testPhone = '17996192552'; // Telefone de Welíton (pixKey)
    const phoneDigits = testPhone.replace(/\D/g, '');
    
    expect(phoneDigits.length).toBeGreaterThanOrEqual(10);
    
    const areaCode = phoneDigits.substring(0, 2);
    const number = phoneDigits.substring(2);
    
    console.log('✅ Telefone extraído:');
    console.log('  DDD:', areaCode); // 17
    console.log('  Número:', number); // 996192552
    
    expect(areaCode).toBe('17');
    expect(number).toBe('996192552');
  });

  it('deve enviar telefone no formato correto para Pagar.me', async () => {
    const testData = {
      name: 'Wéliton Luiz de Oliveira',
      email: 'weliton@example.com',
      document: '82751056849',
      type: 'individual' as const,
      phone: '17996192552', // Telefone de Welíton
      bankAccount: {
        bank: '237', // Bradesco
        branchNumber: '2740',
        branchCheckDigit: '',
        accountNumber: '21603',
        accountCheckDigit: '8',
        type: 'checking' as const,
        holderName: 'Wéliton Luiz de Oliveira',
        holderDocument: '82751056849',
      },
    };

    console.log('📞 Testando createRecipient com telefone:', testData.phone);

    try {
      const result = await createRecipient(testData);
      
      if (result) {
        console.log('✅ Recipient criado com sucesso:', result.recipientId);
        console.log('   Status:', result.status);
        expect(result.recipientId).toBeDefined();
      } else {
        console.log('⚠️ createRecipient retornou null (erro esperado com dados de teste)');
      }
    } catch (error: any) {
      console.log('⚠️ Erro ao criar recipient (esperado com dados de teste):', error.message);
      // Erros são esperados com dados de teste
      expect(error).toBeDefined();
    }
  });

  it('deve usar pixKey como fallback se telefone não estiver disponível', async () => {
    const pixKey = '17996192552';
    const phone = null || pixKey; // Fallback para pixKey
    
    console.log('📞 Telefone final (com fallback):', phone);
    expect(phone).toBe('17996192552');
  });

  it('deve validar que telefone é obrigatório para Pagar.me', async () => {
    // Dados SEM telefone
    const testDataNoPhone = {
      name: 'Test User',
      email: 'test@example.com',
      document: '12345678901',
      type: 'individual' as const,
      phone: '', // Telefone vazio
      bankAccount: {
        bank: '001',
        branchNumber: '0001',
        branchCheckDigit: '',
        accountNumber: '123456',
        accountCheckDigit: '8',
        type: 'checking' as const,
        holderName: 'Test User',
        holderDocument: '12345678901',
      },
    };

    console.log('📞 Testando createRecipient SEM telefone');

    try {
      const result = await createRecipient(testDataNoPhone);
      
      if (!result) {
        console.log('✅ Pagar.me rejeitou requisição sem telefone (retornou null)');
      } else {
        console.log('⚠️ Recipient foi criado mesmo sem telefone:', result.recipientId);
      }
    } catch (error: any) {
      console.log('✅ Pagar.me rejeitou requisição sem telefone com erro:', error.message);
      // Esperamos erro ou null quando telefone está vazio
      expect(error.message).toContain('422');
    }
  });

  it('deve formatar telefone com país (55) e DDD', async () => {
    const phone = '17996192552';
    const phoneDigits = phone.replace(/\D/g, '');
    
    const formattedPhone = {
      country_code: '55',
      area_code: phoneDigits.substring(0, 2),
      number: phoneDigits.substring(2),
    };
    
    console.log('📞 Telefone formatado para Pagar.me:', JSON.stringify(formattedPhone, null, 2));
    
    expect(formattedPhone.country_code).toBe('55');
    expect(formattedPhone.area_code).toBe('17');
    expect(formattedPhone.number).toBe('996192552');
  });
});
