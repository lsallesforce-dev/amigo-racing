import createExpressApp from './server/app.js';
import type { VercelRequest, VercelResponse } from "@vercel/node";

let _app: any;

export default async function handler(req: VercelRequest, res: VercelResponse) {
    try {
        if (!_app) {
            _app = await createExpressApp();
        }

        // Vercel routes all /api/(.*) over to this handler
        return _app(req, res);
    } catch (error: any) {
        console.error("Vercel API Initialization Error:", error);
        return res.status(500).json({
            error: "API Initialization Error",
            message: error?.message || String(error),
            stack: error?.stack,
            name: error?.name
        });
    }
}
