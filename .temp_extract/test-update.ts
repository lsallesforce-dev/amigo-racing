import { getDb } from './server/db';
import { users } from './drizzle/schema';
import { eq } from 'drizzle-orm';

async function testUpdate() {
  const db = await getDb();
  if (!db) {
    console.log('Database not available');
    process.exit(1);
  }

  try {
    const userId = 2820172; // Wéliton
    
    console.log('1. Verificando dados ANTES do update:');
    const before = await db.select({
      id: users.id,
      email: users.email,
      bankAccountDv: users.bankAccountDv,
      bankAgencyDv: users.bankAgencyDv,
    }).from(users).where(eq(users.id, userId));
    console.log(JSON.stringify(before, null, 2));
    
    console.log('\n2. Fazendo UPDATE com Drizzle ORM:');
    await db.update(users).set({
      bankAccountDv: '8',
      bankAgencyDv: '5',
    }).where(eq(users.id, userId));
    console.log('✅ UPDATE executado');
    
    console.log('\n3. Verificando dados DEPOIS do update:');
    const after = await db.select({
      id: users.id,
      email: users.email,
      bankAccountDv: users.bankAccountDv,
      bankAgencyDv: users.bankAgencyDv,
    }).from(users).where(eq(users.id, userId));
    console.log(JSON.stringify(after, null, 2));
    
    console.log('\n4. Verificando com SQL RAW:');
    const raw = await db.execute(`
      SELECT id, email, bankAccountDv, bankAgencyDv 
      FROM users 
      WHERE id = ${userId}
    `);
    console.log(JSON.stringify(raw, null, 2));
    
  } catch (error) {
    console.error('Erro:', error);
  }
  
  process.exit(0);
}

testUpdate();
