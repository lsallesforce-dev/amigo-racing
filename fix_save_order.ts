// Correção da rota saveOrderPositions
// Problema: Não está aguardando as operações de upsert dentro do loop

// ANTES (ERRADO):
/*
for (const [categoryIdStr, orderPosition] of Object.entries(input.order)) {
  const categoryId = parseInt(categoryIdStr);
  const existingConfigs = await db.getStartOrderConfigsByEventId(input.eventId);
  const existingConfig = existingConfigs.find(c => c.categoryId === categoryId);
  
  if (existingConfig) {
    await db.upsertStartOrderConfig({...}); // Não aguarda
  } else {
    await db.upsertStartOrderConfig({...}); // Não aguarda
  }
}
*/

// DEPOIS (CORRETO):
/*
const updatePromises = Object.entries(input.order).map(async ([categoryIdStr, orderPosition]) => {
  const categoryId = parseInt(categoryIdStr);
  const existingConfigs = await db.getStartOrderConfigsByEventId(input.eventId);
  const existingConfig = existingConfigs.find(c => c.categoryId === categoryId);
  
  if (existingConfig) {
    return await db.upsertStartOrderConfig({...});
  } else {
    return await db.upsertStartOrderConfig({...});
  }
});

await Promise.all(updatePromises);
*/
