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

            // Replace static imports: from "./foo.ts" -> from "./foo.js"
            const newContent = content
                .replace(/from\s+(['"])(.*)\.ts(['"])/g, 'from $1$2.js$3')
                // Replace dynamic imports: import("./foo.ts") -> import("./foo.js")
                .replace(/import\((['"])(.*)\.ts(['"])\)/g, 'import($1$2.js$3)');

            if (content !== newContent) {
                fs.writeFileSync(fullPath, newContent);
                console.log(`Updated: ${fullPath}`);
            }
        }
    }
}

for (const dir of dirs) {
    if (fs.existsSync(dir)) {
        walk(dir);
    }
}
