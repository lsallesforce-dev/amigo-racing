const fs = require('fs');
const path = require('path');

const baseDir = process.cwd();

function walk(dir) {
    let results = [];
    const list = fs.readdirSync(dir);
    list.forEach(file => {
        file = path.join(dir, file);
        const stat = fs.statSync(file);
        if (stat && stat.isDirectory()) {
            if (!file.includes('node_modules') && !file.includes('.git')) {
                results = results.concat(walk(file));
            }
        } else {
            if (file.endsWith('.ts') || file.endsWith('.tsx') || file.endsWith('.js') || file.endsWith('.mjs') || file.endsWith('.json')) {
                results.push(file);
            }
        }
    });
    return results;
}

const allFiles = walk(baseDir);

allFiles.forEach(file => {
    let content = fs.readFileSync(file, 'utf8');
    // Replace api/server/ with api/_server/
    // Handle both relative and absolute-ish paths found in greps
    const newContent = content.replace(/api\/server\//g, 'api/_server/');

    if (content !== newContent) {
        fs.writeFileSync(file, newContent, 'utf8');
        console.log(`Updated imports in: ${path.relative(baseDir, file)}`);
    }
});
