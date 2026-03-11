import { integer, pgTable, text, timestamp, varchar, doublePrecision, boolean, json, serial, uuid } from "drizzle-orm/pg-core";

/**
 * Core user table backing auth flow.
 * Extended with role field for access control (PARTICIPANT, ORGANIZER, ADMIN)
 */
export const users = pgTable("users", {
  id: serial("id").primaryKey(),
  openId: varchar("openId", { length: 64 }).notNull().unique(),
  name: text("name"),
  email: varchar("email", { length: 320 }),
  phone: varchar("phone", { length: 20 }),
  loginMethod: varchar("loginMethod", { length: 64 }),
  password: varchar("password", { length: 255 }), // Hash da senha para login local
  resetToken: varchar("resetToken", { length: 255 }), // Token para reset de senha
  resetTokenExpires: timestamp("resetTokenExpires"), // Expiração do token de reset de senha
  role: varchar("role", { length: 50 }).$type<"user" | "admin" | "participant" | "organizer">().default("participant").notNull(),
  recipientId: varchar("recipientId", { length: 64 }), // ID do recipient no Pagar.me
  pagarmeCustomerId: varchar("pagarmeCustomerId", { length: 64 }), // ID do customer no Pagar.me
  pixKey: varchar("pixKey", { length: 255 }), // Chave PIX do organizador (CPF, CNPJ, email, telefone ou aleatória)
  // Campos bancários
  bankDocument: varchar("bankDocument", { length: 20 }), // CPF ou CNPJ
  bankCode: varchar("bankCode", { length: 10 }), // Código do banco
  bankAgency: varchar("bankAgency", { length: 10 }), // Agência
  bankAgencyDv: varchar("bankAgencyDv", { length: 2 }), // Dígito da agência
  bankAccount: varchar("bankAccount", { length: 20 }), // Número da conta
  bankAccountDv: varchar("bankAccountDv", { length: 2 }), // Dígito da conta
  bankAccountType: varchar("bankAccountType", { length: 20 }), // Tipo de conta checking/savings
  bankHolderName: varchar("bankHolderName", { length: 255 }), // Nome do titular
  bankHolderDocument: varchar("bankHolderDocument", { length: 20 }), // Documento do titular
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().notNull(),
  lastSignedIn: timestamp("lastSignedIn").defaultNow().notNull(),
});

export type User = typeof users.$inferSelect;
export type InsertUser = typeof users.$inferInsert;

/**
 * Vehicles table - stores participant vehicles
 */
export const vehicles = pgTable("vehicles", {
  id: serial("id").primaryKey(),
  brand: varchar("brand", { length: 100 }).notNull(),
  model: varchar("model", { length: 100 }).notNull(),
  plate: varchar("plate", { length: 20 }).notNull().unique(),
  year: integer("year"),
  color: varchar("color", { length: 50 }),
  ownerId: varchar("ownerId", { length: 64 }).notNull(), // openId do usuário (OAuth)
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

export type Vehicle = typeof vehicles.$inferSelect;
export type InsertVehicle = typeof vehicles.$inferInsert;

/**
 * Organizers table - stores event organizers
 */
export const organizers = pgTable("organizers", {
  id: serial("id").primaryKey(),
  name: varchar("name", { length: 200 }).notNull(),
  description: text("description"),
  active: boolean("active").default(true).notNull(),
  ownerId: varchar("ownerId", { length: 64 }).notNull(), // openId do usuário (OAuth)
  pagseguroEmail: varchar("pagseguroEmail", { length: 320 }),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

export type Organizer = typeof organizers.$inferSelect;
export type InsertOrganizer = typeof organizers.$inferInsert;

/**
 * Organizer Members (Sub-organizers) table
 * Links a user email to an organizer with specific permissions
 */
export const organizerMembers = pgTable("organizer_members", {
  id: serial("id").primaryKey(),
  organizerId: integer("organizerId").notNull(), // The ID of the Principal Organizer User (users.id)
  memberEmail: varchar("memberEmail", { length: 320 }).notNull(), // The invited user's email
  permissions: json("permissions").notNull(), // Array of strings: ['events', 'registrations', 'finance', 'store']
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

export type OrganizerMember = typeof organizerMembers.$inferSelect;
export type InsertOrganizerMember = typeof organizerMembers.$inferInsert;

/**
 * Events table - stores racing events
 */
export const events = pgTable("events", {
  id: serial("id").primaryKey(),
  name: varchar("name", { length: 200 }).notNull(),
  description: text("description"),
  startDate: timestamp("startDate").notNull(),
  endDate: timestamp("endDate").notNull(),
  location: varchar("location", { length: 300 }).notNull(),
  city: varchar("city", { length: 100 }).notNull(),
  state: varchar("state", { length: 2 }),
  status: varchar("status", { length: 50 }).$type<"open" | "closed" | "cancelled">().default("open").notNull(),
  isExternal: boolean("isExternal").default(false).notNull(),
  showInListing: boolean("showInListing").default(true).notNull(),
  showRegistrations: boolean("showRegistrations").default(true).notNull(),
  imageUrl: text("imageUrl"),
  documents: text("documents"), // JSON: [{name, url, type}]
  terms: text("terms"),
  organizerId: integer("organizerId").notNull(),
  notifyOnNewRegistration: boolean("notifyOnNewRegistration").default(false).notNull(),
  notificationEmail: varchar("notificationEmail", { length: 320 }),
  allowCancellation: boolean("allowCancellation").default(false),
  cancellationDeadlineDays: integer("cancellationDeadlineDays").default(0),
  refundEnabled: boolean("refundEnabled").default(false),
  sponsors: json("sponsors"), // Array of strings (image URLs)
  gallery: json("gallery"), // Array of strings (image URLs)
  navigationFiles: json("navigationFiles"), // JSON: [{name, url, type}]
  externalUrl: text("externalUrl"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().notNull(),
});

export type Event = typeof events.$inferSelect;
export type InsertEvent = typeof events.$inferInsert;

/**
 * Categories table - event categories with pricing and slots
 * Supports hierarchical structure: parent categories (Carros, Motos) and subcategories
 * parentId is null for parent categories, and references parent category id for subcategories
 */
export const categories = pgTable("categories", {
  id: serial("id").primaryKey(),
  name: varchar("name", { length: 100 }).notNull(),
  description: text("description"),
  price: doublePrecision("price"),
  slots: integer("slots"),
  parentId: integer("parentId"),
  eventId: integer("eventId").notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

export type Category = typeof categories.$inferSelect;
export type InsertCategory = typeof categories.$inferInsert;

/**
 * Registrations table - participant registrations for events
 */
export const registrations = pgTable("registrations", {
  id: serial("id").primaryKey(),
  accessHash: uuid("accessHash").defaultRandom().notNull().unique(),
  userId: integer("userId").notNull(),
  eventId: integer("eventId").notNull(),
  categoryId: integer("categoryId").notNull(),
  vehicleId: integer("vehicleId"),

  // Pilot information
  pilotName: varchar("pilotName", { length: 200 }).notNull(),
  pilotEmail: varchar("pilotEmail", { length: 320 }).notNull(),
  pilotCpf: varchar("pilotCpf", { length: 14 }).notNull(),
  pilotCity: varchar("pilotCity", { length: 100 }).notNull(),
  pilotState: varchar("pilotState", { length: 2 }).notNull(),
  pilotAge: integer("pilotAge"),

  // Navigator information (optional)
  navigatorName: varchar("navigatorName", { length: 200 }),
  navigatorEmail: varchar("navigatorEmail", { length: 320 }),
  navigatorCpf: varchar("navigatorCpf", { length: 14 }),
  navigatorCity: varchar("navigatorCity", { length: 100 }),
  navigatorState: varchar("navigatorState", { length: 2 }),

  // Team and vehicle
  team: varchar("team", { length: 200 }),
  vehicleInfo: text("vehicleInfo"),
  vehicleBrand: varchar("vehicleBrand", { length: 100 }),
  vehicleModel: varchar("vehicleModel", { length: 100 }),
  vehicleYear: integer("vehicleYear"),
  vehicleColor: varchar("vehicleColor", { length: 50 }),
  vehiclePlate: varchar("vehiclePlate", { length: 20 }),

  // Shirt sizes
  pilotShirtSize: varchar("pilotShirtSize", { length: 50 }).$type<"pp" | "p" | "m" | "g" | "gg" | "g1" | "g2" | "g3" | "g4" | "infantil">().notNull(),
  navigatorShirtSize: varchar("navigatorShirtSize", { length: 50 }).$type<"pp" | "p" | "m" | "g" | "gg" | "g1" | "g2" | "g3" | "g4" | "infantil">(),

  status: varchar("status", { length: 50 }).$type<"pending" | "paid" | "cancelled" | "cancellation_requested">().default("pending").notNull(),
  cancellationReason: text("cancellationReason"),
  transactionId: varchar("transactionId", { length: 64 }), // ID da transação no Pagar.me
  phone: varchar("phone", { length: 20 }), // Telefone do piloto
  qrCode: text("qrCode"),
  checkedInAt: timestamp("checkedInAt"),
  termsAccepted: boolean("termsAccepted").default(false).notNull(),

  // Digital Secretariat Fields
  isCheckedIn: boolean("isCheckedIn").default(false).notNull(),
  kitDelivered: boolean("kitDelivered").default(false).notNull(),
  waiverSigned: boolean("waiverSigned").default(false).notNull(),

  // Start information for race
  startNumber: integer("startNumber"),
  startTime: varchar("startTime", { length: 10 }),

  // Notes/observations from participant
  notes: text("notes"),

  // Store products purchased during registration
  purchasedProducts: json("purchasedProducts"),

  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().notNull(),
});

export type Registration = typeof registrations.$inferSelect;
export type InsertRegistration = typeof registrations.$inferInsert;

/**
 * Payments table - payment records for registrations
 */
export const payments = pgTable("payments", {
  id: serial("id").primaryKey(),
  registrationId: integer("registrationId").notNull().unique(),
  method: varchar("method", { length: 50 }).$type<"pix" | "credit_card" | "bank_transfer" | "pagseguro">().default("pix").notNull(),
  status: varchar("status", { length: 50 }).$type<"pending" | "confirmed" | "failed" | "refunded" | "processing">().default("pending").notNull(),
  value: doublePrecision("value").notNull(),
  transactionId: varchar("transactionId", { length: 200 }),
  pixCode: text("pixCode"),
  pixQrCode: text("pixQrCode"),
  // PagSeguro Split fields
  pagseguroOrderId: varchar("pagseguroOrderId", { length: 200 }),
  pagseguroChargeId: varchar("pagseguroChargeId", { length: 200 }),
  pagseguroPaymentLink: text("pagseguroPaymentLink"),
  pagseguroQrCode: text("pagseguroQrCode"),
  splitData: json("splitData"), // Stores split configuration
  paidAt: timestamp("paidAt"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().notNull(),
});

export type Payment = typeof payments.$inferSelect;
export type InsertPayment = typeof payments.$inferInsert;

/**
 * Organizer Requests table
 */
export const organizerRequests = pgTable("organizerRequests", {
  id: serial("id").primaryKey(),
  userId: integer("userId").notNull(),
  organizerName: varchar("organizerName", { length: 200 }).notNull(),
  description: text("description"),
  contactEmail: varchar("contactEmail", { length: 320 }).notNull(),
  contactPhone: varchar("contactPhone", { length: 20 }),
  status: varchar("status", { length: 50 }).$type<"pending" | "approved" | "rejected">().default("pending").notNull(),
  reviewedBy: integer("reviewedBy"), // Admin user ID who reviewed
  reviewedAt: timestamp("reviewedAt"),
  rejectionReason: text("rejectionReason"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().notNull(),
});

export type OrganizerRequest = typeof organizerRequests.$inferSelect;
export type InsertOrganizerRequest = typeof organizerRequests.$inferInsert;

/**
 * Registration History table - tracks all changes made to registrations
 */
export const registrationHistory = pgTable("registration_history", {
  id: serial("id").primaryKey(),
  registrationId: integer("registrationId").notNull(),
  changedBy: integer("changedBy").notNull(), // User ID who made the change
  fieldName: varchar("fieldName", { length: 100 }).notNull(), // Field that was changed
  oldValue: text("oldValue"), // Previous value
  newValue: text("newValue"), // New value
  changedAt: timestamp("changedAt").defaultNow().notNull(),
});

export type RegistrationHistory = typeof registrationHistory.$inferSelect;
export type InsertRegistrationHistory = typeof registrationHistory.$inferInsert;

/**
 * Event Images table - stores gallery images for events
 */
export const eventImages = pgTable("event_images", {
  id: serial("id").primaryKey(),
  eventId: integer("eventId").notNull(),
  imageUrl: text("imageUrl").notNull(),
  caption: varchar("caption", { length: 500 }),
  displayOrder: integer("displayOrder").default(0).notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

export type EventImage = typeof eventImages.$inferSelect;
export type InsertEventImage = typeof eventImages.$inferInsert;

/**
 * Start Order Configuration table
 */
export const startOrderConfig = pgTable("start_order_config", {
  id: serial("id").primaryKey(),
  eventId: integer("eventId").notNull(),
  categoryId: integer("categoryId").notNull(),
  orderPosition: integer("orderPosition").notNull(), // 1, 2, 3... (start order)
  numberStart: integer("numberStart").notNull(), // Starting number
  numberEnd: integer("numberEnd").notNull(), // Ending number
  startTime: varchar("startTime", { length: 8 }).notNull(), // Start time (HH:MM:SS)
  intervalSeconds: integer("intervalSeconds").default(60).notNull(), // Seconds between starts
  timeBetweenCategories: integer("timeBetweenCategories").default(0), // Minutes between categories
  registrationOrder: text("registrationOrder"), // JSON array of registration IDs
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().notNull(),
});

export type StartOrderConfig = typeof startOrderConfig.$inferSelect;
export type InsertStartOrderConfig = typeof startOrderConfig.$inferInsert;

/**
 * Transactions table - stores financial transactions for organizers
 */
export const transactions = pgTable("transactions", {
  id: uuid("id").defaultRandom().primaryKey(),
  description: varchar("description", { length: 255 }).notNull(),
  amount: doublePrecision("amount").notNull(),
  type: varchar("type", { length: 20 }).$type<"INCOME" | "EXPENSE">().notNull(),
  date: timestamp("date").notNull(),
  status: varchar("status", { length: 20 }).$type<"PENDING" | "COMPLETED">().notNull(),
  userId: integer("userId").notNull(), // Organizer ID
  eventId: integer("eventId"), // Optional Event ID
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().notNull(),
});

export type Transaction = typeof transactions.$inferSelect;
export type InsertTransaction = typeof transactions.$inferInsert;

/**
 * Organizer Store: Products table
 */
export const products = pgTable("products", {
  id: uuid("id").defaultRandom().primaryKey(),
  name: varchar("name", { length: 200 }).notNull(),
  description: text("description"),
  price: doublePrecision("price").notNull(),
  stock: integer("stock").default(0).notNull(),
  availableSizes: varchar("availableSizes", { length: 200 }),
  imageUrl: text("imageUrl"),
  userId: integer("userId").notNull(), // Owner/Organizer ID
  eventId: integer("eventId"), // Optional link to a specific event
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().notNull(),
});

export type Product = typeof products.$inferSelect;
export type InsertProduct = typeof products.$inferInsert;

/**
 * Standalone Product Orders
 */
export const productOrders = pgTable("product_orders", {
  id: uuid("id").defaultRandom().primaryKey(),
  productId: uuid("productId").notNull(),
  eventId: integer("eventId"), // Optional
  quantity: integer("quantity").notNull(),
  sizes: json("sizes"), // Storing chosen sizes
  totalAmount: doublePrecision("totalAmount").notNull(),
  buyerName: varchar("buyerName", { length: 200 }).notNull(),
  buyerEmail: varchar("buyerEmail", { length: 320 }).notNull(),
  buyerCpf: varchar("buyerCpf", { length: 14 }),
  buyerPhone: varchar("buyerPhone", { length: 20 }),
  status: varchar("status", { length: 50 }).$type<"PENDING" | "PAID" | "SHIPPED" | "CANCELLED">().default("PENDING").notNull(),
  transactionId: varchar("transactionId", { length: 200 }),
  qrCode: text("qrCode"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().notNull(),
});

export type ProductOrder = typeof productOrders.$inferSelect;
export type InsertProductOrder = typeof productOrders.$inferInsert;

/**
 * Championships Management
 */
export const championships = pgTable("championships", {
  id: serial("id").primaryKey(),
  name: varchar("name", { length: 200 }).notNull(),
  year: integer("year").notNull(),
  organizerId: integer("organizerId").notNull(),
  discardRule: integer("discardRule").default(0).notNull(), // N-x discard rule
  sponsorBannerUrl: text("sponsorBannerUrl"),
  imageUrl: text("imageUrl"),
  active: boolean("active").default(true).notNull(),
  allowDiscardMissedStages: boolean("allowDiscardMissedStages").default(true).notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().notNull(),
});

export type Championship = typeof championships.$inferSelect;
export type InsertChampionship = typeof championships.$inferInsert;

/**
 * Championship Stages
 * Links a championship to an existing event
 */
export const championshipStages = pgTable("championship_stages", {
  id: serial("id").primaryKey(),
  championshipId: integer("championshipId").notNull(),
  eventId: integer("eventId"), // Null for external events
  customName: text("customName"),
  isExternal: boolean("isExternal").default(false).notNull(),
  stageNumber: integer("stageNumber").notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

export type ChampionshipStage = typeof championshipStages.$inferSelect;
export type InsertChampionshipStage = typeof championshipStages.$inferInsert;

/**
 * Championship Results
 * Individual scores per stage per competitor
 */
export const championshipResults = pgTable("championship_results", {
  id: serial("id").primaryKey(),
  stageId: integer("stageId").notNull(),
  category: varchar("category", { length: 200 }),
  pilotName: varchar("pilotName", { length: 200 }),
  navigatorName: varchar("navigatorName", { length: 200 }),
  position: integer("position").notNull(),
  points: doublePrecision("points").notNull(),
  isDiscarded: boolean("isDiscarded").default(false).notNull(),
  isDisqualified: boolean("isDisqualified").default(false).notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

export type ChampionshipResult = typeof championshipResults.$inferSelect;
export type InsertChampionshipResult = typeof championshipResults.$inferInsert;

/**
 * Championship Requests
 * Requests from local organizers to join a master championship
 */
export const championshipRequests = pgTable("championship_requests", {
  id: uuid("id").defaultRandom().primaryKey(),
  championshipId: integer("championshipId").notNull(),
  eventId: integer("eventId").notNull(),
  requestingOrganizerId: integer("requestingOrganizerId").notNull(),
  status: varchar("status", { length: 50 }).$type<"PENDING" | "APPROVED" | "REJECTED">().default("PENDING").notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().notNull(),
});

export type ChampionshipRequest = typeof championshipRequests.$inferSelect;
export type InsertChampionshipRequest = typeof championshipRequests.$inferInsert;
