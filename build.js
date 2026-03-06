'use strict';
/**
 * Build script: copies static assets (HTML, CSS, JS) from the repo root
 * into the public/ directory so the server can serve them safely without
 * exposing source files, node_modules, or other sensitive content.
 */

const fs   = require('fs');
const path = require('path');

const srcDir    = __dirname;
const publicDir = path.join(__dirname, 'public');
const SKIP      = new Set(['backend-proxy.js', 'build.js']);
const EXTS      = new Set(['.html', '.css', '.js']);

if (!fs.existsSync(publicDir)) {
    fs.mkdirSync(publicDir, { recursive: true });
}

let copied = 0;
try {
    for (const file of fs.readdirSync(srcDir)) {
        const ext = path.extname(file).toLowerCase();
        if (!EXTS.has(ext) || SKIP.has(file)) continue;
        const src  = path.join(srcDir, file);
        const dest = path.join(publicDir, file);
        if (!fs.statSync(src).isFile()) continue;
        fs.copyFileSync(src, dest);
        copied++;
    }
} catch (err) {
    console.error(`Build failed: unable to read source directory — ${err.message}`);
    process.exit(1);
}

console.log(`Build complete: ${copied} file(s) copied to public/`);
