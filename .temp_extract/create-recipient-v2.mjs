import https from "https";

const PAGARME_API_KEY = process.env.PAGARME_API_KEY || "sk_pRv29LfrGT9j87Qw";
const PAGARME_API_URL = process.env.PAGARME_API_URL || "https://api.pagar.me/core/v5";
const authHeader = `Basic ${Buffer.from(`${PAGARME_API_KEY}:`).toString("base64")}`;

const httpsAgent = new https.Agent({
  maxVersion: "TLSv1.3",
  minVersion: "TLSv1.2",
});

// Dados do recipient com CPF válido (teste)
const recipientData = {
  name: "Lucas Salles",
  email: "lsallesforce@gmail.com",
  document: "93766747070",
  type: "individual",
  default_bank_account: {
    holder_name: "Lucas Salles",
    holder_document: "93766747070",
    holder_type: "individual",
    bank: "001", // Banco do Brasil
    branch_number: "0001",
    branch_check_digit: "0",
    account_number: "12345678",
    account_check_digit: "9",
    type: "checking",
  },
  metadata: {
    test: "true",
    created_at: new Date().toISOString(),
  },
  transfer_settings: {
    transfer_enabled: true,
    transfer_interval: "daily",
    transfer_day: 0,
  },
  phones: [
    {
      country_code: "55",
      area_code: "17",
      number: "991141010",
    },
  ],
};

console.log("📤 Criando novo recipient no Pagar.me...");
console.log("Dados:", JSON.stringify(recipientData, null, 2));

fetch(`${PAGARME_API_URL}/recipients`, {
  method: "POST",
  headers: {
    "Content-Type": "application/json",
    Authorization: authHeader,
  },
  body: JSON.stringify(recipientData),
  agent: httpsAgent,
})
  .then((response) => {
    console.log("\n✅ Response received!");
    console.log("Status:", response.status);
    return response.json().then((data) => ({ response, data }));
  })
  .then(({ response, data }) => {
    console.log("\n📊 Response Data:");
    console.log(JSON.stringify(data, null, 2));

    if (!response.ok) {
      console.log("\n❌ ERROR!");
      if (data.errors) {
        console.log("Errors:", data.errors);
      }
    } else {
      console.log("\n✅ SUCCESS!");
      console.log("Recipient ID:", data.id);
      console.log("Status:", data.status);
      console.log("\n📋 Use este ID no banco de dados:");
      console.log(`UPDATE users SET recipientId = '${data.id}' WHERE email = 'lsallesforce@gmail.com';`);
    }
  })
  .catch((error) => {
    console.error("\n🔴 FETCH ERROR:", error.message);
  });
