import { Router } from "express";
import multer from "multer";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { dirname } from "path";
import { sdk } from "./sdk.ts";
import * as storage from "./storage.ts";


const router = Router();
const upload = multer({
    storage: multer.memoryStorage(),
    limits: {
        fileSize: 50 * 1024 * 1024, // 50MB limit
    }
});

router.post("/upload", upload.single("file"), async (req, res) => {
    try {
        // Authenticate user
        await sdk.authenticateRequest(req);

        if (!req.file) {
            return res.status(400).json({ error: "Nenhum arquivo enviado" });
        }

        const file = req.file;
        // Normalize filename and create relative path
        const safeName = file.originalname.replace(/[^a-zA-Z0-9.-]/g, "_");
        const relativePath = `uploads/${Date.now()}-${safeName}`;

        console.log(`[Upload] Recebido arquivo: ${file.originalname} (${file.size} bytes). Enviando para storage...`);

        try {
            // Try official storage first
            await storage.storagePut(relativePath, file.buffer, { contentType: file.mimetype });
            const url = await storage.storageGet(relativePath);
            return res.json({ url });
        } catch (error) {
            console.warn("[UploadRoute] Storage proxy failed, using fallback:", error instanceof Error ? error.message : error);

            // Fallback Plan B: Save locally to public/uploads if possible
            try {
                const publicUploadsDir = path.resolve(process.cwd(), "public", "uploads");
                if (!fs.existsSync(publicUploadsDir)) {
                    fs.mkdirSync(publicUploadsDir, { recursive: true });
                }
                const localFileName = `${Date.now()}-${safeName}`;
                const localPath = path.join(publicUploadsDir, localFileName);
                fs.writeFileSync(localPath, file.buffer);
                return res.json({ url: `/uploads/${localFileName}` });
            } catch (localError) {
                console.error("[UploadRoute] Local fallback also failed:", localError);
                return res.status(500).json({ error: "Erro interno no servidor de upload (e fallback falhou)" });
            }
        }
    } catch (error) {
        console.error("[UploadRoute] Erro na requisição de upload:", error);
        if (error instanceof Error && (error.message.includes("session") || error.message.includes("not found") || error.name === "ForbiddenError")) {
            return res.status(401).json({ error: "Não autorizado" });
        }
        return res.status(500).json({ error: "Erro crítico no servidor de upload" });
    }
});

export default router;
