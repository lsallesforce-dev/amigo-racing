import type { CreateExpressContextOptions } from "@trpc/_server/adapters/express";
import type { User } from "./drizzle/schema.js";
import { sdk } from "./sdk.js";
import * as db from "./db.js";

// Definimos a interface de forma explícita para matar os erros de tipagem
export type TrpcContext = {
  req: CreateExpressContextOptions["req"];
  res: CreateExpressContextOptions["res"];
  user: (User & {
    recipientId?: string | null;
    role: 'user' | 'admin' | 'organizer' | 'participant';
  }) | null;
};

export async function createContext(
  opts: CreateExpressContextOptions
): Promise<TrpcContext> {
  let user: any = null;

  try {
    // Busca a identidade básica do token
    const authUser = await sdk.authenticateRequest(opts.req);

    if (authUser) {
      console.log(`[Context] Usuário autenticado: ${authUser.email} (OpenID: ${authUser.openId})`);
      // BUSCA REAL: Garante que estamos pegando os dados ATUALIZADOS 
      // do banco de dados pelo openId único, evitando o "Erro Wéliton"
      user = await db.getUserByOpenId(authUser.openId);

      // Middleware: Sincronização de Organizador
      if (user && user.role === 'organizer') {
        const organizer = await db.getOrganizerByOwnerId(user.openId);
        if (!organizer) {
          await db.createOrganizer({
            name: user.name || 'Organizador',
            description: '',
            ownerId: user.openId,
          });
        }
      }
    }
  } catch (error) {
    console.error('[Context] Erro na autenticação:', error);
    user = null;
  }

  return {
    req: opts.req,
    res: opts.res,
    user: user || null,
  };
}