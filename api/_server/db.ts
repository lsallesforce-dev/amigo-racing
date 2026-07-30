import { eq, and, or, gte, lte, asc, desc, sql, ne } from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";
import { drizzle } from "drizzle-orm/postgres-js";
import {
  User,
  InsertUser,
  users,
  vehicles,
  InsertVehicle,
  organizers,
  InsertOrganizer,
  events,
  InsertEvent,
  categories,
  InsertCategory,
  registrations,
  InsertRegistration,
  payments,
  InsertPayment,
  organizerRequests,
  InsertOrganizerRequest,
  eventImages,
  InsertEventImage,
  startOrderConfig,
  InsertStartOrderConfig,
  transactions,
  InsertTransaction,
  products,
  Product,
  InsertProduct,
  productOrders,
  organizerMembers,
  championships,
  InsertChampionship,
  championshipStages,
  InsertChampionshipStage,
  championshipResults,
  InsertChampionshipResult,
  eventShirtStock,
  eventEmails,
  eventEmailRecipients,
} from "./schema.js";
import { normalizeShirtSize, shirtSizesOfRegistration } from "../../shared/shirtSizes.js";
import { ENV } from './env.js';
import postgres from "postgres";

let _db: ReturnType<typeof drizzle> | null = null;

export async function getDb() {
  if (_db) return _db;

  let connectionString = ENV.databaseUrl;
  if (!connectionString) {
    console.error("[Database] ERROR: DATABASE_URL is missing in ENV!");
    return null;
  }

  // Remove pgbouncer=true (it's a Prisma-only flag that breaks this driver)
  let cleanConnectionString = connectionString;
  try {
    const url = new URL(connectionString);
    if (url.searchParams.has("pgbouncer")) {
      url.searchParams.delete("pgbouncer");
      cleanConnectionString = url.toString();
    }
  } catch (e) {
    // If not a valid URL, fallback to simple replace
    cleanConnectionString = connectionString.replace(/[\?&]pgbouncer=true/g, "");
  }

  try {
    console.log("[Database] Connecting to:", cleanConnectionString.split('@')[1]?.split('?')[0] || "unknown");
    const isLocal = cleanConnectionString.includes('localhost') || cleanConnectionString.includes('127.0.0.1');

    _db = drizzle(postgres(cleanConnectionString, {
      max: 10,
      idle_timeout: 20,
      connect_timeout: 10,
      ssl: isLocal ? false : 'require',
      prepare: false,
    }));
  } catch (error) {
    console.warn("[Database] Failed to connect:", error);
    _db = null;
  }
  return _db;
}

// ==================== ORGANIZER CONTEXT ====================

export type OrganizerContext = {
  type: 'PRINCIPAL' | 'MEMBER';
  principalUserId: number; // The user ID that owns the resources
  permissions: string[]; // Only applies if type === 'MEMBER'
};

export async function getOrganizerContext(user: any): Promise<OrganizerContext> {
  const db = await getDb();
  if (!db || !user?.email || !user?.id) {
    return { type: 'PRINCIPAL', principalUserId: user?.id || 0, permissions: [] };
  }

  // Check if this user is invited as a member
  const memberRecords = await db.select().from(organizerMembers).where(eq(organizerMembers.memberEmail, user.email)).limit(1);
  if (memberRecords.length > 0) {
    const record = memberRecords[0];
    let parsedPermissions: string[] = [];
    try {
      parsedPermissions = typeof record.permissions === 'string' ? JSON.parse(record.permissions) : record.permissions;
      if (!Array.isArray(parsedPermissions)) parsedPermissions = [];
    } catch {
      parsedPermissions = [];
    }
    return {
      type: 'MEMBER',
      principalUserId: record.organizerId,
      permissions: parsedPermissions
    };
  }

  // Otherwise, they are a principal
  return {
    type: 'PRINCIPAL',
    principalUserId: user.id,
    permissions: [] // Principals implicitly have all permissions
  };
}

// ==================== USER QUERIES ====================

export async function upsertUser(user: InsertUser): Promise<User | undefined> {
  if (!user.openId) {
    throw new Error("User openId is required for upsert");
  }

  const db = await getDb();
  if (!db) {
    console.warn("[Database] Cannot upsert user: database not available");
    return undefined;
  }

  try {
    const values: InsertUser = {
      openId: user.openId,
    };
    const updateSet: Record<string, unknown> = {};

    const textFields = ["name", "email", "loginMethod", "phone", "password", "resetToken"] as const;
    type TextField = (typeof textFields)[number];

    const assignNullable = (field: TextField) => {
      const value = user[field];
      if (value === undefined) return;
      const normalized = value ?? null;
      values[field] = normalized;
      updateSet[field] = normalized;
    };

    textFields.forEach(assignNullable);

    if (user.lastSignedIn !== undefined) {
      values.lastSignedIn = user.lastSignedIn;
      updateSet.lastSignedIn = user.lastSignedIn;
    }

    if (user.resetTokenExpires !== undefined) {
      values.resetTokenExpires = user.resetTokenExpires;
      updateSet.resetTokenExpires = user.resetTokenExpires;
    }

    // Buscar role existente no banco
    const existingUser = await db.select().from(users).where(eq(users.openId, user.openId)).limit(1);
    const existingRole = existingUser.length > 0 ? existingUser[0].role : null;

    if (user.role !== undefined) {
      values.role = user.role;
      updateSet.role = user.role;
    } else if (existingRole) {
      // Preservar role existente no banco (nÃ£o sobrescrever)
      values.role = existingRole;
      // NÃ£o adicionar ao updateSet para nÃ£o atualizar
    } else if (user.openId === ENV.ownerOpenId) {
      values.role = 'admin';
      updateSet.role = 'admin';
    } else {
      values.role = 'participant';
      updateSet.role = 'participant';
    }

    if (!values.lastSignedIn) {
      values.lastSignedIn = new Date();
    }

    if (Object.keys(updateSet).length === 0) {
      updateSet.lastSignedIn = new Date();
    }

    const result = await db.insert(users).values(values).onConflictDoUpdate({
      target: users.openId,
      set: updateSet,
    }).returning();

    return result[0];
  } catch (error) {
    console.error("[Database] Failed to upsert user:", error);
    throw error;
  }
}

export async function getUserByOpenId(openId: string) {
  const db = await getDb();
  if (!db) {
    console.warn("[Database] Cannot get user: database not available");
    return undefined;
  }

  const result = await db.select().from(users).where(eq(users.openId, openId)).limit(1);
  return result.length > 0 ? result[0] : undefined;
}

export async function getUserById(id: number) {
  const db = await getDb();
  if (!db) return undefined;

  const result = await db.select().from(users).where(eq(users.id, id)).limit(1);
  return result.length > 0 ? result[0] : undefined;
}

export async function getAllUsers() {
  const db = await getDb();
  if (!db) return [];

  return await db.select().from(users).orderBy(desc(users.createdAt));
}

// ==================== VEHICLE QUERIES ====================

export async function createVehicle(vehicle: InsertVehicle) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  const result = await db.insert(vehicles).values(vehicle);
  return result;
}

export async function getVehiclesByOwnerId(ownerId: string) {
  const db = await getDb();
  if (!db) return [];

  return await db.select().from(vehicles).where(eq(vehicles.ownerId, ownerId));
}

export async function getVehicleById(id: number) {
  const db = await getDb();
  if (!db) return undefined;

  const result = await db.select().from(vehicles).where(eq(vehicles.id, id)).limit(1);
  return result.length > 0 ? result[0] : undefined;
}

export async function updateVehicle(id: number, data: Partial<InsertVehicle>) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  return await db.update(vehicles).set(data).where(eq(vehicles.id, id));
}

export async function deleteVehicle(id: number) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  return await db.delete(vehicles).where(eq(vehicles.id, id));
}

// ==================== ORGANIZER QUERIES ====================

export async function createOrganizer(organizer: InsertOrganizer) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  const result = await db.insert(organizers).values(organizer);
  return result;
}

export async function updateOrganizer(id: number, data: Partial<InsertOrganizer>) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  return await db.update(organizers).set(data).where(eq(organizers.id, id));
}

export async function getOrganizersByOwnerId(ownerId: string) {
  const db = await getDb();
  if (!db) return [];

  return await db.select().from(organizers).where(eq(organizers.ownerId, ownerId));
}

export async function getOrganizerByOwnerId(ownerId: string) {
  const db = await getDb();
  if (!db) return undefined;

  const result = await db.select().from(organizers).where(eq(organizers.ownerId, ownerId)).limit(1);
  return result.length > 0 ? result[0] : undefined;
}

export async function getOrganizerById(id: number) {
  const db = await getDb();
  if (!db) return undefined;

  const result = await db.select().from(organizers).where(eq(organizers.id, id)).limit(1);
  return result.length > 0 ? result[0] : undefined;
}

export async function getAllOrganizers() {
  const db = await getDb();
  if (!db) return [];

  return await db.select().from(organizers).where(eq(organizers.active, true));
}

// ==================== EVENT QUERIES ====================

export async function createEvent(event: InsertEvent) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  const result = await db.insert(events).values(event);
  return result;
}

export async function markEventAsExternal(eventId: number, showInListing: boolean = true) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  const showInListingValue = showInListing ? 1 : 0;
  await db.execute(sql`UPDATE events SET isExternal = 1, showInListing = ${showInListingValue} WHERE id = ${eventId}`);
}

export async function getEventById(id: number) {
  const db = await getDb();
  if (!db) return undefined;

  const result = await db.select({
    event: events,
    organizer: organizers,
    owner: users
  })
    .from(events)
    .leftJoin(organizers, eq(events.organizerId, organizers.id))
    .leftJoin(users, eq(organizers.ownerId, users.openId))
    .where(eq(events.id, id))
    .limit(1);

  if (result.length === 0) return undefined;

  const { event, organizer, owner } = result[0];
  return {
    ...event,
    organizer: organizer ? {
      ...organizer,
      principalUserId: owner?.id
    } : null
  };
}

export async function getEventIdBySlug(slug: string) {
  const db = await getDb();
  if (!db) return undefined;

  const result = await db.select({ id: events.id }).from(events).where(eq(events.slug, slug)).limit(1);
  return result[0]?.id;
}

export async function getAllEvents() {
  const db = await getDb();
  if (!db) return [];

  return await db.select().from(events).orderBy(desc(events.startDate));
}

export async function getOpenEvents() {
  const db = await getDb();
  if (!db) return [];

  const today = new Date();
  today.setHours(0, 0, 0, 0);

  return await db.select().from(events)
    .where(and(
      eq(events.status, 'open'),
      eq(events.showInListing, true),
      gte(events.endDate, today)
    ))
    .orderBy(asc(events.startDate));
}

export async function getAllOpenEvents() {
  const db = await getDb();
  if (!db) return [];

  const today = new Date();
  today.setHours(0, 0, 0, 0);

  // Retorna TODOS os eventos abertos, independente de showInListing (para calendário)
  return await db.select().from(events)
    .where(and(
      eq(events.status, 'open'),
      gte(events.endDate, today)
    ))
    .orderBy(asc(events.startDate));
}

export async function getEventsByOrganizerId(organizerId: number) {
  const db = await getDb();
  if (!db) return [];

  const results = await db
    .select({
      event: events,
      registrationCount: sql<number>`count(${registrations.id})`.mapWith(Number),
    })
    .from(events)
    .leftJoin(registrations, eq(events.id, registrations.eventId))
    .where(eq(events.organizerId, organizerId))
    .groupBy(events.id)
    .orderBy(asc(events.startDate));

  return results.map(r => ({
    ...r.event,
    registrationCount: r.registrationCount
  }));
}

export async function updateEvent(id: number, data: Partial<InsertEvent>) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  return await db.update(events).set(data).where(eq(events.id, id));
}

export async function deleteEvent(id: number) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  return await db.delete(events).where(eq(events.id, id));
}

// ==================== CATEGORY QUERIES ====================

export async function createCategory(category: InsertCategory) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  // Insert and get the last inserted ID using returning
  const [createdCategory] = await db
    .insert(categories)
    .values(category)
    .returning({ insertId: categories.id });

  return { insertId: createdCategory.insertId };
}

export async function getCategoriesByEventId(eventId: number) {
  const db = await getDb();
  if (!db) return [];

  return await db.select().from(categories).where(eq(categories.eventId, eventId)).orderBy(categories.sortOrder, categories.id);
}

export async function getCategoryById(id: number) {
  const db = await getDb();
  if (!db) return undefined;

  const result = await db.select().from(categories).where(eq(categories.id, id)).limit(1);
  return result.length > 0 ? result[0] : undefined;
}

export async function updateCategory(id: number, data: Partial<InsertCategory>) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  return await db.update(categories).set(data).where(eq(categories.id, id));
}

export async function deleteCategory(id: number) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  return await db.delete(categories).where(eq(categories.id, id));
}

export async function getParentCategoriesByEventId(eventId: number) {
  const db = await getDb();
  if (!db) return [];

  return await db.select().from(categories)
    .where(and(
      eq(categories.eventId, eventId),
      sql`${categories.parentId} IS NULL`
    ));
}

export async function getSubcategoriesByParentId(parentId: number) {
  const db = await getDb();
  if (!db) return [];

  return await db.select().from(categories)
    .where(eq(categories.parentId, parentId));
}

// ==================== REGISTRATION QUERIES ====================

export async function createRegistration(registration: InsertRegistration) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  // Insert and get the last inserted ID using returning
  const [result] = await db.insert(registrations).values(registration).returning({ id: registrations.id });
  return result.id;
}

export async function getRegistrationById(id: number) {
  const db = await getDb();
  if (!db) return undefined;

  const result = await db.select().from(registrations).where(eq(registrations.id, id)).limit(1);
  return result.length > 0 ? result[0] : undefined;
}

export async function getRegistrationsByUserId(userId: number) {
  const db = await getDb();
  if (!db) return [];

  const results = await db
    .select({
      id: registrations.id,
      userId: registrations.userId,
      eventId: registrations.eventId,
      categoryId: registrations.categoryId,
      vehicleId: registrations.vehicleId,
      pilotName: registrations.pilotName,
      pilotEmail: registrations.pilotEmail,
      pilotCpf: registrations.pilotCpf,
      pilotPhone: registrations.phone,
      pilotCity: registrations.pilotCity,
      pilotState: registrations.pilotState,
      pilotAge: registrations.pilotAge,
      pilotShirtSize: registrations.pilotShirtSize,
      navigatorName: registrations.navigatorName,
      navigatorEmail: registrations.navigatorEmail,
      navigatorCPF: registrations.navigatorCpf,
      navigatorShirtSize: registrations.navigatorShirtSize,
      vehicleBrand: registrations.vehicleBrand,
      vehicleModel: registrations.vehicleModel,
      vehicleYear: registrations.vehicleYear,
      vehicleColor: registrations.vehicleColor,
      vehiclePlate: registrations.vehiclePlate,
      team: registrations.team,
      vehicleInfo: registrations.vehicleInfo,
      status: registrations.status,
      qrCode: registrations.qrCode,
      transactionId: registrations.transactionId,
      startTime: registrations.startTime,
      startNumber: registrations.startNumber,
      createdAt: registrations.createdAt,
      updatedAt: registrations.updatedAt,
      cancellationReason: registrations.cancellationReason,
      purchasedProducts: registrations.purchasedProducts,
      categoryPrice: categories.price,
      categoryName: categories.name,
      parentCategoryName: sql<string | null>`(SELECT name FROM categories AS parent WHERE parent.id = categories."parentId")`,
      eventName: events.name,
      eventDocuments: sql<string | null>`events.documents`,
      eventNavigationFiles: sql<any | null>`events."navigationFiles"`,
      eventAllowCancellation: sql<boolean | null>`events."allowCancellation"`,
      eventNotificationEmail: sql<string | null>`events."notificationEmail"`,
      eventHasShirts: events.hasShirts,
      acceptsCreditCard: events.accepts_credit_card,
      eventDate: events.startDate,
      eventLocation: events.location,
      eventCity: events.city,
      eventState: events.state,
      championshipId: championshipStages.championshipId,
    })
    .from(registrations)
    .leftJoin(categories, eq(registrations.categoryId, categories.id))
    .leftJoin(events, eq(registrations.eventId, events.id))
    .leftJoin(championshipStages, eq(events.id, championshipStages.eventId))
    .where(eq(registrations.userId, userId))
    .orderBy(desc(registrations.createdAt));

  return results;
}

export async function getRegistrationsByEventId(eventId: number) {
  const db = await getDb();
  if (!db) return [];

  const parentCategories = alias(categories, "parentCategories");

  const results = await db
    .select()
    .from(registrations)
    .leftJoin(payments, eq(registrations.id, payments.registrationId))
    .leftJoin(categories, eq(registrations.categoryId, categories.id))
    .leftJoin(parentCategories, eq(categories.parentId, parentCategories.id))
    .leftJoin(vehicles, eq(registrations.vehicleId, vehicles.id))
    .where(eq(registrations.eventId, eventId))
    .orderBy(desc(registrations.createdAt));

  return results.map(r => {
    const vehicleBrand = r.vehicles?.brand || r.registrations.vehicleBrand || null;
    const vehicleModel = r.vehicles?.model || r.registrations.vehicleModel || null;
    return {
      ...r.registrations,
      paymentId: r.payments?.id || null,
      paymentStatus: r.payments?.status || null,
      categoryName: r.categories?.name || 'N/A',
      categoryPrice: r.categories?.price || 0,
      categoryGroup: r.parentCategories?.name || null,
      vehicleBrand,
      vehicleModel,
      startNumber: r.registrations.startNumber,
      startTime: r.registrations.startTime,
    };
  });
}

export async function updateRegistration(id: number, data: Partial<InsertRegistration>) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  return await db.update(registrations).set(data).where(eq(registrations.id, id));
}

export async function getRegistrationByTransactionId(transactionId: string) {
  const db = await getDb();
  if (!db) return undefined;

  const result = await db.select().from(registrations).where(eq(registrations.transactionId, transactionId)).limit(1);
  return result.length > 0 ? result[0] : undefined;
}

export async function getOrderByTransactionId(transactionId: string) {
  const db = await getDb();
  if (!db) return undefined;

  const result = await db.select().from(productOrders).where(eq(productOrders.transactionId, transactionId)).limit(1);
  return result.length > 0 ? result[0] : undefined;
}

export async function updateOrderStatus(id: string, status: "PENDING" | "PAID" | "SHIPPED" | "CANCELLED") {
  const db = await getDb();
  if (!db) throw new Error("Database available");

  return await db.update(productOrders).set({ status, updatedAt: new Date() }).where(eq(productOrders.id, id));
}

export async function deleteRegistration(id: number) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  return await db.delete(registrations).where(eq(registrations.id, id));
}

export async function getRegistrationStatistics(eventId: number) {
  const db = await getDb();
  if (!db) return { totalRegistrations: 0, byCategory: [], totalRevenue: 0 };

  // Buscar todas as inscriÃ§Ãµes do evento
  const allRegistrations = await db.select()
    .from(registrations)
    .where(eq(registrations.eventId, eventId));

  // Buscar todas as categorias do evento (apenas subcategorias)
  const eventCategories = await db.select()
    .from(categories)
    .where(eq(categories.eventId, eventId));

  // Filtrar apenas subcategorias (que tÃªm parentId)
  const subcategories = eventCategories.filter(cat => cat.parentId !== null);

  // Criar mapa de categorias pai para lookup rÃ¡pido
  const parentCategoriesMap = new Map(
    eventCategories.filter(cat => cat.parentId === null).map(cat => [cat.id, cat.name])
  );

  // Calcular estatÃ­sticas por subcategoria
  const byCategory = subcategories.map(category => {
    const categoryRegistrations = allRegistrations.filter(r => r.categoryId === category.id);
    const confirmedCount = categoryRegistrations.filter(r => r.status === 'paid').length;
    const pendingCount = categoryRegistrations.filter(r => r.status === 'pending').length;

    // Obter nome da categoria pai
    const parentName = category.parentId ? parentCategoriesMap.get(category.parentId) : '';
    const displayName = parentName ? `${parentName} - ${category.name}` : category.name;

    return {
      categoryId: category.id,
      categoryName: displayName,
      totalSlots: category.slots || 0,
      confirmedRegistrations: confirmedCount,
      pendingRegistrations: pendingCount,
      availableSlots: category.slots ? Math.max(0, category.slots - confirmedCount) : 0,
      revenue: confirmedCount * (category.price || 0),
    };
  });

  // Calcular totais
  const totalRegistrations = allRegistrations.length;
  const totalRevenue = byCategory.reduce((sum, cat) => sum + cat.revenue, 0);

  return {
    totalRegistrations,
    byCategory,
    totalRevenue,
  };
}

export async function getRegistrationCountByCategory(categoryId: number) {
  const db = await getDb();
  if (!db) return 0;

  const result = await db
    .select({ count: sql<number>`count(*)` })
    .from(registrations)
    .where(
      and(
        eq(registrations.categoryId, categoryId),
        eq(registrations.status, 'paid')
      )
    );

  return result[0]?.count || 0;
}

// ==================== PAYMENT QUERIES ====================

export async function createPayment(payment: InsertPayment) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  const result = await db.insert(payments).values(payment);
  return result;
}

export async function getPaymentByRegistrationId(registrationId: number) {
  const db = await getDb();
  if (!db) return undefined;

  const result = await db.select().from(payments)
    .where(eq(payments.registrationId, registrationId))
    .limit(1);
  return result.length > 0 ? result[0] : undefined;
}

export async function updatePaymentStatus(id: number, status: 'pending' | 'confirmed' | 'failed' | 'refunded') {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  const updateData: Partial<InsertPayment> = {
    status,
    ...(status === 'confirmed' ? { paidAt: new Date() } : {})
  };

  return await db.update(payments).set(updateData).where(eq(payments.id, id));
}

export async function getPaymentById(id: number) {
  const db = await getDb();
  if (!db) return undefined;

  const result = await db.select().from(payments).where(eq(payments.id, id)).limit(1);
  return result.length > 0 ? result[0] : undefined;
}

export async function updatePayment(id: number, data: Partial<InsertPayment>) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  return await db.update(payments).set(data).where(eq(payments.id, id));
}

export async function getAllPayments() {
  const db = await getDb();
  if (!db) return [];

  return await db.select().from(payments).orderBy(desc(payments.createdAt));
}

// Organizer Requests functions - using SQL temporarily due to TypeScript cache issues
export async function createOrganizerRequest(data: InsertOrganizerRequest) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  const result = await db.insert(organizerRequests).values(data);
  return result;
}

export async function getOrganizerRequestsByUserId(userId: number) {
  const db = await getDb();
  if (!db) return [];

  return await db.select().from(organizerRequests).where(eq(organizerRequests.userId, userId)).orderBy(desc(organizerRequests.createdAt));
}

export async function getPendingRequestByUserId(userId: number) {
  const db = await getDb();
  if (!db) return null;

  const result = await db.select().from(organizerRequests).where(and(eq(organizerRequests.userId, userId), eq(organizerRequests.status, 'pending'))).limit(1);
  return result.length > 0 ? result[0] : null;
}

export async function getAllOrganizerRequests() {
  const db = await getDb();
  if (!db) return [];

  return await db.select().from(organizerRequests).orderBy(desc(organizerRequests.createdAt));
}

export async function getPendingOrganizerRequests() {
  const db = await getDb();
  if (!db) return [];

  return await db.select().from(organizerRequests).where(eq(organizerRequests.status, 'pending')).orderBy(desc(organizerRequests.createdAt));
}

export async function getOrganizerRequestById(id: number) {
  const db = await getDb();
  if (!db) return undefined;

  const result = await db.select().from(organizerRequests).where(eq(organizerRequests.id, id)).limit(1);
  return result.length > 0 ? result[0] : undefined;
}

export async function updateOrganizerRequest(id: number, data: Partial<InsertOrganizerRequest>) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  return await db.update(organizerRequests).set(data).where(eq(organizerRequests.id, id));
}

export async function updateUserRole(userId: number, role: 'user' | 'admin' | 'participant' | 'organizer') {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  await db.update(users).set({ role }).where(eq(users.id, userId));
}

export async function updateUserPagarmeCustomerId(userId: number, pagarmeCustomerId: string) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  await db.update(users).set({ pagarmeCustomerId, updatedAt: new Date() }).where(eq(users.id, userId));
}

export async function updateUserBankData(userId: number, data: any) {
  const dbClient = await getDb();
  if (!dbClient) throw new Error("Database not available");

  return await dbClient.update(users)
    .set({
      ...data,
      updatedAt: new Date()
    })
    .where(eq(users.id, userId))
    .returning();
}


// Registration History functions
export async function createRegistrationHistory(data: {
  registrationId: number;
  changedBy: number;
  fieldName: string;
  oldValue: string | null;
  newValue: string | null;
}) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  // Colunas são camelCase case-sensitive (criadas pelo Drizzle) — PRECISAM de
  // aspas no SQL cru, senão o Postgres rebaixa pra minúsculo e não acha a coluna.
  await db.execute(sql`
    INSERT INTO registration_history ("registrationId", "changedBy", "fieldName", "oldValue", "newValue", "changedAt")
    VALUES (${data.registrationId}, ${data.changedBy}, ${data.fieldName}, ${data.oldValue}, ${data.newValue}, NOW())
  `);
}

export async function getRegistrationHistory(registrationId: number) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  const result = await db.execute(sql`
    SELECT
      rh.*,
      u.name as "changedByName"
    FROM registration_history rh
    LEFT JOIN users u ON rh."changedBy" = u.id
    WHERE rh."registrationId" = ${registrationId}
    ORDER BY rh."changedAt" DESC
  `);

  return result as any[];
}

export async function updateRegistrationStartInfo(
  registrationId: number,
  startNumber?: number,
  startTime?: string
) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  await db.execute(sql`
    UPDATE registrations
    SET 
      startNumber = ${startNumber ?? null},
      startTime = ${startTime ?? null},
      updatedAt = NOW()
    WHERE id = ${registrationId}
  `);
}


// ==================== EVENT IMAGES QUERIES ====================

export async function createEventImage(image: InsertEventImage) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  const result = await db.insert(eventImages).values(image);
  return result;
}

export async function getEventImagesByEventId(eventId: number) {
  const db = await getDb();
  if (!db) return [];

  return await db.select().from(eventImages)
    .where(eq(eventImages.eventId, eventId))
    .orderBy(eventImages.displayOrder, eventImages.createdAt);
}

export async function getEventImageById(id: number) {
  const db = await getDb();
  if (!db) return undefined;

  const result = await db.select().from(eventImages).where(eq(eventImages.id, id)).limit(1);
  return result.length > 0 ? result[0] : undefined;
}

export async function deleteEventImage(id: number) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  return await db.delete(eventImages).where(eq(eventImages.id, id));
}

export async function updateEventImageOrder(id: number, displayOrder: number) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  return await db.update(eventImages).set({ displayOrder }).where(eq(eventImages.id, id));
}


// ==================== START ORDER CONFIG QUERIES ====================

export async function createStartOrderConfig(config: InsertStartOrderConfig) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  const result = await db.insert(startOrderConfig).values(config);
  return result;
}

export async function getStartOrderConfigsByEventId(eventId: number) {
  const db = await getDb();
  if (!db) return [];

  const results = await db.select({
    id: startOrderConfig.id,
    eventId: startOrderConfig.eventId,
    categoryId: startOrderConfig.categoryId,
    orderPosition: startOrderConfig.orderPosition,
    numberStart: startOrderConfig.numberStart,
    numberEnd: startOrderConfig.numberEnd,
    startTime: startOrderConfig.startTime,
    intervalSeconds: startOrderConfig.intervalSeconds,
    timeBetweenCategories: startOrderConfig.timeBetweenCategories,
    registrationOrder: startOrderConfig.registrationOrder,
    numberStartManual: startOrderConfig.numberStartManual,
    numberEndManual: startOrderConfig.numberEndManual,
    startTimeManual: startOrderConfig.startTimeManual,
    categoryName: categories.name,
    parentCategoryId: categories.parentId,
  })
    .from(startOrderConfig)
    .leftJoin(categories, eq(startOrderConfig.categoryId, categories.id))
    .where(eq(startOrderConfig.eventId, eventId))
    .orderBy(startOrderConfig.orderPosition);

  // Get parent categories for proper naming
  const parentIds = Array.from(new Set(results.map(r => r.parentCategoryId).filter((id): id is number => id !== null)));
  const parentCategories = parentIds.length > 0
    ? await db.select().from(categories).where(sql`${categories.id} IN (${sql.join(parentIds.map(id => sql`${id}`), sql`, `)})`)
    : [];
  const parentMap = new Map(parentCategories.map(c => [c.id, c.name]));

  // Format category names with parent
  return results.map(r => ({
    ...r,
    categoryName: r.parentCategoryId && parentMap.has(r.parentCategoryId)
      ? `${parentMap.get(r.parentCategoryId)} - ${r.categoryName}`
      : r.categoryName || '',
  }));
}

export async function getStartOrderConfigByCategoryId(eventId: number, categoryId: number) {
  const db = await getDb();
  if (!db) return undefined;

  const result = await db.select().from(startOrderConfig)
    .where(
      and(
        eq(startOrderConfig.eventId, eventId),
        eq(startOrderConfig.categoryId, categoryId)
      )
    )
    .limit(1);

  return result.length > 0 ? result[0] : undefined;
}

export async function upsertStartOrderConfig(config: InsertStartOrderConfig & { id?: number }) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  // Check if config already exists for this event + category
  const existing = await getStartOrderConfigByCategoryId(config.eventId, config.categoryId);

  if (existing) {
    // Update existing config
    return await db.update(startOrderConfig)
      .set({
        orderPosition: config.orderPosition,
        numberStart: config.numberStart,
        numberEnd: config.numberEnd,
        startTime: config.startTime,
        intervalSeconds: config.intervalSeconds,
        updatedAt: new Date(),
      })
      .where(eq(startOrderConfig.id, existing.id));
  } else {
    // Insert new config
    return await db.insert(startOrderConfig).values(config);
  }
}

export async function deleteStartOrderConfig(id: number) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  return await db.delete(startOrderConfig).where(eq(startOrderConfig.id, id));
}

export async function deleteStartOrderConfigsByEventId(eventId: number) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  return await db.delete(startOrderConfig).where(eq(startOrderConfig.eventId, eventId));
}

/**
 * Calculate and assign start number and time for a new registration
 * Based on the category's start order configuration
 */
export async function assignStartInfo(eventId: number, categoryId: number) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  // Get the start order config for this category
  const config = await getStartOrderConfigByCategoryId(eventId, categoryId);
  if (!config) {
    return { startNumber: null, startTime: null };
  }

  // Count existing registrations in this category for this event
  const existingRegistrations = await db.select()
    .from(registrations)
    .where(
      and(
        eq(registrations.eventId, eventId),
        eq(registrations.categoryId, categoryId)
      )
    );

  const count = existingRegistrations.length;

  // Calculate start number
  const startNumber = config.numberStart + count;

  // Check if number is within range
  if (startNumber > config.numberEnd) {
    throw new Error(`NÃºmero de largada excedeu o limite. Faixa disponÃ­vel: ${config.numberStart}-${config.numberEnd}`);
  }

  // Calculate start time
  const [hours, minutes, seconds] = config.startTime.split(':').map(Number);
  const baseTime = new Date();
  baseTime.setHours(hours, minutes, seconds || 0, 0);

  // Add interval for each existing registration
  const startTimeMs = baseTime.getTime() + (count * config.intervalSeconds * 1000);
  const startTimeDate = new Date(startTimeMs);

  const startTime = `${String(startTimeDate.getHours()).padStart(2, '0')}:${String(startTimeDate.getMinutes()).padStart(2, '0')}:${String(startTimeDate.getSeconds()).padStart(2, '0')}`;

  return { startNumber, startTime };
}


// ==================== ADMIN QUERIES ====================

export async function getAllEventsAdmin() {
  const db = await getDb();
  if (!db) return [];

  try {
    const result = await db
      .select({
        id: events.id,
        name: events.name,
        description: events.description,
        startDate: events.startDate,
        endDate: events.endDate,
        location: events.location,
        city: events.city,
        state: events.state,
        imageUrl: events.imageUrl,
        organizerId: events.organizerId,
        isExternal: events.isExternal,
        showInListing: events.showInListing,
        status: events.status,
        createdAt: events.createdAt,
        organizerName: organizers.name,
        ownerName: users.name,
      })
      .from(events)
      .leftJoin(organizers, eq(events.organizerId, organizers.id))
      .leftJoin(users, eq(organizers.ownerId, users.id))
      .orderBy(desc(events.createdAt));

    return result;
  } catch (error) {
    console.error("[Database] Error fetching all events:", error);
    return [];
  }
}

export async function deleteEventAdmin(eventId: number) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  try {
    // Marcar evento como cancelado ao invÃ©s de deletar
    await db
      .update(events)
      .set({ status: 'cancelled' })
      .where(eq(events.id, eventId));
    return true;
  } catch (error) {
    console.error("[Database] Error deleting event:", error);
    throw error;
  }
}

// ============================================
// ADMIN - DASHBOARD STATISTICS
// ============================================

export async function getAdminDashboardStats() {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  // Total de usuÃ¡rios
  const totalUsersResult = await db.select({ count: sql<number>`count(*)` }).from(users);
  const totalUsers = totalUsersResult[0]?.count || 0;

  // Total de eventos
  const totalEventsResult = await db.select({ count: sql<number>`count(*)` }).from(events);
  const totalEvents = totalEventsResult[0]?.count || 0;

  // Total de inscriÃ§Ãµes
  const totalRegistrationsResult = await db.select({ count: sql<number>`count(*)` }).from(registrations);
  const totalRegistrations = totalRegistrationsResult[0]?.count || 0;

  // Receita total (soma de todos os pagamentos confirmados)
  const totalRevenueResult = await db
    .select({ total: sql<number>`COALESCE(SUM(${payments.value}), 0)` })
    .from(payments)
    .where(eq(payments.status, "confirmed"));
  const totalRevenue = totalRevenueResult[0]?.total || 0;

  // Eventos por status
  const eventsByStatusResult = await db
    .select({
      status: events.status,
      count: sql<number>`count(*)`,
    })
    .from(events)
    .groupBy(events.status);

  // Inscrições por mês (últimos 6 meses)
  const registrationsByMonthResult = await db.execute<{ month: string; count: number }>(sql`
    SELECT to_char("createdAt", 'YYYY-MM') as month, COUNT(*)::int as count
    FROM registrations
    WHERE "createdAt" >= NOW() - INTERVAL '6 months'
    GROUP BY to_char("createdAt", 'YYYY-MM')
    ORDER BY to_char("createdAt", 'YYYY-MM')
  `);

  const result = {
    totalUsers,
    totalEvents,
    totalRegistrations,
    totalRevenue,
    eventsByStatus: eventsByStatusResult,
    registrationsByMonth: Array.isArray(registrationsByMonthResult) ? registrationsByMonthResult : [],
  };

  console.log('[DASHBOARD STATS]', result);
  return result;
}


/**
 * Update organizer PagSeguro email
 */
export async function updateOrganizerPagSeguroEmail(organizerId: number, pagseguroEmail: string) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  await db
    .update(organizers)
    .set({ pagseguroEmail })
    .where(eq(organizers.id, organizerId));

  return { success: true };
}

/**
 * Update user recipientId (Pagar.me recipient ID)
   */
export async function updateUserRecipientId(userId: number, recipientId: string, pixKey?: string, phone?: string) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  const updateData: any = { recipientId };
  if (pixKey) {
    updateData.pixKey = pixKey;
  }
  if (phone) {
    updateData.phone = phone;
  }

  await db
    .update(users)
    .set(updateData)
    .where(eq(users.id, userId));

  return { success: true };
}



/**
 * Update registration transactionId (Pagar.me transaction ID)
 */
export async function updateRegistrationTransaction(registrationId: number, transactionId: string) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  await db
    .update(registrations)
    .set({ transactionId })
    .where(eq(registrations.id, registrationId));

  return { success: true };
}

/**
 * Get user by recipientId
 */
export async function getUserByRecipientId(recipientId: string) {
  const db = await getDb();
  if (!db) return null;

  const result = await db
    .select()
    .from(users)
    .where(eq(users.recipientId, recipientId))
    .limit(1);

  return result[0] || null;
}


/**
 * Update user role by openId
 */
export async function updateUserRoleByOpenId(openId: string, role: "user" | "admin" | "participant" | "organizer") {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  await db
    .update(users)
    .set({ role })
    .where(eq(users.openId, openId));

  return { success: true };
}

/**
 * Update event cancellation policy
 */
export async function updateEventCancellationPolicy(eventId: number, policy: {
  allowCancellation: boolean;
  cancellationDeadlineDays: number;
  refundEnabled: boolean;
}) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  await db
    .update(events)
    .set(policy as any)
    .where(eq(events.id, eventId));

  return { success: true };
}

/**
 * Check if a registration is eligible for cancellation
 */
export async function checkCancellationEligibility(registrationId: number) {
  const db = await getDb();
  if (!db) return { eligible: false, message: "Database not available" };

  const registration = await db
    .select()
    .from(registrations)
    .where(eq(registrations.id, registrationId))
    .limit(1);

  if (registration.length === 0) return { eligible: false, message: "Inscricao nao encontrada" };

  return { eligible: true, registration: registration[0] };
}

/**
 * Cancel a registration
 */
export async function cancelRegistration(registrationId: number, reason?: string) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  await db
    .update(registrations)
    .set({ status: "cancelled" })
    .where(eq(registrations.id, registrationId));

  return { success: true };
}

/**
 * Get shirts report for an event
 */
export async function getShirtsReport(eventId: number) {
  const db = await getDb();
  if (!db) return [];

  const result = await db
    .select({
      shirtSize: registrations.pilotShirtSize,
      count: sql<number>`count(*)`,
    })
    .from(registrations)
    .where(and(eq(registrations.eventId, eventId), eq(registrations.status, "paid")))
    .groupBy(registrations.pilotShirtSize);

  return result;
}

/**
 * Get confirmed registration count by category
 */
export async function getConfirmedRegistrationCountByCategory(categoryId: number) {
  const db = await getDb();
  if (!db) return 0;

  const result = await db
    .select({ count: sql<number>`count(*)` })
    .from(registrations)
    .where(and(eq(registrations.categoryId, categoryId), eq(registrations.status, "paid")));

  return result[0]?.count || 0;
}

/**
 * Get user by email
 */
export async function getUserByEmail(email: string) {
  const db = await getDb();
  if (!db) return null;

  const result = await db
    .select()
    .from(users)
    .where(eq(users.email, email))
    .limit(1);

  return result[0] || null;
}


/**
 * Get registration statistics by category for an event
 */
export async function getRegistrationsStatistics(eventId: number) {
  const db = await getDb();
  if (!db) return { byCategory: [], totalRegistrations: 0, totalRevenue: 0, paidRegistrations: 0, paidRevenue: 0, pendingRegistrationsCount: 0, pendingRevenue: 0 };

  // Busca linha a linha (não agregado em SQL) pra poder somar os extras da loja
  // (purchasedProducts, JSON) junto do preço da categoria - mesma correção já
  // aplicada no financeiro: ignorar os extras subestimava a receita real.
  const rows = await db
    .select({
      categoryId: registrations.categoryId,
      categoryName: categories.name,
      price: categories.price,
      slots: categories.slots,
      status: registrations.status,
      purchasedProducts: registrations.purchasedProducts,
    })
    .from(registrations)
    .innerJoin(categories, eq(registrations.categoryId, categories.id))
    .where(eq(registrations.eventId, eventId));

  const byCategoryMap = new Map<number, {
    categoryId: number; categoryName: string; price: number | null; slots: number | null;
    totalRegistrations: number; confirmedRegistrations: number; pendingRegistrations: number; revenue: number;
  }>();

  let totalRegistrations = 0, paidRegistrations = 0, paidRevenue = 0, pendingRegistrationsCount = 0, pendingRevenue = 0;

  for (const r of rows) {
    const amount = (r.price || 0) + sumPurchasedProducts(r.purchasedProducts).total;

    if (!byCategoryMap.has(r.categoryId)) {
      byCategoryMap.set(r.categoryId, {
        categoryId: r.categoryId, categoryName: r.categoryName, price: r.price, slots: r.slots,
        totalRegistrations: 0, confirmedRegistrations: 0, pendingRegistrations: 0, revenue: 0,
      });
    }
    const cat = byCategoryMap.get(r.categoryId)!;
    cat.totalRegistrations++;
    totalRegistrations++;

    if (r.status === 'paid') {
      cat.confirmedRegistrations++;
      cat.revenue += amount;
      paidRegistrations++;
      paidRevenue += amount;
    } else if (r.status === 'pending') {
      cat.pendingRegistrations++;
      pendingRegistrationsCount++;
      pendingRevenue += amount;
    }
  }

  const byCategory = Array.from(byCategoryMap.values()).map(c => ({
    ...c,
    totalSlots: c.slots,
    availableSlots: c.slots ? Math.max(0, c.slots - c.confirmedRegistrations) : null,
  }));

  return {
    byCategory,
    totalRegistrations,
    totalRevenue: paidRevenue + pendingRevenue,
    paidRegistrations,
    paidRevenue,
    pendingRegistrationsCount,
    pendingRevenue,
  };
}

/**
 * Get start order configurations by eventId
 */
export async function getStartOrderConfigByEvent(eventId: number) {
  const db = await getDb();
  if (!db) return [];

  return await db
    .select()
    .from(startOrderConfig)
    .where(eq(startOrderConfig.eventId, eventId))
    .orderBy(startOrderConfig.orderPosition);
}

/**
 * Upsert start order configurations (batch).
 * Atômico via ON CONFLICT no unique (eventId, categoryId) — sem corrida de select-then-insert.
 * Campos undefined são omitidos do UPDATE: quem não envia registrationOrder (ex.: "Salvar Todas"
 * da tela de config) não apaga a ordem sorteada salva pelo /sorteio.
 */
export async function upsertStartOrderConfigs(eventId: number, configs: Partial<InsertStartOrderConfig>[]) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  for (const config of configs) {
    const provided = Object.fromEntries(
      Object.entries(config).filter(([, value]) => value !== undefined)
    ) as Partial<InsertStartOrderConfig>;

    await db
      .insert(startOrderConfig)
      .values({
        ...(provided as InsertStartOrderConfig),
        eventId,
        createdAt: new Date(),
        updatedAt: new Date(),
      })
      .onConflictDoUpdate({
        target: [startOrderConfig.eventId, startOrderConfig.categoryId],
        set: {
          ...provided,
          updatedAt: new Date(),
        },
      });
  }

  return { success: true };
}

/**
 * Create a new transaction
 */
export async function createTransaction(data: InsertTransaction) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  const [result] = await db.insert(transactions).values(data).returning();
  return result;
}

/**
 * Update transaction status
 */
export async function updateTransactionStatus(id: string, status: "PENDING" | "COMPLETED") {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  const [result] = await db.update(transactions)
    .set({ status, updatedAt: new Date() })
    .where(eq(transactions.id, id))
    .returning();

  return result;
}

/**
 * Delete a transaction
 */
export async function deleteTransaction(id: string, userId: number) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  const [result] = await db.delete(transactions)
    .where(and(eq(transactions.id, id), eq(transactions.userId, userId)))
    .returning();

  return result;
}

/**
 * Get transactions for a user with optional filters
 */
// Extras da loja comprados junto da inscrição (registrations.purchasedProducts).
// O valor pago real de uma inscrição é categoria + extras; ignorar isso fazia o
// financeiro mostrar R$80 numa inscrição que pagou R$230 (caso Eric, 2 camisetas).
export function sumPurchasedProducts(purchased: unknown): { total: number; label: string } {
  if (!purchased) return { total: 0, label: "" };
  try {
    const items = typeof purchased === 'string' ? JSON.parse(purchased) : purchased;
    if (!Array.isArray(items) || items.length === 0) return { total: 0, label: "" };
    const total = items.reduce((sum: number, i: any) => sum + (Number(i.price) || 0) * (Number(i.quantity) || 0), 0);
    const label = items.map((i: any) => `${i.quantity}x ${i.name}`).join(' + ');
    return { total, label };
  } catch {
    return { total: 0, label: "" };
  }
}

export async function getTransactions(userId: number, filters?: { type?: "INCOME" | "EXPENSE", month?: number, year?: number }) {
  const db = await getDb();
  if (!db) return [];

  const conditions = [eq(transactions.userId, userId)];

  if (filters?.type) {
    conditions.push(eq(transactions.type, filters.type));
  }

  if (filters?.month !== undefined && filters?.year !== undefined) {
    const startDate = new Date(filters.year, filters.month - 1, 1);
    const endDate = new Date(filters.year, filters.month, 0, 23, 59, 59, 999);
    conditions.push(gte(transactions.date, startDate));
    conditions.push(lte(transactions.date, endDate));
  }

  const manualTxs = await db.select().from(transactions).where(and(...conditions)).orderBy(desc(transactions.date));

  if (filters?.type === "EXPENSE") {
    return manualTxs;
  }

  // ORGANIC TRANSACTIONS (Paid Registrations)
  const userList = await db.select().from(users).where(eq(users.id, userId)).limit(1);
  const userOpenId = userList[0]?.openId;
  const orgList = userOpenId ? await db.select().from(organizers).where(eq(organizers.ownerId, userOpenId)).limit(1) : [];
  const organizerId = orgList.length > 0 ? orgList[0].id : null;

  if (!organizerId) {
    return manualTxs;
  }

  let organicConditions: any[] = [
    eq(events.organizerId, organizerId),
    eq(registrations.status, 'paid')
  ];

  if (filters?.month !== undefined && filters?.year !== undefined) {
    const startDate = new Date(filters.year, filters.month - 1, 1);
    const endDate = new Date(filters.year, filters.month, 0, 23, 59, 59, 999);
    organicConditions.push(gte(registrations.createdAt, startDate));
    organicConditions.push(lte(registrations.createdAt, endDate));
  }

  const organicData = await db
    .select({
      regId: registrations.id,
      pilotName: registrations.pilotName,
      categoryName: categories.name,
      price: categories.price,
      purchasedProducts: registrations.purchasedProducts,
      eventId: registrations.eventId,
      createdAt: registrations.createdAt,
      updatedAt: registrations.updatedAt,
    })
    .from(registrations)
    .innerJoin(categories, eq(registrations.categoryId, categories.id))
    .innerJoin(events, eq(registrations.eventId, events.id))
    .where(and(...organicConditions));

  const organicTxs = organicData.map(tx => {
    const extras = sumPurchasedProducts(tx.purchasedProducts);
    return {
      id: `org-${tx.regId}`,
      description: `Inscrição: ${tx.pilotName} - ${tx.categoryName}${extras.label ? ` + ${extras.label}` : ''}`,
      amount: (tx.price || 0) + extras.total,
      type: 'INCOME' as const,
      date: tx.createdAt,
      status: 'COMPLETED' as const,
      userId,
      eventId: tx.eventId,
      createdAt: tx.createdAt,
      updatedAt: tx.updatedAt,
    };
  }) as typeof manualTxs;

  // STORE TRANSACTIONS (Paid Store Orders)
  let storeConditions: any[] = [
    eq(products.userId, userId),
    eq(productOrders.status, 'PAID')
  ];

  if (filters?.month !== undefined && filters?.year !== undefined) {
    const startDate = new Date(filters.year, filters.month - 1, 1);
    const endDate = new Date(filters.year, filters.month, 0, 23, 59, 59, 999);
    storeConditions.push(gte(productOrders.createdAt, startDate));
    storeConditions.push(lte(productOrders.createdAt, endDate));
  }

  const storeData = await db
    .select({
      id: sql<string>`'store-' || ${productOrders.id}`,
      description: sql<string>`'Loja: ' || ${products.name} || ' (' || ${productOrders.quantity} || 'x) - ' || ${productOrders.buyerName}`,
      amount: productOrders.totalAmount,
      type: sql<"INCOME" | "EXPENSE">`'INCOME'`,
      date: productOrders.createdAt,
      status: sql<"PENDING" | "COMPLETED">`'COMPLETED'`,
      userId: sql<number>`${userId}`,
      eventId: productOrders.eventId,
      createdAt: productOrders.createdAt,
      updatedAt: productOrders.updatedAt,
    })
    .from(productOrders)
    .innerJoin(products, eq(productOrders.productId, products.id))
    .where(and(...storeConditions));

  const storeTxs = storeData.map(tx => ({
    ...tx,
    amount: tx.amount || 0
  })) as typeof manualTxs;

  const combined = [...manualTxs, ...organicTxs, ...storeTxs].sort((a, b) => {
    return new Date(b.date).getTime() - new Date(a.date).getTime();
  });

  return combined;
}

/**
 * Get financial summary (total income, expense, balance, pendingIncome)
 */
export async function getTransactionSummary(userId: number, filters?: { month?: number, year?: number }) {
  const db = await getDb();
  if (!db) return { manualIncome: 0, expense: 0, balance: 0, paidRegistrations: 0, storeIncome: 0, pendingRegistrations: 0, pendingStoreIncome: 0, pendingExpense: 0, projectedBalance: 0, manualBalance: 0 };

  const allTxs = await getTransactions(userId, filters);

  let manualIncome = 0;
  let paidRegistrations = 0;
  let storeIncome = 0;
  let expense = 0;
  let pendingRegistrations = 0;
  let pendingStoreIncome = 0;
  let pendingExpense = 0;

  for (const t of allTxs) {
    if (t.type === 'INCOME') {
      if (typeof t.id === 'string' && t.id.startsWith('org-')) {
        paidRegistrations += Number(t.amount || 0);
      } else if (typeof t.id === 'string' && t.id.startsWith('store-')) {
        storeIncome += Number(t.amount || 0);
      } else {
        if (t.status === 'COMPLETED') {
          manualIncome += Number(t.amount || 0);
        } else if (t.status === 'PENDING') {
          pendingRegistrations += Number(t.amount || 0); // Manual pending income joins the 'A Receber' pool
        }
      }
    }
    if (t.type === 'EXPENSE') {
      if (t.status === 'COMPLETED') {
        expense += Number(t.amount || 0);
      } else if (t.status === 'PENDING') {
        pendingExpense += Number(t.amount || 0);
      }
    }
  }

  // PENDING ORGANIC REGISTRATIONS
  const userList = await db.select().from(users).where(eq(users.id, userId)).limit(1);
  const userOpenId = userList[0]?.openId;
  const orgList = userOpenId ? await db.select().from(organizers).where(eq(organizers.ownerId, userOpenId)).limit(1) : [];
  const organizerId = orgList.length > 0 ? orgList[0].id : null;

  if (!organizerId) {
    return {
      manualIncome,
      paidRegistrations,
      pendingRegistrations,
      expense,
      pendingExpense,
      balance: (manualIncome + paidRegistrations) - expense,
      projectedBalance: ((manualIncome + paidRegistrations) - expense) + pendingRegistrations - pendingExpense
    };
  }

  let pendingConditions: any[] = [
    eq(events.organizerId, organizerId),
    eq(registrations.status, 'pending')
  ];

  if (filters?.month !== undefined && filters?.year !== undefined) {
    const startDate = new Date(filters.year, filters.month - 1, 1);
    const endDate = new Date(filters.year, filters.month, 0, 23, 59, 59, 999);
    pendingConditions.push(gte(registrations.createdAt, startDate));
    pendingConditions.push(lte(registrations.createdAt, endDate));
  }

  const pendingData = await db
    .select({ price: categories.price, purchasedProducts: registrations.purchasedProducts })
    .from(registrations)
    .innerJoin(categories, eq(registrations.categoryId, categories.id))
    .innerJoin(events, eq(registrations.eventId, events.id))
    .where(and(...pendingConditions));

  for (const p of pendingData) {
    pendingRegistrations += Number(p.price || 0) + sumPurchasedProducts(p.purchasedProducts).total;
  }

  // PENDING STORE ORDERS
  let pendingStoreConditions: any[] = [
    eq(products.userId, userId),
    eq(productOrders.status, 'PENDING')
  ];

  if (filters?.month !== undefined && filters?.year !== undefined) {
    const startDate = new Date(filters.year, filters.month - 1, 1);
    const endDate = new Date(filters.year, filters.month, 0, 23, 59, 59, 999);
    pendingStoreConditions.push(gte(productOrders.createdAt, startDate));
    pendingStoreConditions.push(lte(productOrders.createdAt, endDate));
  }

  const pendingStoreData = await db
    .select({ totalAmount: productOrders.totalAmount })
    .from(productOrders)
    .innerJoin(products, eq(productOrders.productId, products.id))
    .where(and(...pendingStoreConditions));

  for (const p of pendingStoreData) {
    pendingStoreIncome += Number(p.totalAmount || 0);
  }

  return {
    manualIncome,
    paidRegistrations,
    storeIncome,
    pendingRegistrations,
    pendingStoreIncome,
    expense,
    pendingExpense,
    balance: (manualIncome + paidRegistrations + storeIncome) - expense, // This remains gross "site" balance for backward compatibility if needed
    manualBalance: manualIncome - expense, // NEW: Net amount in hand (excluding site transactions which are in Pagar.me)
    projectedBalance: ((manualIncome + (paidRegistrations + storeIncome)*0.9) - expense) + (pendingRegistrations + pendingStoreIncome)*0.9 - pendingExpense
  };
}


// ==================== PRODUCTS / STORE QUERIES ====================

export async function createProduct(product: InsertProduct) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  const result = await db.insert(products).values(product).returning();
  return result[0];
}

export async function getProductsByUserId(userId: number, eventId?: number) {
  const db = await getDb();
  if (!db) return [];

  let conditions = eq(products.userId, userId);
  
  if (eventId) {
    conditions = and(conditions, eq(products.eventId, eventId)) as any;
  }

  const rows = await db.select().from(products)
    .where(conditions)
    .orderBy(desc(products.createdAt));

  // Painel do organizador mostra o mesmo número da vitrine (mas sem esconder o
  // que está esgotado — ele precisa ver o produto pra repor).
  return await enriquecerProdutosComEstoque(rows as any[]);
}

export async function getAvailableProducts(filters?: { eventId?: number; organizerId?: number }) {
  const db = await getDb();
  if (!db) return [];

  // Sem filtro de stock no SQL: para produto controlado por tamanho o número da
  // coluna não vale nada — quem decide se está esgotado é o event_shirt_stock,
  // e isso só dá pra saber depois do enriquecimento (ver filtro no fim).
  let query = db.select().from(products);

  if (filters?.eventId) {
    // If eventId is provided, show products for that event OR general products of that organizer
    if (filters.organizerId) {
      query = db.select().from(products).where(
        or(
          eq(products.eventId, filters.eventId),
          and(eq(products.userId, filters.organizerId), sql`${products.eventId} IS NULL`)
        )
      ) as any;
    } else {
      query = db.select().from(products).where(eq(products.eventId, filters.eventId)) as any;
    }
  } else if (filters?.organizerId) {
    query = db.select().from(products).where(eq(products.userId, filters.organizerId)) as any;
  }

  const rows = await query.orderBy(desc(products.createdAt));
  const enriquecidos = await enriquecerProdutosComEstoque(rows as any[]);

  // Vitrine: só o que dá pra comprar de verdade.
  return enriquecidos.filter(p => (p.stock ?? 0) >= 1);
}

/**
 * products.stock é um contador próprio da loja, decrementado a cada compra.
 * Quando o evento controla camiseta por tamanho, quem manda é o event_shirt_stock
 * (produzido - reservado por inscrições E pedidos) — manter os dois números levava
 * a loja a anunciar estoque que não existe (59 anunciados x 11 reais).
 *
 * Aqui o `stock` do produto passa a ser DERIVADO da soma dos disponíveis, e vai
 * junto `sizeAvailability` (por tamanho) e `stockControlledBySize` pro front saber
 * que não deve pedir estoque numérico. Produto sem evento, ou de evento sem estoque
 * cadastrado, passa intacto.
 */
export async function enriquecerProdutosComEstoque(rows: any[]) {
  const out: any[] = [];
  const cache = new Map<number, { size: string; available: number }[]>();

  for (const p of rows) {
    if (!p.eventId) { out.push(p); continue; }

    if (!cache.has(p.eventId)) {
      const stockRows = await getShirtStockByEventId(p.eventId);
      cache.set(p.eventId, stockRows.length === 0 ? [] : (await getShirtAvailability(p.eventId))
        .map(a => ({ size: a.size, available: a.available })));
    }
    const avail = cache.get(p.eventId)!;
    if (avail.length === 0) { out.push(p); continue; }

    const total = avail.reduce((acc, a) => acc + Math.max(0, a.available), 0);

    // O availableSizes gravado é texto livre antigo ("Inf 2, Inf 4, G3"): normaliza
    // e descarta tamanho que não tem linha de estoque no evento. Assim a loja nunca
    // oferece o que ninguém mandou produzir, sem precisar reeditar produto por produto.
    const doEstoque = new Set(avail.map(a => a.size));
    const oferecidos = String(p.availableSizes || "")
      .split(',')
      .map((s: string) => normalizeShirtSize(s))
      .filter((s: string) => s && doEstoque.has(s));
    const availableSizes = [...new Set(oferecidos)].join(',');

    // Sem nada marcado, a loja vende todos os tamanhos do estoque.
    const vendidos = availableSizes ? availableSizes.split(',') : avail.map(a => a.size);

    out.push({
      ...p,
      stock: total,
      availableSizes,
      sizeAvailability: avail.filter(a => vendidos.includes(a.size)),
      stockControlledBySize: true,
    });
  }
  return out;
}

export async function getProductById(id: string) {
  const db = await getDb();
  if (!db) return undefined;

  const result = await db.select().from(products)
    .where(eq(products.id, id))
    .limit(1);

  return result[0];
}

export async function updateProduct(id: string, userId: number, data: Partial<InsertProduct>) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  const result = await db.update(products)
    .set({ ...data, updatedAt: new Date() })
    .where(and(eq(products.id, id), eq(products.userId, userId)))
    .returning();

  return result[0];
}

export async function deleteProduct(id: string, userId: number) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  const result = await db.delete(products)
    .where(and(eq(products.id, id), eq(products.userId, userId)))
    .returning();

  return result[0];
}


// ===== Estoque de camisetas por tamanho =====

export async function getShirtStockByEventId(eventId: number) {
  const db = await getDb();
  if (!db) return [];
  return await db.select().from(eventShirtStock).where(eq(eventShirtStock.eventId, eventId));
}

// Calcula disponibilidade por tamanho: produzido (estoque) - usado (piloto +
// navegador + extras das inscrições não canceladas). Retorna também tamanhos
// que só aparecem no consumo (over-alocados, sem linha de estoque).
export async function getShirtAvailability(eventId: number) {
  const db = await getDb();
  if (!db) return [] as { size: string; quantity: number; used: number; available: number }[];

  const stockRows = await db.select().from(eventShirtStock).where(eq(eventShirtStock.eventId, eventId));
  const regs = await db.select().from(registrations).where(eq(registrations.eventId, eventId));

  // Pedidos da loja ligados a este evento (qualquer status exceto CANCELLED reserva estoque)
  const orders = await db
    .select({ sizes: productOrders.sizes, status: productOrders.status })
    .from(productOrders)
    .innerJoin(products, eq(productOrders.productId, products.id))
    .where(
      and(
        eq(productOrders.eventId, eventId),
        ne(productOrders.status, 'CANCELLED')
      )
    );

  const stock = new Map<string, number>();
  for (const r of stockRows) stock.set(normalizeShirtSize(r.size), r.quantity);

  const used = new Map<string, number>();

  // 1) Camisetas das inscrições (piloto + navegador + extras)
  for (const reg of regs as any[]) {
    if (reg.status === 'cancelled') continue;
    for (const size of shirtSizesOfRegistration(reg)) {
      used.set(size, (used.get(size) || 0) + 1);
    }
  }

  // 2) Camisetas de pedidos avulsos da loja (PENDING, PAID, SHIPPED)
  for (const order of orders) {
    let sizes: unknown[] = [];
    try {
      sizes = Array.isArray(order.sizes)
        ? order.sizes
        : typeof order.sizes === 'string'
          ? JSON.parse(order.sizes)
          : [];
    } catch { sizes = []; }
    for (const sz of sizes) {
      const key = normalizeShirtSize(sz);
      if (key) used.set(key, (used.get(key) || 0) + 1);
    }
  }

  const allSizes = new Set<string>([...stock.keys(), ...used.keys()]);
  const out: { size: string; quantity: number; used: number; available: number }[] = [];
  for (const size of allSizes) {
    const quantity = stock.get(size) || 0;
    const u = used.get(size) || 0;
    out.push({ size, quantity, used: u, available: quantity - u });
  }
  return out;
}

/**
 * Trava única de estoque de camiseta por tamanho. Usada na inscrição nova, na
 * edição da inscrição e no pedido avulso da loja — antes cada fluxo tinha (ou
 * não tinha) a sua checagem, e a loja furava o estoque por tamanho porque só
 * olhava products.stock.
 *
 * Só age se o evento tem estoque cadastrado (retrocompatível com evento sem).
 * `jaReservados` = tamanhos que o registro em edição JÁ ocupa hoje; o
 * `available` do banco conta com eles, então precisam ser descontados senão
 * uma edição que não mexe na camiseta seria barrada por falta de estoque.
 *
 * Devolve o primeiro conflito ({ size, disponivel, pedido }) ou null.
 */
export async function checkShirtSizesAvailable(
  eventId: number,
  pedidos: unknown[],
  jaReservados: unknown[] = []
): Promise<{ size: string; disponivel: number; pedido: number } | null> {
  const stockRows = await getShirtStockByEventId(eventId);
  if (stockRows.length === 0) return null;

  const availability = await getShirtAvailability(eventId);
  const availMap = new Map(availability.map(a => [a.size, a.available]));

  const delta = new Map<string, number>();
  const bump = (raw: unknown, sinal: number) => {
    const k = normalizeShirtSize(raw);
    if (k) delta.set(k, (delta.get(k) || 0) + sinal);
  };
  for (const s of pedidos) bump(s, 1);
  for (const s of jaReservados) bump(s, -1);

  for (const [size, pedido] of delta) {
    if (pedido <= 0) continue;
    const disponivel = availMap.get(size) ?? 0;
    if (disponivel < pedido) return { size, disponivel, pedido };
  }
  return null;
}

/** true se o evento controla camiseta por tamanho (aí products.stock não vale como contador). */
export async function hasShirtStockControl(eventId?: number | null) {
  if (!eventId) return false;
  return (await getShirtStockByEventId(eventId)).length > 0;
}

export async function setShirtStock(eventId: number, items: { size?: string; quantity?: number }[]) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  for (const item of items) {
    const size = normalizeShirtSize(item.size);
    if (!size) continue;
    const qty = Math.max(0, Math.floor(item.quantity || 0));
    await db.execute(sql`
      INSERT INTO event_shirt_stock ("eventId", size, quantity, "updatedAt")
      VALUES (${eventId}, ${size}, ${qty}, NOW())
      ON CONFLICT ("eventId", size) DO UPDATE SET quantity = ${qty}, "updatedAt" = NOW();
    `);
  }
  return await getShirtStockByEventId(eventId);
}

// ===== Central de e-mails do evento =====

export interface FiltrosDestinatarios {
  /** 'paid' | 'pending' | 'all' — status da inscrição */
  status?: "paid" | "pending" | "all";
  /** Só estas categorias (vazio = todas) */
  categoryIds?: number[];
  /** Inclui o e-mail do navegador, quando existir */
  incluirNavegador?: boolean;
  /** Inclui quem comprou na loja sem se inscrever */
  incluirCompradoresLoja?: boolean;
}

export interface DestinatarioEvento {
  email: string;
  name: string;
  registrationId: number | null;
  /** A inscrição inteira, pra resolver as variáveis do e-mail. */
  reg: any | null;
}

const emailValido = (e: unknown) => !!String(e || "").trim() && /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(String(e).trim());

/**
 * Lista de destinatários do evento, já desduplicada por e-mail (piloto que também
 * é navegador de outra dupla recebe uma vez só) e em minúsculas.
 * A ordem importa: piloto ganha da entrada de navegador, porque é dele a inscrição
 * que resolve {{numero}} e {{horario_largada}}.
 */
export async function getEventEmailAudience(
  eventId: number,
  filtros: FiltrosDestinatarios = {}
): Promise<DestinatarioEvento[]> {
  const db = await getDb();
  if (!db) return [];

  const status = filtros.status || "all";
  const regs = (await getRegistrationsByEventId(eventId)) as any[];
  const porEmail = new Map<string, DestinatarioEvento>();

  const adicionar = (email: unknown, name: unknown, reg: any | null) => {
    if (!emailValido(email)) return;
    const chave = String(email).trim().toLowerCase();
    if (porEmail.has(chave)) return;
    porEmail.set(chave, {
      email: chave,
      name: String(name || "").trim() || chave,
      registrationId: reg?.id ?? null,
      reg,
    });
  };

  const elegiveis = regs.filter(r => {
    if (r.status === "cancelled") return false; // cancelado nunca recebe
    if (status === "paid") return r.status === "paid";
    if (status === "pending") return r.status === "pending";
    return true;
  }).filter(r => {
    if (!filtros.categoryIds?.length) return true;
    return filtros.categoryIds.map(Number).includes(Number(r.categoryId));
  });

  for (const reg of elegiveis) adicionar(reg.pilotEmail, reg.pilotName, reg);
  if (filtros.incluirNavegador) {
    for (const reg of elegiveis) adicionar(reg.navigatorEmail, reg.navigatorName, reg);
  }

  if (filtros.incluirCompradoresLoja) {
    const pedidos = await db
      .select({ email: productOrders.buyerEmail, name: productOrders.buyerName })
      .from(productOrders)
      .where(and(eq(productOrders.eventId, eventId), ne(productOrders.status, "CANCELLED")));
    for (const p of pedidos) adicionar(p.email, p.name, null);
  }

  return [...porEmail.values()];
}

export async function createEventEmail(data: {
  eventId: number;
  subject: string;
  body: string;
  kind?: "manual" | "auto_pendente";
  autoStage?: string | null;
  filters?: any;
  createdBy?: number | null;
}) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  const [row] = await db.insert(eventEmails).values({
    eventId: data.eventId,
    subject: data.subject,
    body: data.body,
    kind: data.kind || "manual",
    autoStage: data.autoStage || null,
    filters: data.filters ?? null,
    createdBy: data.createdBy ?? null,
  } as any).returning();
  return row;
}

/** Insere os destinatários do disparo. ON CONFLICT ignora e-mail repetido. */
export async function addEventEmailRecipients(
  emailId: string,
  eventId: number,
  destinatarios: DestinatarioEvento[]
) {
  const db = await getDb();
  if (!db || destinatarios.length === 0) return 0;

  const inseridos = await db.insert(eventEmailRecipients).values(
    destinatarios.map(d => ({
      emailId,
      eventId,
      registrationId: d.registrationId,
      email: d.email,
      name: d.name,
    })) as any
  ).onConflictDoNothing().returning({ id: eventEmailRecipients.id });

  await db.update(eventEmails)
    .set({ totalRecipients: inseridos.length })
    .where(eq(eventEmails.id, emailId));

  return inseridos.length;
}

export async function getEventEmailById(emailId: string) {
  const db = await getDb();
  if (!db) return undefined;
  const [row] = await db.select().from(eventEmails).where(eq(eventEmails.id, emailId)).limit(1);
  return row;
}

export async function getPendingRecipients(emailId: string, limite: number) {
  const db = await getDb();
  if (!db) return [];
  return await db.select().from(eventEmailRecipients)
    .where(and(eq(eventEmailRecipients.emailId, emailId), eq(eventEmailRecipients.status, "pending")))
    .limit(limite);
}

export async function markRecipientResult(id: string, ok: boolean, erro?: string) {
  const db = await getDb();
  if (!db) return;
  await db.update(eventEmailRecipients)
    .set({
      status: ok ? "sent" : "failed",
      error: ok ? null : String(erro || "").slice(0, 500),
      sentAt: new Date(),
    })
    .where(eq(eventEmailRecipients.id, id));
}

/** Recalcula os contadores do disparo a partir dos destinatários. */
export async function refreshEventEmailCounters(emailId: string) {
  const db = await getDb();
  if (!db) return undefined;

  const linhas = await db.select({ status: eventEmailRecipients.status })
    .from(eventEmailRecipients)
    .where(eq(eventEmailRecipients.emailId, emailId));

  const sent = linhas.filter(l => l.status === "sent").length;
  const failed = linhas.filter(l => l.status === "failed").length;
  const pending = linhas.filter(l => l.status === "pending").length;

  const [row] = await db.update(eventEmails)
    .set({
      sentCount: sent,
      failedCount: failed,
      totalRecipients: linhas.length,
      status: pending > 0 ? "sending" : (failed > 0 && sent === 0 ? "failed" : "done"),
      finishedAt: pending > 0 ? null : new Date(),
    })
    .where(eq(eventEmails.id, emailId))
    .returning();

  return { ...row, pending };
}

export async function getEventEmails(eventId: number) {
  const db = await getDb();
  if (!db) return [];
  return await db.select().from(eventEmails)
    .where(eq(eventEmails.eventId, eventId))
    .orderBy(desc(eventEmails.createdAt));
}

export async function getEventEmailRecipients(emailId: string) {
  const db = await getDb();
  if (!db) return [];
  return await db.select().from(eventEmailRecipients)
    .where(eq(eventEmailRecipients.emailId, emailId))
    .orderBy(desc(eventEmailRecipients.createdAt));
}

/**
 * Marcos da régua já enviados para uma inscrição — é o que impede o lembrete de
 * repetir quando o cron roda de novo no mesmo dia.
 */
export async function getAutoChargeStagesSent(registrationId: number): Promise<string[]> {
  const db = await getDb();
  if (!db) return [];

  const linhas = await db
    .select({ stage: eventEmails.autoStage })
    .from(eventEmailRecipients)
    .innerJoin(eventEmails, eq(eventEmailRecipients.emailId, eventEmails.id))
    .where(and(
      eq(eventEmailRecipients.registrationId, registrationId),
      eq(eventEmails.kind, "auto_pendente"),
      ne(eventEmailRecipients.status, "failed")
    ));

  return linhas.map(l => l.stage).filter(Boolean) as string[];
}

/** Eventos com a régua de cobrança ligada e que ainda não aconteceram. */
export async function getEventsWithAutoCharge() {
  const db = await getDb();
  if (!db) return [];
  return await db.select().from(events).where(
    and(
      eq(events.autoChargeEnabled, true),
      gte(events.startDate, new Date())
    )
  );
}

/**
 * Inscrição pelo token do link (accessHash) — usado pelo passaporte público e
 * pela página de cobrança. É o segredo que autoriza pagar sem login.
 */
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function getRegistrationByAccessHash(accessHash: string) {
  const db = await getDb();
  if (!db || !accessHash) return undefined;

  // A coluna é uuid: comparar com texto que não é uuid faz o Postgres estourar
  // (22P02) e o endpoint público devolveria 500 em vez de "link inválido".
  // Qualquer lixo na URL /pagar/:hash cai aqui.
  if (!UUID_RE.test(String(accessHash).trim())) return undefined;

  const [row] = await db.select().from(registrations)
    .where(eq(registrations.accessHash, String(accessHash).trim()))
    .limit(1);
  return row;
}
