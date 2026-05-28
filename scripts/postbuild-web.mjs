import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const dist = path.join(root, 'dist');
const publicDir = path.join(root, 'public');
const logo = path.join(root, 'assets', 'images', 'azoup-logo.png');

if (!fs.existsSync(dist)) {
  console.error('[postbuild-web] pasta dist/ não encontrada — rode expo export antes.');
  process.exit(1);
}

function copyFile(src, dest) {
  if (!fs.existsSync(src)) return;
  fs.copyFileSync(src, dest);
}

if (fs.existsSync(publicDir)) {
  for (const name of fs.readdirSync(publicDir)) {
    const from = path.join(publicDir, name);
    if (fs.statSync(from).isFile()) {
      copyFile(from, path.join(dist, name));
    }
  }
}

if (fs.existsSync(logo)) {
  copyFile(logo, path.join(dist, 'favicon-512.png'));
  copyFile(logo, path.join(dist, 'favicon.png'));
}

const indexPath = path.join(dist, 'index.html');
if (fs.existsSync(indexPath)) {
  let html = fs.readFileSync(indexPath, 'utf8');
  const extraHead = `
    <link rel="icon" type="image/png" sizes="512x512" href="/favicon-512.png" />
    <link rel="shortcut icon" href="/favicon.ico" />
    <link rel="apple-touch-icon" href="/favicon-512.png" />
    <meta name="theme-color" content="#FF7A1A" />`;

  if (!html.includes('favicon-512.png')) {
    html = html.replace('</head>', `${extraHead}\n  </head>`);
    fs.writeFileSync(indexPath, html, 'utf8');
  }
}

console.log('[postbuild-web] favicons copiados e index.html atualizado.');
