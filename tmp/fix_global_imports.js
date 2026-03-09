import fs from 'fs';
import path from 'path';

const searchDirs = ['.', 'lib', 'components', 'pages', 'src', '_core'];
const excludeDirs = ['node_modules', 'dist', 'api', '.git', '.AmigoRacingOriginal', 'temp_extract', 'temp_extract_2', 'temp_api_extract'];

function walk(dir) {
    if (excludeDirs.includes(path.basename(dir)) || path.basename(dir).startsWith('.')) {
        if (dir !== '.') return;
    }

    let files;
    try {
        files = fs.readdirSync(dir);
    } catch (e) {
        return;
    }

    for (const file of files) {
        const fullPath = path.join(dir, file);
        let stat;
        try {
            stat = fs.statSync(fullPath);
        } catch (e) {
            continue;
        }

        if (stat.isDirectory()) {
            walk(fullPath);
        } else if (fullPath.endsWith('.ts') || fullPath.endsWith('.tsx')) {
            let content = fs.readFileSync(fullPath, 'utf8');

            // Replace imports: "../server/..." -> "../api/_server/..."
            // Also potentially fix extensions if they were missing (common in frontend)
            const newContent = content.replace(/(from\s+|import\()(['"])(\.\.?\/)(server\/)([^'"]+?)(['"])/g, (match, p1, p2, p3, p4, p5, p6) => {
                let innerPath = p5;
                // Ensure .js if it's a TS file
                if (!innerPath.includes('.') || innerPath.endsWith('.ts')) {
                    if (innerPath.endsWith('.ts')) {
                        innerPath = innerPath.slice(0, -3);
                    }
                    // Only add .js if it's not a type-only import? No, in ESM we need it.
                    // Wait, if it's a type import in TS, usually we don't need .js?
                    // Actually, for TRPC types, we often do.
                    innerPath += '.js';
                }
                const replacement = `${p1}${p2}${p3}api/${p4}${innerPath}${p6}`;
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

walk('.');
