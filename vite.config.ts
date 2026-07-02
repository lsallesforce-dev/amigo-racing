import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import { fileURLToPath } from 'url';
import path from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export default defineConfig({
    plugins: [
        react(),
        tailwindcss(),
    ],
    resolve: {
        alias: {
            '@': path.resolve(__dirname, './'),
            '@shared': path.resolve(__dirname, './'),
        },
    },
    server: {
        host: true,
        port: 5173,
        strictPort: false,
        proxy: {
            '^/api/(trpc|auth|oauth|raw-test|webhooks|images|qr-code|upload)': {
                target: 'http://127.0.0.1:3000',
                changeOrigin: true,
            },
        },
    },
});
