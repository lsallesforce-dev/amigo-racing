
/**
 * Core user table backing auth flow.
 * Extended with role field for access control (PARTICIPANT, ORGANIZER, ADMIN)
 */
export const users = mysqlTable("users", {
  id: int("id").autoincrement().primaryKey(),
  openId: varchar("openId", { length: 64 }).notNull().unique(),
  name: text("name"),
  email: varchar("email", { length: 320 }),
  phone: varchar("phone", { length: 20 }),
  loginMethod: varchar("loginMethod", { length: 64 }),
  role: mysqlEnum("role", ["user", "admin", "participant", "organizer"]).default("participant").notNull(),
  recipientId: varchar("recipientId", { length: 64 }), // ID do recipient no Pagar.me
  pixKey: varchar("pixKey", { length: 255 }), // Chave PIX do organizador (CPF, CNPJ, email, telefone ou aleatória)
  // Campos bancários
  bankDocument: varchar("bankDocument", { length: 20 }), // CPF ou CNPJ
  bankCode: varchar("bankCode", { length: 10 }), // Código do banco
  bankAgency: varchar("bankAgency", { length: 10 }), // Agência
  bankAgencyDv: varchar("bankAgencyDv", { length: 2 }), // Dígito da agência
  bankAccount: varchar("bankAccount", { length: 20 }), // Número da conta
  bankAccountDv: varchar("bankAccountDv", { length: 2 }), // Dígito da conta
  bankAccountType: varchar("bankAccountType", { length: 20 }), // Tipo de conta (checking/savings)
  bankHolderName: varchar("bankHolderName", { length: 255 }), // Nome do titular
  bankHolderDocument: varchar("bankHolderDocument", { length: 20 }), // Documento do titular
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
  lastSignedIn: timestamp("lastSignedIn").defaultNow().notNull(),
});

export type User = typeof users.$inferSelect;
export type InsertUser = typeof users.$inferInsert;

/**
 * Vehicles table - stores participant vehicles
 */
export const vehicles = mysqlTable("vehicles", {
  id: int("id").autoincrement().primaryKey(),
  brand: varchar("brand", { length: 100 }).notNull(),
  model: varchar("model", { length: 100 }).notNull(),
  plate: varchar("plate", { length: 20 }).notNull().unique(),
  year: int("year"),
  color: varchar("color", { length: 50 }),
  ownerId: varchar("ownerId", { length: 64 }).notNull(), // openId do usuário (OAuth)
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

export type Vehicle = typeof vehicles.$inferSelect;
export type InsertVehicle = typeof vehicles.$inferInsert;