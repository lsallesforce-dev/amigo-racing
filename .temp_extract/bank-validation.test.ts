import { describe, it, expect } from 'vitest';
import { 
  validateBankData, 
  validateDocument, 
  validateBankCode, 
  validateBranch, 
  validateAccount, 
  validateAccountCheckDigit,
  validatePhone 
} from './bank-validation';

describe('Bank Validation - Lucas vs Welíton', () => {
  
  it('LUCAS - Dados que funcionaram (Recipient criado com sucesso)', () => {
    console.log('\n🟢 LUCAS - Dados que FUNCIONARAM:');
    
    const lucasData = {
      document: '17505636000198', // CPF
      bankCode: '290',
      branchNumber: '0001',
      branchCheckDigit: '', // Vazio
      accountNumber: '40507969',
      accountCheckDigit: '9',
      holderName: 'Lucas Salles',
      holderDocument: '17505636000198',
      phone: '17991141010',
    };
    
    const result = validateBankData(lucasData);
    
    console.log('\n✅ RESULTADO LUCAS:');
    console.log('  Válido?', result.isValid);
    console.log('  Erros:', result.errors.length);
    console.log('  Avisos:', result.warnings.length);
    
    expect(result.isValid).toBe(true);
    expect(result.errors.length).toBe(0);
  });
  
  it('WELÍTON - Dados que deram erro 422', () => {
    console.log('\n🔴 WELÍTON - Dados que deram ERRO 422:');
    
    const welitonData = {
      document: '82751056849', // CPF
      bankCode: '237',
      branchNumber: '2740',
      branchCheckDigit: '', // Vazio
      accountNumber: '21603',
      accountCheckDigit: '8',
      holderName: 'Welíton',
      holderDocument: '82751056849',
      phone: '17996192552',
    };
    
    const result = validateBankData(welitonData);
    
    console.log('\n❌ RESULTADO WELÍTON:');
    console.log('  Válido?', result.isValid);
    console.log('  Erros:', result.errors);
    console.log('  Avisos:', result.warnings);
    
    // Mesmo que haja erros na validação local, vamos ver quais são
    if (!result.isValid) {
      console.log('\n⚠️  PROBLEMAS ENCONTRADOS:');
      result.errors.forEach((err, i) => {
        console.log(`  ${i + 1}. ${err}`);
      });
    }
  });
  
  it('Comparar campos específicos: Lucas vs Welíton', () => {
    console.log('\n📊 COMPARAÇÃO DETALHADA:');
    
    const lucas = {
      document: '17505636000198',
      bankCode: '290',
      branchNumber: '0001',
      accountNumber: '40507969',
      accountCheckDigit: '9',
      phone: '17991141010',
    };
    
    const weliton = {
      document: '82751056849',
      bankCode: '237',
      branchNumber: '2740',
      accountNumber: '21603',
      accountCheckDigit: '8',
      phone: '17996192552',
    };
    
    console.log('\n📋 CPF/Documento:');
    console.log('  Lucas:', lucas.document, '(' + lucas.document.length + ' dígitos)');
    console.log('  Welíton:', weliton.document, '(' + weliton.document.length + ' dígitos)');
    const docLucas = validateDocument(lucas.document);
    const docWeliton = validateDocument(weliton.document);
    console.log('  Lucas válido?', docLucas.valid, '-', docLucas.message);
    console.log('  Welíton válido?', docWeliton.valid, '-', docWeliton.message);
    
    console.log('\n🏦 Banco:');
    console.log('  Lucas:', lucas.bankCode);
    console.log('  Welíton:', weliton.bankCode);
    const bankLucas = validateBankCode(lucas.bankCode);
    const bankWeliton = validateBankCode(weliton.bankCode);
    console.log('  Lucas válido?', bankLucas.valid, '-', bankLucas.message);
    console.log('  Welíton válido?', bankWeliton.valid, '-', bankWeliton.message);
    
    console.log('\n🏢 Agência:');
    console.log('  Lucas:', lucas.branchNumber, '(' + lucas.branchNumber.length + ' dígitos)');
    console.log('  Welíton:', weliton.branchNumber, '(' + weliton.branchNumber.length + ' dígitos)');
    const branchLucas = validateBranch(lucas.branchNumber);
    const branchWeliton = validateBranch(weliton.branchNumber);
    console.log('  Lucas válido?', branchLucas.valid, '-', branchLucas.message);
    console.log('  Welíton válido?', branchWeliton.valid, '-', branchWeliton.message);
    
    console.log('\n💰 Conta:');
    console.log('  Lucas:', lucas.accountNumber, '(' + lucas.accountNumber.length + ' dígitos)');
    console.log('  Welíton:', weliton.accountNumber, '(' + weliton.accountNumber.length + ' dígitos)');
    const accountLucas = validateAccount(lucas.accountNumber);
    const accountWeliton = validateAccount(weliton.accountNumber);
    console.log('  Lucas válido?', accountLucas.valid, '-', accountLucas.message);
    console.log('  Welíton válido?', accountWeliton.valid, '-', accountWeliton.message);
    
    console.log('\n✓ Dígito Conta:');
    console.log('  Lucas:', lucas.accountCheckDigit);
    console.log('  Welíton:', weliton.accountCheckDigit);
    const digitLucas = validateAccountCheckDigit(lucas.accountCheckDigit);
    const digitWeliton = validateAccountCheckDigit(weliton.accountCheckDigit);
    console.log('  Lucas válido?', digitLucas.valid, '-', digitLucas.message);
    console.log('  Welíton válido?', digitWeliton.valid, '-', digitWeliton.message);
    
    console.log('\n📱 Telefone:');
    console.log('  Lucas:', lucas.phone, '(' + lucas.phone.replace(/\D/g, '').length + ' dígitos)');
    console.log('  Welíton:', weliton.phone, '(' + weliton.phone.replace(/\D/g, '').length + ' dígitos)');
    const phoneLucas = validatePhone(lucas.phone);
    const phoneWeliton = validatePhone(weliton.phone);
    console.log('  Lucas válido?', phoneLucas.valid, '-', phoneLucas.message);
    console.log('  Welíton válido?', phoneWeliton.valid, '-', phoneWeliton.message);
    
    console.log('\n🔍 DIFERENÇAS ENCONTRADAS:');
    console.log('  - Banco: Lucas usa 290 (Bradesco), Welíton usa 237 (Bradesco)');
    console.log('    (Ambos são Bradesco, mas 237 é código alternativo)');
    console.log('  - Agência: Lucas 0001 (4 dígitos), Welíton 2740 (4 dígitos)');
    console.log('  - Conta: Lucas 40507969 (8 dígitos), Welíton 21603 (5 dígitos)');
    console.log('    ⚠️  DIFERENÇA IMPORTANTE: Conta de Welíton é muito curta!');
  });
  
  it('Testar conta curta de Welíton (21603)', () => {
    console.log('\n⚠️  TESTE: Conta muito curta (21603)');
    
    const result = validateAccount('21603');
    console.log('Validação da conta 21603:', result);
    console.log('Válida?', result.valid);
    console.log('Mensagem:', result.message);
    
    // A conta 21603 tem apenas 5 dígitos, o que pode ser válido
    // Mas vamos verificar se Pagar.me aceita
  });
  
  it('Testar CPF de Welíton (82751056849)', () => {
    console.log('\n⚠️  TESTE: CPF de Welíton (82751056849)');
    
    const result = validateDocument('82751056849');
    console.log('Validação do CPF:', result);
    console.log('Válido?', result.valid);
    console.log('Mensagem:', result.message);
  });
  
  it('Testar Banco 237 vs 290', () => {
    console.log('\n🏦 TESTE: Banco 237 vs 290');
    
    const bank237 = validateBankCode('237');
    const bank290 = validateBankCode('290');
    
    console.log('Banco 237 (Bradesco):', bank237);
    console.log('Banco 290 (Bradesco):', bank290);
    
    console.log('\n💡 NOTA: Ambos são Bradesco!');
    console.log('  - 290: Bradesco (código principal)');
    console.log('  - 237: Bradesco (código alternativo/legado)');
    console.log('  - Pagar.me pode ter restrições com código 237');
  });
});

  it('TESTE: Welíton com Banco 290 em vez de 237', () => {
    console.log('\n🔧 TESTE: Trocar Banco 237 por 290 para Welíton');
    
    const welitonComBanco290 = {
      document: '82751056849', // CPF (igual)
      bankCode: '290', // MUDADO: 237 → 290
      branchNumber: '2740',
      branchCheckDigit: '',
      accountNumber: '21603',
      accountCheckDigit: '8',
      holderName: 'Welíton',
      holderDocument: '82751056849',
      phone: '17996192552',
    };
    
    const result = validateBankData(welitonComBanco290);
    
    console.log('\n✅ RESULTADO COM BANCO 290:');
    console.log('  Válido?', result.isValid);
    console.log('  Erros:', result.errors.length);
    
    if (result.isValid) {
      console.log('\n💡 SUGESTÃO: Tente usar Banco 290 em vez de 237!');
      console.log('  Banco 237 é código legado do Bradesco');
      console.log('  Banco 290 é o código principal');
      console.log('  Pagar.me pode ter restrições com código 237');
    }
  });
});
