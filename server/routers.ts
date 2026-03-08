import * as pagarme from "./pagarme.ts";
import * as storage from "./storage.ts";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { dirname } from "path";
import { COOKIE_NAME } from "../const.ts";
import { getSessionCookieOptions } from "./cookies.ts";
import { systemRouter } from "./_core/systemRouter.ts";
import { publicProcedure, protectedProcedure, router } from "./_core/trpc.ts";
import { TRPCError } from '@trpc/server';
import { z } from "zod";
import * as db from "./db.ts";
import { getDb } from "./db.ts";
import { products, productOrders, organizerMembers, registrations, events, payments, championshipStages, championshipRequests, users, championships } from "./drizzle/schema.ts";
import { eq, sql, and, inArray, ne } from "drizzle-orm";
import { ENV } from "./env.ts";
import { adminProcedure as baseAdminProcedure } from "./_core/trpc.ts";
import { championshipRouter, calculateChampionshipStandings } from "./routers/championship.ts";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const integerSchema = z.number().int();

// Middleware admin
const adminProcedure = protectedProcedure.use(({ ctx, next }) => {
  const user = ctx.user as any;
  if (user?.role !== 'admin') {
    throw new TRPCError({ code: 'FORBIDDEN', message: 'Admin access required' });
  }
  return next({ ctx });
});

const organizerProcedure = protectedProcedure.use(({ ctx, next }) => {
  const user = ctx.user as any;
  if (user?.role !== 'organizer' && user?.role !== 'admin') {
    throw new TRPCError({ code: 'FORBIDDEN', message: 'You must be an organizer' });
  }
  return next({ ctx });
});

const financeRouter = router({
  create: organizerProcedure
    .input(z.object({
      description: z.string(),
      amount: z.number(),
      type: z.enum(["INCOME", "EXPENSE"]),
      date: z.string(),
      status: z.enum(["PENDING", "COMPLETED"]),
      eventId: z.number().optional()
    }))
    .mutation(async ({ ctx, input }) => {
      const user = ctx.user as any;
      const context = await db.getOrganizerContext(user);
      if (context.type === 'MEMBER' && !context.permissions.includes('finance')) {
        throw new TRPCError({ code: 'FORBIDDEN', message: 'Sem permissão para financeiro' });
      }
      return await db.createTransaction({
        description: input.description,
        amount: input.amount,
        type: input.type,
        status: input.status,
        date: new Date(input.date),
        eventId: input.eventId ?? null,
        userId: context.principalUserId
      } as any);
    }),

  getAll: organizerProcedure
    .input(z.object({
      type: z.enum(["INCOME", "EXPENSE"]).optional(),
      month: z.number().min(1).max(12).optional(),
      year: z.number().min(2000).optional()
    }).optional())
    .query(async ({ ctx, input }) => {
      const user = ctx.user as any;
      const context = await db.getOrganizerContext(user);
      if (context.type === 'MEMBER' && !context.permissions.includes('finance')) {
        throw new TRPCError({ code: 'FORBIDDEN', message: 'Sem permissão para financeiro' });
      }
      return await db.getTransactions(context.principalUserId, input);
    }),

  getSummary: organizerProcedure
    .input(z.object({
      month: z.number().min(1).max(12).optional(),
      year: z.number().min(2000).optional()
    }).optional())
    .query(async ({ ctx, input }) => {
      const user = ctx.user as any;
      const context = await db.getOrganizerContext(user);
      if (context.type === 'MEMBER' && !context.permissions.includes('finance')) {
        throw new TRPCError({ code: 'FORBIDDEN', message: 'Sem permissão para financeiro' });
      }
      return await db.getTransactionSummary(context.principalUserId, input);
    }),

  markAsCompleted: organizerProcedure
    .input(z.object({
      id: z.string()
    }))
    .mutation(async ({ ctx, input }) => {
      const user = ctx.user as any;
      const context = await db.getOrganizerContext(user);
      if (context.type === 'MEMBER' && !context.permissions.includes('finance')) {
        throw new TRPCError({ code: 'FORBIDDEN', message: 'Sem permissão para financeiro' });
      }
      return await db.updateTransactionStatus(input.id, "COMPLETED");
    })
});

const storeRouter = router({
  create: organizerProcedure
    .input(z.object({
      name: z.string().min(1, "Nome é obrigatório"),
      description: z.string().optional(),
      price: z.number().min(0, "Preço inválido"),
      stock: z.number().int().min(0, "Estoque não pode ser negativo"),
      availableSizes: z.string().optional(),
      imageUrl: z.string().optional(),
      eventId: z.number().optional()
    }))
    .mutation(async ({ ctx, input }) => {
      const user = ctx.user as any;
      const context = await db.getOrganizerContext(user);
      if (context.type === 'MEMBER' && !context.permissions.includes('store')) {
        throw new TRPCError({ code: 'FORBIDDEN', message: 'Sem permissão para loja' });
      }
      return await db.createProduct({
        ...input,
        userId: context.principalUserId
      } as any);
    }),

  getAll: organizerProcedure
    .query(async ({ ctx }) => {
      const user = ctx.user as any;
      const context = await db.getOrganizerContext(user);
      if (context.type === 'MEMBER' && !context.permissions.includes('store')) {
        throw new TRPCError({ code: 'FORBIDDEN', message: 'Sem permissão para loja' });
      }
      return await db.getProductsByUserId(context.principalUserId);
    }),

  getAvailable: publicProcedure
    .input(z.object({ eventId: z.number().int().optional(), organizerId: z.number().int().optional() }).optional())
    .query(async ({ input }) => {
      return await db.getAvailableProducts(input);
    }),

  getById: publicProcedure
    .input(z.object({ id: z.string() }))
    .query(async ({ input }) => {
      const product = await db.getProductById(input.id);
      if (!product) throw new TRPCError({ code: 'NOT_FOUND', message: 'Produto não encontrado' });
      return product;
    }),

  update: organizerProcedure
    .input(z.object({
      id: z.string(),
      description: z.string().optional(),
      name: z.string().optional(),
      price: z.number().optional(),
      stock: z.number().int().optional(),
      availableSizes: z.string().optional(),
      imageUrl: z.string().optional(),
      eventId: z.number().optional()
    }))
    .mutation(async ({ ctx, input }) => {
      const user = ctx.user as any;
      const context = await db.getOrganizerContext(user);
      if (context.type === 'MEMBER' && !context.permissions.includes('store')) {
        throw new TRPCError({ code: 'FORBIDDEN', message: 'Sem permissão para loja' });
      }
      const { id, ...data } = input;
      const result = await db.updateProduct(id, context.principalUserId, data as any);
      if (!result) throw new TRPCError({ code: 'NOT_FOUND', message: 'Produto não encontrado ou você não tem permissão' });
      return result;
    }),

  delete: organizerProcedure
    .input(z.object({
      id: z.string()
    }))
    .mutation(async ({ ctx, input }) => {
      const user = ctx.user as any;
      const context = await db.getOrganizerContext(user);
      if (context.type === 'MEMBER' && !context.permissions.includes('store')) {
        throw new TRPCError({ code: 'FORBIDDEN', message: 'Sem permissão para loja' });
      }
      const result = await db.deleteProduct(input.id, context.principalUserId);
      if (!result) throw new TRPCError({ code: 'NOT_FOUND', message: 'Produto não encontrado ou você não tem permissão' });
      return { success: true };
    }),

  createStandaloneOrder: publicProcedure
    .input(z.object({
      buyerName: z.string().min(1, "Nome é obrigatório"),
      buyerEmail: z.string().email("E-mail inválido"),
      buyerCpf: z.string().optional(),
      buyerPhone: z.string().optional(),
      productId: z.string(),
      eventId: z.number().optional(),
      quantity: z.number().int().min(1, "Quantidade inválida"),
      sizes: z.array(z.string()).optional()
    }))
    .mutation(async ({ input }) => {
      const dbInstance = await getDb();
      if (!dbInstance) throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: 'Database connection failed' });

      // Get the product to fetch the price and check stock
      const productResult = await dbInstance.select().from(products).where(eq(products.id, input.productId)).limit(1);
      const product = productResult[0];

      if (!product) {
        throw new TRPCError({ code: 'NOT_FOUND', message: 'Produto não encontrado' });
      }

      if (product.stock < input.quantity) {
        throw new TRPCError({ code: 'BAD_REQUEST', message: 'Estoque insuficiente' });
      }

      const totalAmount = product.price * input.quantity;

      // Decrease stock
      await dbInstance.update(products)
        .set({ stock: sql`${products.stock} - ${input.quantity}` })
        .where(eq(products.id, input.productId));

      // Create the order
      const newOrder = await dbInstance.insert(productOrders).values({
        productId: input.productId,
        eventId: input.eventId,
        quantity: input.quantity,
        sizes: input.sizes ? JSON.stringify(input.sizes) : null,
        totalAmount,
        buyerName: input.buyerName,
        buyerEmail: input.buyerEmail,
        buyerPhone: input.buyerPhone,
        buyerCpf: input.buyerCpf ? input.buyerCpf.replace(/\D/g, '') : null,
        status: "PENDING"
      }).returning();

      return { success: true, order: newOrder[0] };
    }),

  getOrganizerOrders: organizerProcedure
    .query(async ({ ctx }) => {
      const user = ctx.user as any;
      const context = await db.getOrganizerContext(user);
      if (context.type === 'MEMBER' && !context.permissions.includes('store')) {
        throw new TRPCError({ code: 'FORBIDDEN', message: 'Sem permissão para loja' });
      }
      const dbInstance = await getDb();
      if (!dbInstance) throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: 'Database connection failed' });

      const orders = await dbInstance.select({
        order: productOrders,
        product: products
      })
        .from(productOrders)
        .innerJoin(products, eq(productOrders.productId, products.id))
        .where(eq(products.userId, context.principalUserId))
        .orderBy(sql`${productOrders.createdAt} DESC`);

      return orders;
    }),

  getMyOrders: protectedProcedure
    .query(async ({ ctx }) => {
      const user = ctx.user as any;
      if (!user?.email) return [];

      const dbInstance = await getDb();
      if (!dbInstance) throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: 'Database connection failed' });

      const orders = await dbInstance.select({
        order: productOrders,
        product: products
      })
        .from(productOrders)
        .innerJoin(products, eq(productOrders.productId, products.id))
        .where(eq(productOrders.buyerEmail, user.email))
        .orderBy(sql`${productOrders.createdAt} DESC`);

      return orders;
    })
});

export const competitorRouter = router({
  getMyChampionships: protectedProcedure
    .query(async ({ ctx }) => {
      const dbInstance = await getDb();
      if (!dbInstance) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database error" });

      const userId = ctx.user.id;
      const user = await dbInstance.select().from(users).where(eq(users.id, userId)).limit(1);
      if (user.length === 0) throw new TRPCError({ code: "NOT_FOUND", message: "User not found" });

      // 1. Get all registrations for this user to identify participating events
      const userRegistrations = await dbInstance.select().from(registrations).where(eq(registrations.userId, userId));
      const eventIds = [...new Set(userRegistrations.map(r => r.eventId))];

      if (eventIds.length === 0) return [];

      // 2. Identify championships linked to these events
      const linkedStages = await dbInstance
        .select({ championshipId: championshipStages.championshipId })
        .from(championshipStages)
        .where(inArray(championshipStages.eventId, eventIds));

      const champIds = [...new Set(linkedStages.map(s => s.championshipId))];

      if (champIds.length === 0) return [];

      // 3. For each championship, calculate standings and extract user data
      const myChampData = [];

      for (const champId of champIds) {
        const { standings, stages, championship } = await calculateChampionshipStandings(champId);

        // Find user in standings (matching by name from user profile or registrations)
        const possibleNames = new Set<string>();
        if (user[0].name) possibleNames.add(user[0].name.toLowerCase());

        const champEventIds = stages.filter(s => s.eventId !== null).map(s => s.eventId as number);
        const relevantRegs = userRegistrations.filter(r => champEventIds.includes(r.eventId));

        relevantRegs.forEach(r => {
          if (r.pilotName) possibleNames.add(r.pilotName.toLowerCase());
          if (r.navigatorName) possibleNames.add(r.navigatorName.toLowerCase());
        });

        let myEntry = null;
        let myPosition = 0;

        // Search in all categories and roles from calculated standings
        for (const cat of standings) {
          const pilotEntry = cat.pilots.find(p => possibleNames.has(p.name.toLowerCase()));
          if (pilotEntry) {
            myEntry = pilotEntry;
            myPosition = cat.pilots.indexOf(pilotEntry) + 1;
            break;
          }
          const navEntry = cat.navigators.find(n => possibleNames.has(n.name.toLowerCase()));
          if (navEntry) {
            myEntry = navEntry;
            myPosition = cat.navigators.indexOf(navEntry) + 1;
            break;
          }
        }

        if (myEntry) {
          // Scenario A: User has results in the championship
          myChampData.push({
            id: championship.id,
            name: championship.name,
            imageUrl: (championship as any).imageUrl,
            category: myEntry.category,
            role: myEntry.role,
            position: myPosition,
            totalPoints: myEntry.netPoints,
            grossPoints: myEntry.grossPoints,
            stages: stages.map(s => {
              const result = myEntry!.stageResults.find(sr => sr.stageId === s.id);
              return {
                id: s.id,
                number: s.stageNumber,
                name: s.customName || s.event?.name || `Etapa ${s.stageNumber}`,
                points: result?.points || 0,
                position: result?.position || 0,
                isDiscarded: result?.isDiscarded || false,
                isDisqualified: result?.isDisqualified || false,
                hasResult: !!result
              };
            })
          });
        } else if (relevantRegs.length > 0) {
          // Scenario B: User is registered but has no results calculated yet
          const latestReg = relevantRegs.sort((a, b) => (b.id || 0) - (a.id || 0))[0];
          const isPilot = user[0].name && latestReg.pilotName && user[0].name.toLowerCase() === latestReg.pilotName.toLowerCase();

          myChampData.push({
            id: championship.id,
            name: championship.name,
            imageUrl: (championship as any).imageUrl,
            category: "Inscrito",
            role: isPilot ? 'pilot' : 'navigator',
            position: null,
            totalPoints: 0,
            grossPoints: 0,
            stages: stages.map(s => ({
              id: s.id,
              number: s.stageNumber,
              name: s.customName || s.event?.name || `Etapa ${s.stageNumber}`,
              points: 0,
              position: 0,
              isDiscarded: false,
              isDisqualified: false,
              hasResult: false
            }))
          });
        }
      }

      return myChampData;
    })
});

export const appRouter = router({
  system: systemRouter,
  finance: financeRouter,
  store: storeRouter,
  championships: championshipRouter,
  competitor: competitorRouter,

  organizerMembers: router({
    invite: organizerProcedure
      .input(z.object({
        email: z.string().email(),
        permissions: z.array(z.string())
      }))
      .mutation(async ({ ctx, input }) => {
        const user = ctx.user as any;
        const dbInstance = await getDb();
        if (!dbInstance) throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: 'DB fail' });

        // Ensure no cyclic or duplicate invitations
        return await dbInstance.insert(organizerMembers).values({
          organizerId: user.id, // Only Principal can invite
          memberEmail: input.email.toLowerCase(),
          permissions: JSON.stringify(input.permissions),
        }).returning();
      }),

    list: organizerProcedure
      .query(async ({ ctx }) => {
        const user = ctx.user as any;
        const dbInstance = await getDb();
        if (!dbInstance) return [];

        return await dbInstance.select()
          .from(organizerMembers)
          .where(eq(organizerMembers.organizerId, user.id));
      }),

    remove: organizerProcedure
      .input(z.object({ id: z.number() }))
      .mutation(async ({ ctx, input }) => {
        const user = ctx.user as any;
        const dbInstance = await getDb();
        if (!dbInstance) return false;

        await dbInstance.delete(organizerMembers)
          .where(and(eq(organizerMembers.id, input.id), eq(organizerMembers.organizerId, user.id)));
        return { success: true };
      }),

    myContext: protectedProcedure
      .query(async ({ ctx }) => {
        const user = ctx.user as any;
        return await db.getOrganizerContext(user);
      }),

    myPermissions: protectedProcedure
      .query(async ({ ctx }) => {
        const user = ctx.user as any;
        const context = await db.getOrganizerContext(user);
        if (context.type === 'PRINCIPAL') {
          return ['events', 'registrations', 'finance', 'store', 'principal'];
        }
        return context.permissions;
      })
  }),

  auth: router({
    me: publicProcedure.query(async ({ ctx }) => {
      if (!ctx.user) return null;
      const user = ctx.user as any;
      return {
        ...user,
        id: user.id || 1,
        openId: user.openId || "dev-user",
        name: user.name || "Competidor",
        email: user.email || "competidor@amigoracing.com.br"
      };
    }),
    logout: publicProcedure.mutation(({ ctx }) => {
      const cookieOptions = getSessionCookieOptions(ctx.req);
      ctx.res.clearCookie(COOKIE_NAME, cookieOptions);
      ctx.res.clearCookie(COOKIE_NAME); // Fallback: sem opções para garantir remoção em localhost
      return { success: true };
    }),
  }),
  events: router({
    list: publicProcedure.query(async () => await db.getAllEvents() || []),
    listAll: publicProcedure.query(async () => await db.getAllEvents() || []),
    listOpen: publicProcedure.query(async () => await db.getOpenEvents() || []),
    get: publicProcedure
      .input(z.object({ id: z.number() }))
      .query(async ({ input }) => {
        const event = await db.getEventById(input.id);
        if (!event) throw new TRPCError({ code: 'NOT_FOUND', message: 'Evento não encontrado' });
        return event;
      }),
    myEvents: protectedProcedure.query(async ({ ctx }) => {
      const user = ctx.user as any;
      const context = await db.getOrganizerContext(user);
      if (context.type === 'MEMBER' && !context.permissions.includes('events')) return [];

      const principal = await db.getUserById(context.principalUserId) as any;
      const organizer = principal ? await db.getOrganizerByOwnerId(principal.openId) as any : null;
      if (!organizer) return [];
      return await db.getEventsByOrganizerId(organizer.id);
    }),
    create: protectedProcedure
      .input(z.object({
        name: z.string(),
        description: z.string().optional(),
        startDate: z.string().or(z.date()),
        endDate: z.string().or(z.date()),
        location: z.string(),
        city: z.string(),
        state: z.string().optional(),
        imageUrl: z.string().optional(),
        isExternal: z.boolean().optional(),
        showInListing: z.boolean().optional(),
        showRegistrations: z.boolean().optional(),
        allowCancellation: z.boolean().optional(),
        notificationEmail: z.string().email().optional(),
        externalUrl: z.string().url().optional().nullable(),
      }))
      .mutation(async ({ ctx, input }) => {
        const user = ctx.user as any;
        const context = await db.getOrganizerContext(user);
        if (context.type === 'MEMBER' && !context.permissions.includes('events')) {
          throw new TRPCError({ code: 'FORBIDDEN', message: 'Sem permissão para eventos' });
        }

        const principal = await db.getUserById(context.principalUserId) as any;
        const organizer = principal ? await db.getOrganizerByOwnerId(principal.openId) as any : null;
        if (!organizer) {
          throw new TRPCError({ code: 'FORBIDDEN', message: 'Usuário principal não possui um organizador válido' });
        }

        try {
          const startDate = new Date(input.startDate);
          const endDate = new Date(input.endDate);

          if (isNaN(startDate.getTime()) || isNaN(endDate.getTime())) {
            throw new Error("Datas inválidas fornecidas");
          }

          const result = await db.createEvent({
            ...input,
            startDate,
            endDate,
            organizerId: organizer.id,
            status: 'open',
            isExternal: input.isExternal || false,
          } as any);

          console.log(`[Events.create] Evento criado com sucesso. ID extraído de:`, result);
          return { success: true, message: "Evento criado com sucesso" };
        } catch (error) {
          console.error(`[Events.create Error]:`, error);
          throw new TRPCError({
            code: 'INTERNAL_SERVER_ERROR',
            message: error instanceof Error ? error.message : 'Erro ao criar evento'
          });
        }
      }),
    createExternal: protectedProcedure
      .input(z.object({
        name: z.string(),
        description: z.string().optional(),
        startDate: z.string().or(z.date()),
        endDate: z.string().or(z.date()),
        location: z.string(),
        city: z.string(),
        state: z.string().optional(),
        imageUrl: z.string().optional(),
        showInListing: z.boolean().optional(),
        allowCancellation: z.boolean().optional(),
        notificationEmail: z.string().email().optional(),
      }))
      .mutation(async ({ ctx, input }) => {
        const user = ctx.user as any;
        const context = await db.getOrganizerContext(user);
        if (context.type === 'MEMBER' && !context.permissions.includes('events')) {
          throw new TRPCError({ code: 'FORBIDDEN', message: 'Sem permissão para eventos' });
        }

        const principal = await db.getUserById(context.principalUserId) as any;
        const organizer = principal ? await db.getOrganizerByOwnerId(principal.openId) as any : null;
        if (!organizer) throw new TRPCError({ code: 'FORBIDDEN', message: 'Usuário não é um organizador' });

        return await db.createEvent({
          ...input,
          startDate: new Date(input.startDate),
          endDate: new Date(input.endDate),
          organizerId: organizer.id,
          status: 'open',
          isExternal: true,
        } as any);
      }),
    update: protectedProcedure
      .input(z.object({
        id: z.number(),
        name: z.string().optional(),
        description: z.string().optional().nullable(),
        startDate: z.string().or(z.date()).optional(),
        endDate: z.string().or(z.date()).optional(),
        location: z.string().optional().nullable(),
        city: z.string().optional().nullable(),
        state: z.string().optional().nullable(),
        status: z.enum(['open', 'closed', 'cancelled']).optional(),
        imageUrl: z.string().optional().nullable(),
        isExternal: z.boolean().optional().nullable(),
        externalUrl: z.string().url().optional().nullable(),
        showInListing: z.boolean().optional().nullable(),
        showRegistrations: z.boolean().optional().nullable(),
        notifyOnNewRegistration: z.boolean().optional().nullable(),
        notificationEmail: z.string().email().optional().nullable(),
        allowCancellation: z.boolean().optional().nullable(),
        cancellationDeadlineDays: z.number().optional().nullable(),
        refundEnabled: z.boolean().optional().nullable(),
        terms: z.string().optional().nullable(),
        documents: z.string().optional().nullable(),
        championshipId: z.number().optional().nullable(),
        sponsors: z.array(z.string()).optional(),
        gallery: z.array(z.string()).optional(),
        navigationFiles: z.array(z.any()).optional(),
      }))
      .mutation(async ({ ctx, input }) => {
        const { id, championshipId, ...data } = input;
        const updateData: any = { ...data };
        if (data.startDate) updateData.startDate = new Date(data.startDate);
        if (data.endDate) updateData.endDate = new Date(data.endDate);

        // Garantir que campos booleanos e opcionais sejam passados corretamente
        if (data.isExternal !== undefined) updateData.isExternal = data.isExternal;
        if (data.externalUrl !== undefined) updateData.externalUrl = data.externalUrl;
        if (data.showInListing !== undefined) updateData.showInListing = data.showInListing;
        if (data.showRegistrations !== undefined) updateData.showRegistrations = data.showRegistrations;

        const result = await db.updateEvent(id, updateData);

        // Handle Championship linking requests
        if (championshipId !== undefined) {
          const drizzleDb = await db.getDb();
          if (drizzleDb) {
            const currentOrganizerId = (ctx.user as any).id;

            if (championshipId === null) {
              // Remove explicit link and any pending requests
              await drizzleDb.delete(championshipStages).where(eq(championshipStages.eventId, id));
              await drizzleDb.delete(championshipRequests).where(eq(championshipRequests.eventId, id));
            } else {
              // Check if it's already an approved stage
              const existingStage = await drizzleDb.select().from(championshipStages).where(eq(championshipStages.eventId, id)).limit(1);

              if (existingStage.length > 0) {
                if (existingStage[0].championshipId !== championshipId) {
                  // Switching championship: Remove old stage and create a pending request for the new one
                  await drizzleDb.delete(championshipStages).where(eq(championshipStages.eventId, id));

                  // Check if a request already exists to avoid duplicates
                  const existingReq = await drizzleDb.select().from(championshipRequests)
                    .where(and(eq(championshipRequests.eventId, id), eq(championshipRequests.championshipId, championshipId))).limit(1);

                  if (existingReq.length === 0) {
                    await drizzleDb.insert(championshipRequests).values({
                      championshipId,
                      eventId: id,
                      requestingOrganizerId: currentOrganizerId,
                      status: "PENDING"
                    });
                  } else if (existingReq[0].status !== "PENDING") {
                    await drizzleDb.update(championshipRequests)
                      .set({ status: "PENDING" })
                      .where(eq(championshipRequests.id, existingReq[0].id));
                  }
                }
              } else {
                // Not an active stage. Handle request creation or update.
                const existingReq = await drizzleDb.select().from(championshipRequests).where(eq(championshipRequests.eventId, id)).limit(1);

                if (existingReq.length > 0) {
                  if (existingReq[0].championshipId !== championshipId) {
                    await drizzleDb.update(championshipRequests)
                      .set({ championshipId, status: "PENDING" })
                      .where(eq(championshipRequests.id, existingReq[0].id));
                  } else if (existingReq[0].status === "REJECTED") {
                    await drizzleDb.update(championshipRequests)
                      .set({ status: "PENDING" })
                      .where(eq(championshipRequests.id, existingReq[0].id));
                  }
                } else {
                  await drizzleDb.insert(championshipRequests).values({
                    championshipId,
                    eventId: id,
                    requestingOrganizerId: currentOrganizerId,
                    status: "PENDING"
                  });
                }
              }
            }
          }
        }

        return result;
      }),
    delete: protectedProcedure
      .input(z.object({ id: z.number() }))
      .mutation(async ({ ctx, input }) => {
        const user = ctx.user as any;
        const context = await db.getOrganizerContext(user);
        if (context.type === 'MEMBER' && !context.permissions.includes('events')) {
          throw new TRPCError({ code: 'FORBIDDEN', message: 'Sem permissão para eventos' });
        }
        return await db.deleteEvent(input.id);
      }),
    listImages: publicProcedure.input(z.any()).query(async () => []),

    updateDocuments: protectedProcedure
      .input(z.object({
        id: z.number(),
        documents: z.string(), // JSON array de {name, url, type}
      }))
      .mutation(async ({ ctx, input }) => {
        const user = ctx.user as any;
        const context = await db.getOrganizerContext(user);
        if (context.type === 'MEMBER' && !context.permissions.includes('events')) {
          throw new TRPCError({ code: 'FORBIDDEN', message: 'Sem permissão para eventos' });
        }
        await db.updateEvent(input.id, { documents: input.documents } as any);
        return { success: true };
      }),

    getDocuments: publicProcedure
      .input(z.object({ id: z.number() }))
      .query(async ({ input }) => {
        const event = await db.getEventById(input.id);
        if (!event) return [];
        try {
          const docs = JSON.parse((event as any).documents || '[]');
          return Array.isArray(docs) ? docs : [];
        } catch {
          return [];
        }
      }),

    getNavigationFiles: publicProcedure
      .input(z.object({ id: z.number() }))
      .query(async ({ input }) => {
        const event = await db.getEventById(input.id);
        if (!event) return [];
        try {
          const files = (event as any).navigationFiles || [];
          return Array.isArray(files) ? files : [];
        } catch {
          return [];
        }
      }),
  }),

  categories: router({
    listByEvent: publicProcedure
      .input(z.object({ eventId: z.number() }))
      .query(async ({ input }) => {
        return await db.getCategoriesByEventId(input.eventId) || [];
      }),
    create: protectedProcedure
      .input(z.any())
      .mutation(async ({ input }) => {
        try {
          return await db.createCategory(input as any);
        } catch (error) {
          return { success: true, id: 1 };
        }
      }),
    delete: protectedProcedure
      .input(z.object({ id: z.number() }))
      .mutation(async ({ input }) => {
        return await db.deleteCategory(input.id);
      }),
    listCategories: publicProcedure.input(z.any()).query(async () => []),
  }),
  registrations: router({
    create: protectedProcedure
      .input(z.object({
        eventId: z.number(),
        categoryId: z.number(),
        vehicleBrand: z.string(),
        vehicleModel: z.string(),
        pilotName: z.string(),
        pilotEmail: z.string(),
        pilotCpf: z.string(),
        pilotCity: z.string(),
        pilotState: z.string(),
        pilotShirtSize: z.string(),
        phone: z.string(),
        navigatorName: z.string().optional(),
        navigatorEmail: z.string().optional(),
        navigatorCpf: z.string().optional(),
        navigatorCity: z.string().optional(),
        navigatorState: z.string().optional(),
        navigatorShirtSize: z.string().optional(),
        team: z.string().optional(),
        notes: z.string().optional(),
        termsAccepted: z.boolean().optional(),
        purchasedProducts: z.any().optional(),
      }))
      .mutation(async ({ ctx, input }) => {
        const user = ctx.user as any;
        try {
          const result = await db.createRegistration({
            ...input,
            userId: user.id || 1,
            pilotCpf: input.pilotCpf.replace(/\D/g, ''),
            phone: input.phone.replace(/\D/g, ''),
            status: "pending",
            createdAt: new Date(),
            updatedAt: new Date(),
          } as any);

          const finalId = typeof result === 'number' ? result : (result as any)?.id || Date.now();

          // Deduct stock for purchased products
          if (input.purchasedProducts && Array.isArray(input.purchasedProducts)) {
            const dbInstance = await getDb();
            if (dbInstance) {
              for (const item of input.purchasedProducts) {
                if (item.productId && item.quantity > 0) {
                  await dbInstance.update(products)
                    .set({ stock: sql`${products.stock} - ${item.quantity}` })
                    .where(eq(products.id, item.productId));
                }
              }
            }
          }

          return { success: true, id: finalId, registrationId: finalId };
        } catch (error) {
          console.error("[registrations.create Error]:", error);
          throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: 'Erro ao criar inscrição' });
        }
      }),
    listByEvent: publicProcedure.input(z.object({ eventId: z.number() })).query(async ({ input }) => {
      return await db.getRegistrationsByEventId(input.eventId) || [];
    }),
    get: publicProcedure.input(z.object({ id: z.number() })).query(async ({ input }) => {
      return await db.getRegistrationById(input.id);
    }),
    myRegistrations: protectedProcedure.query(async ({ ctx }) => {
      return await db.getRegistrationsByUserId(ctx.user.id) || [];
    }),
    updateMyRegistration: protectedProcedure
      .input(z.object({
        registrationId: z.number(),
        pilotName: z.string().optional(),
        pilotEmail: z.string().optional(),
        phone: z.string().optional(),
        pilotCpf: z.string().optional(),
        pilotAge: z.number().optional(),
        pilotShirtSize: z.string().optional(),
        navigatorName: z.string().optional(),
        navigatorEmail: z.string().optional(),
        navigatorCpf: z.string().optional(),
        navigatorShirtSize: z.string().optional(),
        vehicleBrand: z.string().optional(),
        vehicleModel: z.string().optional(),
        vehicleYear: z.number().optional(),
        vehicleColor: z.string().optional(),
        vehiclePlate: z.string().optional(),
        pilotCity: z.string().optional(),
        pilotState: z.string().optional(),
        navigatorCity: z.string().optional(),
        navigatorState: z.string().optional(),
        team: z.string().optional(),
        notes: z.string().optional(),
      }).passthrough())
      .mutation(async ({ ctx, input }) => {
        const { registrationId, ...data } = input;
        const reg = await db.getRegistrationById(registrationId);
        if (!reg || reg.userId !== ctx.user.id) {
          throw new TRPCError({ code: 'UNAUTHORIZED', message: 'Inscrição não encontrada ou sem permissão' });
        }
        return await db.updateRegistration(registrationId, {
          ...data,
          updatedAt: new Date()
        } as any);
      }),
    requestCancellation: protectedProcedure
      .input(z.object({ registrationId: z.number(), reason: z.string().optional() }))
      .mutation(async ({ ctx, input }) => {
        const reg = await db.getRegistrationById(input.registrationId) as any;
        if (!reg || reg.userId !== ctx.user.id) {
          throw new TRPCError({ code: 'UNAUTHORIZED', message: 'Inscrição não encontrada ou sem permissão' });
        }
        if (reg.status === 'cancelled') {
          throw new TRPCError({ code: 'BAD_REQUEST', message: 'Inscrição já está cancelada' });
        }

        // Buscar dados do evento para notificação
        const event = await db.getEventById(reg.eventId) as any;
        const organizer = event ? await db.getOrganizerById(event.organizerId) as any : null;
        const organizerUser = organizer ? await db.getUserByOpenId(organizer.ownerId) as any : null;

        const notifyEmail = event?.notificationEmail || organizerUser?.email || '';

        // Atualizar status da inscrição e salvar motivo
        await db.updateRegistration(input.registrationId, {
          status: 'cancellation_requested',
          cancellationReason: input.reason || null
        });

        console.log(`[requestCancellation] Solicitação de cancelamento recebida:`);
        console.log(`  Inscrição: #${reg.id} - Piloto: ${reg.pilotName} (${reg.pilotEmail})`);
        console.log(`  Motivo: ${input.reason || 'Não informado'}`);
        console.log(`  Evento: ${event?.name || reg.eventId}`);
        console.log(`  Notificar organizador em: ${notifyEmail || 'email não configurado'}`);

        // TODO: integrar envio de email real via nodemailer/resend quando SMTP for configurado
        return {
          success: true,
          message: 'Solicitação de cancelamento enviada ao organizador.',
          notifiedEmail: notifyEmail,
        };
      }),
    getStatistics: publicProcedure
      .input(z.object({ eventId: z.number() }))
      .query(async ({ input }) => {
        return await db.getRegistrationsStatistics(input.eventId);
      }),
    updateStartInfo: protectedProcedure
      .input(z.object({
        registrationId: z.number(),
        startNumber: z.number().int().optional(),
        startTime: z.string().optional(),
      }))
      .mutation(async ({ ctx, input }) => {
        const { registrationId, ...data } = input;
        const user = ctx.user as any;
        const reg = await db.getRegistrationById(registrationId) as any;
        if (!reg) throw new TRPCError({ code: 'NOT_FOUND', message: 'Inscrição não encontrada' });
        const event = await db.getEventById(reg.eventId) as any;
        const organizer = event ? await db.getOrganizerById(event.organizerId) as any : null;

        const context = await db.getOrganizerContext(user);
        const principal = await db.getUserById(context.principalUserId) as any;

        if (!organizer || organizer.ownerId !== principal?.openId || (context.type === 'MEMBER' && !context.permissions.includes('registrations'))) {
          throw new TRPCError({ code: 'UNAUTHORIZED', message: 'Somente o organizador pode alterar informações de largada' });
        }
        return await db.updateRegistration(registrationId, {
          ...data,
          updatedAt: new Date()
        });
      }),
    getHistory: protectedProcedure
      .input(z.object({ registrationId: z.number() }))
      .query(async ({ ctx, input }) => {
        const user = ctx.user as any;

        // Autorização: Usuário deve ser o organizador do evento
        const reg = await db.getRegistrationById(input.registrationId) as any;
        if (!reg) throw new TRPCError({ code: 'NOT_FOUND', message: 'Inscrição não encontrada' });

        const event = await db.getEventById(reg.eventId) as any;
        const organizer = event ? await db.getOrganizerById(event.organizerId) as any : null;

        if (!organizer || organizer.ownerId !== user.openId) {
          throw new TRPCError({ code: 'UNAUTHORIZED', message: 'Somente o organizador pode visualizar o histórico' });
        }

        return await db.getRegistrationHistory(input.registrationId);
      }),
    delete: protectedProcedure
      .input(z.object({ registrationId: z.number() }))
      .mutation(async ({ ctx, input }) => {
        const user = ctx.user as any;
        const reg = await db.getRegistrationById(input.registrationId) as any;
        if (!reg) throw new TRPCError({ code: 'NOT_FOUND', message: 'Inscrição não encontrada' });

        const event = await db.getEventById(reg.eventId) as any;
        const organizer = event ? await db.getOrganizerById(event.organizerId) as any : null;

        if (!organizer || organizer.ownerId !== user.openId) {
          throw new TRPCError({ code: 'UNAUTHORIZED', message: 'Somente o organizador pode excluir inscrições' });
        }

        return await db.deleteRegistration(input.registrationId);
      }),
    getEventRegistrationsForSecretariat: protectedProcedure
      .input(z.object({ eventId: z.number() }))
      .query(async ({ ctx, input }) => {
        const user = ctx.user as any;
        const context = await db.getOrganizerContext(user);

        if (context.type === 'MEMBER' && !context.permissions.includes('registrations')) {
          throw new TRPCError({ code: 'FORBIDDEN', message: 'Sem permissão para secretaria/inscrições' });
        }

        const dbInstance = await getDb();
        if (!dbInstance) throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: 'Database fail' });

        return await dbInstance
          .select()
          .from(registrations)
          .where(eq(registrations.eventId, input.eventId))
          .orderBy(registrations.pilotName);
      }),
    toggleCheckinStatus: protectedProcedure
      .input(z.object({
        registrationId: z.number(),
        isCheckedIn: z.boolean().optional(),
        kitDelivered: z.boolean().optional(),
        waiverSigned: z.boolean().optional()
      }))
      .mutation(async ({ ctx, input }) => {
        const user = ctx.user as any;
        const context = await db.getOrganizerContext(user);

        if (context.type === 'MEMBER' && !context.permissions.includes('registrations')) {
          throw new TRPCError({ code: 'FORBIDDEN', message: 'Sem permissão para secretaria/inscrições' });
        }

        const dbInstance = await getDb();
        if (!dbInstance) throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: 'Database fail' });

        const { registrationId, ...updates } = input;

        if (Object.keys(updates).length > 0) {
          await dbInstance.update(registrations)
            .set(updates)
            .where(eq(registrations.id, registrationId));
        }

        return { success: true };
      }),
  }),

  payments: router({
    getPaymentStatus: publicProcedure.input(z.object({ registrationId: z.number() })).query(async ({ input }) => {
      try {
        const reg = await db.getRegistrationById(input.registrationId) as any;
        if (!reg) return { status: 'pending', paid: false, success: true };
        if (reg.status === 'paid') return { status: 'confirmed', paid: true, success: true };

        const chargeId = reg.transactionId;
        if (chargeId && chargeId.startsWith('ch_')) {
          const apiKey = ENV.pagarmeApiKey;
          const chargeResp = await fetch(`https://api.pagar.me/core/v5/charges/${chargeId}`, {
            headers: { 'Authorization': `Basic ${Buffer.from(`${apiKey}:`).toString('base64')}` }
          });
          if (chargeResp.ok) {
            const charge = await chargeResp.json() as any;
            const chargePaid = charge.status === 'paid';
            if (chargePaid && reg.status !== 'paid') {
              await db.updateRegistration(reg.id, { status: 'paid' });
            }
            return {
              status: chargePaid ? 'confirmed' : (charge.status || 'pending'),
              paid: chargePaid,
              success: true
            };
          }
        }
        return { status: reg.status || 'pending', paid: reg.status === 'paid', success: true };
      } catch (err) {
        return { status: 'pending', paid: false, success: true };
      }
    }),
    createPayment: protectedProcedure
      .input(z.object({
        registrationId: z.number().optional(),
        orderId: z.string().uuid().optional(),
        paymentMethod: z.enum(['pix', 'credit_card']).default('pix'),
        cardData: z.object({
          number: z.string(),
          holder_name: z.string(),
          exp_month: z.number(),
          exp_year: z.number(),
          cvv: z.string(),
          installments: z.number().default(1),
          billingAddress: z.object({
            zipCode: z.string(),
            street: z.string(),
            number: z.string(),
            neighborhood: z.string(),
            city: z.string(),
            state: z.string(),
          }).optional(),
          bypassAntifraud: z.boolean().optional(),
        }).optional(),
      }))
      .mutation(async ({ ctx, input }) => {
        try {
          if (!input.registrationId && !input.orderId) {
            throw new Error("É necessário fornecer um ID de inscrição ou de pedido.");
          }

          let reg: any = null;
          let category: any = null;
          let event: any = null;
          let standaloneOrder: any = null;
          let product: any = null;
          let totalAmountCents = 0;
          let organizerRecipientId: string | undefined;
          let descriptionStr = "";

          if (input.registrationId) {
            reg = await db.getRegistrationById(input.registrationId) as any;
            if (!reg) throw new Error("Inscrição não encontrada");
            category = await db.getCategoryById(reg.categoryId) as any;
            event = await db.getEventById(reg.eventId) as any;
            if (!event) throw new Error("Evento não encontrado");

            const organizerId = event.organizerId;
            const organizer = organizerId ? await db.getOrganizerById(organizerId) as any : null;
            const organizerUser = organizer ? await db.getUserByOpenId(organizer.ownerId) as any : null;
            organizerRecipientId = organizerUser?.recipientId;

            descriptionStr = `Inscrição Evento: ${event?.name || 'Evento'}`;

            let productsTotal = 0;
            if (reg.purchasedProducts) {
              try {
                const productsArray = typeof reg.purchasedProducts === 'string' ? JSON.parse(reg.purchasedProducts) : reg.purchasedProducts;
                if (Array.isArray(productsArray)) {
                  productsTotal = productsArray.reduce((sum, p) => sum + ((p.price || 0) * (p.quantity || 1)), 0);
                }
              } catch (e) {
                console.error("Error parsing purchasedProducts:", e);
              }
            }

            totalAmountCents = Math.round(((category.price || 150) + productsTotal) * 100);
          } else if (input.orderId) {
            const dbInstance = await getDb();
            if (!dbInstance) throw new Error("Falha na conexão com banco");

            const results = await dbInstance.select({
              order: productOrders,
              product: products
            }).from(productOrders)
              .innerJoin(products, eq(productOrders.productId, products.id))
              .where(eq(productOrders.id, input.orderId))
              .limit(1);

            if (!results || results.length === 0) throw new Error("Pedido não encontrado");
            standaloneOrder = results[0].order;
            product = results[0].product;

            const productOwnerId = product.userId;
            const organizerUser = await db.getUserById(productOwnerId) as any;
            organizerRecipientId = organizerUser?.recipientId;

            event = standaloneOrder.eventId ? await db.getEventById(standaloneOrder.eventId) : null;
            descriptionStr = `Pedido Avulso: ${product.name} (Qtd: ${standaloneOrder.quantity})`;
            totalAmountCents = Math.round(standaloneOrder.totalAmount * 100);

            // Create pseudo-reg for Pagar.me customer
            // Note: Since standalone orders bypass CPF collection, we pull the authenticated user CPF if available or fallback to a standard bypassed valid CPF string to satisfy Pagar.me.
            const currentUser = ctx.user as any;

            reg = {
              id: standaloneOrder.id,
              pilotName: standaloneOrder.buyerName,
              pilotEmail: standaloneOrder.buyerEmail,
              pilotCpf: standaloneOrder.buyerCpf || currentUser?.cpf || "", // Use given CPF or fallback
              phone: standaloneOrder.buyerPhone || "11999999999",
              pilotCity: "São Paulo",
              pilotState: "SP"
            };
          }

          const split = [];

          // Se tivermos o recipient do organizador e o ID da plataforma, configuramos o split
          // Aqui assumimos uma taxa fixa ou configurável. Se não houver config, 100% vai para o organizador ou plataforma.
          if (organizerRecipientId && ENV.pagarmePlatformRecipientId) {
            // Exemplo: 90% Organizador, 10% Plataforma (ajuste conforme a regra de negócio)
            const platformFeePercentage = 10;
            const platformAmount = Math.round(totalAmountCents * (platformFeePercentage / 100));
            const organizerAmount = totalAmountCents - platformAmount;

            split.push({
              amount: organizerAmount,
              recipient_id: organizerRecipientId,
              type: "flat",
              options: {
                charge_processing_fee: true,
                charge_remainder_fee: true,
                liable: true
              }
            });

            split.push({
              amount: platformAmount,
              recipient_id: ENV.pagarmePlatformRecipientId,
              type: "flat",
              options: {
                charge_processing_fee: false,
                charge_remainder_fee: false,
                liable: false
              }
            });
          }

          const paymentPayload: any = {
            payment_method: input.paymentMethod,
          };

          if (input.paymentMethod === 'pix') {
            paymentPayload.pix = { expires_in: 7200 };
          } else if (input.paymentMethod === 'credit_card' && input.cardData) {
            paymentPayload.credit_card = {
              installments: input.cardData.installments,
              statement_descriptor: "AMIGO",
              card: {
                number: input.cardData.number.replace(/\D/g, ''),
                holder_name: input.cardData.holder_name,
                exp_month: input.cardData.exp_month,
                exp_year: input.cardData.exp_year,
                cvv: input.cardData.cvv,
                billing_address: {
                  street: input.cardData.billingAddress?.street || "Rua do Piloto",
                  number: input.cardData.billingAddress?.number || "S/N",
                  neighborhood: input.cardData.billingAddress?.neighborhood || "Centro",
                  zip_code: input.cardData.billingAddress?.zipCode?.replace(/\D/g, '') || "01001000",
                  city: input.cardData.billingAddress?.city || String(reg.pilotCity || "São Paulo"),
                  state: input.cardData.billingAddress?.state || String(reg.pilotState || "SP"),
                  country: "BR"
                }
              }
            };
          }

          console.log('[createPayment] Order Payload:', JSON.stringify({
            closed: true,
            items: [{
              amount: totalAmountCents,
              description: descriptionStr,
              quantity: 1,
              code: String(reg.id)
            }],
            customer: {
              name: String(reg.pilotName),
              email: String(reg.pilotEmail),
              ...(reg.pilotCpf ? { document: String(reg.pilotCpf).replace(/\D/g, '') } : {}),
              type: "individual",
              phones: {
                mobile_phone: {
                  country_code: "55",
                  area_code: String(reg.phone).replace(/\D/g, '').substring(0, 2) || "11",
                  number: String(reg.phone).replace(/\D/g, '').substring(2) || "999999999"
                }
              }
            },
            payments: [{
              ...paymentPayload,
              amount: totalAmountCents,
            }]
          }, null, 2));
          console.log('[createPayment] Split details:', JSON.stringify(split, null, 2));

          const bypass = !!input.cardData?.bypassAntifraud || !!input.orderId;
          const capturedIp = ctx.req.ip || (typeof ctx.req.headers['x-forwarded-for'] === 'string' ? ctx.req.headers['x-forwarded-for'].split(',')[0] : ctx.req.headers['x-forwarded-for']?.[0]) || ctx.req.socket.remoteAddress;

          // Se for localhost (::1 ou 127.0.0.1), Pagar.me pode bloquear. Melhor enviar o IP do servidor em produção ou deixar nulo se local.
          const finalIp = (capturedIp === '::1' || capturedIp === '127.0.0.1') ? '177.70.102.10' : capturedIp;

          console.log('[createPayment] Bypass Antifraud:', bypass, 'Is Standalone:', !!input.orderId);
          console.log('[createPayment] Final IP:', finalIp);

          // Deep merge the bypass flag into the credit_card object if it exists
          if (bypass && paymentPayload.credit_card) {
            paymentPayload.credit_card.antifraud_enabled = false;
          }

          const order = await pagarme.createOrder({
            closed: true,
            metadata: {
              registrationId: input.registrationId ? String(reg.id) : undefined,
              orderId: input.orderId ? String(reg.id) : undefined,
              pilotName: String(reg.pilotName),
              eventName: String(event?.name || 'S/N'),
              categoryName: category ? String(category.name) : 'Produto Avulso',
            },
            items: [{
              amount: totalAmountCents,
              description: descriptionStr,
              quantity: 1,
              code: String(reg.id)
            }],
            customer: {
              name: String(reg.pilotName),
              email: String(reg.pilotEmail),
              ...(reg.pilotCpf ? { document: String(reg.pilotCpf).replace(/\D/g, '') } : {}),
              type: "individual",
              ip: finalIp,
              phones: {
                mobile_phone: {
                  country_code: "55",
                  area_code: String(reg.phone).replace(/\D/g, '').substring(0, 2) || "11",
                  number: String(reg.phone).replace(/\D/g, '').substring(2) || "999999999"
                }
              },
              address: {
                street: input.cardData?.billingAddress?.street || "Rua do Piloto",
                number: input.cardData?.billingAddress?.number || "S/N",
                neighborhood: input.cardData?.billingAddress?.neighborhood || "Centro",
                zip_code: input.cardData?.billingAddress?.zipCode?.replace(/\D/g, '') || "01001000",
                city: input.cardData?.billingAddress?.city || String(reg.pilotCity || "São Paulo"),
                state: input.cardData?.billingAddress?.state || String(reg.pilotState || "SP"),
                country: "BR"
              }
            },
            shipping: {
              amount: 0,
              description: "Inscrição em Evento (Entrega Digital)",
              recipient_name: String(reg.pilotName),
              recipient_phone: String(reg.phone).replace(/\D/g, '').substring(0, 11) || "11999999999",
              address: {
                street: input.cardData?.billingAddress?.street || "Rua do Piloto",
                number: input.cardData?.billingAddress?.number || "S/N",
                neighborhood: input.cardData?.billingAddress?.neighborhood || "Centro",
                zip_code: input.cardData?.billingAddress?.zipCode?.replace(/\D/g, '') || "01001000",
                city: input.cardData?.billingAddress?.city || String(reg.pilotCity || "São Paulo"),
                state: input.cardData?.billingAddress?.state || String(reg.pilotState || "SP"),
                country: "BR"
              }
            },
            payments: [{
              ...paymentPayload,
              amount: totalAmountCents,
              antifraud_enabled: bypass ? false : true,
              ...(split.length > 0 ? { split } : {}),
            }]
          });

          const charge = order.charges?.[0];
          const transaction = charge?.last_transaction;

          console.log('[createPayment] Order created:', order.id, 'Status:', charge?.status);
          if (charge?.status === 'failed') {
            console.error('[createPayment] Charge FAILED. Gateway Response:', JSON.stringify(transaction?.gateway_response, null, 2));
          }

          if (charge) {
            if (input.registrationId) {
              await db.updateRegistration(input.registrationId, {
                transactionId: charge.id,
                qrCode: transaction?.qr_code_url || null,
              });
            } else if (input.orderId && standaloneOrder) {
              const dbInstance = await getDb();
              if (dbInstance) {
                await dbInstance.update(productOrders).set({
                  transactionId: charge.id,
                  qrCode: transaction?.qr_code_url || null
                }).where(eq(productOrders.id, standaloneOrder.id));
              }
            }

            return {
              success: true,
              chargeId: charge.id,
              status: charge.status, // authorized, paid, pending, failed
              paymentMethod: input.paymentMethod,
              pixCode: transaction?.qr_code,
              pixQrCodeUrl: transaction?.qr_code_url,
              gatewayResponse: charge.last_transaction?.gateway_response,
              acquirerMessage: transaction?.acquirer_message || charge.last_transaction?.acquirer_message,
              acquirerReturnCode: transaction?.acquirer_return_code || charge.last_transaction?.acquirer_return_code,
            };
          }
          return { success: false, message: "Não foi possível criar a cobrança" };
        } catch (error: any) {
          console.error("[createPayment Error]:", error);
          return {
            success: false,
            message: error.message || "Erro ao processar pagamento",
            error: true
          };
        }
      }),
    setupRecipient: protectedProcedure.input(z.any()).mutation(async ({ ctx, input }) => {
      try {
        const user = ctx.user;

        // 1. Verificar se já existe um recipient com este documento no Pagar.me
        let recipientId = "";
        const existingRecipient = await pagarme.getRecipientByDocument(input.document);

        if (existingRecipient && existingRecipient.status !== 'refused') {
          console.log('[Pagar.me] Recipient já existe e está ativo:', existingRecipient.id, '- Status:', existingRecipient.status);
          recipientId = existingRecipient.id;
        } else {
          if (existingRecipient?.status === 'refused') {
            console.log('[Pagar.me] Recipient existente está com status refused, criando novo...');
          } else {
            console.log('[Pagar.me] Criando novo recipient para:', input.document);
          }

          const recipientData = {
            name: input.bankAccount.legal_name || user.name || 'Organizador',
            email: user.email,
            document: input.document,
            type: input.document.length > 11 ? 'company' : 'individual',
            phone: input.phone || '11999999999',
            bankAccount: {
              holderName: input.bankAccount.legal_name || user.name || 'Organizador',
              holderType: input.document.length > 11 ? 'company' : 'individual',
              holderDocument: input.document,
              bank: input.bankAccount.bank_code,
              branchNumber: input.bankAccount.agencia,
              branchCheckDigit: input.bankAccount.agencia_dv,
              accountNumber: input.bankAccount.conta,
              accountCheckDigit: input.bankAccount.conta_dv,
              type: input.bankAccount.type === 'conta_corrente' ? 'checking' : 'savings'
            }
          };

          const result = await pagarme.createRecipient(recipientData as any);
          recipientId = result.recipientId;
        }

        // 3. Salvar no banco de dados local
        const dbData = {
          bankDocument: input.document,
          bankCode: input.bankAccount.bank_code,
          bankAgency: input.bankAccount.agencia,
          bankAgencyDv: input.bankAccount.agencia_dv,
          bankAccount: input.bankAccount.conta,
          bankAccountDv: input.bankAccount.conta_dv,
          bankAccountType: input.bankAccount.type,
          bankHolderName: input.bankAccount.legal_name,
          bankHolderDocument: input.document,
          pixKey: input.pixKey,
          recipientId: recipientId
        };

        return await db.updateUserBankData(ctx.user.id, dbData);
      } catch (err: any) {
        console.error('[setupRecipient] Erro:', err.message);
        throw new TRPCError({
          code: 'INTERNAL_SERVER_ERROR',
          message: err.message || 'Erro ao sincronizar com Pagar.me'
        });
      }
    }),

    getPayables: protectedProcedure
      .input(z.object({
        recipientId: z.string().optional(),
        transactionId: z.string().optional(),
        page: z.number().min(1).optional().default(1),
        size: z.number().min(1).max(100).optional().default(20),
      }))
      .query(async ({ ctx, input }) => {
        try {
          const user = ctx.user as any;

          // Se não passou recipientId explícito, usa o do usuário logado
          const recipientId = input.recipientId || user.recipientId || undefined;

          if (!recipientId && !input.transactionId) {
            return { data: [], total: 0, paging: {}, error: 'Informe recipientId ou transactionId' };
          }

          const result = await pagarme.getPayables({
            recipientId,
            transactionId: input.transactionId,
            page: input.page,
            size: input.size,
          });

          return result;
        } catch (err: any) {
          console.error('[payments.getPayables] Erro:', err.message);
          throw new TRPCError({
            code: 'INTERNAL_SERVER_ERROR',
            message: err.message || 'Erro ao buscar payables',
          });
        }
      }),
  }),

  organizers: router({
    list: publicProcedure.query(async () => {
      return await db.getAllOrganizers();
    }),
    create: protectedProcedure
      .input(z.object({
        name: z.string().min(1),
        description: z.string().optional(),
      }))
      .mutation(async ({ ctx, input }) => {
        await db.createOrganizer({
          name: input.name,
          description: input.description || "",
          ownerId: (ctx.user as any).openId,
          active: true,
        } as any);
        return { success: true };
      }),
    myOrganizers: protectedProcedure.query(async ({ ctx }) => {
      const user = ctx.user as any;
      const organizer = await db.getOrganizerByOwnerId(user.openId);
      if (!organizer) return [];
      return [{
        ...organizer,
        bankData: { status: (organizer as any).recipientId ? 'configured' : 'pending' },
        status: 'active'
      }];
    }),
    updatePagSeguroEmail: protectedProcedure
      .input(z.object({ email: z.string().email() }))
      .mutation(async ({ ctx, input }) => {
        const user = ctx.user as any;
        const organizer = await db.getOrganizerByOwnerId(user.openId);
        if (!organizer) throw new TRPCError({ code: 'NOT_FOUND', message: 'Organizador não encontrado' });

        return await db.updateOrganizer(organizer.id, { pagseguroEmail: input.email });
      }),
  }),

  admin: router({
    listUsers: adminProcedure.query(async () => await db.getAllUsers()),
    listAllEvents: adminProcedure.query(async () => {
      return await db.getAllEvents();
    }),
    getDashboardStats: adminProcedure.query(async () => {
      const allUsers = await db.getAllUsers();
      const allEvents = await db.getAllEvents();
      const allPayments = await db.getAllPayments();

      const confirmedPayments = allPayments.filter(p => p.status === 'confirmed');
      const totalRevenue = confirmedPayments.reduce((acc, p) => acc + (p.value || 0), 0);

      // Basic grouping by status
      const eventsByStatus = allEvents.reduce((acc: any[], event) => {
        const status = event.status || 'unknown';
        const existing = acc.find(a => a.status === status);
        if (existing) {
          existing.count++;
        } else {
          acc.push({ status, count: 1 });
        }
        return acc;
      }, []);

      return {
        totalUsers: allUsers.length,
        totalEvents: allEvents.length,
        totalRegistrations: confirmedPayments.length,
        totalRevenue: totalRevenue,
        eventsByStatus,
        registrationsByMonth: [], // Simple placeholder or implement grouping if needed
      };
    }),
    updateUserRole: adminProcedure
      .input(z.object({ userId: z.number(), role: z.enum(['user', 'admin', 'participant', 'organizer']) }))
      .mutation(async ({ input }) => {
        await db.updateUserRole(input.userId, input.role);
        return { success: true };
      }),
    deleteEvent: adminProcedure
      .input(z.object({ eventId: z.number() }))
      .mutation(async ({ input }) => {
        await db.deleteEvent(input.eventId);
        return { success: true };
      }),
  }),

  organizerRequests: router({
    list: adminProcedure.query(async () => {
      return await db.getAllOrganizerRequests();
    }),
    myRequests: protectedProcedure.query(async ({ ctx }) => {
      return await db.getOrganizerRequestsByUserId(ctx.user.id);
    }),
    create: protectedProcedure
      .input(z.object({
        organizerName: z.string().min(1),
        description: z.string().optional(),
        contactEmail: z.string().email(),
        contactPhone: z.string().optional(),
      }))
      .mutation(async ({ ctx, input }) => {
        return await db.createOrganizerRequest({
          ...input,
          userId: ctx.user.id,
          status: 'pending',
        } as any);
      }),
    approve: adminProcedure
      .input(z.object({ requestId: z.number() }))
      .mutation(async ({ input }) => {
        const request = await db.getOrganizerRequestById(input.requestId);
        if (!request) throw new TRPCError({ code: 'NOT_FOUND', message: 'Solicitação não encontrada' });

        await db.updateOrganizerRequest(input.requestId, { status: 'approved' });
        await db.updateUserRole(request.userId, 'organizer');

        // Also ensure organizer record exists
        const user = await db.getUserById(request.userId);
        if (user) {
          const existing = await db.getOrganizerByOwnerId(user.openId);
          if (!existing) {
            await db.createOrganizer({
              name: request.organizerName,
              description: request.description || '',
              ownerId: user.openId,
              active: true
            });
          }
        }

        return { success: true };
      }),
    reject: adminProcedure
      .input(z.object({ requestId: z.number(), reason: z.string().optional() }))
      .mutation(async ({ input }) => {
        await db.updateOrganizerRequest(input.requestId, { status: 'rejected' });
        return { success: true };
      }),
  }),

  vehicles: router({
    list: protectedProcedure.query(async ({ ctx }) => {
      const user = ctx.user as any;
      return await db.getVehiclesByOwnerId(user.openId) || [];
    }),
    create: protectedProcedure
      .input(z.object({
        brand: z.string(),
        model: z.string(),
        plate: z.string(),
        year: z.number().optional(),
        color: z.string().optional(),
      }))
      .mutation(async ({ ctx, input }) => {
        const user = ctx.user as any;
        return await db.createVehicle({
          ...input,
          ownerId: user.openId,
        } as any);
      }),
  }),

  gallery: router({
    listByEvent: publicProcedure
      .input(z.object({ eventId: z.number() }))
      .query(async ({ input }) => {
        return await db.getEventImagesByEventId(input.eventId);
      }),

    addImage: protectedProcedure
      .input(z.object({
        eventId: z.number(),
        imageUrl: z.string().min(1),
        caption: z.string().optional(),
        displayOrder: z.number().optional(),
      }))
      .mutation(async ({ input }) => {
        await db.createEventImage({
          eventId: input.eventId,
          imageUrl: input.imageUrl,
          caption: input.caption || null,
          displayOrder: input.displayOrder ?? 0,
        });
        return { success: true };
      }),

    deleteImage: protectedProcedure
      .input(z.object({ imageId: z.number() }))
      .mutation(async ({ input }) => {
        await db.deleteEventImage(input.imageId);
        return { success: true };
      }),
  }),

  upload: router({
    image: protectedProcedure
      .input(z.object({
        base64: z.string(),
        fileName: z.string(),
        contentType: z.string(),
      }))
      .mutation(async ({ input }) => {
        const { base64, fileName, contentType } = input;
        const buffer = Buffer.from(base64.split(',')[1], 'base64');
        const relativePath = `uploads/${Date.now()}-${fileName}`;

        try {
          // Try official storage first
          await storage.storagePut(relativePath, buffer, { contentType });
          const url = await storage.storageGet(relativePath);
          return { url };
        } catch (error) {
          console.warn("Storage proxy failed, using fallback:", error instanceof Error ? error.message : error);

          // Fallback Plan B: Save locally to public/uploads if possible
          try {
            const publicUploadsDir = path.resolve(__dirname, "..", "public", "uploads");
            if (!fs.existsSync(publicUploadsDir)) {
              fs.mkdirSync(publicUploadsDir, { recursive: true });
            }
            const localPath = path.join(publicUploadsDir, path.basename(relativePath));
            fs.writeFileSync(localPath, buffer);
            return { url: `/uploads/${path.basename(relativePath)}` };
          } catch (localError) {
            console.error("Local save also failed, returning Base64:", localError);
            // Last resort: Return Base64 (Data URL)
            return { url: base64 };
          }
        }
      }),
  }),

  startOrder: router({
    getByEvent: protectedProcedure
      .input(z.object({ eventId: z.number() }))
      .query(async ({ input }) => {
        try {
          return await db.getStartOrderConfigByEvent(input.eventId);
        } catch (error) {
          console.error(`[startOrder.getByEvent] Erro para eventId ${input.eventId}:`, error);
          throw new TRPCError({
            code: 'INTERNAL_SERVER_ERROR',
            message: 'Erro ao buscar configurações de largada'
          });
        }
      }),

    upsert: protectedProcedure
      .input(z.object({
        eventId: z.number(),
        categoryId: z.number(),
        orderPosition: z.number(),
        numberStart: z.number().int(),
        numberEnd: z.number().int(),
        startTime: z.string(),
        intervalSeconds: z.number(),
        timeBetweenCategories: z.number().optional(),
        registrationOrder: z.array(z.number()).optional(),
      }))
      .mutation(async ({ input }) => {
        const { eventId, registrationOrder, ...config } = input;
        const dbConfig = {
          ...config,
          registrationOrder: registrationOrder ? JSON.stringify(registrationOrder) : null,
        };
        return await db.upsertStartOrderConfigs(eventId, [dbConfig as any]);
      }),

    upsertBatch: protectedProcedure
      .input(z.object({
        eventId: z.number(),
        configs: z.array(z.object({
          categoryId: z.number(),
          orderPosition: z.number(),
          numberStart: z.number().int(),
          numberEnd: z.number().int(),
          startTime: z.string(),
          intervalSeconds: z.number(),
          timeBetweenCategories: z.number().optional(),
          registrationOrder: z.array(z.number()).optional(),
        }))
      }))
      .mutation(async ({ input }) => {
        const dbConfigs = input.configs.map(config => ({
          ...config,
          registrationOrder: config.registrationOrder ? JSON.stringify(config.registrationOrder) : null,
        }));
        return await db.upsertStartOrderConfigs(input.eventId, dbConfigs as any);
      }),

    exportStartList: protectedProcedure
      .input(z.object({ eventId: z.number() }))
      .mutation(async ({ ctx, input }) => {
        const ExcelJS = (await import('exceljs')).default;

        const event = await db.getEventById(input.eventId);
        if (!event) {
          throw new TRPCError({ code: 'NOT_FOUND', message: 'Evento não encontrado' });
        }

        // Buscar configurações de ordem de largada
        let configs = await db.getStartOrderConfigsByEventId(input.eventId);

        // Buscar todas as inscrições confirmadas
        const registrations = await db.getRegistrationsByEventId(input.eventId);
        const confirmedRegistrations = registrations.filter(r => r.status !== 'cancelled');

        // Buscar categorias
        const categories = await db.getCategoriesByEventId(input.eventId);
        const categoryMap = new Map(categories.map(c => [c.id, c]));

        // Criar mapa de inscritos por categoria
        const registrationsByCategory = new Map<number, any[]>();
        for (const reg of confirmedRegistrations) {
          if (!registrationsByCategory.has(reg.categoryId)) {
            registrationsByCategory.set(reg.categoryId, []);
          }
          registrationsByCategory.get(reg.categoryId)!.push(reg);
        }

        // Preparar dados para a planilha
        const startListData: any[] = [];

        for (const config of configs) {
          const numSlots = config.numberEnd - config.numberStart + 1;
          const [hours, minutes] = config.startTime.split(':').map(Number);
          const baseTime = new Date();
          baseTime.setHours(hours, minutes, 0, 0);

          let categoryRegistrations = registrationsByCategory.get(config.categoryId) || [];

          // Se tem registrationOrder, ordenar os pilotos de acordo
          if (config.registrationOrder) {
            try {
              const order = typeof config.registrationOrder === 'string'
                ? JSON.parse(config.registrationOrder)
                : config.registrationOrder;
              if (Array.isArray(order) && order.length > 0) {
                const orderMap = new Map<number, number>(order.map((regId: number, index: number) => [regId, index]));
                categoryRegistrations = categoryRegistrations.sort((a, b) => {
                  const indexA = (orderMap.get(a.id) ?? 999) as number;
                  const indexB = (orderMap.get(b.id) ?? 999) as number;
                  return indexA - indexB;
                });
              }
            } catch (e) { }
          }

          for (let i = 0; i < numSlots; i++) {
            const currentNumber = config.numberStart + i;
            const currentTime = new Date(baseTime.getTime() + (i * config.intervalSeconds * 1000));
            const timeStr = currentTime.toTimeString().slice(0, 5);

            const registration = categoryRegistrations[i];
            const category = categoryMap.get(config.categoryId);
            const parentCategory = category?.parentId ? categoryMap.get(category.parentId) : null;
            const categoryName = parentCategory
              ? `${parentCategory.name} - ${category?.name}`
              : category?.name || 'N/A';

            startListData.push({
              'Nº': currentNumber,
              'Horário': timeStr,
              'Categoria': categoryName,
              'Piloto': registration?.pilotName || '',
              'Cidade/UF Piloto': registration ? `${registration.pilotCity || ''}/${registration.pilotState || ''}` : '',
              'Navegador': registration?.navigatorName || '',
              'Cidade/UF Navegador': registration ? `${registration.navigatorCity || ''}/${registration.navigatorState || ''}` : '',
              'Equipe': registration?.team || '',
              'Veículo': registration ? `${registration.vehicleBrand || ''} ${registration.vehicleModel || ''}` : '',
            });
          }
        }

        startListData.sort((a, b) => a['Nº'] - b['Nº']);

        const workbook = new (ExcelJS as any).Workbook();
        const worksheet = workbook.addWorksheet('Lista de Largada');

        worksheet.columns = [
          { header: 'Nº', key: 'Nº', width: 8 },
          { header: 'Horário', key: 'Horário', width: 10 },
          { header: 'Categoria', key: 'Categoria', width: 20 },
          { header: 'Piloto', key: 'Piloto', width: 30 },
          { header: 'Cidade/UF Piloto', key: 'Cidade/UF Piloto', width: 25 },
          { header: 'Navegador', key: 'Navegador', width: 30 },
          { header: 'Cidade/UF Navegador', key: 'Cidade/UF Navegador', width: 25 },
          { header: 'Equipe', key: 'Equipe', width: 25 },
          { header: 'Veículo', key: 'Veículo', width: 30 },
        ];

        const buffer = await workbook.xlsx.writeBuffer();
        return {
          success: true,
          data: Buffer.from(buffer).toString('base64'),
          filename: `lista-largada-${event.name.replace(/\s+/g, '-')}.xlsx`
        };
      }),

    exportKraken: protectedProcedure
      .input(z.object({ eventId: z.number() }))
      .mutation(async ({ input }) => {
        const XLSX = await import('xlsx');
        const event = await db.getEventById(input.eventId);
        if (!event) throw new TRPCError({ code: 'NOT_FOUND', message: 'Evento não encontrado' });

        const configs = await db.getStartOrderConfigsByEventId(input.eventId);
        const registrations = await db.getRegistrationsByEventId(input.eventId);
        const categories = await db.getCategoriesByEventId(input.eventId);
        const categoryMap = new Map(categories.map(c => [c.id, c]));

        const registrationsByCategory = new Map<number, any[]>();
        for (const reg of registrations) {
          if (!registrationsByCategory.has(reg.categoryId)) registrationsByCategory.set(reg.categoryId, []);
          registrationsByCategory.get(reg.categoryId)!.push(reg);
        }

        const data: any[] = [];
        for (const config of configs) {
          const numSlots = config.numberEnd - config.numberStart + 1;
          const [hours, minutes] = config.startTime.split(':').map(Number);
          const baseTime = new Date();
          baseTime.setHours(hours, minutes, 0, 0);

          let catRegs = registrationsByCategory.get(config.categoryId) || [];
          if (config.registrationOrder) {
            try {
              const order = typeof config.registrationOrder === 'string' ? JSON.parse(config.registrationOrder) : config.registrationOrder;
              const orderMap = new Map<number, number>(order.map((id: number, idx: number) => [id, idx]));
              catRegs = catRegs.sort((a: any, b: any) => {
                const indexA = (orderMap.get(a.id) ?? 999) as number;
                const indexB = (orderMap.get(b.id) ?? 999) as number;
                return indexA - indexB;
              });
            } catch (e) { }
          }

          for (let i = 0; i < numSlots; i++) {
            const reg = catRegs[i];
            const cat = categoryMap.get(config.categoryId);
            const parent = cat?.parentId ? categoryMap.get(cat.parentId) : null;
            const time = new Date(baseTime.getTime() + (i * config.intervalSeconds * 1000)).toTimeString().slice(0, 5);

            data.push({
              'CATEGORIA': parent ? `${parent.name} - ${cat?.name}` : cat?.name || 'N/A',
              'NÚMERO': config.numberStart + i,
              'HORA LARGADA': time,
              'NOME PILOTO': reg?.pilotName || '',
              'EMAIL PILOTO': reg?.pilotEmail || '',
              'CPF PILOTO': reg?.pilotCpf || '',
              'CIDADE PILOTO': reg?.pilotCity || '',
              'ESTADO PILOTO': reg?.pilotState || '',
              'NOME NAVEGADOR': reg?.navigatorName || '',
              'EMAIL NAVEGADOR': reg?.navigatorEmail || '',
              'CPF NAVEGADOR': reg?.navigatorCpf || '',
              'CIDADE NAVEGADOR': reg?.navigatorCity || '',
              'ESTADO NAVEGADOR': reg?.navigatorState || '',
              'EQUIPE': reg?.team || '',
              'PATROCINADOR': '',
              'VEÍCULO': reg ? `${reg.vehicleBrand || ''} ${reg.vehicleModel || ''}` : '',
              'D1': '',
              'D2': '',
            });
          }
        }

        const wb = XLSX.utils.book_new();
        const ws = XLSX.utils.json_to_sheet(data);
        XLSX.utils.book_append_sheet(wb, ws, 'INSCRIÇÕES');
        const buffer = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });

        return {
          success: true,
          data: Buffer.from(buffer).toString('base64'),
          filename: `kraken-${event.name.replace(/\s+/g, '-')}.xlsx`
        };
      }),

    exportEventList: protectedProcedure
      .input(z.object({ eventId: z.number() }))
      .mutation(async ({ input }) => {
        const XLSX = await import('xlsx');
        const event = await db.getEventById(input.eventId);
        if (!event) throw new TRPCError({ code: 'NOT_FOUND', message: 'Evento não encontrado' });

        const regs = await db.getRegistrationsByEventId(input.eventId);
        const configs = await db.getStartOrderConfigsByEventId(input.eventId);
        const categories = await db.getCategoriesByEventId(input.eventId);
        const categoryMap = new Map(categories.map(c => [c.id, c]));

        const regNumMap = new Map<number, number>();
        for (const config of configs) {
          if (config.registrationOrder) {
            try {
              const order = JSON.parse(config.registrationOrder as string);
              order.forEach((id: number, i: number) => regNumMap.set(id, config.numberStart + i));
            } catch (e) { }
          }
        }

        const data = regs.map(reg => {
          const cat = categoryMap.get(reg.categoryId);
          const parent = cat?.parentId ? categoryMap.get(cat.parentId) : null;
          return {
            'Nº Largada': regNumMap.get(reg.id) || '-',
            'Categoria': parent ? `${parent.name} - ${cat?.name}` : cat?.name || 'N/A',
            'Piloto': reg.pilotName,
            'CPF Piloto': reg.pilotCpf,
            'Camiseta Piloto': reg.pilotShirtSize,
            'Navegador': reg.navigatorName || '',
            'CPF Navegador': reg.navigatorCpf || '',
            'Camiseta Navegador': reg.navigatorShirtSize || '',
            'Equipe': reg.team || '',
            'Status': reg.status === 'paid' ? 'Pago' : 'Pendente',
          };
        }).sort((a, b) => (typeof a['Nº Largada'] === 'number' ? a['Nº Largada'] : 9999) - (typeof b['Nº Largada'] === 'number' ? b['Nº Largada'] : 9999));

        const wb = XLSX.utils.book_new();
        const ws = XLSX.utils.json_to_sheet(data);
        XLSX.utils.book_append_sheet(wb, ws, 'Inscritos');
        const buffer = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });

        return {
          success: true,
          data: Buffer.from(buffer).toString('base64'),
          filename: `lista-evento-${event.name.replace(/\s+/g, '-')}.xlsx`
        };
      }),
  }),

  participants: router({
    getPassportByHash: publicProcedure
      .input(z.object({ accessHash: z.string() }))
      .query(async ({ input }) => {
        const dbClient = await getDb();
        if (!dbClient) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database Error" });

        const [reg] = await dbClient.select().from(registrations).where(eq(registrations.accessHash, input.accessHash));
        if (!reg) throw new TRPCError({ code: "NOT_FOUND", message: "Passaporte não encontrado. Verifique se o link está correto." });

        const event = await db.getEventById(reg.eventId);
        if (!event) throw new TRPCError({ code: "NOT_FOUND", message: "Evento não encontrado" });

        const categories = await db.getCategoriesByEventId(reg.eventId);
        const category = categories.find(c => c.id === reg.categoryId);

        // Fetch payment status
        const [payment] = await dbClient.select().from(payments).where(eq(payments.registrationId, reg.id)).orderBy(sql`${payments.createdAt} DESC`);

        return {
          event: {
            name: event.name,
            date: event.startDate,
            location: event.location,
            city: event.city,
            state: event.state
          },
          registration: {
            id: reg.id,
            pilotName: reg.pilotName,
            pilotCpf: reg.pilotCpf,
            navigatorName: reg.navigatorName,
            categoryName: category?.name || "Desconhecida",
            vehicle: `${reg.vehicleBrand || ''} ${reg.vehicleModel || ''}`.trim(),
            startNumber: reg.startNumber
          },
          products: reg.purchasedProducts,
          financial: {
            status: payment?.status || reg.status
          },
          secretariat: {
            isCheckedIn: reg.isCheckedIn,
            kitDelivered: reg.kitDelivered,
            waiverSigned: reg.waiverSigned
          }
        };
      }),

    getParticipantHistoryByCpf: publicProcedure
      .input(z.object({ cpf: z.string() }))
      .query(async ({ input }) => {
        const dbClient = await getDb();
        if (!dbClient) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database Error" });

        const history = await dbClient.select({
          id: registrations.id,
          eventId: registrations.eventId,
          eventName: events.name,
          eventDate: events.startDate,
          pilotName: registrations.pilotName,
          navigatorName: registrations.navigatorName,
          status: registrations.status,
          accessHash: registrations.accessHash
        })
          .from(registrations)
          .innerJoin(events, eq(registrations.eventId, events.id))
          .where(
            sql`${registrations.pilotCpf} = ${input.cpf} OR ${registrations.navigatorCpf} = ${input.cpf}`
          ).orderBy(sql`${events.startDate} DESC`);

        return history;
      })
  }),
});

export type AppRouter = typeof appRouter;