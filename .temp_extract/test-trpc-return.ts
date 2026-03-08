import { getDb } from "./server/_core/db";

async function testTRPCReturn() {
  const db = await getDb();
  if (!db) {
    console.log("❌ Database not available");
    return;
  }

  // Buscar Wéliton pelo email
  const query = db.select({
    id: db._.users.id,
    openId: db._.users.openId,
    name: db._.users.name,
    email: db._.users.email,
    bankDocument: db._.users.bankDocument,
    bankCode: db._.users.bankCode,
    bankAgency: db._.users.bankAgency,
    bankAgencyDv: db._.users.bankAgencyDv,
    bankAccount: db._.users.bankAccount,
    bankAccountDv: db._.users.bankAccountDv,
    recipientId: db._.users.recipientId,
  }).from(db._.users).where(db.eq(db._.users.email, "projeto@lstecnologias.com.br"));

  const result = await query;
  console.log("✅ Query result:", JSON.stringify(result, null, 2));
  
  if (result.length > 0) {
    console.log("✅ bankAccountDv:", result[0].bankAccountDv);
    console.log("✅ bankAgencyDv:", result[0].bankAgencyDv);
  }
}

testTRPCReturn().catch(console.error);
