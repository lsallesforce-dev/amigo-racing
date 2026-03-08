import "dotenv/config";
import express from "express";
import { createServer } from "http";
import net from "net";
import { createExpressMiddleware } from "@trpc/server/adapters/express";
import { registerOAuthRoutes } from "./oauth";
import { appRouter } from "../routers";
import { createContext } from "./context";
import { serveStatic, setupVite } from "./vite";
import { setupSitemapRoute } from "./sitemapRoute";

function isPortAvailable(port: number): Promise<boolean> {
  return new Promise(resolve => {
    const server = net.createServer();
    server.listen(port, () => {
      server.close(() => resolve(true));
    });
    server.on("error", () => resolve(false));
  });
}

async function findAvailablePort(startPort: number = 3000): Promise<number> {
  for (let port = startPort; port < startPort + 20; port++) {
    if (await isPortAvailable(port)) {
      return port;
    }
  }
  throw new Error(`No available port found starting from ${startPort}`);
}

async function startServer() {
  const app = express();
  const server = createServer(app);
  
  // Configurar CORS para aceitar amigoracing.com.br e manus.space
  // Nota: Domínios manus.space são dinâmicos, então permitimos qualquer subdomínio manus.space
  const allowedOrigins = [
    'https://amigoracing.com.br',
    'https://www.amigoracing.com.br',
    'http://localhost:3000',
    'http://localhost:5173',
  ];
  
  // Função para verificar se origem é permitida (inclui wildcard para manus.space)
  const isOriginAllowed = (origin: string | undefined): boolean => {
    if (!origin) return false;
    if (allowedOrigins.includes(origin)) return true;
    // Permitir qualquer subdomínio manus.space ou manus.computer
    if (origin.includes('manus.space') || origin.includes('manus.computer')) {
      return true;
    }
    return false;
  };
  
  app.use((req, res, next) => {
    const origin = req.headers.origin;
    
    if (origin && isOriginAllowed(origin)) {
      res.setHeader('Access-Control-Allow-Origin', origin);
      res.setHeader('Access-Control-Allow-Credentials', 'true');
      res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS, PATCH');
      res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-Requested-With');
      res.setHeader('Access-Control-Max-Age', '86400');
    } else {
      res.setHeader('Access-Control-Allow-Origin', '*');
    }
    
    // Headers de seguranca adicionais
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('X-Frame-Options', 'SAMEORIGIN');
    res.setHeader('X-XSS-Protection', '1; mode=block');
    
    // Headers agressivos de cache para evitar cache do navegador
    res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate, max-age=0, private');
    res.setHeader('Pragma', 'no-cache');
    res.setHeader('Expires', '0');
    res.setHeader('Surrogate-Control', 'no-store');
    
    if (req.method === 'OPTIONS') {
      return res.sendStatus(200);
    }
    next();
  });
  
  // Configure body parser with larger size limit for file uploads
  app.use(express.json({ limit: "50mb" }));
  app.use(express.urlencoded({ limit: "50mb", extended: true }));
  // OAuth callback under /api/oauth/callback
  registerOAuthRoutes(app);
  // Sitemap and robots.txt
  setupSitemapRoute(app);
  // Image proxy endpoint
  const { imageProxyHandler } = await import('./imageProxy');
  app.get('/api/images/:key(*)', imageProxyHandler);
  
  // QR Code proxy endpoint (para carregar imagens do Pagar.me)
  const { qrCodeProxyHandler } = await import('./qrCodeProxy');
  app.get('/api/qr-code', qrCodeProxyHandler);
  app.options('/api/qr-code', (req, res) => {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
    res.sendStatus(200);
  });
  // Webhook Pagar.me
  const pagarmeWebhook = await import('../webhooks/pagarme');
  app.use('/api/webhooks', pagarmeWebhook.default);
  // tRPC API
  app.use(
    "/api/trpc",
    createExpressMiddleware({
      router: appRouter,
      createContext,
    })
  );
  // development mode uses Vite, production mode uses static files
  if (process.env.NODE_ENV === "development") {
    await setupVite(app, server);
  } else {
    serveStatic(app);
  }

  const preferredPort = parseInt(process.env.PORT || "3000");
  const port = await findAvailablePort(preferredPort);

  if (port !== preferredPort) {
    console.log(`Port ${preferredPort} is busy, using port ${port} instead`);
  }

  server.listen(port, () => {
    console.log(`Server running on http://localhost:${port}/`);
  });
}

startServer().catch(console.error);
