# Requisição de Split de Pagamento - Pagar.me

## 📋 Informações da Transação

**Data**: 18/02/2026  
**Valor Total**: R$ 25,00 (2500 centavos)  
**Método**: PIX ou Cartão de Crédito  
**Tipo de Split**: Flat (valor fixo)

---

## 🔗 Endpoint

```
POST https://api.pagar.me/core/v5/orders
```

---

## 📤 Headers

```
Authorization: Basic [API_KEY_EM_BASE64]
Content-Type: application/json
```

---

## 📦 Body da Requisição (JSON)

```json
{
  "items": [
    {
      "amount": 2500,
      "description": "Inscrição em evento",
      "quantity": 1
    }
  ],
  "customer": {
    "name": "Lucas Salles",
    "email": "lsallesforce@gmail.com",
    "document": "93766747070",
    "type": "individual",
    "phones": {
      "mobile_phone": {
        "country_code": "55",
        "area_code": "17",
        "number": "991141010"
      }
    }
  },
  "payments": [
    {
      "payment_method": "credit_card",
      "credit_card": {
        "installments": 1,
        "statement_descriptor": "AMIGO RACING",
        "card": {
          "number": "4111111111111111",
          "holder_name": "LUCAS SALLES",
          "exp_month": 12,
          "exp_year": 2026,
          "cvv": "123"
        }
      }
    }
  ],
  "split": [
    {
      "recipient_id": "re_cmlip76jfhai7Ol9thzwxtn4g",
      "amount": 250,
      "type": "flat",
      "options": {
        "charge_processing_fee": true,
        "charge_remainder_fee": false,
        "liable": true
      }
    },
    {
      "recipient_id": "re_cmlh54y8231l9Ol9tyh2h34qc",
      "amount": 2250,
      "type": "flat",
      "options": {
        "charge_processing_fee": true,
        "charge_remainder_fee": false,
        "liable": true
      }
    }
  ],
  "closed": true,
  "metadata": {
    "registrationId": "12345"
  }
}
```

---

## 💰 Distribuição do Split

| Recebedor | ID | Valor | Percentual |
|-----------|----|----|-----------|
| **Plataforma (Amigo Racing)** | `re_cmlip76jfhai7Ol9thzwxtn4g` | R$ 2,50 | 10% |
| **Organizador do Evento** | `re_cmlh54y8231l9Ol9tyh2h34qc` | R$ 22,50 | 90% |
| **TOTAL** | - | **R$ 25,00** | **100%** |

---

## 🔍 Detalhes do Split

### Opções de Split Utilizadas:
- **`charge_processing_fee: true`** → Cobra a taxa de processamento do split
- **`charge_remainder_fee: false`** → Não cobra taxa de resto
- **`liable: true`** → O recebedor é responsável por chargebacks

### Tipo de Split:
- **`type: "flat"`** → Valor fixo em centavos (não percentual)

---

## ⚙️ Configuração no Código

### Arquivo: `server/_core/env.ts`
```typescript
export const ENV = {
  // ... outras variáveis
  pagarmeplatformRecipientId: process.env.PAGARME_PLATFORM_RECIPIENT_ID ?? "",
};
```

### Arquivo: `server/pagarme.ts` (função `createOrder`)
```typescript
// Adiciona split se fornecido
if (split && split.length > 0) {
  orderBody.split = split.map((s) => ({
    recipient_id: s.recipientId,
    amount: s.amount,
    type: "flat",
    options: {
      charge_processing_fee: true,
      charge_remainder_fee: false,
      liable: true,
    },
  }));
}
```

### Arquivo: `server/routers.ts` (função `createPayment`)
```typescript
// Calcular valores do split
const totalAmount = Math.round(category.price * 100); // Converter para centavos
const platformAmount = Math.floor(totalAmount * 0.1); // 10%
const organizerAmount = totalAmount - platformAmount; // 90%

// Buscar recipient_id da plataforma
const { ENV } = await import('./_core/env');
const platformRecipientId = ENV.pagarmeplatformRecipientId || process.env.PAGARME_PLATFORM_RECIPIENT_ID;

// Criar pedido com split
const order = await createOrder({
  amount: totalAmount,
  customer: { /* ... */ },
  paymentMethod: "credit_card",
  creditCard: { /* ... */ },
  split: [
    {
      recipientId: platformRecipientId,
      amount: platformAmount,
    },
    {
      recipientId: recipientId, // ID do organizador
      amount: organizerAmount,
    },
  ],
  metadata: {
    registrationId: String(registration.id),
  },
});
```

---

## 🐛 Possíveis Problemas

### 1. **Recipient ID Recusado**
Se o recipient com ID `re_cmlip76jfhai7Ol9thzwxtn4g` estiver com status "Recusado", a Pagar.me rejeitará o split.

**Solução**: Usar um recipient com status "Ativo"

### 2. **Recipient ID em Modo Diferente**
Se o recipient foi criado em modo TEST mas a transação está em modo LIVE (ou vice-versa), o split não funcionará.

**Solução**: Verificar o prefixo da API Key:
- **TEST**: `sk_test_` ou `pk_test_`
- **LIVE**: `sk_live_` ou `pk_live_`

### 3. **Recipient ID Não Configurado**
Se `PAGARME_PLATFORM_RECIPIENT_ID` não estiver definido, o split não será incluído na requisição.

**Solução**: Configurar a variável de ambiente com o ID correto

---

## ✅ Testes Realizados

- ✅ Teste de configuração de variáveis de ambiente
- ✅ Teste de cálculo de split (10% plataforma, 90% organizador)
- ✅ Teste de estrutura JSON do split
- ✅ Validação de IDs de recipient diferentes

---

## 📞 Próximas Ações

1. **Validar status do recipient** `re_cmlip76jfhai7Ol9thzwxtn4g` no painel Pagar.me
2. **Testar nova transação** com split configurado
3. **Verificar logs** da Pagar.me para confirmar que o split foi aplicado
4. **Monitorar** próximas transações para garantir que a comissão está sendo distribuída corretamente
