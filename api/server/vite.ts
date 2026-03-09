import express, { Express } from "express";
import fs from "fs";
import path, { dirname } from "path";
import { fileURLToPath } from "url";
import { createServer as createViteServer } from "vite";
import { type Server } from "http";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

export async function setupVite(app: Express, server: Server) {
    const vite = await createViteServer({
        server: {
            middlewareMode: true,
            hmr: { server },
        },
        appType: "custom",
    });

    app.use(vite.middlewares);
    app.use("*", async (req, res, next) => {
        // Se a requisiÃ§Ã£o for para a API, deixar passar
        if (req.originalUrl.startsWith('/api')) {
            return next();
        }

        try {
            const rootPath = path.resolve(__dirname, "..");
            const templatePath = path.resolve(rootPath, "index.html");

            if (!fs.existsSync(templatePath)) {
                return res.status(404).end("index.html not found");
            }

            let template = fs.readFileSync(templatePath, "utf-8");

            // Inject Vite HMR
            template = await vite.transformIndexHtml(req.originalUrl, template);

            res.status(200).set({ "Content-Type": "text/html" }).end(template);
        } catch (e) {
            vite.ssrFixStacktrace(e as Error);
            next(e);
        }
    });
}

export function serveStatic(app: Express) {
    const rootPath = path.resolve(__dirname, "..");
    const distPath = path.resolve(rootPath, "dist");

    if (!fs.existsSync(distPath)) {
        // Se nÃ£o existir dist, tentar servir do root (para desenvolvimento simplificado)
        app.use(express.static(rootPath));
        app.use("*", (_req, res) => {
            res.sendFile(path.resolve(rootPath, "index.html"));
        });
        return;
    }

    app.use(express.static(distPath));
    app.use("*", (_req, res) => {
        res.sendFile(path.resolve(distPath, "index.html"));
    });
}
