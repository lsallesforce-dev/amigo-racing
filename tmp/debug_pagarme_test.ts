import { ENV } from '../server/env';

async function testPagarme() {
    const apiKey = process.env.PAGARME_API_KEY || 'sk_test_...'; // I'll need to read env or assume it's there
    const auth = Buffer.from(`${apiKey}:`).toString('base64');

    // Simulate the payload from routers.ts
    const payload = {
        closed: true,
        items: [{
            amount: 100, // R$ 1,00
            description: "Teste de Inscrição",
            quantity: 1,
            code: "test-reg-1"
        }],
        customer: {
            name: "Lucas S Oliveira",
            email: "isaudioevideo@hotmail.com",
            document: "12345678909", // Dummy but format correct
            type: "individual",
            phones: {
                mobile_phone: {
                    country_code: "55",
                    area_code: "11",
                    number: "999999999"
                }
            },
            address: {
                line_1: "Rua do Piloto, 123, Centro",
                zip_code: "01001000",
                city: "São Paulo",
                state: "SP",
                country: "BR"
            }
        },
        payments: [{
            payment_method: "credit_card",
            amount: 100,
            credit_card: {
                installments: 1,
                statement_descriptor: "AMIGO RACING",
                card: {
                    number: "4350870337511095", // From screenshot
                    holder_name: "LUCAS S OLIVEIRA",
                    exp_month: 7,
                    exp_year: 2028,
                    cvv: "123"
                },
                billing_address: {
                    line_1: "Rua do Piloto, 123, Centro",
                    zip_code: "01001000",
                    city: "São Paulo",
                    state: "SP",
                    country: "BR"
                }
            }
        }]
    };

    console.log('Sending payload to Pagar.me...');

    const response = await fetch('https://api.pagar.me/core/v5/orders', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'Authorization': `Basic ${auth}`
        },
        body: JSON.stringify(payload)
    });

    const data = await response.json();
    console.log('Status:', response.status);
    console.log('Response:', JSON.stringify(data, null, 2));
}

testPagarme();
