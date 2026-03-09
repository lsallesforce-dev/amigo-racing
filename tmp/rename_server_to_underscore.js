import fs from 'fs';
import path from 'path';

const root = 'c:\\Users\\lsaud\\Downloads\\amigo-racing';

function processFile(fullPath) {
    if (!fullPath.endsWith('.ts') && !fullPath.endsWith('.tsx') && !fullPath.endsWith('.json')) return;
    if (fullPath.includes('node_modules') || fullPath.includes('.git') || fullPath.includes('dist')) return;

    let content = fs.readFileSync(fullPath, 'utf8');
    let changed = false;

    // Replace literal 'server/' with '_server/' in import strings and config
    // Specifically targeting paths that look like they go into the renamed api/server
    const newContent = content.replace(/(['"\/])server\//g, (match, prefix) => {
        // Exclude node_modules paths like @trpc/server/
        if (content.substring(content.lastIndexOf('\n', content.indexOf(match)) + 1, content.indexOf(match)).includes('@trpc/server')) {
            return match;
        }
        console.log(`  Updating in ${fullPath}: ${match} -> ${prefix}_server/`);
        changed = true;
        return prefix + '_server/';
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

// Just scanning everything relevant
const itemsToScan = ['api', 'lib', 'pages', 'components', '_core', 'vercel.json', 'package.json'];
for (const item of itemsToScan) {
    walk(path.join(root, item));
}
