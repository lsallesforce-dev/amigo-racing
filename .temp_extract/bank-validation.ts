/**
 * Validador de dados bancários para Pagar.me
 * Compara formato esperado com dados reais
 */

export interface BankData {
  document: string; // CPF/CNPJ
  bankCode: string; // Código do banco
  branchNumber: string; // Agência
  branchCheckDigit?: string; // Dígito da agência
  accountNumber: string; // Conta
  accountCheckDigit: string; // Dígito da conta
  holderName: string;
  holderDocument: string;
  phone: string;
}

export interface ValidationResult {
  isValid: boolean;
  errors: string[];
  warnings: string[];
  comparison: {
    lucas?: string;
    weliton?: string;
    difference?: string;
  };
}

/**
 * Valida CPF (11 dígitos)
 */
export function validateCPF(cpf: string): { valid: boolean; message: string } {
  const digits = cpf.replace(/\D/g, '');
  
  if (digits.length !== 11) {
    return {
      valid: false,
      message: `CPF deve ter 11 dígitos, recebido: ${digits.length} (${cpf})`
    };
  }
  
  // Verificar se todos os dígitos são iguais (CPF inválido)
  if (/^(\d)\1{10}$/.test(digits)) {
    return {
      valid: false,
      message: `CPF com todos os dígitos iguais é inválido: ${cpf}`
    };
  }
  
  return { valid: true, message: 'CPF válido' };
}

/**
 * Valida CNPJ (14 dígitos)
 */
export function validateCNPJ(cnpj: string): { valid: boolean; message: string } {
  const digits = cnpj.replace(/\D/g, '');
  
  if (digits.length !== 14) {
    return {
      valid: false,
      message: `CNPJ deve ter 14 dígitos, recebido: ${digits.length} (${cnpj})`
    };
  }
  
  return { valid: true, message: 'CNPJ válido' };
}

/**
 * Valida documento (CPF ou CNPJ)
 */
export function validateDocument(document: string): { valid: boolean; message: string } {
  const digits = document.replace(/\D/g, '');
  
  if (digits.length === 11) {
    return validateCPF(document);
  } else if (digits.length === 14) {
    return validateCNPJ(document);
  } else {
    return {
      valid: false,
      message: `Documento deve ter 11 (CPF) ou 14 (CNPJ) dígitos, recebido: ${digits.length}`
    };
  }
}

/**
 * Valida banco (código numérico)
 */
export function validateBankCode(bankCode: string): { valid: boolean; message: string } {
  const digits = bankCode.replace(/\D/g, '');
  
  if (digits.length !== 3) {
    return {
      valid: false,
      message: `Código do banco deve ter 3 dígitos, recebido: ${digits.length} (${bankCode})`
    };
  }
  
  // Verificar bancos conhecidos
  const validBanks = ['001', '033', '104', '237', '290', '341', '356', '399', '422', '633', '655', '745', '746', '748', '752', '756', '757', '758', '761', '766', '801', '808', '812', '827', '835', '836', '837', '840', '846', '847', '848', '849', '850', '851', '852', '853', '856', '857', '858', '859', '860', '861', '862', '863', '864', '865', '866', '867', '868', '869', '870', '871', '872', '873', '874', '875', '876', '877', '878', '879', '880', '881', '882', '883', '884', '885', '886', '887', '888', '889', '890', '891', '892', '893', '894', '895', '896', '897', '898', '899', '900'];
  
  if (!validBanks.includes(digits)) {
    return {
      valid: false,
      message: `Código de banco ${digits} não é reconhecido. Bancos válidos: ${validBanks.join(', ')}`
    };
  }
  
  return { valid: true, message: `Banco ${digits} válido` };
}

/**
 * Valida agência
 */
export function validateBranch(branch: string): { valid: boolean; message: string } {
  const digits = branch.replace(/\D/g, '');
  
  if (digits.length === 0) {
    return {
      valid: false,
      message: `Agência não pode estar vazia`
    };
  }
  
  if (digits.length < 4) {
    return {
      valid: false,
      message: `Agência deve ter pelo menos 4 dígitos, recebido: ${digits.length} (${branch})`
    };
  }
  
  if (digits.length > 5) {
    return {
      valid: false,
      message: `Agência não pode ter mais de 5 dígitos, recebido: ${digits.length} (${branch})`
    };
  }
  
  return { valid: true, message: `Agência ${digits} válida` };
}

/**
 * Valida dígito da agência (opcional, 0-9)
 */
export function validateBranchCheckDigit(digit?: string): { valid: boolean; message: string } {
  if (!digit || digit === '') {
    return { valid: true, message: 'Dígito da agência não fornecido (opcional)' };
  }
  
  const cleaned = digit.replace(/\D/g, '');
  
  if (cleaned.length !== 1) {
    return {
      valid: false,
      message: `Dígito da agência deve ter 1 dígito, recebido: ${cleaned.length} (${digit})`
    };
  }
  
  return { valid: true, message: `Dígito da agência ${cleaned} válido` };
}

/**
 * Valida conta
 */
export function validateAccount(account: string): { valid: boolean; message: string } {
  const digits = account.replace(/\D/g, '');
  
  if (digits.length === 0) {
    return {
      valid: false,
      message: `Conta não pode estar vazia`
    };
  }
  
  if (digits.length < 4) {
    return {
      valid: false,
      message: `Conta deve ter pelo menos 4 dígitos, recebido: ${digits.length} (${account})`
    };
  }
  
  if (digits.length > 12) {
    return {
      valid: false,
      message: `Conta não pode ter mais de 12 dígitos, recebido: ${digits.length} (${account})`
    };
  }
  
  return { valid: true, message: `Conta ${digits} válida` };
}

/**
 * Valida dígito da conta (obrigatório, 0-9)
 */
export function validateAccountCheckDigit(digit: string): { valid: boolean; message: string } {
  const cleaned = digit.replace(/\D/g, '');
  
  if (cleaned.length !== 1) {
    return {
      valid: false,
      message: `Dígito da conta deve ter 1 dígito, recebido: ${cleaned.length} (${digit})`
    };
  }
  
  return { valid: true, message: `Dígito da conta ${cleaned} válido` };
}

/**
 * Valida telefone
 */
export function validatePhone(phone: string): { valid: boolean; message: string } {
  const digits = phone.replace(/\D/g, '');
  
  if (digits.length < 10) {
    return {
      valid: false,
      message: `Telefone deve ter pelo menos 10 dígitos, recebido: ${digits.length} (${phone})`
    };
  }
  
  if (digits.length > 11) {
    return {
      valid: false,
      message: `Telefone não pode ter mais de 11 dígitos, recebido: ${digits.length} (${phone})`
    };
  }
  
  // Verificar se começa com DDD válido (11-99)
  const areaCode = parseInt(digits.substring(0, 2));
  if (areaCode < 11 || areaCode > 99) {
    return {
      valid: false,
      message: `DDD inválido: ${digits.substring(0, 2)} (deve ser entre 11 e 99)`
    };
  }
  
  return { valid: true, message: `Telefone ${digits} válido` };
}

/**
 * Valida todos os dados bancários
 */
export function validateBankData(data: BankData): ValidationResult {
  const errors: string[] = [];
  const warnings: string[] = [];
  
  console.log('\n📋 ===== VALIDAÇÃO DE DADOS BANCÁRIOS =====');
  console.log('Documento:', data.document);
  console.log('Banco:', data.bankCode);
  console.log('Agência:', data.branchNumber);
  console.log('Dígito Agência:', data.branchCheckDigit || '(vazio)');
  console.log('Conta:', data.accountNumber);
  console.log('Dígito Conta:', data.accountCheckDigit);
  console.log('Telefone:', data.phone);
  
  // Validar documento
  const docValidation = validateDocument(data.document);
  if (!docValidation.valid) {
    errors.push(`❌ ${docValidation.message}`);
  } else {
    console.log(`✅ ${docValidation.message}`);
  }
  
  // Validar banco
  const bankValidation = validateBankCode(data.bankCode);
  if (!bankValidation.valid) {
    errors.push(`❌ ${bankValidation.message}`);
  } else {
    console.log(`✅ ${bankValidation.message}`);
  }
  
  // Validar agência
  const branchValidation = validateBranch(data.branchNumber);
  if (!branchValidation.valid) {
    errors.push(`❌ ${branchValidation.message}`);
  } else {
    console.log(`✅ ${branchValidation.message}`);
  }
  
  // Validar dígito da agência
  const branchDigitValidation = validateBranchCheckDigit(data.branchCheckDigit);
  if (!branchDigitValidation.valid) {
    errors.push(`❌ ${branchDigitValidation.message}`);
  } else {
    console.log(`✅ ${branchDigitValidation.message}`);
  }
  
  // Validar conta
  const accountValidation = validateAccount(data.accountNumber);
  if (!accountValidation.valid) {
    errors.push(`❌ ${accountValidation.message}`);
  } else {
    console.log(`✅ ${accountValidation.message}`);
  }
  
  // Validar dígito da conta
  const accountDigitValidation = validateAccountCheckDigit(data.accountCheckDigit);
  if (!accountDigitValidation.valid) {
    errors.push(`❌ ${accountDigitValidation.message}`);
  } else {
    console.log(`✅ ${accountDigitValidation.message}`);
  }
  
  // Validar telefone
  const phoneValidation = validatePhone(data.phone);
  if (!phoneValidation.valid) {
    errors.push(`❌ ${phoneValidation.message}`);
  } else {
    console.log(`✅ ${phoneValidation.message}`);
  }
  
  console.log('\n📊 ===== RESULTADO DA VALIDAÇÃO =====');
  console.log('Erros:', errors.length);
  console.log('Avisos:', warnings.length);
  
  return {
    isValid: errors.length === 0,
    errors,
    warnings,
    comparison: {
      lucas: 'Banco: 290, Agência: 0001, Conta: 40507969, Dígito: 9, CPF: 17505636000198',
      weliton: 'Banco: 237, Agência: 2740, Conta: 21603, Dígito: 8, CPF: 82751056849',
      difference: 'Banco 237 pode ter restrições diferentes do 290'
    }
  };
}
