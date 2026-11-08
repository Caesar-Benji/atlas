// harness helpers for tests/verify*.js: static server over the repo, CDNs stubbed (run: NODE_PATH=$(npm root -g) node tests/verify75.js)
// shared harness: static server over the repo, CDNs stubbed, fixture mode
const { chromium } = require('playwright');
const http = require('http'), fs = require('fs'), path = require('path');
const ROOT = process.env.ROOT || path.join(__dirname, '..');
const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.png': 'image/png', '.jpg': 'image/jpeg', '.webmanifest': 'application/manifest+json', '.mp4': 'video/mp4', '.svg': 'image/svg+xml' };
function serve(){
  const srv = http.createServer((req, res) => {
    const f = path.join(ROOT, decodeURIComponent(req.url.split('?')[0].replace(/^\/$/, '/index.html')));
    if (!fs.existsSync(f) || fs.statSync(f).isDirectory()) { res.writeHead(404); return res.end(); }
    res.writeHead(200, { 'Content-Type': MIME[path.extname(f)] || 'application/octet-stream' }); fs.createReadStream(f).pipe(res);
  }).listen(0);
  return srv;
}
async function stub(page){
  await page.route(/cdn\.jsdelivr\.net|cdnjs\.cloudflare\.com|fonts\.googleapis|fonts\.gstatic|picsum\.photos|unpkg\.com/, (r) => {
    const u = r.request().url();
    if (/supabase-js/.test(u)) return r.fulfill({ contentType: 'text/javascript', body: 'window.supabase={createClient(){throw new Error("stub")}}' });
    if (/chart\.umd|chart\.js/.test(u)) return r.fulfill({ contentType: 'text/javascript', body: 'window.Chart=class{constructor(){} destroy(){} resize(){} update(){}}; Chart.defaults={font:{},plugins:{legend:{labels:{}}}};' });
    if (/pdf\.min/.test(u)) return r.fulfill({ contentType: 'text/javascript', body: 'window.pdfjsLib={GlobalWorkerOptions:{}}' });
    if (/\.js(\?|$)/.test(u)) return r.fulfill({ contentType: 'text/javascript', body: '' });
    return r.fulfill({ contentType: 'text/css', body: '' });
  });
}
async function killIntro(page){
  await page.evaluate(() => { const w = document.querySelector('.ai-skip'); if (w && w.parentElement) w.parentElement.remove(); if (window.AI) { try{ cancelAnimationFrame(AI.raf); }catch(e){} AI = null; } });
}
module.exports = { chromium, serve, stub, killIntro };
