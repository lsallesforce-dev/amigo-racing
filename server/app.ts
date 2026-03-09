import "dotenv/config";
import express from "express";
import { createExpressMiddleware } from "@trpc/server/adapters/express";
import { registerOAuthRoutes } from "./oauth.ts";
import { appRouter } from "./routers.ts";
import { createContext } from "./context.ts";
import cookieParser from "cookie-parser";
import cors from "cors";
import { ENV } from "./env.ts";

export async function createExpressApp() {
    const app = express();

    app.use(cors({
        origin: ENV.allowedOrigins,
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

    const sitemapRoute = await import('./sitemapRoute.ts');
    sitemapRoute.setupSitemapRoute(app);

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
            createContext: createContext as any,
        })
    );

    return app;
}
