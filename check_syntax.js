import fs from 'fs';
try {
    const content = fs.readFileSync('server/routers.ts', 'utf8');
    console.log('File length:', content.length);
    let braces = 0;
    let square = 0;
    let parens = 0;
    for (let i = 0; i < content.length; i++) {
        if (content[i] === '{') braces++;
        if (content[i] === '}') braces--;
        if (content[i] === '[') square++;
        if (content[i] === ']') square--;
        if (content[i] === '(') parens++;
        if (content[i] === ')') parens--;
    }
    console.log('Braces balance:', braces);
    console.log('Square brackets balance:', square);
    console.log('Parentheses balance:', parens);
    if (braces !== 0 || square !== 0 || parens !== 0) {
        console.error('ERROR: Mismatched structural elements!');
    } else {
        console.log('Structural elements seem balanced.');
    }
} catch (e) {
    console.error(e);
}
