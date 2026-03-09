import { createExpressApp } from "../server/app.ts";
import type { VercelRequest, VercelResponse } from "@vercel/node";

let _app: any;

export default async function handler(req: VercelRequest, res: VercelResponse) {
    if (!_app) {
        _app = await createExpressApp();
    }

    // Vercel routes all /api/(.*) over to this handler
    return _app(req, res);
}
