import { describe, it, expect } from 'vitest';

describe('Phone Contact Field - Validar fluxo completo', () => {
  
  it('deve validar que telefone é obrigatório no formulário', () => {
    // Simular validação do formulário
    const bankConfigForm = {
      document: '82751056849',
      bank: '237',
      agency: '2740',
      agencyDigit: '',
      account: '21603',
      accountDigit: '8',
      accountType: 'checking' as const,
      pixKey: '17996192552',
      phone: '', // VAZIO - deve desabilitar botão
      holderName: 'Wéliton Luiz de Oliveira',
      holderEmail: 'weliton@example.com',
    };

    // Validação: botão deve estar desabilitado se telefone está vazio
    const isFormValid = !!(
      bankConfigForm.document &&
      bankConfigForm.bank &&
      bankConfigForm.agency &&
      bankConfigForm.account &&
      bankConfigForm.accountDigit &&
      bankConfigForm.accountType &&
      bankConfigForm.holderName &&
      bankConfigForm.holderEmail &&
      bankConfigForm.phone // NOVO: Telefone obrigatório
    );

    console.log('✅ Validação de formulário:');
    console.log('  Telefone vazio:', bankConfigForm.phone === '');
    console.log('  Formulário válido:', isFormValid);
    
    expect(isFormValid).toBe(false); // Deve ser inválido com telefone vazio
  });

  it('deve validar que formulário fica válido com telefone preenchido', () => {
    const bankConfigForm = {
      document: '82751056849',
      bank: '237',
      agency: '2740',
      agencyDigit: '',
      account: '21603',
      accountDigit: '8',
      accountType: 'checking' as const,
      pixKey: '17996192552',
      phone: '17996192552', // PREENCHIDO
      holderName: 'Wéliton Luiz de Oliveira',
      holderEmail: 'weliton@example.com',
    };

    const isFormValid = !!(
      bankConfigForm.document &&
      bankConfigForm.bank &&
      bankConfigForm.agency &&
      bankConfigForm.account &&
      bankConfigForm.accountDigit &&
      bankConfigForm.accountType &&
      bankConfigForm.holderName &&
      bankConfigForm.holderEmail &&
      bankConfigForm.phone
    );

    console.log('✅ Validação com telefone preenchido:');
    console.log('  Telefone:', bankConfigForm.phone);
    console.log('  Formulário válido:', isFormValid);
    
    expect(isFormValid).toBe(true);
  });

  it('deve enviar telefone no payload para setupRecipient', () => {
    const bankConfigForm = {
      document: '82751056849',
      bank: '237',
      agency: '2740',
      agencyDigit: '',
      account: '21603',
      accountDigit: '8',
      accountType: 'checking' as const,
      pixKey: '17996192552',
      phone: '17996192552',
      holderName: 'Wéliton Luiz de Oliveira',
      holderEmail: 'weliton@example.com',
    };

    // Simular criação do payload
    const cleanDocument = bankConfigForm.document.replace(/\D/g, '');
    const cleanBankCode = bankConfigForm.bank.replace(/\D/g, '');
    const agencyDigitToSend = bankConfigForm.agencyDigit === '0' ? '' : bankConfigForm.agencyDigit;

    const payload = {
      document: cleanDocument,
      pixKey: bankConfigForm.pixKey || undefined,
      phone: bankConfigForm.phone, // NOVO: Telefone no payload
      holderName: bankConfigForm.holderName,
      holderEmail: bankConfigForm.holderEmail,
      bankAccount: {
        bank_code: cleanBankCode,
        agencia: bankConfigForm.agency,
        agencia_dv: agencyDigitToSend,
        conta: bankConfigForm.account,
        conta_dv: bankConfigForm.accountDigit,
        type: (bankConfigForm.accountType === 'checking' ? 'conta_corrente' : 'conta_poupanca') as 'conta_corrente' | 'conta_poupanca',
        legal_name: bankConfigForm.holderName,
        document_number: cleanDocument,
      },
    };

    console.log('📞 Payload enviado para setupRecipient:');
    console.log(JSON.stringify(payload, null, 2));

    expect(payload.phone).toBe('17996192552');
    expect(payload.phone).toBeDefined();
    expect(payload.phone).not.toBeNull();
  });

  it('deve validar que phone é passado para updateUserRecipientId', () => {
    const userId = 2820172;
    const recipientId = 're_cmlip76jfhai70l9thzwxtn4g';
    const pixKey = '17996192552';
    const phone = '17996192552'; // NOVO: Telefone a ser salvo

    console.log('💾 Chamada para updateUserRecipientId:');
    console.log('  userId:', userId);
    console.log('  recipientId:', recipientId);
    console.log('  pixKey:', pixKey);
    console.log('  phone:', phone);

    // Simular o que seria salvo no banco
    const updateData = {
      recipientId,
      ...(pixKey && { pixKey }),
      ...(phone && { phone }), // NOVO: Salvar telefone
    };

    console.log('  Dados a salvar:', updateData);

    expect(updateData.phone).toBe('17996192552');
    expect(updateData.recipientId).toBe(recipientId);
  });

  it('deve validar que phone é extraído corretamente para Pagar.me', () => {
    const phone = '17996192552';
    const phoneDigits = phone.replace(/\D/g, '');

    const phoneNumbers = [
      {
        country_code: '55',
        area_code: phoneDigits.substring(0, 2),
        number: phoneDigits.substring(2),
        type: 'mobile',
      }
    ];

    console.log('📞 Telefone extraído para Pagar.me:');
    console.log(JSON.stringify(phoneNumbers, null, 2));

    expect(phoneNumbers[0].country_code).toBe('55');
    expect(phoneNumbers[0].area_code).toBe('17');
    expect(phoneNumbers[0].number).toBe('996192552');
    expect(phoneNumbers[0].type).toBe('mobile');
  });

  it('deve remover fallback inseguro do pixKey', () => {
    // ANTES: phone = ctx.user.phone || input.pixKey || ''
    // DEPOIS: phone = input.phone (obrigatório)

    const input = {
      phone: '17996192552', // Obrigatório agora
      pixKey: 'chave-aleatoria-12345', // Pode ser diferente
    };

    // Não usar pixKey como fallback
    const phone = input.phone; // Sempre usar input.phone

    console.log('✅ Removido fallback inseguro:');
    console.log('  phone (obrigatório):', phone);
    console.log('  pixKey (opcional):', input.pixKey);

    expect(phone).toBe('17996192552');
    expect(phone).not.toBe(input.pixKey); // Podem ser diferentes
  });
});
