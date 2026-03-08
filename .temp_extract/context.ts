import type { CreateExpressContextOptions } from "@trpc/server/adapters/express";
import type { User } from "../../drizzle/schema";
import { sdk } from "./sdk";
import * as db from "../db";

export type TrpcContext = {
  req: CreateExpressContextOptions["req"];
  res: CreateExpressContextOptions["res"];
  user: User | null;
};

export async function createContext(
  opts: CreateExpressContextOptions
): Promise<TrpcContext> {
  let user: User | null = null;

  try {
    user = await sdk.authenticateRequest(opts.req);
    
    // Middleware: Garantir que usuário ORGANIZADOR tenha registro de organizador
    if (user && user.role === 'organizer') {
      const organizer = await db.getOrganizerByOwnerId(user.openId);
      
      // Se usuário é organizador mas não tem registro, criar automaticamente
      if (!organizer) {
        await db.createOrganizer({
          name: user.name || 'Organizador',
          description: '',
          ownerId: user.openId,
        });
      }
    }
  } catch (error) {
    // Authentication is optional for public procedures.
    user = null;
  }

  return {
    req: opts.req,
    res: opts.res,
    user,
  };
}
