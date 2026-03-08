#!/usr/bin/env node

import https from "https";

const PAGARME_API_KEY = process.env.PAGARME_API_KEY;
const PAGARME_API_URL = process.env.PAGARME_API_URL || "https://api.pagar.me/core/v5";

if (!PAGARME_API_KEY) {
  console.error("❌ PAGARME_API_KEY não está definida!");
  process.exit(1);
}

console.log("📡 Testando PIX com split em produção...");
console.log(`API URL: ${PAGARME_API_URL}`);
console.log(`API Key: ${PAGARME_API_KEY.substring(0, 10)}...`);

// Pagar.me v5 usa Basic auth
const authHeader = `Basic ${Buffer.from(`${PAGARME_API_KEY}:`).toString("base64")}`;

const orderBody = {
  items: [
    {
      code: `test-pix-${Date.now()}`,
      amount: 100, // R$ 1,00 em centavos
      description: "Teste PIX com Split",
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
          recipient_id: "re_cmlip76jfhai70l9thzwxtn4g", // Plataforma (10%)
          amount: 10,
          type: "flat",
          options: {
            charge_processing_fee: true,
            charge_remainder_fee: false,
            liable: true,
          },
        },
        {
          recipient_id: "re_cmlh54y8231l90l9tyh2h34qc", // Organizador (90%)
          amount: 90,
          type: "flat",
          options: {
            charge_processing_fee: false,
            charge_remainder_fee: true, // Último recebedor absorve o resto
            liable: true,
          },
        },
      ],
    },
  ],
  closed: true,
};

console.log("\n📦 Payload enviado:");
console.log(JSON.stringify(orderBody, null, 2));

const options = {
  hostname: new URL(PAGARME_API_URL).hostname,
  port: 443,
  path: "/core/v5/orders",
  method: "POST",
  headers: {
    "Content-Type": "application/json",
    Authorization: authHeader,
  },
};

const req = https.request(options, (res) => {
  let data = "";

  res.on("data", (chunk) => {
    data += chunk;
  });

  res.on("end", () => {
    console.log(`\n📊 Status: ${res.statusCode}`);
    console.log("\n📋 Response:");
    
    try {
      const parsed = JSON.parse(data);
      console.log(JSON.stringify(parsed, null, 2));
      
      if (res.statusCode === 200 || res.statusCode === 201) {
        console.log("\n✅ SUCESSO! Pedido criado!");
        if (parsed.charges && parsed.charges[0]) {
          console.log(`\nCharge ID: ${parsed.charges[0].id}`);
          console.log(`Status: ${parsed.charges[0].status}`);
          if (parsed.charges[0].last_transaction) {
            console.log(`PIX QR Code: ${parsed.charges[0].last_transaction.qr_code}`);
            console.log(`PIX URL: ${parsed.charges[0].last_transaction.qr_code_url}`);
          }
        }
      } else {
        console.log("\n❌ ERRO!");
        if (parsed.errors) {
          console.log("\nErros:");
          parsed.errors.forEach((err) => {
            console.log(`- ${err.message}`);
            if (err.details) console.log(`  Detalhes: ${JSON.stringify(err.details)}`);
          });
        }
      }
    } catch (e) {
      console.log(data);
    }
  });
});

req.on("error", (e) => {
  console.error(`❌ Erro na requisição: ${e.message}`);
});

req.write(JSON.stringify(orderBody));
req.end();
