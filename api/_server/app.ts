import "dotenv/config";
import express from "express";
import path from "path";
import { getDb } from "./db.js";
import { createExpressMiddleware } from "@trpc/server/adapters/express";
import { registerOAuthRoutes } from "./oauth.js";
import { appRouter } from "./routers.js";
import { createContext } from "./context.js";
import cookieParser from "cookie-parser";
import cors from "cors";
import { ENV } from "./env.js";

import { setupSitemapRoute } from "./sitemapRoute.js";
import { imageProxyHandler } from "./imageProxy.js";
import { qrCodeProxyHandler } from "./qrCodeProxy.js";
import pagarmeWebhook from "./pagarme.js";
import uploadRoute from "./uploadRoute.js";

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

    app.use(express.static(path.join(process.cwd(), "public")));

    // Raw DB Test Route to bypass TRPC and see exact postgres.js error
    app.get('/api/raw-test', async (req, res) => {
        try {
            const dbInstance = await getDb();
            if (!dbInstance) return res.status(500).json({ error: "No DB Connection" });
            const schema = await import('./schema.js');
            const events = await dbInstance.select().from(schema.events);
            res.json(events);
        } catch (err: any) {
            console.error("RAW DB ERROR", err);
            res.status(500).json({
                raw_error: JSON.parse(JSON.stringify(err, Object.getOwnPropertyNames(err)))
            });
        }
    });

    app.use(express.json({ limit: "50mb" }));
    app.use(express.urlencoded({ limit: "50mb", extended: true }));
    app.use(cookieParser(ENV.cookieSecret));

    registerOAuthRoutes(app);

    setupSitemapRoute(app);
    app.get('/api/images/:key(*)', imageProxyHandler);
    app.get('/api/qr-code', qrCodeProxyHandler);
    app.use('/api/webhooks', pagarmeWebhook);
    app.use('/api', uploadRoute);

    app.use(
        "/api/trpc",
        createExpressMiddleware({
            router: appRouter,
            createContext: createContext as any,
        })
    );

    return app;
}

export default createExpressApp;
