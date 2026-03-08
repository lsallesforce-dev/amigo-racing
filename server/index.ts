import "dotenv/config";
import express from "express";
import { createServer } from "http";
import net from "net";
import { createExpressMiddleware } from "@trpc/server/adapters/express";
import { registerOAuthRoutes } from "./oauth.ts";
import { appRouter } from "./routers.ts";
import { createContext } from "./context.ts";
import { serveStatic, setupVite } from "./vite.ts";
import { setupSitemapRoute } from "./sitemapRoute.ts";
import cookieParser from "cookie-parser";
import cors from "cors";
import { ENV } from "./env.ts";

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

  app.use(cors({
    origin: ['http://localhost:3000', 'http://localhost:5173'],
    credentials: true
  }));

  app.use((req, res, next) => {
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('X-Frame-Options', 'SAMEORIGIN');
    res.setHeader('X-XSS-Protection', '1; mode=block');
    res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate, max-age=0, private');
    res.setHeader('Pragma', 'no-cache');
    res.setHeader('Expires', '0');
    next();
  });

  app.use(express.json({ limit: "50mb" }));
  app.use(express.urlencoded({ limit: "50mb", extended: true }));
  app.use(cookieParser(ENV.cookieSecret));

  registerOAuthRoutes(app);
  setupSitemapRoute(app);

  const { imageProxyHandler } = await import('./imageProxy.ts');
  app.get('/api/images/:key(*)', imageProxyHandler);

  const { qrCodeProxyHandler } = await import('./qrCodeProxy.ts');
  app.get('/api/qr-code', qrCodeProxyHandler);

  const pagarmeWebhook = await import('./pagarme.ts');
  app.use('/api/webhooks', pagarmeWebhook.default);

  const uploadRoute = await import('./uploadRoute.ts');
  app.use('/api', uploadRoute.default);

  app.use(
    "/api/trpc",
    createExpressMiddleware({
      router: appRouter,
      createContext,
    })
  );

  if (!ENV.isProduction) {
    await setupVite(app, server);
  } else {
    serveStatic(app);
  }

  const port = 3000;
  server.listen(port, "0.0.0.0", () => {
    console.log(`--------------------------------`);
    console.log(`🚀 SERVIDOR INICIADO NA PORTA: ${port}`);
    console.log(`URL: http://localhost:${port}`);
    console.log(`--------------------------------`);
  }).on('error', (err: any) => {
    if (err.code === 'EADDRINUSE') {
      console.error(`\n❌ ERRO: A porta ${port} está ocupada!`);
      process.exit(1);
    }
  });
}

startServer().catch(console.error);
