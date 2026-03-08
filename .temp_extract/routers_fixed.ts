    saveOrderPositions: organizerProcedure
      .input(z.object({
        eventId: z.number(),
        order: z.record(z.string(), z.number()),
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
        
        // Buscar todas as configurações existentes uma vez
        const existingConfigs = await db.getStartOrderConfigsByEventId(input.eventId);
        
        // Criar promises para todas as operações de upsert
        const updatePromises = Object.entries(input.order).map(async ([categoryIdStr, orderPosition]) => {
          const categoryId = parseInt(categoryIdStr);
          const existingConfig = existingConfigs.find(c => c.categoryId === categoryId);
          
          if (existingConfig) {
            return await db.upsertStartOrderConfig({
              eventId: input.eventId,
              categoryId,
              orderPosition,
              numberStart: existingConfig.numberStart,
              numberEnd: existingConfig.numberEnd,
              startTime: existingConfig.startTime,
              intervalSeconds: existingConfig.intervalSeconds,
            });
          } else {
            return await db.upsertStartOrderConfig({
              eventId: input.eventId,
              categoryId,
              orderPosition,
              numberStart: 1,
              numberEnd: 1,
              startTime: '08:00',
              intervalSeconds: 300,
            });
          }
        });
        
        // Aguardar todas as operações
        await Promise.all(updatePromises);
        
        return { success: true };
      }),
