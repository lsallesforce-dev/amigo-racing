import fs from 'fs';
import path from 'path';

const root = 'c:\\Users\\lsaud\\Downloads\\amigo-racing';
const apiDir = path.join(root, 'api');
const serverDir = path.join(apiDir, '_server');

// 1. Create _server directory if it doesn't exist
if (!fs.existsSync(serverDir)) {
    fs.mkdirSync(serverDir, { recursive: true });
    console.log(`Created ${serverDir}`);
}

// 2. Identify files to move back into _server
// Only index.ts should remain in api/
const apiFiles = fs.readdirSync(apiDir);
for (const file of apiFiles) {
    if (file === 'index.ts' || file === '_server') continue;

    const srcPath = path.join(apiDir, file);
    const destPath = path.join(serverDir, file);

    console.log(`  Moving ${srcPath} -> ${destPath}`);
    fs.renameSync(srcPath, destPath);
}

// 3. Update index.ts to import from _server
const indexPath = path.join(apiDir, 'index.ts');
if (fs.existsSync(indexPath)) {
    let content = fs.readFileSync(indexPath, 'utf8');
    content = content.replace(/from '\.\/app\.js'/g, "from './_server/app.js'");
    fs.writeFileSync(indexPath, content);
    console.log('Updated api/index.ts');
}

// 4. Fix specific TypeScript path errors from logs

// A. api/_server/_core/trpc.ts (now api/_server/_core/trpc.ts) 
// Error: Cannot find module '../../../const.js'
const trpcPath = path.join(serverDir, '_core', 'trpc.ts');
if (fs.existsSync(trpcPath)) {
    let content = fs.readFileSync(trpcPath, 'utf8');
    // It was likely trying to reach root const.js which is now 3 levels up from api/_server/_core/
    // actually, api/_server/_core/ -> api/_server -> api -> root (3 levels)
    // If it was already ../../../const.js, maybe it was wrong?
    // Let's check the content first.
}

console.log('Done!');
