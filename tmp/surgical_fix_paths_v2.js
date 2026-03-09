import fs from 'fs';
import path from 'path';

const root = 'c:\\Users\\lsaud\\Downloads\\amigo-racing';

function processFile(fullPath) {
    if (!fullPath.endsWith('.ts') && !fullPath.endsWith('.tsx')) return;
    let content = fs.readFileSync(fullPath, 'utf8');
    let changed = false;

    const dir = path.dirname(fullPath);
    const relToRoot = path.relative(root, dir);
    const depthFromRoot = relToRoot === '' ? 0 : relToRoot.split(path.sep).length;

    // 1. Resolve 'env.js' imports
    // On the backend (api/server/), env.js is local (same dir as it was in server/).
    // If it's importing ../../env.js, it's overshooting.
    const newContent = content.replace(/(from\s+['"]|import\(['"])(\.\.?\/[^'"]+?)(['"])/g, (match, prefix, pathPart, suffix) => {
        let updatedPath = pathPart;

        // Fix env.js imports for backend files
        if (fullPath.includes('api\\server') && updatedPath.includes('env.js')) {
            // Find current depth from api/server
            const relToBackend = path.relative(path.join(root, 'api', 'server'), dir);
            const depthInBackend = relToBackend === '' ? 0 : relToBackend.split(path.sep).length;

            // It should be exactly depthInBackend times '../' then 'env.js'
            let corrected = 'env.js';
            for (let i = 0; i < depthInBackend; i++) {
                corrected = '../' + corrected;
            }
            if (!corrected.startsWith('./') && !corrected.startsWith('../')) {
                corrected = './' + corrected;
            }
            updatedPath = corrected;
        }

        // Fix const.js and drizzle.config.js (THESE ARE AT ROOT)
        if (updatedPath.includes('const.js') || updatedPath.includes('drizzle.config.js')) {
            let corrected = updatedPath.replace(/\.\.?\//g, ''); // strip dots
            // Add dots based on depthFromRoot
            for (let i = 0; i < depthFromRoot; i++) {
                corrected = '../' + corrected;
            }
            updatedPath = corrected;
        }

        const res = `${prefix}${updatedPath}${suffix}`;
        if (match !== res) {
            console.log(`  Fixing in ${fullPath}: ${match} -> ${res}`);
            changed = true;
        }
        return res;
    });

    if (changed) {
        fs.writeFileSync(fullPath, newContent);
    }
}

function walk(dir) {
    if (!fs.existsSync(dir)) return;
    const stat = fs.statSync(dir);
    if (!stat.isDirectory()) {
        processFile(dir);
        return;
    }

    const items = fs.readdirSync(dir);
    for (const item of items) {
        const fullPath = path.join(dir, item);
        const itemStat = fs.statSync(fullPath);
        if (itemStat.isDirectory()) {
            if (['node_modules', '.git', 'dist'].includes(item)) continue;
            walk(fullPath);
        } else {
            processFile(fullPath);
        }
    }
}

const itemsToScan = ['api', 'lib', 'pages', 'components', '_core'];
for (const item of itemsToScan) {
    walk(path.join(root, item));
}
