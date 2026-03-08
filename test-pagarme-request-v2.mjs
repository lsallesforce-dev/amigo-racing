import https from "https";

const PAGARME_API_KEY = process.env.PAGARME_API_KEY || "sk_pRv29LfrGT9j87Qw";
const PAGARME_API_URL = process.env.PAGARME_API_URL || "https://api.pagar.me/core/v5";
const authHeader = `Basic ${Buffer.from(`${PAGARME_API_KEY}:`).toString("base64")}`;

const httpsAgent = new https.Agent({
  maxVersion: "TLSv1.3",
  minVersion: "TLSv1.2",
  keepAlive: true,
  keepAliveMsecs: 30000,
});

// Dados de teste com novo recipient
const orderBody = {
  items: [
    {
      code: `registration-test-${Date.now()}`,
      amount: 100, // R$ 1,00 em centavos
      description: "Inscrição em evento",
      quantity: 1,
    },
  ],
  customer: {
    name: "Lucas Salles",
    email: "lsallesforce@gmail.com",
    document: "93766747070",
    type: "individual",
    phones: {
      mobile_phone: {
        country_code: "55",
        area_code: "17",
        number: "991141010",
      },
    },
  },
  payments: [
    {
      payment_method: "pix",
      pix: {
        expires_in: 1800,
      },
      split: [
        {
          recipient_id: "re_cmltamqp6u1s40l9tf459akgb", // Novo recipient
          amount: 90, // 90% do valor
          type: "flat",
          options: {
            charge_processing_fee: false,
            charge_remainder_fee: false,
            liable: false,
          },
        },
        {
          recipient_id: "re_cmltamqp6u1s40l9tf459akgb", // Novo recipient
          amount: 10, // 10% do valor
          type: "flat",
          options: {
            charge_processing_fee: true,
            charge_remainder_fee: false,
            liable: true,
          },
        },
      ],
    },
  ],
  closed: true,
};

console.log("📤 Testando com novo recipient...");

fetch(`${PAGARME_API_URL}/orders`, {
  method: "POST",
  headers: {
    "Content-Type": "application/json",
    Authorization: authHeader,
  },
  body: JSON.stringify(orderBody),
  agent: httpsAgent,
})
  .then((response) => {
    console.log("\n✅ Response received!");
    console.log("Status:", response.status);
    return response.json().then((data) => ({ response, data }));
  })
  .then(({ response, data }) => {
    if (!response.ok) {
      console.log("\n❌ ERROR!");
      if (data.errors) {
        console.log("Errors:", JSON.stringify(data.errors, null, 2));
      }
    } else {
      console.log("\n✅ SUCCESS!");
      if (data.charges && data.charges[0]) {
        console.log("Charge Status:", data.charges[0].status);
        if (data.charges[0].last_transaction) {
          console.log("QR Code:", data.charges[0].last_transaction.qr_code);
          console.log("QR Code URL:", data.charges[0].last_transaction.qr_code_url);
        }
        if (data.charges[0].last_transaction?.gateway_response) {
          console.log("Gateway Response:", JSON.stringify(data.charges[0].last_transaction.gateway_response, null, 2));
        }
      }
    }
  })
  .catch((error) => {
    console.error("\n🔴 FETCH ERROR:", error.message);
  });
