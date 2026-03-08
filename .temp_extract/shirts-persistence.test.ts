import { describe, it, expect } from 'vitest';
import fs from 'fs';
import path from 'path';

describe('Shirts Persistence', () => {
  it('should have includeShirts in routers.ts create mutation', () => {
    const filePath = path.join(__dirname, '../server/routers.ts');
    const content = fs.readFileSync(filePath, 'utf-8');
    
    // Check for includeShirts in create mutation
    expect(content).toContain('includeShirts: z.boolean().default(true).optional()');
  });

  it('should have includeShirts in routers.ts update mutation', () => {
    const filePath = path.join(__dirname, '../server/routers.ts');
    const content = fs.readFileSync(filePath, 'utf-8');
    
    // Check for includeShirts in update mutation schema
    expect(content).toContain('includeShirts: z.boolean().optional()');
  });

  it('should have includeShirts in routers.ts createExternal mutation', () => {
    const filePath = path.join(__dirname, '../server/routers.ts');
    const content = fs.readFileSync(filePath, 'utf-8');
    
    // Check that includeShirts appears in createExternal
    const createExternalSection = content.substring(
      content.indexOf('createExternal: organizerProcedure'),
      content.indexOf('createExternal: organizerProcedure') + 1500
    );
    expect(createExternalSection).toContain('includeShirts: z.boolean().default(true).optional()');
  });

  it('should load includeShirts from event in EventDetails.tsx', () => {
    const filePath = path.join(__dirname, '../client/src/pages/EventDetails.tsx');
    const content = fs.readFileSync(filePath, 'utf-8');
    
    // Check for loading from event
    expect(content).toContain('(event as any)?.includeShirts');
    
    // Check for useEffect to update when event changes
    expect(content).toContain('useEffect');
  });

  it('should send includeShirts in handleUpdateEvent', () => {
    const filePath = path.join(__dirname, '../client/src/pages/OrganizerPanel.tsx');
    const content = fs.readFileSync(filePath, 'utf-8');
    
    // Check for includeShirts being sent in update
    expect(content).toContain('if (editingEvent.includeShirts !== undefined) updates.includeShirts = editingEvent.includeShirts');
  });

  it('should have includeShirts field in database schema', () => {
    const filePath = path.join(__dirname, '../drizzle/schema.ts');
    const content = fs.readFileSync(filePath, 'utf-8');
    
    // Check for includeShirts in events table
    expect(content).toContain('includeShirts: boolean("includeShirts")');
    expect(content).toContain('.default(true).notNull()');
  });

  it('should show shirts fields conditionally in registration form', () => {
    const filePath = path.join(__dirname, '../client/src/pages/EventDetails.tsx');
    const content = fs.readFileSync(filePath, 'utf-8');
    
    // Check for conditional rendering of shirts
    expect(content).toContain('{includeShirts && (');
    expect(content).toContain('pilotShirtSize');
    expect(content).toContain('navigatorShirtSize');
  });
});
