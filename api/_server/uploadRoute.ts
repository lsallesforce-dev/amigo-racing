import { Router } from "express";
import multer from "multer";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { dirname } from "path";
import { sdk } from "./sdk.js";
import * as storage from "./storage.js";


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

        } catch (error) {
            const storageError = error instanceof Error ? error.message : String(error);
            console.warn("[UploadRoute] Storage proxy failed:", storageError);

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
                const fallbackError = localError instanceof Error ? localError.message : String(localError);
                console.error("[UploadRoute] Local fallback also failed:", fallbackError);
                return res.status(500).json({ 
                    error: "Erro interno no servidor de upload",
                    details: {
                        storage: storageError,
                        fallback: fallbackError,
                        path: relativePath
                    }
                });
            }
        }
    } catch (error) {
        console.error("[UploadRoute] Erro na requisição de upload:", error);
        if (error instanceof Error && (error.message.includes("session") || error.message.includes("not found") || error.name === "ForbiddenError")) {
            console.warn("[UploadRoute] Falha de autenticação:", error.message);
            return res.status(401).json({ error: "Não autorizado" });
        }
        return res.status(500).json({ error: "Erro crítico no servidor de upload: " + (error instanceof Error ? error.message : String(error)) });
    }
});

export default router;
