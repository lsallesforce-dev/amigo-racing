# 🔧 CORREÇÃO CRÍTICA: Bug de Requisição ao Pagar.me

## Problema Identificado

O sistema **NÃO estava enviando requisições para o Pagar.me** ao salvar dados bancários. O `recipientId` permanecia `null` porque:

1. **pagarme.ts (createRecipient)**: Retornava `null` silenciosamente quando a API falhava
2. **routers.ts (setupRecipient)**: Capturava erros em try/catch e retornava `success: true` mesmo com falha

Resultado: Usuário clicava em "Salvar", dados eram salvos localmente, mas **nenhuma chamada era feita ao Pagar.me**.

## Solução Implementada

### 1. **pagarme.ts** - Remover retorno silencioso de null

**Antes:**
```typescript
if (!response.ok) {
  // ... log de erro ...
  return null;  // ❌ Silencia o erro
}
```

**Depois:**
```typescript
if (!response.ok) {
  // ... log de erro ...
  throw new Error(errorMsg);  // ✅ Lança erro real
}
```

**Impacto:** Agora o Pagar.me retorna o erro real em vez de `null`.

### 2. **routers.ts (setupRecipient)** - Remover proteção silenciosa

**Antes:**
```typescript
try {
  const recipient = await createOrGetRecipient(...);
  // ... processamento ...
} catch (error: any) {
  pagarmeError = error?.message;
  // ❌ Continua e retorna success: true com recipientId: null
}

return {
  success: true,  // ❌ Sempre true, mesmo com erro
  recipientId: null,
  pagarmeError: "..."
};
```

**Depois:**
```typescript
// Validar dados completos
if (!temDadosCompletos) {
  throw new TRPCError({ code: 'BAD_REQUEST', message: '...' });
}

// Chamar Pagar.me - SE FALHAR, LANÇA ERRO
const recipient = await createOrGetRecipient(...);

// Validar resultado
if (!recipient) {
  throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: '...' });
}

// Validar status
if (recipient.status === 'refused') {
  throw new TRPCError({ code: 'BAD_REQUEST', message: '...' });
}

// Salvar recipientId
await db.updateUserRecipientId(...);

return {
  success: true,
  recipientId: recipientId,  // ✅ Sempre preenchido ou erro lançado
  message: 'Sucesso!'
};
```

**Impacto:** Agora o sistema **LANÇA ERRO** se qualquer coisa falhar, em vez de silenciar.

## Fluxo Agora

1. ✅ Usuário clica "Salvar dados bancários"
2. ✅ Sistema valida se todos os dados estão preenchidos
3. ✅ Sistema **CHAMA Pagar.me** com:
   - `name`, `email`, `document`
   - `bank_code`, `branch_number`, `branch_check_digit`
   - `account_number`, `account_check_digit` ← **DÍGITO DA CONTA**
   - `type` (checking/savings)
   - `holder_name`, `holder_document`
4. ✅ Se Pagar.me suceder: `recipientId` é salvo e retornado
5. ✅ Se Pagar.me falhar: **ERRO é lançado** e frontend vê a mensagem real

## Dados Enviados para Pagar.me

```json
{
  "register_information": {
    "type": "individual",
    "name": "Usuário",
    "email": "email@example.com",
    "document": "12345678901"
  },
  "default_bank_account": {
    "holder_name": "Usuário",
    "holder_document": "12345678901",
    "bank": "001",
    "branch_number": "0001",
    "branch_check_digit": "",
    "account_number": "123456",
    "account_check_digit": "8",
    "type": "checking"
  },
  "transfer_settings": {
    "transfer_enabled": true
  }
}
```

## Testes Adicionados

Arquivo: `server/setupRecipient.test.ts`

- ✅ Valida que dados incompletos lançam erro
- ✅ Valida que dígito da conta é enviado
- ✅ Valida que Pagar.me rejeita dados inválidos
- ✅ Valida reutilização de recipient existente

## Como Testar

1. Acesse o painel do organizador
2. Clique em "Editar Configurações" (dados bancários)
3. Preencha TODOS os campos:
   - Banco: 001 (Banco do Brasil)
   - Agência: 0001
   - Dígito agência: (deixar em branco se não tiver)
   - Conta: 123456
   - **Dígito conta: 8** ← OBRIGATÓRIO
   - Tipo: Conta Corrente
   - Titular: Seu Nome
   - CPF Titular: Seu CPF
4. Clique "Salvar Configurações"
5. Se suceder: `recipientId` aparecerá no campo somente leitura
6. Se falhar: Mensagem de erro aparecerá na tela

## Status

- ✅ Correção implementada
- ✅ Testes criados e passando
- ✅ Servidor compilando sem erros
- ✅ Pronto para testar com dados reais

## Próximas Etapas

1. Testar com dados bancários reais de Welíton
2. Verificar se `recipientId` é criado com sucesso
3. Validar que split 90/10 funciona em pagamentos PIX
