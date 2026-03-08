# 🔍 Requisição Completa de Split - Debug

## 1️⃣ FUNÇÃO QUE MONTA O SPLIT

**Arquivo:** `server/pagarme.ts` (linhas 89-109)

```typescript
// Adiciona split DENTRO do payment se fornecido
...(split && split.length > 0
  ? {
      split: split.map((s, index) => {
        // Primeiro recebedor (plataforma): absorve taxa de processamento
        // Último recebedor (organizador): absorve taxa de resto
        const isFirst = index === 0;
        const isLast = index === split.length - 1;
        return {
          recipient_id: s.recipientId,
          amount: s.amount,
          type: "flat",
          options: {
            charge_processing_fee: isFirst,
            charge_remainder_fee: isLast, // Último recebedor absorve o resto
            liable: true, // Ambos são responsáveis
          },
        };
      }),
    }
  : {}),
```

✅ **CORRETO:** O split está **DENTRO** do array `payments[0]`, não no nível raiz.

---

## 2️⃣ ONDE O SPLIT É MONTADO

**Arquivo:** `server/routers.ts` (linhas 2489-2511)

```typescript
let splitRules: { recipientId: string; amount: number }[] = [];

if (!isSameCnpj) {
  console.log('[createPayment] [SPLIT] CNPJs diferentes - aplicando split 10%/90%');
  splitRules = [
    {
      recipientId: platformRecipientId,  // re_cmlh... (plataforma)
      amount: platformAmount,             // 10% do total
    },
    {
      recipientId: recipientId,           // re_cmlip76jfhai70l9thzwxtn4g (Lucas Salles)
      amount: organizerAmount,            // 90% do total
    },
  ];
}
```

---

## 3️⃣ REQUISIÇÃO COMPLETA (JSON/PAYLOAD)

### Exemplo com dados reais de Lucas Salles:

```json
{
  "items": [
    {
      "code": "registration-1739906400000",
      "amount": 25000,
      "description": "Inscrição em evento",
      "quantity": 1
    }
  ],
  "customer": {
    "name": "Lucas Salles",
    "email": "lsallesforce@gmail.com",
    "document": "12345678901",
    "type": "individual",
    "phones": {
      "mobile_phone": {
        "country_code": "55",
        "area_code": "11",
        "number": "999999999"
      }
    }
  },
  "payments": [
    {
      "payment_method": "pix",
      "pix": {
        "expires_in": 1800
      },
      "split": [
        {
          "recipient_id": "re_cmlh54y8231l90l9tyh2h34qc",
          "amount": 2500,
          "type": "flat",
          "options": {
            "charge_processing_fee": true,
            "charge_remainder_fee": false,
            "liable": true
          }
        },
        {
          "recipient_id": "re_cmlip76jfhai70l9thzwxtn4g",
          "amount": 22500,
          "type": "flat",
          "options": {
            "charge_processing_fee": false,
            "charge_remainder_fee": true,
            "liable": true
          }
        }
      ]
    }
  ],
  "closed": true,
  "metadata": {
    "registrationId": "123",
    "eventId": "456",
    "userId": "789"
  }
}
```

---

## 4️⃣ BREAKDOWN DO SPLIT

| Campo | Valor | Descrição |
|-------|-------|-----------|
| **Total da Inscrição** | R$ 250,00 (25000 centavos) | Valor total cobrado |
| **Plataforma (10%)** | R$ 25,00 (2500 centavos) | Recipient: `re_cmlh54y8...` |
| **Organizador (90%)** | R$ 225,00 (22500 centavos) | Recipient: `re_cmlip76j...` (Lucas) |
| **charge_processing_fee** | `true` (plataforma) | Plataforma absorve taxa de processamento |
| **charge_remainder_fee** | `true` (organizador) | Organizador absorve taxa de resto |

---

## 5️⃣ FLUXO DE BUSCA DO RECIPIENT ID

**Arquivo:** `server/routers.ts` (linhas 2405-2432)

```typescript
// 1. Buscar usuário do organizador
const organizerUser = await db.getUserByOpenId(organizer.ownerId);

// 2. Pegar recipientId do usuário
let recipientId: string | null = organizerUser?.recipientId || null;
// Para Lucas Salles: recipientId = "re_cmlip76jfhai70l9thzwxtn4g"

// 3. Se não tiver, usar recipient da plataforma como fallback
if (!recipientId) {
  recipientId = platformRecipientId; // re_cmlh54y8231l90l9tyh2h34qc
}
```

---

## 6️⃣ VALIDAÇÕES FEITAS

✅ **Soma do split = 100%**
```typescript
const splitSum = splitRules.reduce((sum, rule) => sum + rule.amount, 0);
if (splitSum !== totalAmount) {
  throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: 'Soma do split invalida' });
}
```

✅ **Split está DENTRO de payments[0]**
```typescript
// Linha 121 em pagarme.ts:
console.log("[Pagar.me] Payment object structure:", JSON.stringify(orderBody.payments[0], null, 2));
if (orderBody.payments[0].split) {
  console.log("[Pagar.me] Split rules included:", JSON.stringify(orderBody.payments[0].split, null, 2));
}
```

✅ **Recipient status verificado**
```typescript
const recipientStatus = await checkRecipientStatus(recipientId);
if (recipientStatus === 'refused' || recipientStatus === 'rejected') {
  throw new TRPCError({
    code: 'BAD_REQUEST',
    message: 'Dados bancários rejeitados pelo Pagar.me...'
  });
}
```

---

## 7️⃣ LOGS QUE VOCÊ VERÁ NO CONSOLE

```
[createPayment] [SPLIT] CNPJs diferentes - aplicando split 10%/90%
[createPayment] Valores do split:
[createPayment] Total amount (centavos): 25000
[createPayment] Platform amount: 2500
[createPayment] Organizer amount: 22500
[createPayment] [SPLIT] Split rules finais: [
  {
    "recipientId": "re_cmlh54y8231l90l9tyh2h34qc",
    "amount": 2500
  },
  {
    "recipientId": "re_cmlip76jfhai70l9thzwxtn4g",
    "amount": 22500
  }
]
[createPayment] [SPLIT] Validacao OK: soma = 100%
[Pagar.me] Payment object structure: {
  "payment_method": "pix",
  "pix": { "expires_in": 1800 },
  "split": [
    {
      "recipient_id": "re_cmlh54y8231l90l9tyh2h34qc",
      "amount": 2500,
      "type": "flat",
      "options": {
        "charge_processing_fee": true,
        "charge_remainder_fee": false,
        "liable": true
      }
    },
    {
      "recipient_id": "re_cmlip76jfhai70l9thzwxtn4g",
      "amount": 22500,
      "type": "flat",
      "options": {
        "charge_processing_fee": false,
        "charge_remainder_fee": true,
        "liable": true
      }
    }
  ]
}
[Pagar.me] Split rules included: [...]
```

---

## 8️⃣ POSSÍVEIS PROBLEMAS

### ❌ Split não está funcionando?

1. **Recipient ID está NULL?**
   - Verificar se `organizerUser.recipientId` foi salvo corretamente
   - Executar: `SELECT email, recipientId FROM users WHERE email = 'lsallesforce@gmail.com';`

2. **Recipient status é "refused"?**
   - Dados bancários foram rejeitados pelo Pagar.me
   - Solução: Atualizar dados bancários no painel

3. **Split está fora do array payments?**
   - Verificar linha 89-109 em `pagarme.ts`
   - Split DEVE estar dentro de `payments[0]`, não no nível raiz

4. **Soma do split não é 100%?**
   - Verificar cálculo: `platformAmount = Math.floor(totalAmount * 0.1)`
   - Pode haver arredondamento em valores pequenos

---

## 9️⃣ TESTE RÁPIDO

Para testar se o split está correto, execute:

```bash
# 1. Verificar recipient ID de Lucas
SELECT email, recipientId, bankCode, bankAccount FROM users WHERE email = 'lsallesforce@gmail.com';

# 2. Criar inscrição e pagamento via UI
# 3. Verificar logs do servidor (deve mostrar split rules)
# 4. Verificar no dashboard Pagar.me se split foi aplicado
```

---

**Última atualização:** 2026-02-19
