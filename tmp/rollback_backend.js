import fs from 'fs';
import path from 'path';

const root = 'c:\\Users\\lsaud\\Downloads\\amigo-racing';
const apiDir = path.join(root, 'api');
const serverDir = path.join(apiDir, '_server');

// 1. Define files to move to api/ directly
const filesToMove = [
    { src: 'app.ts', dest: 'app.ts' },
    { src: 'db.ts', dest: 'db.ts' },
    { src: 'drizzle/schema.ts', dest: 'schema.ts' },
    { src: 'env.ts', dest: 'env.ts' },
    { src: 'routers.ts', dest: 'routers.ts' },
    { src: 'cookies.ts', dest: 'cookies.ts' },
    { src: 'pagarme.ts', dest: 'pagarme.ts' },
    { src: 'storage.ts', dest: 'storage.ts' },
    { src: 'context.ts', dest: 'context.ts' },
    { src: 'oauth.ts', dest: 'oauth.ts' },
    { src: 'sdk.ts', dest: 'sdk.ts' },
    { src: 'bank-validation.ts', dest: 'bank-validation.ts' },
    { src: 'email-service.ts', dest: 'email-service.ts' },
    { src: 'email-templates.ts', dest: 'email-templates.ts' },
    { src: 'imageProxy.ts', dest: 'imageProxy.ts' },
    { src: 'qrCodeProxy.ts', dest: 'qrCodeProxy.ts' },
    { src: 'sitemapRoute.ts', dest: 'sitemapRoute.ts' },
    { src: 'uploadRoute.ts', dest: 'uploadRoute.ts' },
    { src: 'vite.ts', dest: 'vite.ts' }
];

// 2. Define directories to move
const dirsToMove = [
    { src: '_core', dest: '_core' },
    { src: 'utils', dest: 'utils' },
    { src: 'routers', dest: 'backend_routers' }
];

console.log('Moving files...');
for (const file of filesToMove) {
    const srcPath = path.join(serverDir, file.src);
    const destPath = path.join(apiDir, file.dest);
    if (fs.existsSync(srcPath)) {
        console.log(`  Moving ${srcPath} -> ${destPath}`);
        fs.mkdirSync(path.dirname(destPath), { recursive: true });
        fs.renameSync(srcPath, destPath);
    }
}

console.log('Moving directories...');
for (const dir of dirsToMove) {
    const srcPath = path.join(serverDir, dir.src);
    const destPath = path.join(apiDir, dir.dest);
    if (fs.existsSync(srcPath)) {
        console.log(`  Moving ${srcPath} -> ${destPath}`);
        if (fs.existsSync(destPath)) {
            // merge if exists
            const files = fs.readdirSync(srcPath);
            for (const f of files) {
                fs.renameSync(path.join(srcPath, f), path.join(destPath, f));
            }
        } else {
            fs.renameSync(srcPath, destPath);
        }
    }
}

// 3. Update imports project-wide
function updateImports(filePath) {
    if (!filePath.endsWith('.ts') && !filePath.endsWith('.tsx') && !filePath.endsWith('.js') && !filePath.endsWith('.json')) return;
    if (filePath.includes('node_modules') || filePath.includes('.git')) return;

    let content = fs.readFileSync(filePath, 'utf8');
    let original = content;

    // Relative to api/
    content = content.replace(/@\/api\/_server\//g, '@/api/');
    content = content.replace(/\.\/api\/_server\//g, './api/');
    content = content.replace(/\.\.\/api\/_server\//g, '../api/');

    // Within api/ directory renames
    if (filePath.startsWith(apiDir)) {
        content = content.replace(/\.\/_server\//g, './');
        content = content.replace(/\.\.\/_server\//g, '../');
    }

    // Specific mapping for moved files
    content = content.replace(/@\/api\/_server\/drizzle\/schema\.js/g, '@/api/schema.js');
    content = content.replace(/\.\.\/api\/_server\/drizzle\/schema\.js/g, '../api/schema.js');
    content = content.replace(/\.\/drizzle\/schema\.js/g, './schema.js');

    // Depth changes for files moved from api/_server to api/
    if (filePath.startsWith(apiDir) && !filePath.includes('_core') && !filePath.includes('utils') && !filePath.includes('backend_routers')) {
        content = content.replace(/\.\.\/\.\.\/const\.js/g, '../const.js');
        content = content.replace(/\.\.\/\.\.\/lib\//g, '../lib/');
        content = content.replace(/\.\/drizzle\/schema\.js/g, './schema.js');
        content = content.replace(/\.\/routers\//g, './backend_routers/');
    }

    if (original !== content) {
        fs.writeFileSync(filePath, content);
        console.log(`  Updated imports in ${filePath}`);
    }
}

function walk(dir) {
    const items = fs.readdirSync(dir);
    for (const item of items) {
        const fullPath = path.join(dir, item);
        const stat = fs.statSync(fullPath);
        if (stat.isDirectory()) {
            if (['node_modules', '.git', 'dist'].includes(item)) continue;
            walk(fullPath);
        } else {
            updateImports(fullPath);
        }
    }
}

console.log('Updating imports...');
walk(root);

// Update api/index.ts specifically
const indexPath = path.join(apiDir, 'index.ts');
if (fs.existsSync(indexPath)) {
    let indexContent = fs.readFileSync(indexPath, 'utf8');
    indexContent = indexContent.replace(/\.\/_server\/app\.js/g, './app.js');
    fs.writeFileSync(indexPath, indexContent);
    console.log('Updated api/index.ts');
}

console.log('Done!');
