import { COOKIE_NAME } from "@shared/const";
import { getSessionCookieOptions } from "./_core/cookies";
import { systemRouter } from "./_core/systemRouter";
import { publicProcedure, protectedProcedure, router } from "./_core/trpc";
import { TRPCError } from '@trpc/server';
import * as fs from 'fs';
const LOG_FILE = '/tmp/setupRecipient.log';
import { z } from "zod";
import * as db from "./db";
import { notifyOwner } from "./_core/notification";
import { getDb } from "./db";
import { events } from "../drizzle/schema";
import { eq } from "drizzle-orm";
import { sendEmailNotification } from "./email-service";
import { newRegistrationTemplate } from "./email-templates";
import { ENV } from "./_core/env";
import { createOrder, createRecipient, createOrGetRecipient, getRecipientByDocument, checkRecipientStatus } from './pagarme';
import { validateBankData } from './bank-validation';

// Middleware para verificar role de admin
const adminProcedure = protectedProcedure.use(({ ctx, next }) => {
  if (ctx.user.role !== 'admin') {
    throw new TRPCError({ code: 'FORBIDDEN', message: 'Admin access required' });
  }
  return next({ ctx });
});

// Middleware para verificar role de organizer ou admin
  const organizerProcedure = protectedProcedure.use(({ ctx, next }) => {
    console.log('[organizerProcedure] Verificando role:', ctx.user.role, 'email:', ctx.user.email);
    if (ctx.user.role !== 'organizer' && ctx.user.role !== 'admin') {
      console.log('[organizerProcedure] BLOQUEADO! Role nao eh organizer ou admin');
      throw new TRPCError({ code: 'FORBIDDEN', message: 'You must be an organizer' });
    }
    console.log('[organizerProcedure] PERMITIDO! Role eh valido');
    return next({ ctx });
  });

// Middleware especial para setupRecipient: permite mesmo com role atrasada se recipientId for nulo
const setupRecipientProcedure = protectedProcedure.use(async ({ ctx, next }) => {
  fs.appendFileSync(LOG_FILE, `[${new Date().toISOString()}] MIDDLEWARE INICIADO\n`);
  fs.appendFileSync(LOG_FILE, `[${new Date().toISOString()}] User ID: ${ctx.user?.id}, Role: ${ctx.user?.role}, RecipientId: ${ctx.user?.recipientId}\n`);
  console.log('[setupRecipientProcedure] ===== MIDDLEWARE INICIADO =====');
  console.log('[setupRecipientProcedure] User ID:', ctx.user?.id);
  console.log('[setupRecipientProcedure] Role:', ctx.user?.role, 'Email:', ctx.user?.email, 'RecipientId:', ctx.user?.recipientId);
  
  // Se tem role válida, permitir
  if (ctx.user.role === 'organizer' || ctx.user.role === 'admin') {
    fs.appendFileSync(LOG_FILE, `[${new Date().toISOString()}] PERMITIDO! Role valida\n`);
    console.log('[setupRecipientProcedure] PERMITIDO! Role válida');
    return next({ ctx });
  }
  
  // Se role está atrasada MAS recipientId é nulo, permitir (exceção para primeira criação)
  if (!ctx.user.recipientId) {
    console.log('[setupRecipientProcedure] EXCEÇÃO APLICADA! Role atrasada mas recipientId é nulo - permitindo primeira criação');
    return next({ ctx });
  }
  
  // Caso contrário, bloquear
  console.log('[setupRecipientProcedure] BLOQUEADO! Role inválida e recipientId já existe');
  throw new TRPCError({ code: 'FORBIDDEN', message: 'You must be an organizer to manage recipients' });
});

export const appRouter = router({
  system: systemRouter,
  
  auth: router({
    me: publicProcedure
      .output(z.object({
        id: z.number(),
        openId: z.string(),
        name: z.string().nullable(),
        email: z.string().nullable(),
        phone: z.string().nullable(),
        loginMethod: z.string().nullable(),
        role: z.enum(['user', 'admin', 'participant', 'organizer']),
        recipientId: z.string().nullable(),
        pixKey: z.string().nullable(),
        bankDocument: z.string().nullable(),
        bankCode: z.string().nullable(),
        bankAgency: z.string().nullable(),
        bankAgencyDv: z.string().nullable(),
        bankAccount: z.string().nullable(),
        bankAccountDv: z.string().nullable(),
        bankAccountType: z.string().nullable(),
        bankHolderName: z.string().nullable(),
        bankHolderDocument: z.string().nullable(),
        createdAt: z.date(),
        updatedAt: z.date(),
        lastSignedIn: z.date(),
      }).nullable())
      .query(async ({ ctx }) => {
      if (!ctx.user) return null;
      
      console.log('[auth.me] ctx.user.openId:', ctx.user.openId);
      console.log('[auth.me] ctx.user.email:', ctx.user.email);
      
      // Buscar dados completos do usuário no banco (incluindo role e dados bancários)
      let fullUser = await db.getUserByOpenId(ctx.user.openId);
      console.log('[auth.me] fullUser por openId:', fullUser ? 'ENCONTRADO' : 'NÃO ENCONTRADO');
      if (fullUser) {
        console.log('[auth.me] bankAccountDv:', fullUser.bankAccountDv);
      }
      
      // Se não encontrou por openId, tentar por email como fallback
      if (!fullUser && ctx.user.email) {
        console.log('[auth.me] Tentando fallback por email:', ctx.user.email);
        fullUser = await db.getUserByEmail(ctx.user.email);
        console.log('[auth.me] fullUser por email:', fullUser ? 'ENCONTRADO' : 'NÃO ENCONTRADO');
        if (fullUser) {
          console.log('[auth.me] bankAccountDv (email):', fullUser.bankAccountDv);
        }
      }
      
      const result = fullUser || ctx.user;
      console.log('[auth.me] RETORNANDO COM OUTPUT SCHEMA:', {
        id: result.id,
        email: result.email,
        phone: result.phone, // NOVO: Log do telefone
        bankAccountDv: result.bankAccountDv,
        recipientId: result.recipientId,
      });
      console.log('[auth.me] Objeto completo do resultado:', JSON.stringify(result, null, 2));
      return result;
    }),
    logout: publicProcedure.mutation(({ ctx }) => {
      console.log('[auth.logout] Iniciando logout para usuario:', ctx.user?.openId);
      const cookieOptions = getSessionCookieOptions(ctx.req);
      console.log('[auth.logout] Limpando cookie com opcoes:', cookieOptions);
      ctx.res.clearCookie(COOKIE_NAME, { ...cookieOptions, maxAge: -1 });
      ctx.res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
      ctx.res.setHeader('Pragma', 'no-cache');
      ctx.res.setHeader('Expires', '0');
      console.log('[auth.logout] Cookie limpo com sucesso, headers de cache definidos');
      return { success: true } as const;
    }),
  }),

  // ==================== UPLOAD ====================
  upload: router({
    image: protectedProcedure
      .input(z.object({
        base64: z.string(),
        fileName: z.string(),
        contentType: z.string(),
      }))
      .mutation(async ({ input, ctx }) => {
        // Remove data URL prefix if present
        let base64Data = input.base64;
        if (base64Data.startsWith('data:')) {
          base64Data = base64Data.split(',')[1];
        }
        
        // Convert base64 to buffer
        const buffer = Buffer.from(base64Data, 'base64');
        
        // Upload to S3
        const { storagePut } = await import('./storage');
        const fileKey = `uploads/${ctx.user.openId}/${Date.now()}-${input.fileName}`;
        const result = await storagePut(fileKey, buffer, input.contentType);
        
        return { url: result.url };
      }),
  }),

  // ==================== VEHICLES ====================
  vehicles: router({
    list: protectedProcedure.query(async ({ ctx }) => {
      return await db.getVehiclesByOwnerId(ctx.user.openId); // ✅ Usa openId
    }),
    
    create: protectedProcedure
      .input(z.object({
        brand: z.string().min(1),
        model: z.string().min(1),
        plate: z.string().min(1),
        year: z.number().optional(),
        color: z.string().optional(),
      }))
      .mutation(async ({ ctx, input }) => {
        await db.createVehicle({
          ...input,
          ownerId: ctx.user.openId, // ✅ Usa openId
        });
        return { success: true };
      }),
    
    update: protectedProcedure
      .input(z.object({
        id: z.number(),
        brand: z.string().optional(),
        model: z.string().optional(),
        plate: z.string().optional(),
        year: z.number().optional(),
        color: z.string().optional(),
      }))
      .mutation(async ({ ctx, input }) => {
        const { id, ...data } = input;
        const vehicle = await db.getVehicleById(id);
        
        if (!vehicle || vehicle.ownerId !== ctx.user.openId) { // ✅ Usa openId
          throw new TRPCError({ code: 'FORBIDDEN', message: 'Not your vehicle' });
        }
        
        await db.updateVehicle(id, data);
        return { success: true };
      }),
    
    delete: protectedProcedure
      .input(z.object({ id: z.number() }))
      .mutation(async ({ ctx, input }) => {
        const vehicle = await db.getVehicleById(input.id);
        
        if (!vehicle || vehicle.ownerId !== ctx.user.openId) { // ✅ Usa openId
          throw new TRPCError({ code: 'FORBIDDEN', message: 'Not your vehicle' });
        }
        
        await db.deleteVehicle(input.id);
        return { success: true };
      }),
  }),

  // ==================== ORGANIZERS ====================
  organizers: router({
    list: publicProcedure.query(async () => {
      return await db.getAllOrganizers();
    }),
    
    myOrganizer: organizerProcedure.query(async ({ ctx }) => {
      return await db.getOrganizerByOwnerId(ctx.user.openId); // ✅ Usa openId
    }),
    
    myOrganizers: organizerProcedure.query(async ({ ctx }) => {
      const organizer = await db.getOrganizerByOwnerId(ctx.user.openId); // ✅ Usa openId
      return organizer ? [organizer] : [];
    }),
    
    updatePagSeguroEmail: organizerProcedure
      .input(z.object({
        organizerId: z.number(),
        pagseguroEmail: z.string().email(),
      }))
      .mutation(async ({ ctx, input }) => {
        // Verificar se organizador pertence ao usuário
        const organizer = await db.getOrganizerByOwnerId(ctx.user.openId); // ✅ Usa openId
        if (!organizer || organizer.id !== input.organizerId) {
          throw new Error('Organizer not found or unauthorized');
        }
        return await db.updateOrganizerPagSeguroEmail(input.organizerId, input.pagseguroEmail);
      }),
    
    create: protectedProcedure
      .input(z.object({
        name: z.string().min(1),
        description: z.string().optional(),
      }))
      .mutation(async ({ ctx, input }) => {
        await db.createOrganizer({
          ...input,
          ownerId: ctx.user.openId, // ✅ Usa openId do usuário
        });
        return { success: true };
      }),
    
    update: organizerProcedure
      .input(z.object({
        id: z.number(),
        name: z.string().optional(),
        description: z.string().optional(),
        active: z.boolean().optional(),
      }))
      .mutation(async ({ ctx, input }) => {
        const { id, ...data } = input;
        const organizer = await db.getOrganizerById(id);
        
        if (!organizer || (organizer.ownerId !== ctx.user.openId && ctx.user.role !== 'admin')) {
          throw new TRPCError({ code: 'FORBIDDEN', message: 'Not your organizer' });
        }
        
        await db.updateOrganizer(id, data);
        return { success: true };
      }),
    
    updateNotificationSettings: organizerProcedure
      .input(z.object({
        organizerId: z.number(),
        notifyOnNewRegistration: z.boolean().optional(),
        notifyOnPaymentConfirmed: z.boolean().optional(),
        notifyOnRegistrationCancelled: z.boolean().optional(),
        notificationEmail: z.string().email().optional().or(z.literal('')),
      }))
      .mutation(async ({ ctx, input }) => {
        const { organizerId, ...settings } = input;
        const organizer = await db.getOrganizerById(organizerId);
        
        if (!organizer || (organizer.ownerId !== ctx.user.openId && ctx.user.role !== 'admin')) {
          throw new TRPCError({ code: 'FORBIDDEN', message: 'Not your organizer' });
        }
        
        const dbConnection = await getDb();
        if (!dbConnection) {
          throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: 'Database connection failed' });
        }
        
        const { organizers: organizersTable } = require('../drizzle/schema');
        await dbConnection
          .update(organizersTable)
          .set({
            notifyOnNewRegistration: settings.notifyOnNewRegistration,
            notifyOnPaymentConfirmed: settings.notifyOnPaymentConfirmed,
            notifyOnRegistrationCancelled: settings.notifyOnRegistrationCancelled,
            notificationEmail: settings.notificationEmail || null,
          })
          .where(eq(organizersTable.id, organizerId));
        
        return { success: true };
      }),
  }),

  // ==================== ORGANIZER REQUESTS ====================
  organizerRequests: router({
    create: protectedProcedure
      .input(z.object({
        organizerName: z.string().min(1),
        description: z.string().optional(),
        contactEmail: z.string().email(),
        contactPhone: z.string().optional(),
      }))
      .mutation(async ({ ctx, input }) => {
        // Verificar se usuário já tem solicitação pendente
        const existingRequest = await db.getPendingRequestByUserId(ctx.user.id);
        if (existingRequest) {
          throw new TRPCError({ 
            code: 'BAD_REQUEST', 
            message: 'Você já possui uma solicitação pendente' 
          });
        }
        
        // Verificar se usuário já é organizador
        const existingOrganizer = await db.getOrganizerByOwnerId(ctx.user.openId); // ✅ Usa openId
        if (existingOrganizer) {
          throw new TRPCError({ 
            code: 'BAD_REQUEST', 
            message: 'Você já é um organizador' 
          });
        }
        
        await db.createOrganizerRequest({
          ...input,
          userId: ctx.user.id,
        });
        
        return { success: true };
      }),
    
    myRequests: protectedProcedure.query(async ({ ctx }) => {
      return await db.getOrganizerRequestsByUserId(ctx.user.id);
    }),
    
    list: adminProcedure.query(async () => {
      return await db.getAllOrganizerRequests();
    }),
    
    approve: adminProcedure
      .input(z.object({ requestId: z.number() }))
      .mutation(async ({ ctx, input }) => {
        const request = await db.getOrganizerRequestById(input.requestId);
        if (!request) {
          throw new TRPCError({ code: 'NOT_FOUND', message: 'Solicitação não encontrada' });
        }
        if (request.status !== 'pending') {
          throw new TRPCError({ code: 'BAD_REQUEST', message: 'Solicitação já foi processada' });
        }
        
        // Buscar usuário para pegar openId
        const user = await db.getUserById(request.userId);
        if (!user) {
          throw new TRPCError({ code: 'NOT_FOUND', message: 'Usuário não encontrado' });
        }
        
        // Criar organizador usando openId
        await db.createOrganizer({
          name: request.organizerName,
          description: request.description || '',
          ownerId: user.openId, // ✅ Usa openId do usuário
        });
        
        // Atualizar role do usuário para organizer usando openId
        await db.updateUserRoleByOpenId(user.openId, 'organizer');
        
        // Atualizar status da solicitação
        await db.updateOrganizerRequest(input.requestId, {
          status: 'approved',
          reviewedBy: ctx.user.id,
          reviewedAt: new Date(),
        });
        
        // Notificar admin
        await notifyOwner({
          title: 'Solicitação de Organizador Aprovada',
          content: `A solicitação de ${request.organizerName} (${request.contactEmail}) foi aprovada com sucesso.`,
        });
        
        return { success: true };
      }),
    
    reject: adminProcedure
      .input(z.object({ 
        requestId: z.number(),
        reason: z.string().min(1),
      }))
      .mutation(async ({ ctx, input }) => {
        const request = await db.getOrganizerRequestById(input.requestId);
        if (!request) {
          throw new TRPCError({ code: 'NOT_FOUND', message: 'Solicitação não encontrada' });
        }
        
        if (request.status !== 'pending') {
          throw new TRPCError({ code: 'BAD_REQUEST', message: 'Solicitação já foi processada' });
        }
        
        // Atualizar status da solicitação
        await db.updateOrganizerRequest(input.requestId, {
          status: 'rejected',
          reviewedBy: ctx.user.id,
          reviewedAt: new Date(),
          rejectionReason: input.reason,
        });
        
        // Notificar admin
        await notifyOwner({
          title: 'Solicitação de Organizador Rejeitada',
          content: `A solicitação de ${request.organizerName} (${request.contactEmail}) foi rejeitada. Motivo: ${input.reason}`,
        });
        
        return { success: true };
      }),
  }),

  // ==================== EVENTS ====================
  events: router({
    list: publicProcedure
      .input(z.object({
        showExternal: z.boolean().optional(),
      }).optional())
      .query(async ({ input }) => {
        // showExternal não está implementado ainda, retorna todos os eventos
        return await db.getAllEvents();
      }),
    
    listOpen: publicProcedure.query(async () => {
      return await db.getOpenEvents();
    }),
    
    listAll: publicProcedure.query(async () => {
      return await db.getAllOpenEvents();
    }),
    
    myEvents: organizerProcedure.query(async ({ ctx }) => {
      // ADMIN visualiza todos os eventos
      if (ctx.user.role === 'admin') {
        return await db.getAllEvents();
      }
      
      // ORGANIZADOR visualiza apenas seus eventos
      const organizer = await db.getOrganizerByOwnerId(ctx.user.openId);
      if (!organizer) {
        return [];
      }
      return await db.getEventsByOrganizerId(organizer.id);
    }),
    
    getById: publicProcedure
      .input(z.object({ id: z.number() }))
      .query(async ({ input }) => {
        return await db.getEventById(input.id);
      }),
    
    get: publicProcedure
      .input(z.object({ id: z.number() }))
      .query(async ({ input }) => {
        return await db.getEventById(input.id);
      }),
    
    create: organizerProcedure
      .input(z.object({
        name: z.string().min(1),
        description: z.string().optional(),
        startDate: z.string(),
        endDate: z.string(),
        location: z.string().min(1),
        city: z.string().min(1),
        state: z.string().length(2),
        isExternal: z.boolean().default(false),
        showInListing: z.boolean().default(true),
        imageUrl: z.string().optional(),
        includeShirts: z.boolean().default(true).optional(),
      }))
      .mutation(async ({ ctx, input }) => {
        let organizerId: number;
        if (ctx.user.role === 'admin') {
          organizerId = ctx.user.id;
        } else {
          const organizer = await db.getOrganizerByOwnerId(ctx.user.openId);
          if (!organizer) throw new TRPCError({ code: 'FORBIDDEN', message: 'You must be an organizer' });
          organizerId = organizer.id;
        }
        await db.createEvent({
          ...input,
          startDate: new Date(input.startDate),
          endDate: new Date(input.endDate),
          organizerId,
        });
        return { success: true };
      }),
    
    createExternal: organizerProcedure
      .input(z.object({
        name: z.string().min(1),
        description: z.string().optional(),
        startDate: z.string(),
        endDate: z.string(),
        location: z.string().min(1),
        city: z.string().min(1),
        state: z.string().length(2),
        showInListing: z.boolean().default(false),
        imageUrl: z.string().optional(),
        includeShirts: z.boolean().default(true).optional(),
      }))
      .mutation(async ({ ctx, input }) => {
        const organizer = await db.getOrganizerByOwnerId(ctx.user.openId); // ✅ Usa openId
        if (!organizer) {
          throw new TRPCError({ code: 'FORBIDDEN', message: 'You must be an organizer' });
        }
        
        const { ...eventData } = input;
        await db.createEvent({
          name: eventData.name,
          description: eventData.description,
          startDate: new Date(eventData.startDate),
          endDate: new Date(eventData.endDate),
          location: eventData.location,
          city: eventData.city,
          state: eventData.state,
          showInListing: eventData.showInListing,
          imageUrl: eventData.imageUrl,
          organizerId: organizer.id,
          isExternal: true,
          status: 'open',
        } as any);
        return { success: true };
      }),
    
    update: organizerProcedure
      .input(z.object({
        id: z.number(),
        name: z.string().optional(),
        description: z.string().optional(),
        startDate: z.string().optional(),
        endDate: z.string().optional(),
        location: z.string().optional(),
        city: z.string().optional(),
        state: z.string().optional(),
        status: z.enum(['open', 'closed', 'cancelled']).optional(),
        isExternal: z.boolean().optional(),
        showInListing: z.boolean().optional(),
        showRegistrations: z.boolean().optional(),
        imageUrl: z.string().optional(),
        termsText: z.string().nullable().optional(),
        eventDocuments: z.string().nullable().optional(),
        includeShirts: z.boolean().optional(),
      }))
      .mutation(async ({ ctx, input }) => {
        const { id, ...data } = input;
        const event = await db.getEventById(id);
        
        if (!event) {
          throw new TRPCError({ code: 'NOT_FOUND', message: 'Event not found' });
        }
        
        const organizer = await db.getOrganizerById(event.organizerId);
        if (!organizer || (organizer.ownerId !== ctx.user.openId && ctx.user.role !== 'admin')) {
          throw new TRPCError({ code: 'FORBIDDEN', message: 'Not your event' });
        }
        
        // Se evento for externo, permitir edição apenas de campos internos
        let updateData: any = { ...data };
        if (event.isExternal) {
          // Campos editáveis para eventos externos: apenas controles internos
          const allowedFields = ['startDate', 'endDate', 'status', 'showInListing', 'showRegistrations', 'termsText', 'eventDocuments'];
          updateData = Object.keys(updateData)
            .filter(key => allowedFields.includes(key))
            .reduce((obj, key) => ({ ...obj, [key]: updateData[key] }), {});
        }
        
        // Converter strings de data para Date
        if (updateData.startDate) updateData.startDate = new Date(updateData.startDate);
        if (updateData.endDate) updateData.endDate = new Date(updateData.endDate);
        
        await db.updateEvent(id, updateData);
        return { success: true };
      }),
    
    updateCancellationPolicy: organizerProcedure
      .input(z.object({
        id: z.number(),
        allow_cancel: z.boolean(),
        cancel_deadline_days: z.number().min(0),
        refund_enabled: z.boolean(),
      }))
      .mutation(async ({ ctx, input }) => {
        const event = await db.getEventById(input.id);
        
        if (!event) {
          throw new TRPCError({ code: 'NOT_FOUND', message: 'Event not found' });
        }
        
        const organizer = await db.getOrganizerById(event.organizerId);
        if (!organizer || (organizer.ownerId !== ctx.user.openId && ctx.user.role !== 'admin')) {
          throw new TRPCError({ code: 'FORBIDDEN', message: 'Not your event' });
        }
        
        await db.updateEventCancellationPolicy(input.id, {
          allow_cancel: input.allow_cancel,
          cancel_deadline_days: input.cancel_deadline_days,
          refund_enabled: input.refund_enabled,
        });
        
        return { success: true };
      }),
    
    delete: organizerProcedure
      .input(z.object({ id: z.number() }))
      .mutation(async ({ ctx, input }) => {
        const event = await db.getEventById(input.id);
        
        if (!event) {
          throw new TRPCError({ code: 'NOT_FOUND', message: 'Event not found' });
        }
        
        const organizer = await db.getOrganizerById(event.organizerId);
        if (!organizer || (organizer.ownerId !== ctx.user.openId && ctx.user.role !== 'admin')) {
          throw new TRPCError({ code: 'FORBIDDEN', message: 'Not your event' });
        }
        
        await db.deleteEvent(input.id);
        return { success: true };
      }),
    
    // Gallery endpoints
    addImage: organizerProcedure
      .input(z.object({
        eventId: z.number(),
        imageUrl: z.string(),
        caption: z.string().optional(),
        displayOrder: z.number().optional(),
      }))
      .mutation(async ({ ctx, input }) => {
        const event = await db.getEventById(input.eventId);
        if (!event) {
          throw new TRPCError({ code: 'NOT_FOUND', message: 'Event not found' });
        }
        
        const organizer = await db.getOrganizerById(event.organizerId);
        if (!organizer || (organizer.ownerId !== ctx.user.openId && ctx.user.role !== 'admin')) {
          throw new TRPCError({ code: 'FORBIDDEN', message: 'Not your event' });
        }
        
        await db.createEventImage({
          eventId: input.eventId,
          imageUrl: input.imageUrl,
          caption: input.caption,
          displayOrder: input.displayOrder || 0,
        });
        
        return { success: true };
      }),
    
    listImages: publicProcedure
      .input(z.object({ eventId: z.number() }))
      .query(async ({ input }) => {
        return await db.getEventImagesByEventId(input.eventId);
      }),
    
    deleteImage: organizerProcedure
      .input(z.object({ imageId: z.number() }))
      .mutation(async ({ ctx, input }) => {
        const image = await db.getEventImageById(input.imageId);
        if (!image) {
          throw new TRPCError({ code: 'NOT_FOUND', message: 'Image not found' });
        }
        
        const event = await db.getEventById(image.eventId);
        if (!event) {
          throw new TRPCError({ code: 'NOT_FOUND', message: 'Event not found' });
        }
        
        const organizer = await db.getOrganizerById(event.organizerId);
        if (!organizer || (organizer.ownerId !== ctx.user.openId && ctx.user.role !== 'admin')) {
          throw new TRPCError({ code: 'FORBIDDEN', message: 'Not your event' });
        }
        
        await db.deleteEventImage(input.imageId);
        return { success: true };
      }),
    
    updateImageOrder: organizerProcedure
      .input(z.object({
        imageId: z.number(),
        displayOrder: z.number(),
      }))
      .mutation(async ({ ctx, input }) => {
        const image = await db.getEventImageById(input.imageId);
        if (!image) {
          throw new TRPCError({ code: 'NOT_FOUND', message: 'Image not found' });
        }
        
        const event = await db.getEventById(image.eventId);
        if (!event) {
          throw new TRPCError({ code: 'NOT_FOUND', message: 'Event not found' });
        }
        
        const organizer = await db.getOrganizerById(event.organizerId);
        if (!organizer || (organizer.ownerId !== ctx.user.openId && ctx.user.role !== 'admin')) {
          throw new TRPCError({ code: 'FORBIDDEN', message: 'Not your event' });
        }
        
        await db.updateEventImageOrder(input.imageId, input.displayOrder);
        return { success: true };
      }),
  }),

  // ==================== CATEGORIES ====================
  categories: router({
    listByEvent: publicProcedure
      .input(z.object({ eventId: z.number() }))
      .query(async ({ input }) => {
        return await db.getCategoriesByEventId(input.eventId);
      }),
    
    create: organizerProcedure
      .input(z.object({
        eventId: z.number(),
        name: z.string().min(1),
        description: z.string().optional(),
        price: z.number().optional(),
        slots: z.number().optional(),
        parentId: z.number().optional(),
      }))
      .mutation(async ({ ctx, input }) => {
        // Validação 1: Verificar se evento existe
        const event = await db.getEventById(input.eventId);
        if (!event) {
          throw new TRPCError({ 
            code: 'NOT_FOUND', 
            message: 'Evento não encontrado. Verifique se o ID do evento está correto.' 
          });
        }
        
        // Validação 2: Verificar permissão do organizador
        const organizer = await db.getOrganizerById(event.organizerId);
        if (!organizer || (organizer.ownerId !== ctx.user.openId && ctx.user.role !== 'admin')) {
          throw new TRPCError({ 
            code: 'FORBIDDEN', 
            message: 'Você não tem permissão para criar categorias neste evento.' 
          });
        }
        
        // Validação 3: Verificar se parentId existe (quando fornecido)
        if (input.parentId) {
          const parentCategory = await db.getCategoryById(input.parentId);
          if (!parentCategory) {
            throw new TRPCError({ 
              code: 'NOT_FOUND', 
              message: 'Categoria pai não encontrada. Verifique se o ID da categoria pai está correto.' 
            });
          }
          // Validar se categoria pai pertence ao mesmo evento
          if (parentCategory.eventId !== input.eventId) {
            throw new TRPCError({ 
              code: 'BAD_REQUEST', 
              message: 'Categoria pai deve pertencer ao mesmo evento.' 
            });
          }
        }
        
        // Validação 4: Verificar duplicação de nome no mesmo evento
        const existingCategories = await db.getCategoriesByEventId(input.eventId);
        const duplicateName = existingCategories.find(
          cat => cat.name.toLowerCase() === input.name.toLowerCase() && cat.parentId === input.parentId
        );
        if (duplicateName) {
          throw new TRPCError({ 
            code: 'CONFLICT', 
            message: `Já existe uma categoria com o nome "${input.name}" neste evento.` 
          });
        }
        
        const result = await db.createCategory(input);
        return { success: true, insertId: result.insertId };
      }),
    
    update: organizerProcedure
      .input(z.object({
        id: z.number(),
        name: z.string().optional(),
        description: z.string().optional(),
        price: z.number().optional(),
        slots: z.number().optional(),
      }))
      .mutation(async ({ ctx, input }) => {
        const { id, ...data } = input;
        const category = await db.getCategoryById(id);
        
        if (!category) {
          throw new TRPCError({ code: 'NOT_FOUND', message: 'Category not found' });
        }
        
        const event = await db.getEventById(category.eventId);
        if (!event) {
          throw new TRPCError({ code: 'NOT_FOUND', message: 'Event not found' });
        }
        
        const organizer = await db.getOrganizerById(event.organizerId);
        if (!organizer || (organizer.ownerId !== ctx.user.openId && ctx.user.role !== 'admin')) {
          throw new TRPCError({ code: 'FORBIDDEN', message: 'Not your event' });
        }
        
        await db.updateCategory(id, data);
        return { success: true };
      }),
    
    delete: organizerProcedure
      .input(z.object({ id: z.number() }))
      .mutation(async ({ ctx, input }) => {
        const category = await db.getCategoryById(input.id);
        
        if (!category) {
          throw new TRPCError({ code: 'NOT_FOUND', message: 'Category not found' });
        }
        
        const event = await db.getEventById(category.eventId);
        if (!event) {
          throw new TRPCError({ code: 'NOT_FOUND', message: 'Event not found' });
        }
        
        const organizer = await db.getOrganizerById(event.organizerId);
        if (!organizer || (organizer.ownerId !== ctx.user.openId && ctx.user.role !== 'admin')) {
          throw new TRPCError({ code: 'FORBIDDEN', message: 'Not your event' });
        }
        
        await db.deleteCategory(input.id);
        return { success: true };
      }),
  }),

  // ==================== REGISTRATIONS ====================
  registrations: router({
    myRegistrations: protectedProcedure.query(async ({ ctx }) => {
      return await db.getRegistrationsByUserId(ctx.user.id);
    }),
    
    getLastRegistration: protectedProcedure.query(async ({ ctx }) => {
      const registrations = await db.getRegistrationsByUserId(ctx.user.id);
      // Retorna a inscrição mais recente (primeira da lista, já que está ordenada por createdAt DESC)
      return registrations.length > 0 ? registrations[0] : null;
    }),
    
    updateMyRegistration: protectedProcedure
      .input(z.object({
        registrationId: z.number(),
        pilotName: z.string().min(1),
        pilotEmail: z.string().email(),
        pilotPhone: z.string().min(1),
        pilotCPF: z.string().min(1),
        pilotBirthDate: z.string(),
        pilotCity: z.string().optional(),
        pilotState: z.string().min(2).max(2).optional(),
        pilotShirtSize: z.enum(['pp', 'p', 'm', 'g', 'gg', 'g1', 'g2', 'g3', 'g4', 'infantil']),
        navigatorName: z.string().optional(),
        navigatorEmail: z.string().optional(),
        navigatorPhone: z.string().optional(),
        navigatorCPF: z.string().optional(),
        navigatorBirthDate: z.string().optional(),
        navigatorCity: z.string().optional(),
        navigatorState: z.string().min(2).max(2).optional(),
        navigatorShirtSize: z.enum(['pp', 'p', 'm', 'g', 'gg', 'g1', 'g2', 'g3', 'g4', 'infantil']).optional(),
        vehicleBrand: z.string().optional(),
        vehicleModel: z.string().optional(),
        vehicleYear: z.string().optional(),
        vehicleColor: z.string().optional(),
        vehiclePlate: z.string().optional(),
      }))
      .mutation(async ({ ctx, input }) => {
        const { registrationId, ...updateData } = input;
        
        // Verificar se inscrição pertence ao usuário
        const registration = await db.getRegistrationById(registrationId);
        if (!registration || registration.userId !== ctx.user.id) {
          throw new TRPCError({ code: 'FORBIDDEN', message: 'Inscrição não encontrada' });
        }
        
        // Verificar se inscrição está cancelada
        if (registration.status === 'cancelled') {
          throw new TRPCError({ code: 'BAD_REQUEST', message: 'Não é possível editar inscrição cancelada' });
        }
        
        // Buscar evento para verificar data
        const event = await db.getEventById(registration.eventId);
        if (!event) {
          throw new TRPCError({ code: 'NOT_FOUND', message: 'Evento não encontrado' });
        }
        
        // Verificar se ainda é possível editar (até 1 dia antes do evento)
        const eventDate = new Date(event.startDate);
        const oneDayBefore = new Date(eventDate);
        oneDayBefore.setDate(oneDayBefore.getDate() - 1);
        
        const now = new Date();
        if (now > oneDayBefore) {
          throw new TRPCError({ 
            code: 'BAD_REQUEST', 
            message: 'Não é mais possível editar esta inscrição (prazo: até 1 dia antes do evento)' 
          });
        }
        
        // Validação: Se inscrição está paga, bloquear edição de campos críticos
        if (registration.status === 'paid') {
          const criticalFields = ['pilotName', 'pilotEmail', 'pilotCPF', 'pilotBirthDate', 
                                   'navigatorName', 'navigatorEmail', 'navigatorCPF', 'navigatorBirthDate'];
          
          const attemptedCriticalChanges = criticalFields.filter(field => {
            const oldValue = (registration as any)[field];
            const newValue = (updateData as any)[field];
            return oldValue !== newValue && newValue !== undefined;
          });
          
          if (attemptedCriticalChanges.length > 0) {
            throw new TRPCError({ 
              code: 'BAD_REQUEST', 
              message: 'Inscrição confirmada (paga). Apenas telefone, tamanho de camisa e informações do veículo podem ser alterados. Para alterar dados pessoais, entre em contato com o organizador.' 
            });
          }
        }
        
        // Registrar alterações no histórico
        const changes: Array<{ field: string; oldValue: string; newValue: string }> = [];
        
        // Comparar campos e registrar mudanças
        const fieldsToCompare: Array<{ key: keyof typeof updateData; label: string }> = [
          { key: 'pilotName', label: 'Nome do Piloto' },
          { key: 'pilotEmail', label: 'Email do Piloto' },
          { key: 'pilotPhone', label: 'Telefone do Piloto' },
          { key: 'pilotCPF', label: 'CPF do Piloto' },
          { key: 'pilotBirthDate', label: 'Data de Nascimento do Piloto' },
          { key: 'pilotShirtSize', label: 'Tamanho Camiseta Piloto' },
          { key: 'navigatorName', label: 'Nome do Navegador' },
          { key: 'navigatorEmail', label: 'Email do Navegador' },
          { key: 'navigatorPhone', label: 'Telefone do Navegador' },
          { key: 'navigatorCPF', label: 'CPF do Navegador' },
          { key: 'navigatorBirthDate', label: 'Data de Nascimento do Navegador' },
          { key: 'navigatorShirtSize', label: 'Tamanho Camiseta Navegador' },
          { key: 'vehicleBrand', label: 'Marca do Veículo' },
          { key: 'vehicleModel', label: 'Modelo do Veículo' },
          { key: 'vehicleYear', label: 'Ano do Veículo' },
          { key: 'vehicleColor', label: 'Cor do Veículo' },
          { key: 'vehiclePlate', label: 'Placa do Veículo' },
        ];
        
        for (const { key, label } of fieldsToCompare) {
          const oldValue = (registration as any)[key];
          const newValue = updateData[key];
          
          if (oldValue !== newValue) {
            changes.push({
              field: label,
              oldValue: oldValue || '',
              newValue: newValue || '',
            });
          }
        }
        
        // Salvar histórico
        for (const change of changes) {
          await db.createRegistrationHistory({
            registrationId,
            changedBy: ctx.user.id,
            fieldName: change.field,
            oldValue: change.oldValue,
            newValue: change.newValue,
          });
        }
        
        // Atualizar inscrição
        await db.updateRegistration(registrationId, updateData as any);
        
        return { success: true };
      }),
    
    listByEvent: publicProcedure
      .input(z.object({ eventId: z.number() }))
      .query(async ({ input }) => {
        const event = await db.getEventById(input.eventId);
        if (!event) {
          throw new TRPCError({ code: 'NOT_FOUND', message: 'Event not found' });
        }
        
        return await db.getRegistrationsByEventId(input.eventId);
      }),
    
    getStatistics: publicProcedure
      .input(z.object({ eventId: z.number() }))
      .query(async ({ input }) => {
        const event = await db.getEventById(input.eventId);
        if (!event) {
          throw new TRPCError({ code: 'NOT_FOUND', message: 'Event not found' });
        }
        
        return await db.getRegistrationStatistics(input.eventId);
      }),
    
    exportToExcel: protectedProcedure
      .input(z.object({ eventId: z.number() }))
      .query(async ({ ctx, input }) => {
        const event = await db.getEventById(input.eventId);
        if (!event) {
          throw new TRPCError({ code: 'NOT_FOUND', message: 'Event not found' });
        }
        
        // Admin pode ver qualquer evento, organizador só pode ver seus eventos
        if (ctx.user.role !== 'admin') {
          const organizer = await db.getOrganizerById(event.organizerId);
          if (!organizer || organizer.ownerId !== ctx.user.openId) {
            throw new TRPCError({ code: 'FORBIDDEN', message: 'Not your event' });
          }
        }
        
        const registrations = await db.getRegistrationsByEventId(input.eventId);
        
        // Importar xlsx dinamicamente
        const XLSX = await import('xlsx');
        
        // Preparar dados para exportação
        const data = registrations.map((reg: any) => ({
          'Nome do Piloto': reg.pilotName,
          'Idade do Piloto': reg.pilotAge || '',
          'Email do Piloto': reg.pilotEmail,
          'CPF do Piloto': reg.pilotCpf,
          'Cidade do Piloto': reg.pilotCity,
          'Estado do Piloto': reg.pilotState,
          'Tamanho Camiseta Piloto': reg.pilotShirtSize,
          'Nome do Navegador': reg.navigatorName || '',
          'Idade do Navegador': reg.navigatorAge || '',
          'Email do Navegador': reg.navigatorEmail || '',
          'CPF do Navegador': reg.navigatorCpf || '',
          'Cidade do Navegador': reg.navigatorCity || '',
          'Estado do Navegador': reg.navigatorState || '',
          'Tamanho Camiseta Navegador': reg.navigatorShirtSize || '',
          'Categoria': reg.categoryName,
          'Equipe': reg.team || '',
          'Marca do Veículo': reg.vehicleBrand || '',
          'Modelo do Veículo': reg.vehicleModel || '',
          'Status': reg.status === 'paid' ? 'Confirmado' : reg.status === 'pending' ? 'Pendente' : 'Cancelado',
          'Valor': reg.categoryPrice || 0,
          'Método de Pagamento': reg.paymentMethod || '',
          'Status do Pagamento': reg.paymentStatus || '',
          'Data de Inscrição': new Date(reg.createdAt).toLocaleDateString('pt-BR'),
        }));
        
        // Criar workbook e worksheet
        const wb = XLSX.utils.book_new();
        const ws = XLSX.utils.json_to_sheet(data);
        
        // Ajustar largura das colunas
        const colWidths = [
          { wch: 30 }, // Nome do Piloto
          { wch: 8 },  // Idade do Piloto
          { wch: 30 }, // Email do Piloto
          { wch: 15 }, // CPF do Piloto
          { wch: 20 }, // Cidade do Piloto
          { wch: 8 },  // Estado do Piloto
          { wch: 20 }, // Tamanho Camiseta Piloto
          { wch: 30 }, // Nome do Navegador
          { wch: 8 },  // Idade do Navegador
          { wch: 30 }, // Email do Navegador
          { wch: 15 }, // CPF do Navegador
          { wch: 20 }, // Cidade do Navegador
          { wch: 8 },  // Estado do Navegador
          { wch: 20 }, // Tamanho Camiseta Navegador
          { wch: 20 }, // Categoria
          { wch: 20 }, // Equipe
          { wch: 20 }, // Marca do Veículo
          { wch: 20 }, // Modelo do Veículo
          { wch: 12 }, // Status
          { wch: 12 }, // Valor
          { wch: 20 }, // Método de Pagamento
          { wch: 20 }, // Status do Pagamento
          { wch: 15 }, // Data de Inscrição
        ];
        ws['!cols'] = colWidths;
        
        XLSX.utils.book_append_sheet(wb, ws, 'Inscrições');
        
        // Gerar buffer do arquivo Excel
        const excelBuffer = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });
        
        // Converter para base64 para enviar ao frontend
        const base64 = excelBuffer.toString('base64');
        
        return {
          filename: `Inscritos-${event.name.replace(/\s+/g, '')}.xlsx`,
          data: base64,
        };
      }),
    
    exportKraken: organizerProcedure
      .input(z.object({ eventId: z.number() }))
      .query(async ({ ctx, input }) => {
        const event = await db.getEventById(input.eventId);
        if (!event) {
          throw new TRPCError({ code: 'NOT_FOUND', message: 'Event not found' });
        }
        
        const organizer = await db.getOrganizerById(event.organizerId);
        if (!organizer || (organizer.ownerId !== ctx.user.openId && ctx.user.role !== 'admin')) {
          throw new TRPCError({ code: 'FORBIDDEN', message: 'Not your event' });
        }
        
        // Validação 1: Verificar se evento está ativo
        if (event.status === 'cancelled') {
          throw new TRPCError({ 
            code: 'BAD_REQUEST', 
            message: 'Não é possível exportar planilha de evento cancelado.' 
          });
        }
        
        // Validação 2: Verificar se existem categorias no evento
        const categories = await db.getCategoriesByEventId(input.eventId);
        if (categories.length === 0) {
          throw new TRPCError({ 
            code: 'BAD_REQUEST', 
            message: 'Não é possível exportar planilha. O evento não possui categorias cadastradas.' 
          });
        }
        
        // Validação 3: Verificar se existem inscrições confirmadas
        const registrations = await db.getRegistrationsByEventId(input.eventId);
        const confirmedRegistrations = registrations.filter((reg: any) => reg.paymentStatus === 'paid');
        
        if (confirmedRegistrations.length === 0) {
          throw new TRPCError({ 
            code: 'BAD_REQUEST', 
            message: 'Não é possível exportar planilha. O evento não possui inscrições confirmadas (pagas).' 
          });
        }
        
        // Importar xlsx dinamicamente
        const XLSX = await import('xlsx');
        
        // Preparar dados no formato Kraken (18 colunas)
        const data = registrations.map((reg: any) => ({
          'CATEGORIA': reg.categoryName || '',
          'NÚMERO': reg.startNumber || '',
          'HORA LARGADA': reg.startTime || '',
          'NOME PILOTO': reg.pilotName || '',
          'EMAIL PILOTO': reg.pilotEmail || '',
          'CPF PILOTO': reg.pilotCpf || '',
          'CIDADE PILOTO': reg.pilotCity || '',
          'ESTADO PILOTO': reg.pilotState || '',
          'NOME NAVEGADOR': reg.navigatorName || '',
          'EMAIL NAVEGADOR': reg.navigatorEmail || '',
          'CPF NAVEGADOR': reg.navigatorCpf || '',
          'CIDADE NAVEGADOR': reg.navigatorCity || '',
          'ESTADO NAVEGADOR': reg.navigatorState || '',
          'EQUIPE': reg.team || '',
          'PATROCINADOR': '', // Não temos
          'VEÍCULO': reg.vehicleBrand && reg.vehicleModel ? `${reg.vehicleBrand} ${reg.vehicleModel}` : '',
          'D1': '', // Não sabemos o que é
          'D2': '', // Não sabemos o que é
        }));
        
        // Criar workbook e worksheet
        const wb = XLSX.utils.book_new();
        const ws = XLSX.utils.json_to_sheet(data);
        
        // Ajustar largura das colunas (formato Kraken)
        const colWidths = [
          { wch: 18 }, // CATEGORIA
          { wch: 10 }, // NÚMERO
          { wch: 15 }, // HORA LARGADA
          { wch: 30 }, // NOME PILOTO
          { wch: 30 }, // EMAIL PILOTO
          { wch: 15 }, // CPF PILOTO
          { wch: 20 }, // CIDADE PILOTO
          { wch: 8 },  // ESTADO PILOTO
          { wch: 30 }, // NOME NAVEGADOR
          { wch: 30 }, // EMAIL NAVEGADOR
          { wch: 15 }, // CPF NAVEGADOR
          { wch: 20 }, // CIDADE NAVEGADOR
          { wch: 8 },  // ESTADO NAVEGADOR
          { wch: 20 }, // EQUIPE
          { wch: 20 }, // PATROCINADOR
          { wch: 25 }, // VEÍCULO
          { wch: 10 }, // D1
          { wch: 10 }, // D2
        ];
        ws['!cols'] = colWidths;
        
        XLSX.utils.book_append_sheet(wb, ws, 'INSCRIÇÕES');
        
        // Gerar buffer do arquivo Excel
        const excelBuffer = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });
        
        // Converter para base64 para enviar ao frontend
        const base64 = excelBuffer.toString('base64');
        
        return {
          filename: `Inscritos-${event.name.replace(/\s+/g, '')}.xlsx`,
          data: base64,
        };
      }),
    
    getHistory: organizerProcedure
      .input(z.object({ registrationId: z.number() }))
      .query(async ({ ctx, input }) => {
        // Verificar se inscrição existe e se organizador tem permissão
        const registration = await db.getRegistrationById(input.registrationId);
        if (!registration) {
          throw new TRPCError({ code: 'NOT_FOUND', message: 'Inscrição não encontrada' });
        }
        
        const event = await db.getEventById(registration.eventId);
        if (!event) {
          throw new TRPCError({ code: 'NOT_FOUND', message: 'Evento não encontrado' });
        }
        
        const organizer = await db.getOrganizerById(event.organizerId);
        if (!organizer || (organizer.ownerId !== ctx.user.openId && ctx.user.role !== 'admin')) {
          throw new TRPCError({ code: 'FORBIDDEN', message: 'Sem permissão para visualizar histórico' });
        }
        
        return await db.getRegistrationHistory(input.registrationId);
      }),
    
    updateStartInfo: organizerProcedure
      .input(z.object({
        registrationId: z.number(),
        startNumber: z.number().optional(),
        startTime: z.string().optional(),
      }))
      .mutation(async ({ ctx, input }) => {
        // Verificar se inscrição existe e se organizador tem permissão
        const registration = await db.getRegistrationById(input.registrationId);
        if (!registration) {
          throw new TRPCError({ code: 'NOT_FOUND', message: 'Inscrição não encontrada' });
        }
        
        const event = await db.getEventById(registration.eventId);
        if (!event) {
          throw new TRPCError({ code: 'NOT_FOUND', message: 'Evento não encontrado' });
        }
        
        const organizer = await db.getOrganizerById(event.organizerId);
        if (!organizer || (organizer.ownerId !== ctx.user.openId && ctx.user.role !== 'admin')) {
          throw new TRPCError({ code: 'FORBIDDEN', message: 'Sem permissão para atualizar dados de largada' });
        }
        
        // Atualizar dados de largada
        await db.updateRegistrationStartInfo(
          input.registrationId,
          input.startNumber,
          input.startTime
        );
        
        return { success: true };
      }),
    
    // TEMPORARIAMENTE DESABILITADO - AGUARDANDO IMPLEMENTAÇÃO DAS FUNÇÕES NO DB
    /* checkIn: organizerProcedure
      .input(z.object({ qrCode: z.string() }))
      .mutation(async ({ ctx, input }) => {
        // Buscar inscrição pelo QR Code
        const registration = await db.getRegistrationByQrCode(input.qrCode);
        if (!registration) {
          throw new TRPCError({ code: 'NOT_FOUND', message: 'Inscrição não encontrada' });
        }
        
        // Verificar se organizador tem permissão
        const event = await db.getEventById(registration.eventId);
        if (!event) {
          throw new TRPCError({ code: 'NOT_FOUND', message: 'Evento não encontrado' });
        }
        
        const organizer = await db.getOrganizerById(event.organizerId);
        if (!organizer || (organizer.ownerId !== ctx.user.openId && ctx.user.role !== 'admin')) {
          throw new TRPCError({ code: 'FORBIDDEN', message: 'Sem permissão para fazer check-in' });
        }
        
        // Verificar se pagamento foi confirmado
        if (registration.status !== 'paid') {
          throw new TRPCError({ 
            code: 'BAD_REQUEST', 
            message: 'Check-in não permitido: pagamento não confirmado' 
          });
        }
        
        // Verificar se já fez check-in
        if ((registration as any).checkedInAt) {
          throw new TRPCError({ 
            code: 'BAD_REQUEST', 
            message: 'Check-in já realizado anteriormente' 
          });
        }
        
        // Registrar check-in
        await db.updateRegistrationCheckIn(registration.id);
        
        return { 
          success: true,
          registration: {
            pilotName: registration.pilotName,
            category: (registration as any).categoryName,
          }
        };
      }), */
    
    cancelMyRegistration: protectedProcedure
      .input(z.object({ registrationId: z.number() }))
      .mutation(async ({ ctx, input }) => {
        const registration = await db.getRegistrationById(input.registrationId);
        if (!registration || registration.userId !== ctx.user.id) {
          throw new TRPCError({ code: 'FORBIDDEN', message: 'Inscricao nao encontrada' });
        }
        const eligibility = await db.checkCancellationEligibility(input.registrationId);
        if (!eligibility.canCancel) {
          throw new TRPCError({ code: 'BAD_REQUEST', message: eligibility.reason });
        }
        const result = await db.cancelRegistration(input.registrationId);
        return {
          success: true,
          cancelled: result.cancelled,
          refundProcessed: result.refundProcessed,
          refundValue: (result as any).refundValue,
        };
      }),
    
    checkCancellationEligibility: protectedProcedure
      .input(z.object({ registrationId: z.number() }))
      .query(async ({ ctx, input }) => {
        const registration = await db.getRegistrationById(input.registrationId);
        if (!registration || registration.userId !== ctx.user.id) {
          throw new TRPCError({ code: 'FORBIDDEN', message: 'Inscricao nao encontrada' });
        }
        return await db.checkCancellationEligibility(input.registrationId);
      }),
    
    create: protectedProcedure
      .input(z.object({
        eventId: z.number(),
        categoryId: z.number(),
        vehicleId: z.number().optional(),
        vehicleBrand: z.string().optional(),
        vehicleModel: z.string().optional(),
        pilotName: z.string().min(1),
        pilotEmail: z.string().email(),
        pilotCpf: z.string().length(14),
        pilotAge: z.number().optional(),
        pilotBirthDate: z.string().optional(),
        pilotCity: z.string().min(1),
        pilotState: z.string().min(2).max(2),
        phone: z.string().min(10),
        navigatorName: z.string().optional(),
        navigatorEmail: z.string().email().optional().or(z.literal('')),
        navigatorCpf: z.string().optional(),
        navigatorPhone: z.string().optional(),
        navigatorAge: z.number().optional(),
        navigatorBirthDate: z.string().optional(),
        navigatorCity: z.string().optional(),
        navigatorState: z.string().min(2).max(2).optional(),
        team: z.string().optional(),
        vehicleInfo: z.string().optional(),
        pilotShirtSize: z.enum(["pp", "p", "m", "g", "gg", "g1", "g2", "g3", "g4", "infantil"]),
        navigatorShirtSize: z.enum(["pp", "p", "m", "g", "gg", "g1", "g2", "g3", "g4", "infantil"]).optional(),
        notes: z.string().optional(),
      }))
      .mutation(async ({ ctx, input }) => {
        const event = await db.getEventById(input.eventId);
        if (!event || event.status !== 'open') {
          throw new TRPCError({ code: 'BAD_REQUEST', message: 'Event not available for registration' });
        }
        
        const category = await db.getCategoryById(input.categoryId);
        if (!category) {
          throw new TRPCError({ code: 'NOT_FOUND', message: 'Category not found' });
        }
        
        // Verificar vagas disponíveis
        if (category.slots) {
          const stats = await db.getRegistrationStatistics(input.eventId);
          const categoryStat = stats.byCategory.find(c => c.categoryId === input.categoryId);
          if (categoryStat && categoryStat.availableSlots <= 0) {
            throw new TRPCError({ code: 'BAD_REQUEST', message: 'No slots available for this category' });
          }
        }
        
        // Gerar QR Code único
        const qrCode = `REG-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
        
        // Atribuir número e horário de largada automaticamente
        let startNumber: number | null = null;
        let startTime: string | null = null;
        
        try {
          const startInfo = await db.assignStartInfo(input.eventId, input.categoryId);
          startNumber = startInfo.startNumber;
          startTime = startInfo.startTime;
        } catch (error: any) {
          // Se não houver configuração ou atingir limite, continuar sem número/horário
          console.warn('Could not assign start info:', error.message);
        }
        
        const registrationId = await db.createRegistration({
          ...input,
          userId: ctx.user.id,
          qrCode,
          pilotAge: input.pilotAge ? parseInt(input.pilotAge.toString()) : undefined,
          navigatorAge: input.navigatorAge ? parseInt(input.navigatorAge.toString()) : undefined,
          pilotBirthDate: input.pilotBirthDate ? new Date(input.pilotBirthDate) : undefined,
          navigatorBirthDate: input.navigatorBirthDate ? new Date(input.navigatorBirthDate) : undefined,
          ...(startNumber !== null && { startNumber }),
          ...(startTime !== null && { startTime }),
        });
        
        // Send email notification to organizer
        (async () => {
          try {
            const organizer = await db.getOrganizerById(event.organizerId);
            if (organizer && organizer.notifyOnNewRegistration) {
              const organizerUser = await db.getUserByOpenId(organizer.ownerId);
              const notificationEmail = organizer.notificationEmail || organizerUser?.email;
              
              if (notificationEmail) {
                const categoryData = await db.getCategoryById(input.categoryId);
                const parentCategory = categoryData?.parentId ? await db.getCategoryById(categoryData.parentId) : null;
                const categoryName = parentCategory
                  ? `${parentCategory.name} - ${categoryData?.name}`
                  : categoryData?.name || 'Desconhecida';
                
                const templateData = newRegistrationTemplate({
                  organizerName: organizer.name,
                  eventName: event.name,
                  pilotName: input.pilotName,
                  pilotEmail: input.pilotEmail,
                  categoryName: categoryName,
                  registrationDate: new Date().toLocaleDateString('pt-BR'),
                  eventStartDate: event.startDate.toLocaleDateString('pt-BR'),
                  eventLocation: event.location,
                  dashboardUrl: 'https://amigoracing.com.br/painel-organizador',
                });
                
                await sendEmailNotification({
                  to: notificationEmail,
                  subject: templateData.subject,
                  html: templateData.html,
                  text: templateData.text,
                  organizerId: organizer.id,
                  eventId: input.eventId,
                  registrationId: registrationId,
                  type: 'new_registration',
                });
              }
            }
          } catch (error) {
            console.error('[Registrations] Error sending notification email:', error);
          }
        })();
        
        return { success: true, registrationId, qrCode };
      }),
    
    getShirtsReport: organizerProcedure
      .input(z.object({ eventId: z.number() }))
      .query(async ({ ctx, input }) => {
        const event = await db.getEventById(input.eventId);
        if (!event) {
          throw new TRPCError({ code: 'NOT_FOUND', message: 'Event not found' });
        }
        
        // Admin pode ver qualquer evento, organizador só pode ver seus eventos
        if (ctx.user.role !== 'admin') {
          const organizer = await db.getOrganizerById(event.organizerId);
          if (!organizer || organizer.ownerId !== ctx.user.openId) {
            throw new TRPCError({ code: 'FORBIDDEN', message: 'Not your event' });
          }
        }
        
        return await db.getShirtsReport(input.eventId);
      }),
  }),

  // ==================== START ORDER ROUTES ====================
  startOrder: router({
    getConfirmedCount: protectedProcedure
      .input(z.object({ eventId: z.number(), categoryId: z.number() }))
      .query(async ({ input }) => {
        const count = await db.getConfirmedRegistrationCountByCategory(input.eventId, input.categoryId);
        return { count };
      }),
    
    getByEvent: publicProcedure
      .input(z.object({ eventId: z.number() }))
      .query(async ({ input }) => {
        return await db.getStartOrderConfigsByEventId(input.eventId);
      }),
    
    upsert: organizerProcedure
      .input(z.object({
        eventId: z.number(),
        categoryId: z.number(),
        orderPosition: z.number(),
        numberStart: z.number(),
        numberEnd: z.number(),
        startTime: z.string(),
        intervalSeconds: z.number(),
        timeBetweenCategories: z.number().optional(), // Minutes between categories
        registrationOrder: z.array(z.number()).optional(), // Array of registration IDs in custom order
      }))
      .mutation(async ({ ctx, input }) => {
        // Verify organizer owns this event
        const event = await db.getEventById(input.eventId);
        if (!event) {
          throw new TRPCError({ code: 'NOT_FOUND', message: 'Event not found' });
        }
        
        const organizer = await db.getOrganizerById(event.organizerId);
        if (!organizer || (organizer.ownerId !== ctx.user.openId && ctx.user.role !== 'admin')) {
          throw new TRPCError({ code: 'FORBIDDEN', message: 'Not your event' });
        }
        
        // Validate number range
        if (input.numberStart >= input.numberEnd) {
          throw new TRPCError({ code: 'BAD_REQUEST', message: 'Número inicial deve ser menor que o final' });
        }
        
        // Check for overlapping number ranges ONLY within the same parent category
        const existingConfigs = await db.getStartOrderConfigsByEventId(input.eventId);
        const categories = await db.getCategoriesByEventId(input.eventId);
        const categoryMap = new Map(categories.map(c => [c.id, c]));
        
        // Get parent category of current category being saved
        const currentCategory = categoryMap.get(input.categoryId);
        const currentParentId = currentCategory?.parentId;
        
        for (const config of existingConfigs) {
          if (config.categoryId === input.categoryId) continue; // Skip same category
          
          // Get parent category of existing config
          const existingCategory = categoryMap.get(config.categoryId);
          const existingParentId = existingCategory?.parentId;
          
          // Only check for overlaps if both categories have the same parent
          // This allows different parent categories (Carros vs Motos) to have overlapping numbers
          if (currentParentId !== existingParentId) continue;
          
          const overlaps = (
            (input.numberStart >= config.numberStart && input.numberStart <= config.numberEnd) ||
            (input.numberEnd >= config.numberStart && input.numberEnd <= config.numberEnd) ||
            (input.numberStart <= config.numberStart && input.numberEnd >= config.numberEnd)
          );
          
          if (overlaps) {
            const conflictCategory = categoryMap.get(config.categoryId);
            const parentCategory = conflictCategory?.parentId ? categoryMap.get(conflictCategory.parentId) : null;
            const categoryName = parentCategory 
              ? `${parentCategory.name} - ${conflictCategory?.name}`
              : conflictCategory?.name || 'Desconhecida';
            
            throw new TRPCError({ 
              code: 'BAD_REQUEST', 
              message: `Faixa de numeração sobrepõe com "${categoryName}" (${config.numberStart}-${config.numberEnd})` 
            });
          }
        }
        
        // Serialize registrationOrder to JSON if provided
        const dataToSave = {
          ...input,
          registrationOrder: input.registrationOrder ? JSON.stringify(input.registrationOrder) : null,
        };
        console.log('[upsert] Saving config:', dataToSave);
        await db.upsertStartOrderConfig(dataToSave);
        return { success: true };
      }),
    
    delete: organizerProcedure
      .input(z.object({ id: z.number() }))
      .mutation(async ({ ctx, input }) => {
        // Get config to verify ownership
        const configs = await db.getStartOrderConfigsByEventId(0); // We need to get by ID
        // For now, just delete - proper ownership check would require getById helper
        await db.deleteStartOrderConfig(input.id);
        return { success: true };
      }),
    
    deleteByEvent: organizerProcedure
      .input(z.object({ eventId: z.number() }))
      .mutation(async ({ ctx, input }) => {
        // Verify organizer owns this event
        const event = await db.getEventById(input.eventId);
        if (!event) {
          throw new TRPCError({ code: 'NOT_FOUND', message: 'Event not found' });
        }
        
        const organizer = await db.getOrganizerById(event.organizerId);
        if (!organizer || (organizer.ownerId !== ctx.user.openId && ctx.user.role !== 'admin')) {
          throw new TRPCError({ code: 'FORBIDDEN', message: 'Not your event' });
        }
        
        await db.deleteStartOrderConfigsByEventId(input.eventId);
        return { success: true };
      }),
    
    upsertBatch: organizerProcedure
      .input(z.object({
        eventId: z.number(),
        configs: z.array(z.object({
          categoryId: z.number(),
          orderPosition: z.number(),
          numberStart: z.number(),
          numberEnd: z.number(),
          startTime: z.string(),
          intervalSeconds: z.number(),
          timeBetweenCategories: z.number().optional(),
        })),
      }))
      .mutation(async ({ ctx, input }) => {
        // Verify organizer owns this event
        const event = await db.getEventById(input.eventId);
        if (!event) {
          throw new TRPCError({ code: 'NOT_FOUND', message: 'Event not found' });
        }
        
        const organizer = await db.getOrganizerById(event.organizerId);
        if (!organizer || (organizer.ownerId !== ctx.user.openId && ctx.user.role !== 'admin')) {
          throw new TRPCError({ code: 'FORBIDDEN', message: 'Not your event' });
        }
        
        // Validate all configs before saving
        for (const config of input.configs) {
          if (config.numberStart > config.numberEnd) {
            throw new TRPCError({ code: 'BAD_REQUEST', message: 'Número inicial deve ser menor ou igual ao final' });
          }
        }
        
        // Check for overlaps within the new configs ONLY within the same parent category
        const categories = await db.getCategoriesByEventId(input.eventId);
        const categoryMap = new Map(categories.map(c => [c.id, c]));
        
        for (let i = 0; i < input.configs.length; i++) {
          for (let j = i + 1; j < input.configs.length; j++) {
            const config1 = input.configs[i];
            const config2 = input.configs[j];
            
            const cat1 = categoryMap.get(config1.categoryId);
            const cat2 = categoryMap.get(config2.categoryId);
            const parent1Id = cat1?.parentId;
            const parent2Id = cat2?.parentId;
            
            // Only check for overlaps if both categories have the same parent
            if (parent1Id !== parent2Id) continue;
            
            const overlaps = (
              (config1.numberStart >= config2.numberStart && config1.numberStart <= config2.numberEnd) ||
              (config1.numberEnd >= config2.numberStart && config1.numberEnd <= config2.numberEnd) ||
              (config1.numberStart <= config2.numberStart && config1.numberEnd >= config2.numberEnd)
            );
            
            if (overlaps) {
              const parent1 = parent1Id ? categoryMap.get(parent1Id) : null;
              const parent2 = parent2Id ? categoryMap.get(parent2Id) : null;
              const name1 = parent1 ? `${parent1.name} - ${cat1?.name}` : cat1?.name || 'Desconhecida';
              const name2 = parent2 ? `${parent2.name} - ${cat2?.name}` : cat2?.name || 'Desconhecida';
              
              throw new TRPCError({ 
                code: 'BAD_REQUEST', 
                message: `Faixa de numeração sobrepõe: "${name1}" (${config1.numberStart}-${config1.numberEnd}) e "${name2}" (${config2.numberStart}-${config2.numberEnd})` 
              });
            }
          }
        }
        
        // Upsert each config (update if exists, insert if not)
        // Don't delete all - just update each one individually
        for (const config of input.configs) {
          await db.upsertStartOrderConfig({
            eventId: input.eventId,
            ...config,
          });
        }
        
        return { success: true };
      }),
    
    exportStartList: organizerProcedure
      .input(z.object({ eventId: z.number() }))
      .mutation(async ({ ctx, input }) => {
        const ExcelJSModule = await import('exceljs');
        const ExcelJS = ExcelJSModule.default;
        
        const event = await db.getEventById(input.eventId);
        if (!event) {
          throw new TRPCError({ code: 'NOT_FOUND', message: 'Event not found' });
        }
        
        const organizer = await db.getOrganizerById(event.organizerId);
        if (!organizer || (organizer.ownerId !== ctx.user.openId && ctx.user.role !== 'admin')) {
          throw new TRPCError({ code: 'FORBIDDEN', message: 'Not your event' });
        }
        
        // Buscar configurações de ordem de largada
        let configs = await db.getStartOrderConfigsByEventId(input.eventId);
        
        // Se não existem configurações, gerar padrão
        if (configs.length === 0) {
          const stats = await db.getRegistrationStatistics(input.eventId);
          const categories = await db.getCategoriesByEventId(input.eventId);
          
          const subcategoriesWithRegistrations = categories.filter(category => {
            if (!category.parentId) return false;
            const catStat = stats.byCategory?.find((s: any) => s.categoryId === category.id);
            const registrationCount = catStat?.confirmedRegistrations || 0;
            return registrationCount > 0;
          });
          
          if (subcategoriesWithRegistrations.length === 0) {
            throw new TRPCError({ code: 'BAD_REQUEST', message: 'Nenhuma categoria com inscritos para exportar.' });
          }
          
          let currentNumber = 1;
          let currentHour = 8;
          let currentMinute = 0;
          
          for (let i = 0; i < subcategoriesWithRegistrations.length; i++) {
            const category = subcategoriesWithRegistrations[i];
            const catStat = stats.byCategory?.find((s: any) => s.categoryId === category.id);
            const registrationCount = catStat?.confirmedRegistrations || 1;
            const numberEnd = currentNumber + (registrationCount - 1);
            
            const startTime = `${String(currentHour).padStart(2, '0')}:${String(currentMinute).padStart(2, '0')}`;
            
            await db.upsertStartOrderConfig({
              eventId: input.eventId,
              categoryId: category.id,
              orderPosition: i + 1,
              numberStart: currentNumber,
              numberEnd: numberEnd,
              startTime: startTime,
              intervalSeconds: 60,
            });
            
            currentNumber = numberEnd + 1;
            currentMinute += registrationCount;
            if (currentMinute >= 60) {
              currentHour += Math.floor(currentMinute / 60);
              currentMinute = currentMinute % 60;
            }
          }
          
          configs = await db.getStartOrderConfigsByEventId(input.eventId);
        }
        
        // Buscar todas as inscrições confirmadas
        const registrations = await db.getRegistrationsByEventId(input.eventId);
        const confirmedRegistrations = registrations.filter(r => r.status !== 'cancelled');
        
        // Buscar categorias
        const categories = await db.getCategoriesByEventId(input.eventId);
        const categoryMap = new Map(categories.map(c => [c.id, c]));
        
        // Criar mapa de inscritos por categoria
        const registrationsByCategory = new Map<number, typeof confirmedRegistrations>();
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
          
          const [hours, minutes, seconds] = config.startTime.split(':').map(Number);
          const baseTime = new Date();
          baseTime.setHours(hours, minutes, seconds || 0, 0);
          
          let categoryRegistrations = registrationsByCategory.get(config.categoryId) || [];
          
          // Se tem registrationOrder, ordenar os pilotos de acordo
          if (config.registrationOrder) {
            try {
              const order = typeof config.registrationOrder === 'string' 
                ? JSON.parse(config.registrationOrder) 
                : config.registrationOrder;
              if (Array.isArray(order) && order.length > 0) {
                const orderMap = new Map(order.map((regId: number, index: number) => [regId, index]));
                categoryRegistrations = categoryRegistrations.sort((a, b) => {
                  const indexA = orderMap.get(a.id) ?? 999;
                  const indexB = orderMap.get(b.id) ?? 999;
                  return indexA - indexB;
                });
              }
            } catch (e) {
              // Se falhar o parse, usar ordem padrão
            }
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
              'Cidade/UF Piloto': registration ? `${registration.pilotCity || ''}, ${registration.pilotState || ''}` : '',
              'Navegador': registration?.navigatorName || '',
              'Cidade/UF Navegador': registration ? `${registration.navigatorCity || ''}, ${registration.navigatorState || ''}` : '',
              'Equipe': registration?.team || '',
              'Veículo': registration?.vehicleInfo || '',
            });
          }
        }
        
        // Ordenar por número
        startListData.sort((a, b) => a['Nº'] - b['Nº']);
        
        // Criar workbook
        const workbook = new ExcelJS.Workbook();
        const worksheet = workbook.addWorksheet('Lista de Largada');
        
        // Definir colunas
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
        
        // Estilizar cabeçalho
        worksheet.getRow(1).font = { bold: true, color: { argb: 'FFFFFFFF' } };
        worksheet.getRow(1).fill = {
          type: 'pattern',
          pattern: 'solid',
          fgColor: { argb: 'FF0066CC' },
        };
        worksheet.getRow(1).alignment = { vertical: 'middle', horizontal: 'center' };
        
        // Adicionar dados
        for (const row of startListData) {
          worksheet.addRow(row);
        }
        
        // Adicionar bordas
        worksheet.eachRow((row) => {
          row.eachCell((cell) => {
            cell.border = {
              top: { style: 'thin' },
              left: { style: 'thin' },
              bottom: { style: 'thin' },
              right: { style: 'thin' },
            };
          });
        });
        
        // Gerar buffer
        const buffer = await workbook.xlsx.writeBuffer();
        const base64 = Buffer.from(buffer).toString('base64');
        
        return {
          filename: `lista-largada-${event.name.replace(/[^a-zA-Z0-9]/g, '-')}.xlsx`,
          data: base64,
          count: startListData.length,
        };
      }),

    
    deleteAllByEvent: organizerProcedure
      .input(z.object({ eventId: z.number() }))
      .mutation(async ({ ctx, input }) => {
        // Verify organizer owns this event
        const event = await db.getEventById(input.eventId);
        if (!event) {
          throw new TRPCError({ code: 'NOT_FOUND', message: 'Event not found' });
        }
        
        const organizer = await db.getOrganizerById(event.organizerId);
        if (!organizer || (organizer.ownerId !== ctx.user.openId && ctx.user.role !== 'admin')) {
          throw new TRPCError({ code: 'FORBIDDEN', message: 'Not your event' });
        }
        
        // Delete all start order configs for this event
        await db.deleteStartOrderConfigsByEventId(input.eventId);
        return { success: true };
      }),
    
    exportKraken: organizerProcedure
      .input(z.object({ eventId: z.number() }))
      .mutation(async ({ ctx, input }) => {
        const event = await db.getEventById(input.eventId);
        if (!event) {
          throw new TRPCError({ code: 'NOT_FOUND', message: 'Event not found' });
        }
        
        const organizer = await db.getOrganizerById(event.organizerId);
        if (!organizer || (organizer.ownerId !== ctx.user.openId && ctx.user.role !== 'admin')) {
          throw new TRPCError({ code: 'FORBIDDEN', message: 'Not your event' });
        }
        
        if (event.status === 'cancelled') {
          throw new TRPCError({ 
            code: 'BAD_REQUEST', 
            message: 'Não é possível exportar ordem de largada de evento cancelado.' 
          });
        }
        
        const categories = await db.getCategoriesByEventId(input.eventId);
        if (categories.length === 0) {
          throw new TRPCError({ 
            code: 'BAD_REQUEST', 
            message: 'Não é possível exportar ordem de largada. O evento não possui categorias cadastradas.' 
          });
        }
        
        let configs = await db.getStartOrderConfigsByEventId(input.eventId);
        const categoryMap = new Map(categories.map(c => [c.id, c]));
        
        // Se não existem configurações, gerar configurações padrão
        if (configs.length === 0) {
          const stats = await db.getRegistrationStatistics(input.eventId);
          const subcategoriesWithRegistrations = categories.filter(category => {
            if (!category.parentId) return false;
            const catStat = stats.byCategory?.find((s: any) => s.categoryId === category.id);
            const registrationCount = catStat?.confirmedRegistrations || 0;
            return registrationCount > 0;
          });
          
          if (subcategoriesWithRegistrations.length === 0) {
            throw new TRPCError({ code: 'BAD_REQUEST', message: 'Nenhuma categoria com inscritos para exportar.' });
          }
          
          let currentNumber = 1;
          let currentHour = 8;
          let currentMinute = 0;
          
          for (let i = 0; i < subcategoriesWithRegistrations.length; i++) {
            const category = subcategoriesWithRegistrations[i];
            const catStat = stats.byCategory?.find((s: any) => s.categoryId === category.id);
            const registrationCount = catStat?.confirmedRegistrations || 1;
            const numberEnd = currentNumber + (registrationCount - 1);
            
            const startTime = `${String(currentHour).padStart(2, '0')}:${String(currentMinute).padStart(2, '0')}`;
            
            await db.upsertStartOrderConfig({
              eventId: input.eventId,
              categoryId: category.id,
              orderPosition: i + 1,
              numberStart: currentNumber,
              numberEnd: numberEnd,
              startTime: startTime,
              intervalSeconds: 60,
            });
            
            currentNumber = numberEnd + 1;
            currentMinute += registrationCount;
            if (currentMinute >= 60) {
              currentHour += Math.floor(currentMinute / 60);
              currentMinute = currentMinute % 60;
            }
          }
          
          configs = await db.getStartOrderConfigsByEventId(input.eventId);
        }
        
        const registrations = await db.getRegistrationsByEventId(input.eventId);
        
        const registrationsByCategory = new Map<number, typeof registrations>();
        for (const reg of registrations) {
          if (!registrationsByCategory.has(reg.categoryId)) {
            registrationsByCategory.set(reg.categoryId, []);
          }
          registrationsByCategory.get(reg.categoryId)!.push(reg);
        }
        
        const XLSX = await import('xlsx');
        
        const data: any[] = [];
        
        for (const config of configs) {
          const numSlots = config.numberEnd - config.numberStart + 1;
          
          const [hours, minutes, seconds] = config.startTime.split(':').map(Number);
          const baseTime = new Date();
          baseTime.setHours(hours, minutes, seconds || 0, 0);
          
          let categoryRegistrations = registrationsByCategory.get(config.categoryId) || [];
          
          // Se tem registrationOrder, ordenar os pilotos de acordo
          if (config.registrationOrder) {
            try {
              const order = typeof config.registrationOrder === 'string' 
                ? JSON.parse(config.registrationOrder) 
                : config.registrationOrder;
              if (Array.isArray(order) && order.length > 0) {
                const orderMap = new Map(order.map((regId: number, index: number) => [regId, index]));
                categoryRegistrations = categoryRegistrations.sort((a, b) => {
                  const indexA = orderMap.get(a.id) ?? 999;
                  const indexB = orderMap.get(b.id) ?? 999;
                  return indexA - indexB;
                });
              }
            } catch (e) {
              // Se falhar o parse, usar ordem padrão
            }
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
            
            data.push({
              'CATEGORIA': categoryName,
              'NÚMERO': currentNumber,
              'HORA LARGADA': timeStr,
              'NOME PILOTO': registration?.pilotName || '',
              'EMAIL PILOTO': registration?.pilotEmail || '',
              'CPF PILOTO': registration?.pilotCpf || '',
              'CIDADE PILOTO': registration?.pilotCity || '',
              'ESTADO PILOTO': registration?.pilotState || '',
              'NOME NAVEGADOR': registration?.navigatorName || '',
              'EMAIL NAVEGADOR': registration?.navigatorEmail || '',
              'CPF NAVEGADOR': registration?.navigatorCpf || '',
              'CIDADE NAVEGADOR': registration?.navigatorCity || '',
              'ESTADO NAVEGADOR': registration?.navigatorState || '',
              'EQUIPE': '',
              'PATROCINADOR': '',
              'VEÍCULO': registration?.vehicleId ? `Veículo ID ${registration.vehicleId}` : '',
              'D1': '',
              'D2': '',
            });
          }
        }
        
        data.sort((a, b) => a['NÚMERO'] - b['NÚMERO']);
        
        const wb = XLSX.utils.book_new();
        const ws = XLSX.utils.json_to_sheet(data);
        
        const colWidths = [
          { wch: 18 },
          { wch: 10 },
          { wch: 15 },
          { wch: 30 },
          { wch: 30 },
          { wch: 15 },
          { wch: 20 },
          { wch: 8 },
          { wch: 30 },
          { wch: 30 },
          { wch: 15 },
          { wch: 20 },
          { wch: 8 },
          { wch: 20 },
          { wch: 20 },
          { wch: 25 },
          { wch: 10 },
          { wch: 10 },
        ];
        ws['!cols'] = colWidths;
        
        XLSX.utils.book_append_sheet(wb, ws, 'ORDEM DE LARGADA');
        
        const excelBuffer = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });
        const base64 = excelBuffer.toString('base64');
        
        return {
          filename: `OrdemLargada-${event.name.replace(/\s+/g, '')}.xlsx`,
          data: base64,
        };
      }),

    // Exportar Lista do Evento (para montagem de kits)
    exportEventList: organizerProcedure
      .input(z.object({ eventId: z.number() }))
      .mutation(async ({ ctx, input }) => {
        const event = await db.getEventById(input.eventId);
        if (!event) {
          throw new TRPCError({ code: 'NOT_FOUND', message: 'Event not found' });
        }
        
        const organizer = await db.getOrganizerById(event.organizerId);
        if (!organizer || (organizer.ownerId !== ctx.user.openId && ctx.user.role !== 'admin')) {
          throw new TRPCError({ code: 'FORBIDDEN', message: 'Not your event' });
        }
        
        if (event.status === 'cancelled') {
          throw new TRPCError({ 
            code: 'BAD_REQUEST', 
            message: 'Não é possível exportar lista do evento cancelado.' 
          });
        }
        
        const categories = await db.getCategoriesByEventId(input.eventId);
        const registrations = await db.getRegistrationsByEventId(input.eventId);
        const startOrderConfigs = await db.getStartOrderConfigsByEventId(input.eventId);
        
        if (registrations.length === 0) {
          throw new TRPCError({ 
            code: 'BAD_REQUEST', 
            message: 'Não há inscrições para exportar.' 
          });
        }
        
        const categoryMap = new Map(categories.map(c => [c.id, c]));
        const XLSX = await import('xlsx');
        
        // Construir mapa de numeros da ordem de largada por inscricao
        const registrationNumberMap = new Map<number, number>();
        
        console.log('[exportEventList] startOrderConfigs length:', startOrderConfigs.length);
        
        for (const config of startOrderConfigs) {
          console.log(`[exportEventList] Config ${config.id}: registrationOrder exists?`, !!config.registrationOrder, `numberStart=${config.numberStart}`);
          if (config.registrationOrder) {
            try {
              const orderArray = JSON.parse(config.registrationOrder);
              console.log(`[exportEventList] Parsed orderArray for config ${config.id}:`, orderArray);
              for (let i = 0; i < orderArray.length; i++) {
                const regId = orderArray[i];
                const number = config.numberStart + i;
                registrationNumberMap.set(regId, number);
              }
            } catch (e) {
              console.error('Erro ao parsear registrationOrder:', e);
            }
          }
        }
        
        console.log('[exportEventList] Final registrationNumberMap size:', registrationNumberMap.size);
        console.log('[exportEventList] Registrations IDs:', registrations.map(r => ({ id: r.id, pilotName: r.pilotName })));
        console.log('[exportEventList] registrationNumberMap entries:', Array.from(registrationNumberMap.entries()));
        
        const data: any[] = [];
        
        // Agrupar inscrições por número de largada (usando ordem salva)
        const registrationsByStartNumber = new Map<number, typeof registrations>();
        for (const reg of registrations) {
          const startNum = registrationNumberMap.get(reg.id) || 0;
          if (!registrationsByStartNumber.has(startNum)) {
            registrationsByStartNumber.set(startNum, []);
          }
          registrationsByStartNumber.get(startNum)!.push(reg);
        }
        
        // Ordenar por número de largada
        const sortedStartNumbers = Array.from(registrationsByStartNumber.keys()).sort((a, b) => a - b);
        
        for (const startNum of sortedStartNumbers) {
          const regsForNumber = registrationsByStartNumber.get(startNum) || [];
          
          for (const reg of regsForNumber) {
            const category = categoryMap.get(reg.categoryId);
            const parentCategory = category?.parentId ? categoryMap.get(category.parentId) : null;
            const categoryName = parentCategory 
              ? `${parentCategory.name} - ${category?.name}` 
              : category?.name || 'N/A';
            
            data.push({
              'CATEGORIA - SUBCATEGORIA': categoryName,
              'NÚMERO DE LARGADA': startNum || '',
              'NOME PILOTO': reg.pilotName || '',
              'NOME NAVEGADOR': reg.navigatorName || '',
              'CPF PILOTO': reg.pilotCpf || '',
              'CPF NAVEGADOR': reg.navigatorCpf || '',
              'TAMANHO CAMISETA PILOTO': reg.pilotShirtSize || '',
              'TAMANHO CAMISETA NAVEGADOR': reg.navigatorShirtSize || '',
              'NOME DA EQUIPE': reg.team || '',
              'OBSERVAÇÕES': reg.notes || '',
            });
          }
        }
        
        const wb = XLSX.utils.book_new();
        const ws = XLSX.utils.json_to_sheet(data);
        
        const colWidths = [
          { wch: 25 },  // CATEGORIA - SUBCATEGORIA
          { wch: 18 },  // NÚMERO DE LARGADA
          { wch: 25 },  // NOME PILOTO
          { wch: 25 },  // NOME NAVEGADOR
          { wch: 18 },  // CPF PILOTO
          { wch: 18 },  // CPF NAVEGADOR
          { wch: 20 },  // TAMANHO CAMISETA PILOTO
          { wch: 20 },  // TAMANHO CAMISETA NAVEGADOR
          { wch: 20 },  // NOME DA EQUIPE
          { wch: 30 },  // OBSERVAÇÕES
        ];
        ws['!cols'] = colWidths;
        
        XLSX.utils.book_append_sheet(wb, ws, 'LISTA DO EVENTO');
        
        const excelBuffer = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });
        const base64 = excelBuffer.toString('base64');
        
        return {
          filename: `ListaEvento-${event.name.replace(/\s+/g, '')}.xlsx`,
          data: base64,
        };
      }),

    

  }),

  // ==================== ADMIN ====================
  admin: router({
    // Listar todos os usuários
    listUsers: adminProcedure.query(async () => {
      return await db.getAllUsers();
    }),

    // Atualizar role de usuário
    updateUserRole: adminProcedure
      .input(z.object({
        userId: z.number(),
        role: z.enum(["user", "admin", "participant", "organizer"]),
      }))
      .mutation(async ({ input }) => {
        await db.updateUserRole(input.userId, input.role);
        
        // Se o role for "organizer", criar registro na tabela organizers (se não existir)
        if (input.role === 'organizer') {
          const user = await db.getUserById(input.userId);
          if (!user) {
            throw new TRPCError({ code: 'NOT_FOUND', message: 'Usuário não encontrado' });
          }
          
          // Verificar se já existe registro de organizer
          const existingOrganizer = await db.getOrganizerByOwnerId(user.openId);
          if (!existingOrganizer) {
            // Criar registro de organizer usando openId (ID do OAuth)
            await db.createOrganizer({
              name: user.name || 'Organizador',
              description: '',
              ownerId: user.openId,
            });
          }
        }
        
        return { success: true };
      }),

    // Listar todos os eventos (incluindo de outros organizadores)
    listAllEvents: adminProcedure.query(async () => {
      return await db.getAllEventsAdmin();
    }),

    // Deletar qualquer evento
    deleteEvent: adminProcedure
      .input(z.object({
        eventId: z.number(),
      }))
      .mutation(async ({ input }) => {
        await db.deleteEventAdmin(input.eventId);
        return { success: true };
      }),

    // Buscar estatísticas do dashboard
    getDashboardStats: adminProcedure.query(async () => {
      return await db.getAdminDashboardStats();
    }),
  }),

  // ==================== PAGAMENTOS ====================
  payments: router({
    // Criar/atualizar recipient (conta de recebedor) para organizador
    setupRecipient: setupRecipientProcedure
      .input(z.object({
        document: z.string(),
        pixKey: z.string().optional(),
        phone: z.string(), // NOVO: Telefone obrigatório
        holderName: z.string().optional(),
        holderEmail: z.string().optional(),
        bankAccount: z.object({
          bank_code: z.string(),
          agencia: z.string(),
          agencia_dv: z.string().optional(),
          conta: z.string(),
          conta_dv: z.string(),
          type: z.enum(['conta_corrente', 'conta_poupanca']),
          legal_name: z.string(),
          document_number: z.string(),
        }),
      }))
      .mutation(async ({ ctx, input }) => {
        fs.appendFileSync(LOG_FILE, `[${new Date().toISOString()}] ========== SETUPRECIPIENT MUTATION INICIADA ==========\n`);
        fs.appendFileSync(LOG_FILE, `[${new Date().toISOString()}] INPUT RECEBIDO: ${JSON.stringify(input)}\n`);
        fs.appendFileSync(LOG_FILE, `[${new Date().toISOString()}] CTX USER: ${JSON.stringify({id: ctx.user?.id, role: ctx.user?.role, email: ctx.user?.email})}\n`);
        console.log('[setupRecipient] ===== MUTATION INICIADA =====');
        console.log('[setupRecipient] INPUT RECEBIDO:', input);
        console.log('[setupRecipient] ctx.user:', { id: ctx.user?.id, email: ctx.user?.email, role: ctx.user?.role });
        console.log('[setupRecipient] input:', JSON.stringify(input, null, 2));
        const { createOrGetRecipient } = await import('./pagarme');
        
        console.log('[setupRecipient] Iniciando PASSO 1: Buscar organizador');
        const organizer = await db.getOrganizerByOwnerId(ctx.user.openId);
        console.log('[setupRecipient] Organizador encontrado:', organizer?.id);
        if (!organizer) {
          console.log('[setupRecipient] ERRO: Organizador não encontrado para openId:', ctx.user.openId);
          throw new TRPCError({ code: 'NOT_FOUND', message: 'Organizador não encontrado' });
        }
        
        // PASSO 2: Buscar usuário do organizador para salvar dados
        const organizerUser = await db.getUserByOpenId(organizer.ownerId);
        if (!organizerUser) {
          throw new TRPCError({ code: 'NOT_FOUND', message: 'Usuário do organizador não encontrado' });
        }
        
        // ========================================================================
        // PASSO 3: SALVAR NO BANCO LOCAL - INCONDICIONAL (SEM TRY/CATCH)
        // Isto SEMPRE vai funcionar. Nenhum erro externo pode impedir isto.
        // ========================================================================
        console.log('[setupRecipient] ===== INICIANDO SALVAMENTO LOCAL =====');
        console.log('[setupRecipient] Usuário ID:', organizerUser.id);
        console.log('[setupRecipient] Dados a salvar:', {
          document: input.document,
          bankCode: input.bankAccount.bank_code,
          agencia: input.bankAccount.agencia,
          conta: input.bankAccount.conta,
          holderName: input.bankAccount.legal_name,
          holderDocument: input.bankAccount.document_number,
          pixKey: input.pixKey,
        });
        
        // SALVAR - SEM PROTECAO
        await db.updateUserBankData(organizerUser.id, {
          bankDocument: input.document,
          bankCode: input.bankAccount.bank_code,
          bankAgency: input.bankAccount.agencia,
          bankAgencyDv: input.bankAccount.agencia_dv || '',
          bankAccount: input.bankAccount.conta,
          bankAccountDv: input.bankAccount.conta_dv,
          bankAccountType: input.bankAccount.type,
          bankHolderName: input.bankAccount.legal_name,
          bankHolderDocument: input.bankAccount.document_number,
          pixKey: input.pixKey,
          phone: input.phone, // NOVO: Salvar telefone no banco local
        });
        console.log('[setupRecipient] Telefone salvo no banco local:', input.phone);
        
        const verifyAfterBankUpdate = await db.getUserById(organizerUser.id);

        // ========================================================================
        // PASSO 4: VERIFICAR SE JA TEM RECIPIENT
        // Se nao tiver, FORCAR criacao (mesmo que seja ex-participante)
        // ========================================================================
        console.log('[setupRecipient] Verificando recipient do usuario:', organizerUser.recipientId);
        
        let recipientId: string | null = organizerUser.recipientId || null;
        let pagarmeError: string | null = null;
        
        // Se nao tem recipient, DEVE criar um agora
        if (!recipientId) {
          console.log('[setupRecipient] ATENCAO: Usuario NAO tem recipient! Forcando criacao...');
        } else {
          console.log('[setupRecipient] OK: Usuario ja tem recipient:', recipientId);
        }
        
        // VALIDAR SE TEM TODOS OS DADOS OBRIGATORIOS PARA CRIAR RECIPIENT
        // NOTA: agencia_dv é OPCIONAL (alguns bancos como Bradesco não tém)
        const temDadosCompletos = input.bankAccount.agencia && input.bankAccount.conta && input.bankAccount.conta_dv;
        
        if (!temDadosCompletos) {
          console.log('[setupRecipient] ⚠️ DADOS INCOMPLETOS: Não criando recipient no Pagar.me');
          console.log('[setupRecipient] Agência:', input.bankAccount.agencia);
          console.log('[setupRecipient] Dígito agência:', input.bankAccount.agencia_dv);
          console.log('[setupRecipient] Conta:', input.bankAccount.conta);
          console.log('[setupRecipient] Dígito conta:', input.bankAccount.conta_dv);
          throw new TRPCError({ 
            code: 'BAD_REQUEST', 
            message: 'Preencha todos os dados bancários obrigatórios (agência, conta, dígito conta) para criar o recipient'
          });
        }
        
        console.log('[setupRecipient] ===== TENTANDO CRIAR RECIPIENT NA PAGAR.ME =====');
        console.log('[setupRecipient] Parâmetros enviados para Pagar.me:', {
          name: ctx.user.name,
          email: ctx.user.email,
          document: input.document,
          bank: input.bankAccount.bank_code,
          agencia: input.bankAccount.agencia,
          agencia_dv: input.bankAccount.agencia_dv,
          conta: input.bankAccount.conta,
          conta_dv: input.bankAccount.conta_dv,
        });
        
        // CHAMAR PAGAR.ME - SE FALHAR, LANÇA ERRO IMEDIATAMENTE
        // Usar telefone do input (obrigatório agora)
        const phone = input.phone;
        console.log('[setupRecipient] Telefone a enviar para Pagar.me:', phone);
        
        // Validar que telefone foi fornecido
        if (!phone || phone.trim().length === 0) {
          throw new TRPCError({ code: 'BAD_REQUEST', message: 'Telefone de contato é obrigatório' });
        }
        
        // ===== VALIDAR DADOS BANCÁRIOS ANTES DE ENVIAR AO PAGAR.ME =====
        const dadosValidacao = {
          document: input.document,
          bankCode: input.bankAccount.bank_code,
          branchNumber: input.bankAccount.agencia,
          branchCheckDigit: input.bankAccount.agencia_dv,
          accountNumber: input.bankAccount.conta,
          accountCheckDigit: input.bankAccount.conta_dv,
          holderName: input.bankAccount.legal_name,
          holderDocument: input.bankAccount.document_number,
          phone: phone,
        };
        fs.appendFileSync(LOG_FILE, `[${new Date().toISOString()}] DADOS ANTES DA VALIDAÇÃO: ${JSON.stringify(dadosValidacao)}\n`);
        console.log('[setupRecipient] ===== VALIDANDO DADOS BANCÁRIOS =====');
        console.log('[setupRecipient] DADOS ANTES DA VALIDAÇÃO:', {
          document: input.document,
          bankCode: input.bankAccount.bank_code,
          branchNumber: input.bankAccount.agencia,
          branchCheckDigit: input.bankAccount.agencia_dv,
          accountNumber: input.bankAccount.conta,
          accountCheckDigit: input.bankAccount.conta_dv,
          holderName: input.bankAccount.legal_name,
          holderDocument: input.bankAccount.document_number,
          phone: phone,
        });
        const validation: any = validateBankData({
          document: input.document,
          bankCode: input.bankAccount.bank_code,
          branchNumber: input.bankAccount.agencia,
          branchCheckDigit: input.bankAccount.agencia_dv,
          accountNumber: input.bankAccount.conta,
          accountCheckDigit: input.bankAccount.conta_dv,
          holderName: input.bankAccount.legal_name,
          holderDocument: input.bankAccount.document_number,
          phone: phone,
        });  
        if (!validation?.isValid) {
          fs.appendFileSync(LOG_FILE, `[${new Date().toISOString()}] VALIDAÇÃO FALHOU: ${JSON.stringify(validation.errors)}\n`);
          console.error('[setupRecipient] ❌ VALIDAÇÃO FALHOU:');
          validation.errors.forEach((err: string) => console.error('  ' + err));
          throw new TRPCError({ 
            code: 'BAD_REQUEST', 
            message: `Dados bancários inválidos: ${validation.errors.join('; ')}`
          });
        }
        console.log('[setupRecipient] ✅ Dados bancários validados com sucesso');
        
        let recipient: any;
        try {
          console.log('[setupRecipient] ===== CHAMANDO PAGAR.ME =====');
          console.log('[setupRecipient] PAYLOAD COMPLETO PARA PAGAR.ME:', {
            name: ctx.user.name || 'Usuário',
            email: ctx.user.email || '',
            document: input.document,
            type: input.document.replace(/\D/g, '').length === 11 ? 'individual' : 'company',
            phone: phone,
            bankAccount: {
              bank: input.bankAccount.bank_code,
              branchNumber: input.bankAccount.agencia,
              branchCheckDigit: input.bankAccount.agencia_dv || '',
              accountNumber: input.bankAccount.conta,
              accountCheckDigit: input.bankAccount.conta_dv,
              type: input.bankAccount.type === 'conta_corrente' ? 'checking' : 'savings',
              holderName: input.bankAccount.legal_name,
              holderDocument: input.bankAccount.document_number,
            },
          });
          recipient = await createOrGetRecipient({
            name: ctx.user.name || 'Usuário',
            email: ctx.user.email || '',
            document: input.document,
            type: input.document.replace(/\D/g, '').length === 11 ? 'individual' : 'company',
            phone: phone, // Passar telefone obrigatório
            bankAccount: {
              bank: input.bankAccount.bank_code,
              branchNumber: input.bankAccount.agencia,
              branchCheckDigit: input.bankAccount.agencia_dv || '', // Pode ser vazio
              accountNumber: input.bankAccount.conta,
              accountCheckDigit: input.bankAccount.conta_dv,
              type: input.bankAccount.type === 'conta_corrente' ? 'checking' : 'savings',
              holderName: input.bankAccount.legal_name,
              holderDocument: input.bankAccount.document_number,
            },
          });
          console.log('[setupRecipient] Resposta do Pagar.me:', JSON.stringify(recipient, null, 2));
        } catch (error: any) {
          console.error('[setupRecipient] \u274c ERRO AO CHAMAR PAGAR.ME!');
          console.error('[setupRecipient] Tipo de erro:', error?.constructor?.name);
          console.error('[setupRecipient] Mensagem:', error?.message);
          
          // Log detalhado da resposta do Pagar.me se disponível
          if (error?.response) {
            console.error('[setupRecipient] Status HTTP:', error.response.status);
            console.error('[setupRecipient] Headers:', JSON.stringify(error.response.headers, null, 2));
            try {
              const errorData = error.response.data;
              console.error('[setupRecipient] \u274c RESPOSTA DO PAGAR.ME (422):', JSON.stringify(errorData, null, 2));
              
              // Extrair mensagem exata do erro
              if (errorData?.errors) {
                console.error('[setupRecipient] ERROS DETALHADOS:');
                Object.entries(errorData.errors).forEach(([key, value]: any) => {
                  console.error(`  ${key}:`, JSON.stringify(value, null, 2));
                });
              }
              if (errorData?.message) {
                console.error('[setupRecipient] Mensagem do Pagar.me:', errorData.message);
              }
            } catch (parseError) {
              console.error('[setupRecipient] Não conseguiu fazer parse da resposta:', error.response.data);
            }
          } else {
            console.error('[setupRecipient] Stack trace:', error?.stack);
          }
          
          // LANÇAR ERRO PARA O FRONTEND
          throw new TRPCError({ 
            code: 'INTERNAL_SERVER_ERROR', 
            message: `Erro ao criar recipient no Pagar.me: ${error?.message || 'Erro desconhecido'}`
          });
        }
        
        if (!recipient) {
          throw new TRPCError({ 
            code: 'INTERNAL_SERVER_ERROR', 
            message: 'Falha ao criar recipient no Pagar.me'
          });
        }
        
        recipientId = recipient.recipientId;
        console.log('[setupRecipient] ✅ Recipient criado na Pagar.me:', recipientId);
        console.log('[setupRecipient] Status do recipient:', recipient.status);
        
        // VALIDAR STATUS DO RECIPIENT
        if (recipient.status === 'refused') {
          console.log('[setupRecipient] ❌ RECIPIENT REJEITADO!');
          console.log('[setupRecipient] Recipient completo:', JSON.stringify(recipient, null, 2));
          throw new TRPCError({ 
            code: 'BAD_REQUEST', 
            message: `Dados bancários rejeitados pelo Pagar.me. Status: ${recipient.status}`
          });
        }
        
        if (recipientId) {
          console.log('[setupRecipient] Salvando recipient ID no banco:', recipientId);
          await db.updateUserRecipientId(organizerUser.id, recipientId, input.pixKey, input.phone); // NOVO: Passar phone
          console.log('[setupRecipient] Recipient ID e telefone salvos no banco local com sucesso!');
          
          const updatedUser = await db.getUserById(organizerUser.id);
          console.log('[setupRecipient] VERIFICACAO APOS updateUserRecipientId:');
          console.log('[setupRecipient] recipientId:', updatedUser?.recipientId);
          console.log('[setupRecipient] bankAccountDv AINDA EXISTE?:', updatedUser?.bankAccountDv);
        } else {
          throw new TRPCError({ 
            code: 'INTERNAL_SERVER_ERROR', 
            message: 'Recipient criado mas ID não foi retornado'
          });
        }

        // ========================================================================
        // RETORNAR SUCESSO - RECIPIENT FOI CRIADO COM SUCESSO
        // ========================================================================
        console.log('[setupRecipient] ===== RETORNANDO RESULTADO =====');
        return {
          success: true,
          recipientId: recipientId,
          localDataSaved: true,
          message: 'Dados bancários salvos e recipient criado na Pagar.me com sucesso!',
        };
      }),

    // Criar transação de pagamento com split
    createPayment: protectedProcedure
      .input(z.object({
        registrationId: z.number(),
        paymentMethod: z.enum(['pix', 'credit_card']),
        cardData: z.object({
          card_number: z.string(),
          card_holder_name: z.string(),
          card_expiration_date: z.string(),
          card_cvv: z.string(),
        }).optional(),
      }))
      .mutation(async ({ ctx, input }) => {
        const { createOrder } = await import('./pagarme');

        // Buscar inscrição
        const registration = await db.getRegistrationById(input.registrationId);
        if (!registration) {
          throw new TRPCError({ code: 'NOT_FOUND', message: 'Inscrição não encontrada' });
        }

        // Buscar evento e organizador
        const event = await db.getEventById(registration.eventId);
        if (!event) {
          throw new TRPCError({ code: 'NOT_FOUND', message: 'Evento não encontrado' });
        }

        // Buscar organizador do evento
        const organizer = await db.getOrganizerById(event.organizerId);
        if (!organizer) {
          throw new TRPCError({ code: 'NOT_FOUND', message: 'Organizador não encontrado' });
        }
        
        // Buscar usuário do organizador para obter recipientId
        const organizerUser = await db.getUserByOpenId(organizer.ownerId);
        
        // Se não tem recipientId mas tem dados bancários, tentar criar dinamicamente
        let recipientId: string | null = organizerUser?.recipientId || null;
        
        console.log('[createPayment] [DEBUG] Verificando dados do organizador:');
        console.log('[createPayment] [DEBUG] recipientId:', organizerUser?.recipientId);
        console.log('[createPayment] [DEBUG] bankCode:', organizerUser?.bankCode);
        console.log('[createPayment] [DEBUG] bankAccount:', organizerUser?.bankAccount);
        console.log('[createPayment] [DEBUG] bankHolderName:', organizerUser?.bankHolderName);
        console.log('[createPayment] [DEBUG] bankDocument:', organizerUser?.bankDocument);
        
        // Definir platformRecipientId ANTES de usar
        const platformRecipientId = ENV.pagarmeplatformRecipientId;
        if (!platformRecipientId) {
          throw new TRPCError({ 
            code: 'INTERNAL_SERVER_ERROR', 
            message: 'Recipient ID da plataforma nao configurado. Verifique a variável PAGARME_PLATFORM_RECIPIENT_ID' 
          });
        }
        
        // RECIPIENT DEVE JA ESTAR CRIADO NO CADASTRO DO ORGANIZADOR
        // Se não tiver, usar o recipient da plataforma como fallback
        if (!recipientId) {
          console.log('[createPayment] [RECIPIENT] Sem recipient do organizador, usando recipient da plataforma');
          recipientId = platformRecipientId;
        }
        
        // Verificar status do recipient no Pagar.me
        let recipientStatus = 'unknown';
        if (recipientId && recipientId !== platformRecipientId) {
          try {
            recipientStatus = await checkRecipientStatus(recipientId);
            console.log('[createPayment] [RECIPIENT] Status do recipient:', recipientStatus);
            
            if (recipientStatus === 'refused' || recipientStatus === 'rejected') {
              console.warn('[createPayment] [RECIPIENT] Recipient rejeitado - PIX será gerado com platformRecipientId');
            }
          } catch (error) {
            console.error('[createPayment] [RECIPIENT] Erro ao verificar status:', error);
          }
        }
        
        // IMPORTANTE: Em modo TEST, recipients com dados fictcios sao rejeitados
        console.log('[createPayment] [RECIPIENT] Usando recipient:', recipientId);
        console.log('[createPayment] [RECIPIENT] NOTA: Se recipient estiver com status refused, PIX falhar');
        console.log('[createPayment] [RECIPIENT] Solucao: Configure dados bancarios reais ou use recipient da plataforma');
        console.log('[createPayment] [VALIDACAO] CPF:', organizerUser?.bankDocument);
        console.log('[createPayment] [VALIDACAO] Banco:', organizerUser?.bankCode);
        console.log('[createPayment] [VALIDACAO] Agencia:', organizerUser?.bankAgency);
        console.log('[createPayment] [VALIDACAO] Conta:', organizerUser?.bankAccount);
        console.log('[createPayment] [VALIDACAO] Digito:', organizerUser?.bankAccountDv);
        
        console.log('[createPayment] [RECIPIENT] Organizador encontrado:', organizerUser?.email);
        console.log('[createPayment] [RECIPIENT] Recipient ID:', organizerUser?.recipientId);
        console.log('[createPayment] [RECIPIENT] PIX Key:', organizerUser?.pixKey);
        console.log('[createPayment] [RECIPIENT] IMPORTANTE: Verificar status do recipient_id na Pagar.me (deve estar active/ativo)');

        // Buscar preço da categoria
        const category = await db.getCategoryById(registration.categoryId);
        if (!category || !category.price) {
          throw new TRPCError({ code: 'BAD_REQUEST', message: 'Preço da categoria não configurado' });
        }

        const totalAmount = Math.round(category.price * 100); // Converter para centavos
        const platformAmount = Math.floor(totalAmount * 0.1); // 10%
        const organizerAmount = totalAmount - platformAmount; // 90%
        
        console.log('[createPayment] Valores do split:');
        console.log('[createPayment] Total amount (centavos):', totalAmount);
        console.log('[createPayment] Platform amount:', platformAmount);
        console.log('[createPayment] Organizer amount:', organizerAmount);
        // Buscar recipient_id da plataforma
        // Verificar se CNPJ/CPF do organizador é igual ao da plataforma
        const organizerDoc = organizerUser?.bankDocument?.replace(/\D/g, '') || '';
        // IMPORTANTE: Comparar com o CNPJ/CPF do owner, não com ownerOpenId
        // Por enquanto, assumir que são diferentes (split sempre ativo)
        const isSameCnpj = false; // Sempre aplicar split para organizadores diferentes
        
        console.log('[createPayment] [SPLIT] Verificação de CNPJ:');
        console.log('[createPayment] [SPLIT] Organizador CNPJ:', organizerDoc);
        console.log('[createPayment] [SPLIT] Split sempre ativo para organizadores');
        
        // Definir split apenas se CNPJs forem diferentes
        let splitRules: { recipientId: string; amount: number }[] = [];
        
        if (!isSameCnpj) {
          if (!recipientId || recipientId === platformRecipientId || recipientStatus === 'refused') {
            console.log('[createPayment] [SPLIT] Recipient inválido - usando 100% para plataforma');
            splitRules = [
              {
                recipientId: platformRecipientId,
                amount: totalAmount,
              },
            ];
          } else {
            console.log('[createPayment] [SPLIT] CNPJs diferentes - aplicando split 10%/90%');
            splitRules = [
              {
                recipientId: platformRecipientId,
                amount: platformAmount,
              },
              {
                recipientId: recipientId,
                amount: organizerAmount,
              },
            ];
          }
        } else {
          console.log('[createPayment] [SPLIT] CNPJs iguais - SEM split, 100% para organizador');
          splitRules = [
            {
              recipientId: recipientId,
              amount: totalAmount,
            },
          ];
        }
        
        console.log('[createPayment] [SPLIT] Split rules finais:', JSON.stringify(splitRules, null, 2));
        
        // Validar que a soma do split eh exatamente 100%
        const splitSum = splitRules.reduce((sum, rule) => sum + rule.amount, 0);
        if (splitSum !== totalAmount) {
          console.error('[createPayment] [SPLIT] ERRO: Soma do split nao eh 100%!');
          console.error('[createPayment] [SPLIT] Total esperado:', totalAmount);
          console.error('[createPayment] [SPLIT] Soma obtida:', splitSum);
          throw new TRPCError({ 
            code: 'INTERNAL_SERVER_ERROR', 
            message: 'Soma do split invalida' 
          });
        }
        console.log('[createPayment] [SPLIT] Validacao OK: soma = 100%');
        
        // Verificar modo de operacao
        const apiKey = process.env.PAGARME_API_KEY || '';
        const modePrefix = apiKey.substring(0, 10);
        console.log('[createPayment] [MODE] API Key prefix:', modePrefix);
        console.log('[createPayment] [MODE] CRITICO: recipient_id deve ser criado no MESMO modo (test ou live)!');

        // Criar pedido com split
        const order = await createOrder({
          amount: totalAmount,
          customer: {
            name: registration.pilotName,
            email: registration.pilotEmail,
            document: registration.pilotCpf.replace(/\D/g, ''),
            phone: registration.phone || '11999999999',
          },
          paymentMethod: input.paymentMethod,
          creditCard: input.cardData ? {
            number: input.cardData.card_number,
            holderName: input.cardData.card_holder_name,
            expMonth: input.cardData.card_expiration_date.substring(0, 2),
            expYear: input.cardData.card_expiration_date.substring(2, 4),
            cvv: input.cardData.card_cvv,
          } : undefined,
          split: splitRules,
          metadata: {
            registrationId: String(registration.id),
            eventId: String(event.id),
            userId: String(ctx.user.id),
          },
        });

        // Salvar orderId na inscrição
        await db.updateRegistrationTransaction(registration.id, order.orderId);

        const charge = order.charges[0];
        
        // Logging detalhado da resposta
        console.log("[createPayment] Order response:", JSON.stringify(order, null, 2));
        console.log("[createPayment] Charge object:", JSON.stringify(charge, null, 2));
        console.log("[createPayment] pixQrCode:", charge.pixQrCode);

        // Extrair failure_reason se o charge falhou
        let failureReason = null;
        if (charge.status === 'failed') {
          console.log('[createPayment] [ERROR] Charge falhou! Inspecionando estrutura:');
          console.log('[createPayment] [ERROR] charge.last_transaction:', JSON.stringify(charge.last_transaction, null, 2));
          console.log('[createPayment] [ERROR] charge.failure_reason:', charge.failure_reason);
          console.log('[createPayment] [ERROR] charge.error:', charge.error);
          console.log('[createPayment] [ERROR] charge.gateway_response:', JSON.stringify(charge.gateway_response, null, 2));
          
          if (charge.last_transaction?.failure_reason) {
            failureReason = charge.last_transaction.failure_reason;
          } else if (charge.failure_reason) {
            failureReason = charge.failure_reason;
          } else if (charge.last_transaction?.error) {
            failureReason = charge.last_transaction.error;
          } else if (charge.gateway_response?.errors) {
            failureReason = JSON.stringify(charge.gateway_response.errors);
          } else {
            failureReason = 'Erro desconhecido ao processar pagamento';
          }
        }
        
        return {
          success: charge.status === 'paid' || charge.status === 'pending',
          transactionId: order.orderId,
          status: charge.status,
          pixQrCode: charge.pixQrCode || null,
          pixCode: charge.pixQrCode || null,
          pixQrCodeUrl: charge.pixQrCodeUrl || null,
          failureReason: failureReason,
        };
      }),

    // Buscar status de pagamento
    getPaymentStatus: protectedProcedure
      .input(z.object({
        registrationId: z.number(),
      }))
      .query(async ({ input }) => {
        const registration = await db.getRegistrationById(input.registrationId);
        if (!registration || !registration.transactionId) {
          return { status: 'pending', paid: false };
        }

        const { getOrderStatus } = await import('./pagarme');
        const order = await getOrderStatus(registration.transactionId);

        const charge = order.charges[0];

        return {
          status: charge.status,
          paid: charge.status === 'paid',
          transactionId: order.orderId,
        };
      }),

    // Buscar saldo do organizador
    getOrganizerBalance: organizerProcedure.query(async ({ ctx }) => {
      // Buscar organizador do usuário logado
      const organizer = await db.getOrganizerByOwnerId(ctx.user.openId);
      if (!organizer) {
        return { available: 0, waiting_funds: 0, transferred: 0 };
      }
      
      // Buscar usuário do organizador para obter recipientId
      const organizerUser = await db.getUserByOpenId(organizer.ownerId);
      if (!organizerUser || !organizerUser.recipientId) {
        return { available: 0, waiting_funds: 0, transferred: 0 };
      }

      const { getRecipientBalance } = await import('./pagarme');
      const balance = await getRecipientBalance(organizerUser.recipientId);

      return balance;
    }),
    
  }),

  eventMembers: router({
    // TODO: Implementar procedimentos de event members quando a tabela for criada
    // getMembers, inviteMember, updateMemberRole, removeMember
  }),
});

export type AppRouter = typeof appRouter;
