import { Router } from 'express';
import * as db from './db.js';
import { ENV } from './env.js';
import { TRPCError } from '@trpc/server';

const router = Router();

export interface BankAccount {
  bank: string;
  branchNumber: string;
  branchCheckDigit?: string;
  accountNumber: string;
  accountCheckDigit: string;
  type: 'checking' | 'savings';
  holderName: string;
  holderType: 'individual' | 'corporation';
  holderDocument: string;
}

export interface RecipientData {
  name: string;
  email: string;
  document: string;
  type: 'individual' | 'corporation';
  phone: string;
  bankAccount: BankAccount;
}

/**
 * Cria ou recupera um recebedor no Pagar.me
 */
export async function createOrGetRecipient(data: RecipientData) {
  console.log('[Pagar.me] Iniciando createOrGetRecipient para:', data.document);

  // Buscar recebedor existente pelo documento
  const existingRecipient = await getRecipientByDocument(data.document);
  if (existingRecipient) {
    console.log('[Pagar.me] Recebedor jÃ¡ existe:', existingRecipient.id);
    return {
      recipientId: existingRecipient.id,
      status: existingRecipient.status,
    };
  }

  // Criar novo recebedor
  return await createRecipient(data);
}

/**
 * Cria um novo recebedor no Pagar.me
 */
export async function createRecipient(data: RecipientData) {
  const url = `${ENV.pagarmeApiUrl}/recipients`;
  const apiKey = ENV.pagarmeApiKey;

  if (!apiKey) {
    throw new Error('PAGARME_API_KEY nÃ£o configurada');
  }

  const payload = {
    name: data.name,
    email: data.email,
    document: data.document.replace(/\D/g, ''),
    type: data.type,
    phones: {
      mobile_phone: {
        country_code: '55',
        area_code: data.phone.replace(/\D/g, '').substring(0, 2),
        number: data.phone.replace(/\D/g, '').substring(2),
      }
    },
    default_bank_account: {
      holder_name: data.bankAccount.holderName,
      holder_type: data.bankAccount.holderType,
      holder_document: data.bankAccount.holderDocument.replace(/\D/g, ''),
      bank: String(data.bankAccount.bank).padStart(3, '0'),
      branch_number: data.bankAccount.branchNumber,
      account_number: data.bankAccount.accountNumber,
      type: data.bankAccount.type,
      ...(data.bankAccount.branchCheckDigit ? { branch_check_digit: data.bankAccount.branchCheckDigit } : {}),
      ...(data.bankAccount.accountCheckDigit ? { account_check_digit: data.bankAccount.accountCheckDigit } : {}),
    },
    transfer_settings: {
      transfer_enabled: true,
      transfer_interval: 'Daily',
      transfer_day: 0,
    },
  };

  console.log('[Pagar.me] PAYLOAD COMPLETO:', JSON.stringify(payload, null, 2));

  const response = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Basic ${Buffer.from(`${apiKey}:`).toString('base64')}`,
    },
    body: JSON.stringify(payload),
  });

  const responseData = await response.json();

  if (!response.ok) {
    console.error('[Pagar.me] Erro ao criar recipient:', response.status, JSON.stringify(responseData, null, 2));
    let detailedError = responseData.message || `Erro API Pagar.me: ${response.status}`;
    if (responseData.errors) {
      const firstErrorKey = Object.keys(responseData.errors)[0];
      const firstErrorVal = responseData.errors[firstErrorKey][0];
      detailedError = `${detailedError} (${firstErrorKey}: ${firstErrorVal})`;
    }
    const err = new Error(detailedError);
    (err as any).response = { data: responseData, status: response.status };
    throw err;
  }

  console.log('[Pagar.me] Recipient criado com sucesso:', responseData.id);
  return {
    recipientId: responseData.id,
    status: responseData.status,
  };
}

/**
 * Busca um recebedor pelo documento
 */
export async function getRecipientByDocument(document: string) {
  const url = `${ENV.pagarmeApiUrl}/recipients?document=${document.replace(/\D/g, '')}`;
  const apiKey = ENV.pagarmeApiKey;

  if (!apiKey) return null;

  try {
    const response = await fetch(url, {
      method: 'GET',
      headers: {
        'Authorization': `Basic ${Buffer.from(`${apiKey}:`).toString('base64')}`,
      },
    });

    if (!response.ok) return null;

    const data = await response.json();
    return data.data && data.data.length > 0 ? data.data[0] : null;
  } catch (error) {
    console.error('[Pagar.me] Erro ao buscar recipient por documento:', error);
    return null;
  }
}

/**
 * Cria ou recupera um cliente (Customer) no Pagar.me
 */
export async function createOrGetCustomer(customerData: any) {
  const apiKey = ENV.pagarmeApiKey;
  if (!apiKey) throw new Error('PAGARME_API_KEY nÃ£o configurada');

  const authHeader = `Basic ${Buffer.from(`${apiKey}:`).toString('base64')}`;

  // Tenta buscar o cliente existente pelo documento
  const searchUrl = `${ENV.pagarmeApiUrl}/customers?document=${customerData.document}`;
  try {
    const searchRes = await fetch(searchUrl, {
      method: 'GET',
      headers: { 'Authorization': authHeader },
    });

    if (searchRes.ok) {
      const searchData = await searchRes.json();
      if (searchData.data && searchData.data.length > 0) {
        console.log('[Pagar.me] Cliente jÃ¡ existente:', searchData.data[0].id);
        return searchData.data[0];
      }
    }
  } catch (err) {
    console.error('[Pagar.me] Falha ao buscar cliente existente, procedendo com criaÃ§Ã£o.', err);
  }

  // Cria um novo cliente
  const createUrl = `${ENV.pagarmeApiUrl}/customers`;
  console.log('[Pagar.me] Criando novo cliente:', customerData.document);

  const createRes = await fetch(createUrl, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': authHeader,
    },
    body: JSON.stringify(customerData),
  });

  const data = await createRes.json();

  if (!createRes.ok) {
    throw new Error(data.message || `Erro API Pagar.me (Customers): ${createRes.status}`);
  }

  return data;
}

/**
 * Cria um pedido (transaÃ§Ã£o) no Pagar.me
 */
export async function createOrder(orderData: any) {
  const url = `${ENV.pagarmeApiUrl}/orders`;
  const apiKey = ENV.pagarmeApiKey;

  if (!apiKey) {
    throw new Error('PAGARME_API_KEY nÃ£o configurada');
  }

  const response = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Basic ${Buffer.from(`${apiKey}:`).toString('base64')}`,
    },
    body: JSON.stringify(orderData),
  });

  const data = await response.json();

  if (!response.ok) {
    console.error('[Pagar.me] Erro ao criar pedido:', response.status, JSON.stringify(data, null, 2));
    throw new Error(data.message || `Erro API Pagar.me: ${response.status}`);
  }

  return data;
}

/**
 * Verifica o status de um recebedor
 */
export async function checkRecipientStatus(recipientId: string) {
  const url = `${ENV.pagarmeApiUrl}/recipients/${recipientId}`;
  const apiKey = ENV.pagarmeApiKey;

  if (!apiKey) return 'unknown';

  try {
    const response = await fetch(url, {
      method: 'GET',
      headers: {
        'Authorization': `Basic ${Buffer.from(`${apiKey}:`).toString('base64')}`,
      },
    });

    if (!response.ok) return 'unknown';

    const data = await response.json();
    return data.status;
  } catch (error) {
    return 'unknown';
  }
}

/**
 * Busca o status de um pedido no Pagar.me
 */
export async function getOrderStatus(orderId: string) {
  const url = `${ENV.pagarmeApiUrl}/orders/${orderId}`;
  const apiKey = ENV.pagarmeApiKey;

  if (!apiKey) throw new Error('PAGARME_API_KEY nÃ£o configurada');

  const response = await fetch(url, {
    method: 'GET',
    headers: {
      'Authorization': `Basic ${Buffer.from(`${apiKey}:`).toString('base64')}`,
    },
  });

  if (!response.ok) {
    throw new Error(`Erro ao buscar pedido: ${response.status}`);
  }

  return await response.json();
}

/**
 * Busca o saldo de um recebedor no Pagar.me
 */
export async function getRecipientBalance(recipientId: string) {
  const url = `${ENV.pagarmeApiUrl}/balance?recipient_id=${recipientId}`;
  const apiKey = ENV.pagarmeApiKey;

  if (!apiKey) throw new Error('PAGARME_API_KEY nÃ£o configurada');

  const response = await fetch(url, {
    method: 'GET',
    headers: {
      'Authorization': `Basic ${Buffer.from(`${apiKey}:`).toString('base64')}`,
    },
  });

  if (!response.ok) {
    throw new Error(`Erro ao buscar saldo: ${response.status}`);
  }

  return await response.json();
}

/**
 * Busca os payables (recebíveis) de um recebedor ou transação no Pagar.me.
 * Retorna o campo `payment_date` com a data exata de liquidação do valor.
 *
 * @param recipientId - ID do recebedor no Pagar.me (ex: re_xxxxx)
 * @param transactionId - ID da transação/charge no Pagar.me (ex: tran_xxxxx ou ch_xxxxx)
 * @param page - Página (padrão: 1)
 * @param size - Itens por página (padrão: 20, máx: 100)
 */
export async function getPayables(params: {
  recipientId?: string;
  transactionId?: string;
  page?: number;
  size?: number;
}) {
  const apiKey = ENV.pagarmeApiKey;
  if (!apiKey) throw new Error('PAGARME_API_KEY não configurada');

  const query = new URLSearchParams();
  if (params.recipientId) query.set('recipient_id', params.recipientId);
  if (params.transactionId) query.set('transaction_id', params.transactionId);
  query.set('page', String(params.page || 1));
  query.set('size', String(params.size || 20));

  const url = `${ENV.pagarmeApiUrl}/payables?${query.toString()}`;

  console.log(`[Pagar.me] Buscando payables: ${url}`);

  const response = await fetch(url, {
    method: 'GET',
    headers: {
      'Authorization': `Basic ${Buffer.from(`${apiKey}:`).toString('base64')}`,
    },
  });

  if (!response.ok) {
    const errorData = await response.json().catch(() => ({}));
    console.error('[Pagar.me] Erro ao buscar payables:', response.status, errorData);
    throw new Error(`Erro ao buscar payables: ${response.status}`);
  }

  const data = await response.json() as any;

  // Normaliza os payables para um formato mais amigável para o frontend
  const payables = (data.data || []).map((p: any) => ({
    id: p.id,
    status: p.status,                        // 'waiting_funds' | 'prepaid' | 'paid' | 'suspended' | 'canceled'
    amount: p.amount,                        // valor em centavos
    fee: p.fee,                              // taxa em centavos
    anticipation_fee: p.anticipation_fee,
    net_amount: (p.amount || 0) - (p.fee || 0) - (p.anticipation_fee || 0),
    payment_date: p.payment_date,            // ← DATA EXATA DE LIQUIDAÇÃO (ISO 8601)
    original_payment_date: p.original_payment_date,
    accrual_date: p.accrual_date,            // data de competência
    type: p.type,                            // 'credit' | 'refund' | 'chargeback'
    payment_method: p.payment_method,        // 'pix' | 'credit_card' | etc.
    recipient_id: p.recipient_id,
    transaction_id: p.transaction_id,
    charge_id: p.charge_id,
    installment: p.installment,
    total_installments: p.total_installments,
    created_at: p.created_at,
  }));

  return {
    data: payables,
    paging: data.paging || {},
    total: data.paging?.total || payables.length,
  };
}

// Webhook Handler
router.post('/pagarme', async (req, res) => {
  try {
    const event = req.body;
    console.log('[Webhook Pagar.me] Evento recebido:', event.type);

    if (event.type === 'transaction.paid') {
      const transaction = event.data;
      const registration = await db.getRegistrationByTransactionId(transaction.id);

      if (registration) {
        await db.updateRegistration(registration.id, { status: 'paid' });
        console.log('[Webhook Pagar.me] InscriÃ§Ã£o atualizada para paga:', registration.id);
      }
    }

    return res.status(200).json({ received: true });
  } catch (error) {
    console.error('[Webhook Pagar.me] Erro:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
});

export default router;
