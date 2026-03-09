import fs from 'fs';
import path from 'path';

const root = 'c:\\Users\\lsaud\\Downloads\\amigo-racing';

function updateFile(filePath) {
    if (!filePath.endsWith('.ts') && !filePath.endsWith('.tsx')) return;

    let content = fs.readFileSync(filePath, 'utf8');
    let original = content;

    // 1. Fix lib/trpc.ts (already done manually, but good to have)
    if (filePath.endsWith('lib\\trpc.ts')) {
        content = content.replace(/from "\.\.\/api\/routers\.js"/g, 'from "../api/_server/routers.js"');
    }

    // 2. Fix depth issues in api/_server subfolders
    if (filePath.includes('api\\_server')) {
        // If it's in a subfolder (like _core or backend_routers)
        const parts = filePath.split(path.sep);
        const serverIndex = parts.indexOf('_server');
        const depth = parts.length - serverIndex - 2; // items after _server excluding filename

        if (depth === 1) { // e.g., api/_server/_core/trpc.ts
            content = content.replace(/from "\.\.\/const\.js"/g, 'from "../../const.js"');
            content = content.replace(/from "\.\.\/context\.js"/g, 'from "../context.js"');
        }

        // Single level fix (direct in api/_server)
        if (depth === 0) {
            // Already direct, but ensure we don't have redundant depths
            content = content.replace(/from "\.\.\/\.\.\/const\.js"/g, 'from "../const.js"');
        }
    }

    // 3. Fix sitemapRoute.ts specifically
    if (filePath.endsWith('api\\_server\\sitemapRoute.ts')) {
        content = content.replace(/from "\.\.\/\.\.\/sitemap\.js"/g, 'from "../sitemap.js"');
    }

    // 4. Client side hooks
    content = content.replace(/from "\.\.\/\.\.\/\.\.\/api\/routers\.js"/g, 'from "../../../api/_server/routers.js"');
    content = content.replace(/from "\.\.\/\.\.\/api\/routers\.js"/g, 'from "../../api/_server/routers.js"');

    if (content !== original) {
        fs.writeFileSync(filePath, content);
        console.log(`Updated ${filePath}`);
    }
}

function walk(dir) {
    const items = fs.readdirSync(dir);
    for (const item of items) {
        const fullPath = path.join(dir, item);
        const stat = fs.statSync(fullPath);
        if (stat.isDirectory()) {
            if (['node_modules', '.git', 'dist', '.AmigoRacingOriginal'].includes(item)) continue;
            walk(fullPath);
        } else {
            updateFile(fullPath);
        }
    }
}

console.log('Starting final import fix...');
walk(root);
console.log('Done!');
