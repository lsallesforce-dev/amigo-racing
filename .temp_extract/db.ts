  bankDocument: string;
  bankCode: string;
  bankAgency: string;
  bankAgencyDv: string;
  bankAccount: string;
  bankAccountDv: string;
  bankAccountType: string;
  bankHolderName: string;
  bankHolderDocument: string;
  pixKey?: string;
  phone?: string; // NOVO: Adicionar telefone
}) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  
  console.log('[updateUserBankData] INICIADO com userId:', userId);
  console.log('[updateUserBankData] data.bankAccountDv ENTRADA:', data.bankAccountDv);
  
  const updateData: any = {
    bankDocument: data.bankDocument,
    bankCode: data.bankCode,
    bankAgency: data.bankAgency,
    bankAgencyDv: data.bankAgencyDv,
    bankAccount: data.bankAccount,
    bankAccountDv: data.bankAccountDv,
    bankAccountType: data.bankAccountType,
    bankHolderName: data.bankHolderName,
    bankHolderDocument: data.bankHolderDocument,
  };
  
  console.log('[updateUserBankData] updateData.bankAccountDv ANTES DO UPDATE:', updateData.bankAccountDv);
  
  if (data.pixKey) {
    updateData.pixKey = data.pixKey;
  }
  
  if (data.phone) {
    updateData.phone = data.phone; // NOVO: Salvar telefone no banco
    console.log('[updateUserBankData] Telefone a salvar:', data.phone);
  }
  
  console.log('[updateUserBankData] Executando UPDATE com:', updateData);
  console.log('[updateUserBankData] ⚠️ VERIFICANDO PHONE:', {
    'data.phone': data.phone,
    'updateData.phone': updateData.phone,
    'phone foi incluido?': !!updateData.phone,
  });
  
  await db
    .update(users)
    .set(updateData)
    .where(eq(users.id, userId));
  
  console.log('[updateUserBankData] UPDATE EXECUTADO!');
  
  const verifyAfter = await db.select({ 
    bankAccountDv: users.bankAccountDv,
    phone: users.phone, // NOVO: Verificar se phone foi salvo
  }).from(users).where(eq(users.id, userId)).limit(1);
  console.log('[updateUserBankData] VERIFICACAO APOS UPDATE:', verifyAfter[0]);
  console.log('[updateUserBankData] ⚠️ PHONE FOI SALVO?', verifyAfter[0]?.phone);
  
  return { success: true };
}


// ==================== START ORDER QUERIES ====================