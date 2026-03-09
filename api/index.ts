import createExpressApp from './_server/app.js';
import type { VercelRequest, VercelResponse } from "@vercel/node";

let _app: any;

export default async function handler(req: VercelRequest, res: VercelResponse) {
    try {
        console.log(`[API] Request: ${req.method} ${req.url}`);
        if (!_app) {
            console.log("[API] Initializing Express app...");
            _app = await createExpressApp();
            console.log("[API] Express app initialized.");
        }

        // Vercel routes all /api/(.*) over to this handler
        _app(req, res);
        return;
    } catch (error: any) {
        console.error("Vercel API Error:", error);
        return res.status(500).json({
            error: "API Runtime Error",
            message: error?.message || String(error),
            stack: error?.stack,
            path: req.url,
            method: req.method
        });
    }
}
