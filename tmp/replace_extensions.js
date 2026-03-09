import fs from 'fs';
import path from 'path';

const dirs = ['server', 'api'];

function walk(dir) {
    const files = fs.readdirSync(dir);
    for (const file of files) {
        const fullPath = path.join(dir, file);
        if (fs.statSync(fullPath).isDirectory()) {
            walk(fullPath);
        } else if (fullPath.endsWith('.ts')) {
            let content = fs.readFileSync(fullPath, 'utf8');

            const newContent = content.replace(/(from\s+|import\()(['"])(\.\.?\/[^'"]+?)(['"])/g, (match, p1, p2, p3, p4) => {
                // If it ends in a known extension that is NOT .ts, leave it
                const knownExtensions = ['.js', '.css', '.json', '.png', '.jpg', '.svg', '.mjs', '.cjs'];
                if (knownExtensions.some(ext => p3.endsWith(ext))) {
                    return match;
                }

                let cleanPath = p3;
                if (cleanPath.endsWith('.ts')) {
                    cleanPath = cleanPath.slice(0, -3);
                }

                const replacement = `${p1}${p2}${cleanPath}.js${p4}`;
                console.log(`  Updated in ${fullPath}: ${match} -> ${replacement}`);
                return replacement;
            });

            if (content !== newContent) {
                fs.writeFileSync(fullPath, newContent);
                console.log(`Updated file: ${fullPath}`);
            }
        }
    }
}

for (const dir of dirs) {
    if (fs.existsSync(dir)) {
        walk(dir);
    }
}
