# 🎯 DESCOBERTA: Novo Formato de Payload do Pagar.me

## Problema
Erro 422 ao criar recipient para Welíton, mas Lucas funcionou.

## Causa Raiz
**A documentação do Pagar.me mudou em Fevereiro de 2024!**

Novo contrato entrou em vigor: **29 de fevereiro de 2024**
- Exigência de compliance com Circular 3.978/20 do Banco Central
- Novos campos obrigatórios em `register_information`
- Novo formato de `phone_numbers`

## Formato ANTIGO (que estamos usando):
```json
{
  "code": "rec_...",
  "register_information": {
    "type": "individual",
    "name": "Nome",
    "email": "email@example.com",
    "document": "12345678901",
    "phone_numbers": [
      {
        "country_code": "55",
        "area_code": "17",
        "number": "996192552",
        "type": "mobile"
      }
    ]
  },
  "default_bank_account": {
    "holder_name": "Nome",
    "holder_type": "individual",
    "holder_document": "12345678901",
    "bank": "237",
    "branch_number": "2740",
    "branch_check_digit": "",
    "account_number": "21603",
    "account_check_digit": "8",
    "type": "conta_corrente"
  }
}
```

## Formato NOVO (v5 - obrigatório desde Feb 2024):
```json
{
  "code": "rec_...",
  "register_information": {
    "type": "individual",  // ou "corporation"
    "name": "Nome",
    "email": "email@example.com",
    "document_number": "12345678901",  // ⚠️ MUDOU: "document" → "document_number"
    "phone_numbers": [
      {
        "ddd": "17",  // ⚠️ MUDOU: "area_code" → "ddd"
        "number": "996192552",  // ⚠️ MUDOU: sem "country_code"
        "type": "mobile"
      }
    ],
    // ⚠️ NOVO: Campos obrigatórios para compliance
    "address": {
      "street": "Rua",
      "number": "123",
      "neighborhood": "Bairro",
      "zip_code": "12345678",
      "city": "Cidade",
      "state": "SP",
      "country": "BR",
      "complement": "Apto 100",
      "reference_point": "Perto de..."
    },
    "site_url": "https://...",  // ⚠️ NOVO
    "annual_revenue": "100000",  // ⚠️ NOVO
    "monthly_income": "10000"  // ⚠️ NOVO (para PF)
  },
  "default_bank_account": {
    "holder_name": "Nome",
    "holder_type": "individual",
    "holder_document": "12345678901",
    "bank": "237",
    "branch_number": "2740",
    "branch_check_digit": "",
    "account_number": "21603",
    "account_check_digit": "8",
    "type": "conta_corrente"
  }
}
```

## Diferenças Críticas:
1. **`document` → `document_number`** (campo renomeado)
2. **`area_code` → `ddd`** (em phone_numbers)
3. **Removido `country_code`** (de phone_numbers)
4. **Novos campos obrigatórios:**
   - `address` (completo)
   - `site_url`
   - `annual_revenue` (para PJ)
   - `monthly_income` (para PF)

## Por que Lucas funcionou?
Lucas foi criado **ANTES de 29/02/2024**, então a API aceitava o formato antigo.
Welíton está tentando criar **DEPOIS de 29/02/2024**, então a API rejeita com erro 422.

## Solução:
Atualizar o payload em `server/pagarme.ts` para usar o novo formato com:
- ✅ `document_number` em vez de `document`
- ✅ `ddd` em vez de `area_code`
- ✅ Remover `country_code`
- ✅ Adicionar campos de `address`
- ✅ Adicionar `site_url` e `annual_revenue`/`monthly_income`

## Referência:
- Documentação: https://docs.pagar.me/reference/criar-recebedor-1
- Mudanças: https://docs.pagar.me/page/adequa%C3%A7%C3%A3o-de-marketplace-para-mudan%C3%A7as-regulat%C3%B3rias
