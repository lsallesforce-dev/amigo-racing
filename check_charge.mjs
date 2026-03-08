import dotenv from 'dotenv';
import path from 'path';

dotenv.config({ path: path.resolve(process.cwd(), '.env') });

const PAGARME_API_KEY = process.env.PAGARME_API_KEY;

async function checkStatus() {
    if (!PAGARME_API_KEY) {
        console.error('PAGARME_API_KEY não encontrada no .env');
        return;
    }

    const authHeader = `Basic ${Buffer.from(`${PAGARME_API_KEY}:`).toString('base64')}`;

    console.log(`--- Verificando Pedido no Pagar.me ---`);

    const chargeId = 'ch_vXRMQV5tyVhvgx87';
    console.log(`Consultando Charge: ${chargeId}...`);

    try {
        const res = await fetch(`https://api.pagar.me/core/v5/charges/${chargeId}`, {
            headers: { 'Authorization': authHeader }
        });
        const data = await res.json();
        console.log('Status da Cobrança:', data.status);

        if (data.last_transaction) {
            console.log('Última Transação Status:', data.last_transaction.status);
            console.log('Pix Texto:', data.last_transaction.qr_code);
        }

        console.log('Método:', data.payment_method);
        console.log('Valor:', data.amount);

        console.log('\n--- DETALHES COMPLETOS DA COBRANÇA ---');
        console.log(JSON.stringify(data, null, 2));

    } catch (err) {
        console.error('Erro ao consultar charge:', err.message);
    }
}

checkStatus();
