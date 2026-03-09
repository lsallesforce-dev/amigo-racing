import { ENV } from '../api/server/env.js';
import * as pagarme from '../api/server/pagarme.js';

async function run() {
    try {
        const totalAmountCents = 7000;
        const split = [];

        // Simulate organizer setup using platform ID
        if (ENV.pagarmePlatformRecipientId) {
            split.push({
                amount: totalAmountCents - 700,
                recipient_id: ENV.pagarmePlatformRecipientId, // Using Platform ID as the mock recipient for the test
                type: "flat",
                options: {
                    charge_processing_fee: true,
                    charge_remainder_fee: true,
                    liable: true
                }
            });
            split.push({
                amount: 700,
                recipient_id: ENV.pagarmePlatformRecipientId,
                type: "flat",
                options: {
                    charge_processing_fee: false,
                    charge_remainder_fee: false,
                    liable: false
                }
            });
        }

        console.log("Creating payload for PIX SPLIT", split);

        const order = await pagarme.createOrder({
            closed: true,
            metadata: { orderId: "1234-test" },
            items: [{ amount: totalAmountCents, description: "Test Standalone", quantity: 1, code: "1234-test" }],
            customer: {
                name: "Test User",
                email: "test@example.com",
                document: "01234567890",
                type: "individual",
                phones: { mobile_phone: { country_code: "55", area_code: "11", number: "999999999" } }
            },
            payments: [{
                payment_method: "pix",
                pix: { expires_in: 7200 },
                amount: totalAmountCents,
                antifraud_enabled: false,
                ...(split.length > 0 ? { split } : {}),
            }]
        });

        console.log("SUCCESS:", order.id);
    } catch (e: any) {
        console.error("ERROR:", e.message);
    }
}

run();
