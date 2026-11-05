// v74 Deals section harness: fixture mode, CDNs stubbed, Chromium headless.
const { chromium } = require('playwright');
const http = require('http'), fs = require('fs'), path = require('path');
const ROOT = '/home/claude/atlas', OUT = process.argv[2] || '/tmp/claude-0/-home-claude/5f7e2c25-120c-5f05-a9a2-be3e7a18a32a/scratchpad/shots';
fs.mkdirSync(OUT, { recursive: true });
const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.png': 'image/png', '.jpg': 'image/jpeg', '.webmanifest': 'application/manifest+json', '.mp4': 'video/mp4' };
const srv = http.createServer((req, res) => {
  const f = path.join(ROOT, decodeURIComponent(req.url.split('?')[0].replace(/^\/$/, '/index.html')));
  if (!fs.existsSync(f) || fs.statSync(f).isDirectory()) { res.writeHead(404); return res.end(); }
  res.writeHead(200, { 'Content-Type': MIME[path.extname(f)] || 'application/octet-stream' }); fs.createReadStream(f).pipe(res);
}).listen(0);
const port = srv.address().port;
let fails = 0, n = 0;
const check = (name, ok, extra = '') => { n++; if (!ok) fails++; console.log(`${ok ? 'ok  ' : 'FAIL'} ${name}${extra ? '  — ' + extra : ''}`); };

(async () => {
  const b = await chromium.launch();
  for (const [w, h, label] of [[1280, 900, 'desktop'], [390, 844, 'phone']]) {
    const ctx = await b.newContext({ viewport: { width: w, height: h }, deviceScaleFactor: 1, reducedMotion: 'reduce' });
    const page = await ctx.newPage();
    const errors = [];
    page.on('pageerror', (e) => errors.push(String(e.message || e)));
    page.on('console', (m) => { if (m.type() === 'error' && !/404/.test(m.text())) errors.push(m.text()); });
    await page.route(/cdn\.jsdelivr\.net|cdnjs\.cloudflare\.com|fonts\.googleapis|fonts\.gstatic|picsum\.photos/, (r) => {
      const u = r.request().url();
      if (/supabase-js/.test(u)) return r.fulfill({ contentType: 'text/javascript', body: 'window.supabase={createClient(){throw new Error("stub")}}' });
      if (/chart\.umd/.test(u)) return r.fulfill({ contentType: 'text/javascript', body: 'window.Chart=class{constructor(){} destroy(){} resize(){} update(){}}; Chart.defaults={font:{},plugins:{legend:{labels:{}}}};' });
      if (/pdf\.min/.test(u)) return r.fulfill({ contentType: 'text/javascript', body: 'window.pdfjsLib={GlobalWorkerOptions:{}}' });
      if (/picsum/.test(u)) return r.fulfill({ contentType: 'image/svg+xml', body: '<svg xmlns="http://www.w3.org/2000/svg" width="480" height="600"><rect width="480" height="600" fill="#d8d5cf"/><circle cx="240" cy="300" r="120" fill="#aaa"/></svg>' });
      return r.fulfill({ contentType: 'text/css', body: '' });
    });
    for (const fx of ['demo', 'worst', 'empty']) {
      await page.goto(`http://127.0.0.1:${port}/index.html?fixture=${fx}#deals`, { waitUntil: 'load' });
      await page.waitForTimeout(900);
      await page.evaluate(() => { const w = document.querySelector('.ai-skip'); if (w) w.parentElement.remove(); if (window.AI) { cancelAnimationFrame(AI.raf); AI = null; } });
      await page.waitForTimeout(600);
      const tab = await page.evaluate(() => window._curTab);
      check(`${label}/${fx}: lands on deals`, tab === 'deals', tab);
      const cards = await page.locator('#dlGrid .dl-card').count();
      const lead = await page.locator('#dlLead .mstat').count();
      if (fx === 'demo') { check(`${label}/${fx}: cards rendered`, cards > 10, String(cards)); check(`${label}/${fx}: three lead tiles`, lead === 3); }
      if (fx === 'empty') check(`${label}/${fx}: empty state`, (await page.locator('#dlGrid .empty').count()) === 1 && cards === 0);
      if (fx === 'worst') { check(`${label}/${fx}: renders`, cards > 5, String(cards));
        const over = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
        check(`${label}/${fx}: no horizontal overflow`, over <= 1, String(over)); }
      await page.evaluate(() => { const w = document.querySelector('.ai-skip'); if (w) w.parentElement.remove(); }); await page.screenshot({ path: `${OUT}/${label}-${fx}-today.png`, fullPage: label === 'desktop' });
      if (fx === 'demo') {
        // filters
        await page.evaluate(() => document.querySelector('#dlCats button:nth-child(2)').click()); await page.waitForTimeout(150);
        const c2 = await page.locator('#dlGrid .dl-card').count(); check(`${label}: category filter narrows`, c2 > 0 && c2 < cards, `${cards} → ${c2}`);
        await page.evaluate(() => document.querySelector('#dlCats button:nth-child(1)').click()); await page.waitForTimeout(100);
        // detail sheet with gallery
        await page.evaluate(() => document.querySelector('#dlGrid .dl-card .dl-img').click()); await page.waitForTimeout(400);
        check(`${label}: detail sheet opens`, (await page.locator('#appBg .dl-gal img').count()) >= 1);
        check(`${label}: detail has sizes`, (await page.locator('#appBg .dl-size').count()) >= 1);
        await page.waitForTimeout(400);
        check(`${label}: price history drew`, (await page.locator('#dlHistBox').innerText()).length > 5);
        await page.screenshot({ path: `${OUT}/${label}-detail.png` });
        await page.evaluate(() => closeSheet()); await page.waitForTimeout(500);
        // heart a card
        const before = await page.locator('#dlGrid .dl-card.wished').count();
        await page.evaluate(() => document.querySelector('#dlGrid .dl-card:not(.wished) .dl-acts .icon-btn').click()); await page.waitForTimeout(300);
        check(`${label}: heart marks the card`, (await page.locator('#dlGrid .dl-card.wished').count()) === before + 1);
        // hide a card
        const total = await page.locator('#dlGrid .dl-card').count();
        await page.evaluate(() => document.querySelector('#dlGrid .dl-card .dl-acts .icon-btn:nth-child(2)').click()); await page.waitForTimeout(300);
        check(`${label}: hide removes the card`, (await page.locator('#dlGrid .dl-card').count()) === total - 1);
        // watchlist + history panes
        await page.evaluate(() => paneShow('deals', 'watch')); await page.waitForTimeout(300);
        check(`${label}: watchlist has cards`, (await page.locator('#dlWatch .dl-card').count()) >= 1);
        check(`${label}: hidden list has rows`, (await page.locator('#dlHidden .lrow').count()) >= 1);
        await page.screenshot({ path: `${OUT}/${label}-watch.png`, fullPage: label === 'desktop' });
        await page.evaluate(() => paneShow('deals', 'history')); await page.waitForTimeout(500);
        check(`${label}: history rows with sparklines`, (await page.locator('#dlHist .dl-spark polyline').count()) >= 3);
        await page.screenshot({ path: `${OUT}/${label}-history.png`, fullPage: label === 'desktop' });
        // runs sheet
        await page.evaluate(() => paneShow('deals', 'today')); await page.evaluate(() => dlRunsSheet()); await page.waitForTimeout(300);
        check(`${label}: runs sheet lists nine shops`, (await page.locator('#appBg .lrow').count()) === 9);
        await page.screenshot({ path: `${OUT}/${label}-runs.png` });
        await page.evaluate(() => closeSheet()); await page.waitForTimeout(400);
        // hub tile + tab exist
        check(`${label}: hub tile`, (await page.locator('#hub .tile[data-tab=deals]').count()) === 1);
        check(`${label}: top tab`, (await page.locator('.tabs .tab[data-tab=deals]').count()) === 1);
        await page.evaluate(() => go('home')); await page.waitForTimeout(500);
        await page.screenshot({ path: `${OUT}/${label}-hub.png` });
      }
      check(`${label}/${fx}: no page errors`, errors.length === 0, errors.slice(0, 3).join(' | '));
      errors.length = 0;
    }
    await ctx.close();
  }
  await b.close(); srv.close();
  console.log(`\n${n - fails}/${n} checks passed`);
  process.exit(fails ? 1 : 0);
})();
