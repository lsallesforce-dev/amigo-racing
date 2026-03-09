import fs from 'fs';
import path from 'path';

const baseDir = 'api/server';

function walk(dir) {
    const files = fs.readdirSync(dir);
    for (const file of files) {
        const fullPath = path.join(dir, file);
        if (fs.statSync(fullPath).isDirectory()) {
            walk(fullPath);
        } else if (fullPath.endsWith('.ts')) {
            let content = fs.readFileSync(fullPath, 'utf8');

            // Calculate depth relative to api/server
            const relativePath = path.relative(baseDir, dir);
            const depth = relativePath === '' ? 0 : relativePath.split(path.sep).length;

            // We are looking for imports that go UP beyond the 'server' root.
            // In their original home (server/), an import pointing to root would have (depth + 1) levels of '../'.
            // Now in api/server/, it needs (depth + 2) levels of '../'.

            const newContent = content.replace(/(from\s+|import\()(['"])(\.\.?\/[^'"]+?)(['"])/g, (match, p1, p2, p3, p4) => {
                let importPath = p3;

                // Count how many '../' are at the start of the import path
                const dotDots = importPath.match(/^\.\.\//g);
                const currentUpLevels = dotDots ? dotDots.length : 0;

                // If the import path goes up matching exactly (depth + 1), it used to point to ROOT.
                // Now it needs to point to ROOT from api/server/... so it needs an extra ../
                if (currentUpLevels === (depth + 1)) {
                    importPath = '../' + importPath;
                }

                // Also Ensure .js extension (same as before)
                const knownExtensions = ['.js', '.css', '.json', '.png', '.jpg', '.svg', '.mjs', '.cjs'];
                if (!knownExtensions.some(ext => importPath.endsWith(ext))) {
                    if (importPath.endsWith('.ts')) {
                        importPath = importPath.slice(0, -3);
                    }
                    importPath += '.js';
                }

                const replacement = `${p1}${p2}${importPath}${p4}`;
                if (match !== replacement) {
                    console.log(`  Updated in ${fullPath}: ${match} -> ${replacement}`);
                }
                return replacement;
            });

            if (content !== newContent) {
                fs.writeFileSync(fullPath, newContent);
                console.log(`Updated file: ${fullPath}`);
            }
        }
    }
}

if (fs.existsSync(baseDir)) {
    walk(baseDir);
} else {
    console.log(`Error: ${baseDir} not found`);
}
