/**
 * Validador de dados bancÃ¡rios para Pagar.me
 * Compara formato esperado com dados reais
 */

export interface BankData {
  document: string; // CPF/CNPJ
  bankCode: string; // CÃ³digo do banco
  branchNumber: string; // AgÃªncia
  branchCheckDigit?: string; // DÃ­gito da agÃªncia
  accountNumber: string; // Conta
  accountCheckDigit: string; // DÃ­gito da conta
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
 * Valida CPF (11 dÃ­gitos)
 */
export function validateCPF(cpf: string): { valid: boolean; message: string } {
  const digits = cpf.replace(/\D/g, '');
  
  if (digits.length !== 11) {
    return {
      valid: false,
      message: `CPF deve ter 11 dÃ­gitos, recebido: ${digits.length} (${cpf})`
    };
  }
  
  // Verificar se todos os dÃ­gitos sÃ£o iguais (CPF invÃ¡lido)
  if (/^(\d)\1{10}$/.test(digits)) {
    return {
      valid: false,
      message: `CPF com todos os dÃ­gitos iguais Ã© invÃ¡lido: ${cpf}`
    };
  }
  
  return { valid: true, message: 'CPF vÃ¡lido' };
}

/**
 * Valida CNPJ (14 dÃ­gitos)
 */
export function validateCNPJ(cnpj: string): { valid: boolean; message: string } {
  const digits = cnpj.replace(/\D/g, '');
  
  if (digits.length !== 14) {
    return {
      valid: false,
      message: `CNPJ deve ter 14 dÃ­gitos, recebido: ${digits.length} (${cnpj})`
    };
  }
  
  return { valid: true, message: 'CNPJ vÃ¡lido' };
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
      message: `Documento deve ter 11 (CPF) ou 14 (CNPJ) dÃ­gitos, recebido: ${digits.length}`
    };
  }
}

/**
 * Valida banco (cÃ³digo numÃ©rico)
 */
export function validateBankCode(bankCode: string): { valid: boolean; message: string } {
  const digits = bankCode.replace(/\D/g, '');
  
  if (digits.length !== 3) {
    return {
      valid: false,
      message: `CÃ³digo do banco deve ter 3 dÃ­gitos, recebido: ${digits.length} (${bankCode})`
    };
  }
  
  // Verificar bancos conhecidos
  const validBanks = ['001', '033', '104', '237', '290', '341', '356', '399', '422', '633', '655', '745', '746', '748', '752', '756', '757', '758', '761', '766', '801', '808', '812', '827', '835', '836', '837', '840', '846', '847', '848', '849', '850', '851', '852', '853', '856', '857', '858', '859', '860', '861', '862', '863', '864', '865', '866', '867', '868', '869', '870', '871', '872', '873', '874', '875', '876', '877', '878', '879', '880', '881', '882', '883', '884', '885', '886', '887', '888', '889', '890', '891', '892', '893', '894', '895', '896', '897', '898', '899', '900'];
  
  if (!validBanks.includes(digits)) {
    return {
      valid: false,
      message: `CÃ³digo de banco ${digits} nÃ£o Ã© reconhecido. Bancos vÃ¡lidos: ${validBanks.join(', ')}`
    };
  }
  
  return { valid: true, message: `Banco ${digits} vÃ¡lido` };
}

/**
 * Valida agÃªncia
 */
export function validateBranch(branch: string): { valid: boolean; message: string } {
  const digits = branch.replace(/\D/g, '');
  
  if (digits.length === 0) {
    return {
      valid: false,
      message: `AgÃªncia nÃ£o pode estar vazia`
    };
  }
  
  if (digits.length < 4) {
    return {
      valid: false,
      message: `AgÃªncia deve ter pelo menos 4 dÃ­gitos, recebido: ${digits.length} (${branch})`
    };
  }
  
  if (digits.length > 5) {
    return {
      valid: false,
      message: `AgÃªncia nÃ£o pode ter mais de 5 dÃ­gitos, recebido: ${digits.length} (${branch})`
    };
  }
  
  return { valid: true, message: `AgÃªncia ${digits} vÃ¡lida` };
}

/**
 * Valida dÃ­gito da agÃªncia (opcional, 0-9)
 */
export function validateBranchCheckDigit(digit?: string): { valid: boolean; message: string } {
  if (!digit || digit === '') {
    return { valid: true, message: 'DÃ­gito da agÃªncia nÃ£o fornecido (opcional)' };
  }
  
  const cleaned = digit.replace(/\D/g, '');
  
  if (cleaned.length !== 1) {
    return {
      valid: false,
      message: `DÃ­gito da agÃªncia deve ter 1 dÃ­gito, recebido: ${cleaned.length} (${digit})`
    };
  }
  
  return { valid: true, message: `DÃ­gito da agÃªncia ${cleaned} vÃ¡lido` };
}

/**
 * Valida conta
 */
export function validateAccount(account: string): { valid: boolean; message: string } {
  const digits = account.replace(/\D/g, '');
  
  if (digits.length === 0) {
    return {
      valid: false,
      message: `Conta nÃ£o pode estar vazia`
    };
  }
  
  if (digits.length < 4) {
    return {
      valid: false,
      message: `Conta deve ter pelo menos 4 dÃ­gitos, recebido: ${digits.length} (${account})`
    };
  }
  
  if (digits.length > 12) {
    return {
      valid: false,
      message: `Conta nÃ£o pode ter mais de 12 dÃ­gitos, recebido: ${digits.length} (${account})`
    };
  }
  
  return { valid: true, message: `Conta ${digits} vÃ¡lida` };
}

/**
 * Valida dÃ­gito da conta (obrigatÃ³rio, 0-9)
 */
export function validateAccountCheckDigit(digit: string): { valid: boolean; message: string } {
  const cleaned = digit.replace(/\D/g, '');
  
  if (cleaned.length !== 1) {
    return {
      valid: false,
      message: `DÃ­gito da conta deve ter 1 dÃ­gito, recebido: ${cleaned.length} (${digit})`
    };
  }
  
  return { valid: true, message: `DÃ­gito da conta ${cleaned} vÃ¡lido` };
}

/**
 * Valida telefone
 */
export function validatePhone(phone: string): { valid: boolean; message: string } {
  const digits = phone.replace(/\D/g, '');
  
  if (digits.length < 10) {
    return {
      valid: false,
      message: `Telefone deve ter pelo menos 10 dÃ­gitos, recebido: ${digits.length} (${phone})`
    };
  }
  
  if (digits.length > 11) {
    return {
      valid: false,
      message: `Telefone nÃ£o pode ter mais de 11 dÃ­gitos, recebido: ${digits.length} (${phone})`
    };
  }
  
  // Verificar se comeÃ§a com DDD vÃ¡lido (11-99)
  const areaCode = parseInt(digits.substring(0, 2));
  if (areaCode < 11 || areaCode > 99) {
    return {
      valid: false,
      message: `DDD invÃ¡lido: ${digits.substring(0, 2)} (deve ser entre 11 e 99)`
    };
  }
  
  return { valid: true, message: `Telefone ${digits} vÃ¡lido` };
}

/**
 * Valida todos os dados bancÃ¡rios
 */
export function validateBankData(data: BankData): ValidationResult {
  const errors: string[] = [];
  const warnings: string[] = [];
  
  console.log('\nðŸ“‹ ===== VALIDAÃ‡ÃƒO DE DADOS BANCÃRIOS =====');
  console.log('Documento:', data.document);
  console.log('Banco:', data.bankCode);
  console.log('AgÃªncia:', data.branchNumber);
  console.log('DÃ­gito AgÃªncia:', data.branchCheckDigit || '(vazio)');
  console.log('Conta:', data.accountNumber);
  console.log('DÃ­gito Conta:', data.accountCheckDigit);
  console.log('Telefone:', data.phone);
  
  // Validar documento
  const docValidation = validateDocument(data.document);
  if (!docValidation.valid) {
    errors.push(`âŒ ${docValidation.message}`);
  } else {
    console.log(`âœ… ${docValidation.message}`);
  }
  
  // Validar banco
  const bankValidation = validateBankCode(data.bankCode);
  if (!bankValidation.valid) {
    errors.push(`âŒ ${bankValidation.message}`);
  } else {
    console.log(`âœ… ${bankValidation.message}`);
  }
  
  // Validar agÃªncia
  const branchValidation = validateBranch(data.branchNumber);
  if (!branchValidation.valid) {
    errors.push(`âŒ ${branchValidation.message}`);
  } else {
    console.log(`âœ… ${branchValidation.message}`);
  }
  
  // Validar dÃ­gito da agÃªncia
  const branchDigitValidation = validateBranchCheckDigit(data.branchCheckDigit);
  if (!branchDigitValidation.valid) {
    errors.push(`âŒ ${branchDigitValidation.message}`);
  } else {
    console.log(`âœ… ${branchDigitValidation.message}`);
  }
  
  // Validar conta
  const accountValidation = validateAccount(data.accountNumber);
  if (!accountValidation.valid) {
    errors.push(`âŒ ${accountValidation.message}`);
  } else {
    console.log(`âœ… ${accountValidation.message}`);
  }
  
  // Validar dÃ­gito da conta
  const accountDigitValidation = validateAccountCheckDigit(data.accountCheckDigit);
  if (!accountDigitValidation.valid) {
    errors.push(`âŒ ${accountDigitValidation.message}`);
  } else {
    console.log(`âœ… ${accountDigitValidation.message}`);
  }
  
  // Validar telefone
  const phoneValidation = validatePhone(data.phone);
  if (!phoneValidation.valid) {
    errors.push(`âŒ ${phoneValidation.message}`);
  } else {
    console.log(`âœ… ${phoneValidation.message}`);
  }
  
  console.log('\nðŸ“Š ===== RESULTADO DA VALIDAÃ‡ÃƒO =====');
  console.log('Erros:', errors.length);
  console.log('Avisos:', warnings.length);
  
  return {
    isValid: errors.length === 0,
    errors,
    warnings,
    comparison: {
      lucas: 'Banco: 290, AgÃªncia: 0001, Conta: 40507969, DÃ­gito: 9, CPF: 17505636000198',
      weliton: 'Banco: 237, AgÃªncia: 2740, Conta: 21603, DÃ­gito: 8, CPF: 82751056849',
      difference: 'Banco 237 pode ter restriÃ§Ãµes diferentes do 290'
    }
  };
}
