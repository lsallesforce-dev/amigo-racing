import dotenv from "dotenv";
import path from "path";

// Carrega o arquivo .env da raiz do projeto
dotenv.config({ path: path.resolve(process.cwd(), ".env") });

console.log("[Env] Loading configuration...");

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

  // Servidor de Email (Zoho SMTP)
  smtpUser: process.env.SMTP_USER || "amigo@amigoracing.com.br",
  smtpPassword: process.env.SMTP_PASSWORD || "",

  // Pagar.me (Onde o dinheiro entra)
  pagarmeApiKey: process.env.PAGARME_API_KEY || "",
  pagarmePublicKey: process.env.PAGARME_PUBLIC_KEY || "",
  pagarmeAccountId: process.env.PAGARME_ACCOUNT_ID || "",
  pagarmeApiUrl: process.env.PAGARME_API_URL || "https://api.pagar.me/core/v5",
  pagarmePlatformRecipientId: process.env.PAGARME_PLATFORM_RECIPIENT_ID || "",

  // Storage (Provido pelo Manus)
  forgeApiUrl: process.env.BUILT_IN_FORGE_API_URL || "https://api.manus.pro",
  forgeApiKey: process.env.BUILT_IN_FORGE_API_KEY || "",

  // CORS (Segurança em nuvem)
  allowedOrigins: process.env.ALLOWED_ORIGINS
    ? process.env.ALLOWED_ORIGINS.split(',').map(o => o.trim())
    : ['http://localhost:3000', 'http://localhost:5173', 'https://amigo-racing.vercel.app'],
};

const mask = (str: string | undefined) => {
  if (!str || str.length < 8) return "MISSING";
  return `${str.substring(0, 4)}...${str.substring(str.length - 4)}`;
};

console.log("[Env] Status Check:", {
  NODE_ENV: process.env.NODE_ENV,
  isProd: ENV.isProduction,
  dbUrl: mask(ENV.databaseUrl),
  jwtSecret: ENV.cookieSecret === "uma-senha-muito-segura-e-longa-de-32-caracteres" ? "FALLBACK_DETECTED" : "LOADED_OK",
  oAuthUrl: ENV.oAuthServerUrl,
  allowedOrigins: ENV.allowedOrigins
});
