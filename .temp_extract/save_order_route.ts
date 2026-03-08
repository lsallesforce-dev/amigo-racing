    saveOrderPositions: organizerProcedure
      .input(z.object({
        eventId: z.number(),
        order: z.record(z.string(), z.number()), // { categoryId: orderPosition }
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
        
        // Update orderPosition for each category
        for (const [categoryIdStr, orderPosition] of Object.entries(input.order)) {
          const categoryId = parseInt(categoryIdStr);
          
          // Get existing config or create new one
          const existingConfigs = await db.getStartOrderConfigsByEventId(input.eventId);
          const existingConfig = existingConfigs.find(c => c.categoryId === categoryId);
          
          if (existingConfig) {
            // Update existing config with new orderPosition
            await db.upsertStartOrderConfig({
              eventId: input.eventId,
              categoryId,
              orderPosition,
              numberStart: existingConfig.numberStart,
              numberEnd: existingConfig.numberEnd,
              startTime: existingConfig.startTime,
              intervalSeconds: existingConfig.intervalSeconds,
            });
          } else {
            // Create new config with default values
            await db.upsertStartOrderConfig({
              eventId: input.eventId,
              categoryId,
              orderPosition,
              numberStart: 1,
              numberEnd: 1,
              startTime: '08:00',
              intervalSeconds: 300,
            });
          }
        }
        
        return { success: true };
      }),
