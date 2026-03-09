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

    // Re-fix imports pointing to root files
    const newContent = content.replace(/(from\s+['"]|import\(['"])(\.\.?\/[^'"]+?)(['"])/g, (match, prefix, pathPart, suffix) => {
        let updatedPath = pathPart;

        // Identify if it's pointing to root files (const, env, drizzle.config)
        // These are files that should be at exactly ../ repeated (depthFromRoot) times
        if (updatedPath.includes('const.js') || updatedPath.includes('env.js') || updatedPath.includes('drizzle.config.js')) {
            const dots = updatedPath.match(/\.\.\//g) || [];
            if (dots.length < depthFromRoot) {
                const needed = depthFromRoot - dots.length;
                let newPath = updatedPath;
                for (let i = 0; i < needed; i++) {
                    newPath = '../' + newPath;
                }
                updatedPath = newPath;
            }
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
            if (['node_modules', '.git', 'dist', 'AmigoRacingOriginal', 'temp_extract'].includes(item)) continue;
            walk(fullPath);
        } else {
            processFile(fullPath);
        }
    }
}

const itemsToScan = ['api', 'lib', 'pages', 'components', '_core', 'cleanup_external_events.ts', 'reaffiliate_championship.ts', 'reset_pwd.ts', 'reset_user_pwd.ts', 'seed_real_events.ts', 'verify_fix.ts'];
for (const item of itemsToScan) {
    walk(path.join(root, item));
}
