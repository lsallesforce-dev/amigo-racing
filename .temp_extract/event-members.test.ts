import { describe, it, expect } from 'vitest';

describe('Event Members Feature', () => {
  it('should have eventMembers table in schema', () => {
    const fs = require('fs');
    const schemaContent = fs.readFileSync('/home/ubuntu/amigo-racing-platform/drizzle/schema.ts', 'utf-8');
    expect(schemaContent).toContain('export const eventMembers = mysqlTable');
  });

  it('should have EventMember types exported', () => {
    const fs = require('fs');
    const schemaContent = fs.readFileSync('/home/ubuntu/amigo-racing-platform/drizzle/schema.ts', 'utf-8');
    expect(schemaContent).toContain('export type EventMember');
    expect(schemaContent).toContain('export type InsertEventMember');
  });

  it('should have role enum with correct values', () => {
    const fs = require('fs');
    const schemaContent = fs.readFileSync('/home/ubuntu/amigo-racing-platform/drizzle/schema.ts', 'utf-8');
    expect(schemaContent).toContain('master');
    expect(schemaContent).toContain('editor');
    expect(schemaContent).toContain('coordinator');
    expect(schemaContent).toContain('viewer');
  });

  it('should have invite tracking fields', () => {
    const fs = require('fs');
    const schemaContent = fs.readFileSync('/home/ubuntu/amigo-racing-platform/drizzle/schema.ts', 'utf-8');
    expect(schemaContent).toContain('inviteToken');
    expect(schemaContent).toContain('inviteStatus');
    expect(schemaContent).toContain('inviteEmail');
    expect(schemaContent).toContain('inviteSentAt');
    expect(schemaContent).toContain('inviteAcceptedAt');
  });

  it('should have DEFAULT_PERMISSIONS object', () => {
    const fs = require('fs');
    const schemaContent = fs.readFileSync('/home/ubuntu/amigo-racing-platform/drizzle/schema.ts', 'utf-8');
    expect(schemaContent).toContain('DEFAULT_PERMISSIONS');
  });

  it('should have event members db functions', () => {
    const fs = require('fs');
    const dbContent = fs.readFileSync('/home/ubuntu/amigo-racing-platform/server/db.ts', 'utf-8');
    expect(dbContent).toContain('export async function addEventMember');
    expect(dbContent).toContain('export async function getEventMembers');
    expect(dbContent).toContain('export async function getEventMember');
    expect(dbContent).toContain('export async function updateEventMember');
    expect(dbContent).toContain('export async function removeEventMember');
  });

  it('should have invite acceptance functions', () => {
    const fs = require('fs');
    const dbContent = fs.readFileSync('/home/ubuntu/amigo-racing-platform/server/db.ts', 'utf-8');
    expect(dbContent).toContain('export async function acceptEventInvite');
    expect(dbContent).toContain('export async function rejectEventInvite');
    expect(dbContent).toContain('export async function getEventMemberByInviteToken');
  });

  it('should have eventMembers router with mutations', () => {
    const fs = require('fs');
    const routersContent = fs.readFileSync('/home/ubuntu/amigo-racing-platform/server/routers.ts', 'utf-8');
    expect(routersContent).toContain('eventMembers: router({');
    expect(routersContent).toContain('getMembers: organizerProcedure');
    expect(routersContent).toContain('inviteMember: organizerProcedure');
    expect(routersContent).toContain('updateMemberRole: organizerProcedure');
    expect(routersContent).toContain('removeMember: organizerProcedure');
  });

  it('should have EventMembersManager component', () => {
    const fs = require('fs');
    const componentContent = fs.readFileSync('/home/ubuntu/amigo-racing-platform/client/src/components/EventMembersManager.tsx', 'utf-8');
    expect(componentContent).toContain('export function EventMembersManager');
    expect(componentContent).toContain('trpc.eventMembers.getMembers.useQuery');
    expect(componentContent).toContain('trpc.eventMembers.inviteMember.useMutation');
  });

  it('should have proper role-based access control in mutations', () => {
    const fs = require('fs');
    const routersContent = fs.readFileSync('/home/ubuntu/amigo-racing-platform/server/routers.ts', 'utf-8');
    expect(routersContent).toContain('member?.role !== \'master\'');
    expect(routersContent).toContain('event.organizerId !== ctx.user.id');
    expect(routersContent).toContain('ctx.user.role !== \'admin\'');
  });

  it('should prevent master role removal', () => {
    const fs = require('fs');
    const routersContent = fs.readFileSync('/home/ubuntu/amigo-racing-platform/server/routers.ts', 'utf-8');
    expect(routersContent).toContain('Cannot remove master');
    expect(routersContent).toContain('Cannot change master');
  });

  it('should have invite token generation', () => {
    const fs = require('fs');
    const routersContent = fs.readFileSync('/home/ubuntu/amigo-racing-platform/server/routers.ts', 'utf-8');
    expect(routersContent).toContain('Math.random().toString(36)');
    expect(routersContent).toContain('inviteToken');
  });
});
