import dotenv from "dotenv";
import path from "path";

// Carrega o arquivo .env da raiz do projeto
dotenv.config({ path: path.resolve(process.cwd(), ".env") });

export const ENV = {
  // Configurações do App
  appId: process.env.VITE_APP_ID || "amigo-racing",
  cookieSecret: process.env.JWT_SECRET || "uma-senha-muito-segura-e-longa-de-32-caracteres",

  // Banco de Dados (O coração do Calendário)
  databaseUrl: process.env.DATABASE_URL || "",

  // URLs de Servidor
  oAuthServerUrl: process.env.OAUTH_SERVER_URL || "http://localhost:3000",
  ownerOpenId: process.env.OWNER_OPEN_ID || "",

  // Verificação de ambiente
  isProduction: process.env.NODE_ENV === "production" || !!process.env.RENDER,

  // Pagar.me (Onde o dinheiro entra)
  pagarmeApiKey: process.env.PAGARME_API_KEY || "",
  pagarmePublicKey: process.env.PAGARME_PUBLIC_KEY || "",
  pagarmeAccountId: process.env.PAGARME_ACCOUNT_ID || "",
  pagarmeApiUrl: process.env.PAGARME_API_URL || "https://api.pagar.me/core/v5",
  pagarmePlatformRecipientId: process.env.PAGARME_PLATFORM_RECIPIENT_ID || "",

  // Storage (Provido pelo Manus)
  forgeApiUrl: process.env.BUILT_IN_FORGE_API_URL || "https://api.manus.pro",
  forgeApiKey: process.env.BUILT_IN_FORGE_API_KEY || "",
};

console.log("[Env] Variables loaded:", {
  hasCookieSecret: !!ENV.cookieSecret,
  hasDatabaseUrl: !!ENV.databaseUrl,
  secretLength: ENV.cookieSecret?.length ?? 0,
  oAuthUrl: ENV.oAuthServerUrl,
  isProd: ENV.isProduction
});
