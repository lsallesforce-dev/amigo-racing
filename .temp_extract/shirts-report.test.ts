import { describe, it, expect } from 'vitest';

describe('Shirts Report Feature', () => {
  it('should have getShirtsReport function exported from db.ts', () => {
    const fs = require('fs');
    const dbContent = fs.readFileSync('/home/ubuntu/amigo-racing-platform/server/db.ts', 'utf-8');
    expect(dbContent).toContain('export async function getShirtsReport');
  });

  it('should return correct structure from getShirtsReport', () => {
    const fs = require('fs');
    const dbContent = fs.readFileSync('/home/ubuntu/amigo-racing-platform/server/db.ts', 'utf-8');
    expect(dbContent).toContain('totalShirts');
    expect(dbContent).toContain('pilotShirts');
    expect(dbContent).toContain('navigatorShirts');
    expect(dbContent).toContain('byCategory');
    expect(dbContent).toContain('shirtSizes');
  });

  it('should have getShirtsReport mutation in routers.ts', () => {
    const fs = require('fs');
    const routersContent = fs.readFileSync('/home/ubuntu/amigo-racing-platform/server/routers.ts', 'utf-8');
    expect(routersContent).toContain('getShirtsReport: organizerProcedure');
  });

  it('should have proper authorization check in getShirtsReport', () => {
    const fs = require('fs');
    const routersContent = fs.readFileSync('/home/ubuntu/amigo-racing-platform/server/routers.ts', 'utf-8');
    const getShirtsReportSection = routersContent.substring(
      routersContent.indexOf('getShirtsReport: organizerProcedure'),
      routersContent.indexOf('getShirtsReport: organizerProcedure') + 1000
    );
    expect(getShirtsReportSection).toContain('ctx.user.role');
    expect(getShirtsReportSection).toContain('organizer.ownerId');
  });

  it('should have ShirtsReport component in client', () => {
    const fs = require('fs');
    const componentContent = fs.readFileSync('/home/ubuntu/amigo-racing-platform/client/src/components/ShirtsReport.tsx', 'utf-8');
    expect(componentContent).toContain('export function ShirtsReport');
  });

  it('should have ShirtsReport component with charts', () => {
    const fs = require('fs');
    const componentContent = fs.readFileSync('/home/ubuntu/amigo-racing-platform/client/src/components/ShirtsReport.tsx', 'utf-8');
    expect(componentContent).toContain('BarChart');
    expect(componentContent).toContain('PieChart');
    expect(componentContent).toContain('Table');
  });

  it('should have ShirtsReportContainer in OrganizerPanel', () => {
    const fs = require('fs');
    const organizerPanelContent = fs.readFileSync('/home/ubuntu/amigo-racing-platform/client/src/pages/OrganizerPanel.tsx', 'utf-8');
    expect(organizerPanelContent).toContain('ShirtsReportContainer');
    expect(organizerPanelContent).toContain('trpc.registrations.getShirtsReport.useQuery');
  });

  it('should have shirts tab in OrganizerPanel', () => {
    const fs = require('fs');
    const organizerPanelContent = fs.readFileSync('/home/ubuntu/amigo-racing-platform/client/src/pages/OrganizerPanel.tsx', 'utf-8');
    expect(organizerPanelContent).toContain('value="shirts"');
    expect(organizerPanelContent).toContain('Relatório de Camisetas');
  });
});
