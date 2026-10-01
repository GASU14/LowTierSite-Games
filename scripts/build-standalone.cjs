const fs = require('fs');
const path = require('path');

const distDir = path.join(__dirname, '..', 'dist');
const distHtml = path.join(distDir, 'index.html');

if (!fs.existsSync(distHtml)) {
  console.error('dist/index.html not found, skipping standalone build.');
  process.exit(0);
}

let html = fs.readFileSync(distHtml, 'utf8');

// Replace stylesheet link with inline <style>
html = html.replace(/<link\s+rel="stylesheet"[^>]*href="\.\/assets\/([^"]+\.css)"[^>]*>/gi, (match, cssFile) => {
  const cssPath = path.join(distDir, 'assets', cssFile);
  if (fs.existsSync(cssPath)) {
    const cssContent = fs.readFileSync(cssPath, 'utf8');
    return `<style>\n${cssContent}\n</style>`;
  }
  return match;
});

// Replace module script with inline <script type="module">
html = html.replace(/<script\s+type="module"[^>]*src="\.\/assets\/([^"]+\.js)"[^>]*><\/script>/gi, (match, jsFile) => {
  const jsPath = path.join(distDir, 'assets', jsFile);
  if (fs.existsSync(jsPath)) {
    const jsContent = fs.readFileSync(jsPath, 'utf8');
    // Escape closing script tags in JS strings if any
    const safeJs = jsContent.replace(/<\/script>/gi, '<\\/script>');
    return `<script type="module">\n${safeJs}\n</script>`;
  }
  return match;
});

// Output standalone.html inside dist and at root
const standaloneDistPath = path.join(distDir, 'standalone.html');
const standaloneRootPath = path.join(__dirname, '..', 'standalone.html');

fs.writeFileSync(standaloneDistPath, html, 'utf8');
fs.writeFileSync(standaloneRootPath, html, 'utf8');

// Also create /docs directory for 1-click GitHub Pages hosting
const docsDir = path.join(__dirname, '..', 'docs');
if (!fs.existsSync(docsDir)) {
  fs.mkdirSync(docsDir, { recursive: true });
}

function copyDirRecursive(src, dest) {
  if (!fs.existsSync(dest)) fs.mkdirSync(dest, { recursive: true });
  const entries = fs.readdirSync(src, { withFileTypes: true });
  for (const entry of entries) {
    const srcPath = path.join(src, entry.name);
    const destPath = path.join(dest, entry.name);
    if (entry.isDirectory()) {
      copyDirRecursive(srcPath, destPath);
    } else {
      fs.copyFileSync(srcPath, destPath);
    }
  }
}

copyDirRecursive(distDir, docsDir);

console.log('Successfully generated standalone.html and populated /docs for GitHub Pages!');
