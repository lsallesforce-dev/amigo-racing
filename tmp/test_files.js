import fs from 'fs';
import path from 'path';

const dirs = ['server', 'api'];

function walk(dir) {
    if (!fs.existsSync(dir)) {
        console.log(`Directory does not exist: ${dir}`);
        return;
    }
    const files = fs.readdirSync(dir);
    console.log(`Scanning directory: ${dir} (${files.length} items)`);
    for (const file of files) {
        const fullPath = path.join(dir, file);
        if (fs.statSync(fullPath).isDirectory()) {
            walk(fullPath);
        } else if (fullPath.endsWith('.ts')) {
            console.log(`Found TS file: ${fullPath}`);
        }
    }
}

for (const dir of dirs) {
    walk(dir);
}
