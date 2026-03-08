import { createClient } from "@libsql/client";

const client = createClient({
  url: process.env.DATABASE_URL,
});

async function testReturn() {
  try {
    const result = await client.execute(
      `SELECT 
        id, openId, name, email, 
        bankDocument, bankCode, bankAgency, bankAgencyDv, 
        bankAccount, bankAccountDv, recipientId
      FROM users 
      WHERE email = 'projeto@lstecnologias.com.br'`
    );
    
    console.log("✅ Query result:", JSON.stringify(result.rows, null, 2));
    
    if (result.rows.length > 0) {
      const row = result.rows[0];
      console.log("\n✅ bankAccountDv:", row.bankAccountDv);
      console.log("✅ bankAgencyDv:", row.bankAgencyDv);
      console.log("✅ Campos no objeto:", Object.keys(row));
    }
  } catch (error) {
    console.error("❌ Error:", error);
  }
}

testReturn();
