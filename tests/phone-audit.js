// Phone audit: every section, every screen and the main sheets at 390×844 touch.
// Reports tap targets under 40 px, inputs under 16 px (iOS zooms the page on focus), horizontal overflow,
// and screenshots everything for a visual pass.
const { chromium, serve, stub, killIntro } = require('./base');
const fs = require('fs');
const OUT = process.argv[2] || '/tmp/atlas-phone-audit'; fs.mkdirSync(OUT, { recursive: true });
const MIN = +(process.env.MIN || 40);
const SCREENS = [['home'], ['schedule', 'today'], ['schedule', 'calendar'], ['schedule', 'upcoming'], ['gym', 'today'], ['gym', 'history'], ['gym', 'progress'], ['gym', 'records'],
  ['money', 'overview'], ['money', 'charges'], ['money', 'insights'], ['money', 'recurring'], ['rent', 'checks'], ['rent', 'electricity'], ['rent', 'water'],
  ['goals', 'active'], ['goals', 'done'], ['chores', 'due'], ['chores', 'all'], ['wardrobe', 'figure'], ['wardrobe', 'closet'], ['wardrobe', 'matches'],
  ['deals', 'today'], ['deals', 'watch'], ['deals', 'history'], ['house']];
// sheets: [section, label, js that opens it]
const SHEETS = [
  ['schedule', 'event-new', "eventSheet()"], ['schedule', 'program', "programSheet()"],
  ['gym', 'kind', "kindSheet()"], ['gym', 'picker', "startFree()"], ['gym', 'workout', "woSheet(window._gymWos[0].id)"],
  ['money', 'expense-new', "expenseSheet()"], ['money', 'expense', "expenseSheet((window._monthExpenses||[])[0]?.id)"], ['money', 'budget', "budgetSheet()"], ['money', 'import', "importSheet()"],
  ['goals', 'goal-new', "goalSheet()"], ['chores', 'chore-new', "choreSheet()"], ['rent', 'reading-new', "readingSheet('electricity')"],
  ['wardrobe', 'item', "wdDetail((window.W2&&W2.items||[])[0]?.id)"], ['deals', 'detail', "document.querySelector('#dlGrid .dl-card .dl-img')?.click()"],
  ['house', 'library', "hdLibSheet()"],
];
const LIVE = [['live-focus', "startKind('A');beginSession()"], ['live-plan', "livePlan()"], ['live-rest', "closeSheet();liveLog(0)"], ['live-finish', "restSkip();finishSheet()"]];

const scan = (MIN) => {
  const vis = el => { const r = el.getBoundingClientRect(), cs = getComputedStyle(el); return r.width > 0 && r.height > 0 && cs.visibility !== 'hidden' && cs.display !== 'none' && +cs.opacity > .05; };
  const label = el => (el.getAttribute('aria-label') || el.getAttribute('title') || el.textContent || el.placeholder || el.name || el.id || el.className || el.tagName).trim().replace(/\s+/g, ' ').slice(0, 40);
  const top = [...document.querySelectorAll('.sheet-bg:not(.closing), #live')].pop();
  const root = top || document;
  const sel = 'button, a[href], input:not([type=hidden]), select, textarea, [role=button], [onclick], label.checkbox, .checkbox, [tabindex="0"]';
  const small = [], fonts = [];
  root.querySelectorAll(sel).forEach(el => {
    if(!vis(el) || el.closest('[aria-label="Fixture"]')) return;
    if(el.closest('.wheel-col') && el.classList.contains('wheel-row')) return;
    const r = el.getBoundingClientRect();
    if(r.bottom < 0 || r.top > innerHeight * 3) return;
    if(el.matches('input,select,textarea')){ const fs = parseFloat(getComputedStyle(el).fontSize); if(fs < 16 && !['checkbox', 'radio', 'range', 'file', 'color'].includes(el.type)) fonts.push(`${label(el)} (${fs}px)`); }
    // inline text links inside a paragraph are exempt; everything else wants ~44 px
    if((r.width < MIN || r.height < MIN) && !(el.matches('a') && el.closest('p'))) small.push(`${label(el)} ${Math.round(r.width)}×${Math.round(r.height)} .${(el.className && el.className.baseVal === undefined ? el.className : '').toString().split(' ')[0]}`);
  });
  const over = document.documentElement.scrollWidth - innerWidth;
  return { small: [...new Set(small)], fonts: [...new Set(fonts)], over };
};

(async () => {
  const srv = serve(), port = srv.address().port, b = await chromium.launch();
  const ctx = await b.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, hasTouch: true, isMobile: true });
  const page = await ctx.newPage(); const errs = []; page.on('pageerror', e => errs.push(e.message)); await stub(page);
  const report = {};
  const open = async (hash) => {
    await page.goto('about:blank');
    await page.goto(`http://127.0.0.1:${port}/index.html?fixture=demo#${hash}`, { waitUntil: 'load' }); await page.waitForTimeout(1000); await killIntro(page);
    await page.evaluate(() => document.querySelector('[aria-label="Fixture"]')?.remove()); await page.waitForTimeout(500);
  };
  for(const [sec, pane] of SCREENS){
    await open(sec + (pane ? '/' + pane : ''));
    const key = sec + (pane ? '-' + pane : '');
    report[key] = await page.evaluate(scan, MIN);
    await page.screenshot({ path: `${OUT}/${key}.png`, fullPage: true });
  }
  for(const [sec, key, js] of SHEETS){
    await open(sec);
    try{ await page.evaluate(js); }catch(e){ report['sheet-' + key] = { err: e.message.slice(0, 80) }; continue; }
    await page.waitForTimeout(600);
    report['sheet-' + key] = await page.evaluate(scan, MIN);
    await page.screenshot({ path: `${OUT}/sheet-${key}.png` });
  }
  await open('gym');
  for(const [key, js] of LIVE){
    try{ await page.evaluate(js); }catch(e){ report[key] = { err: e.message.slice(0, 80) }; continue; }
    await page.waitForTimeout(700);
    report[key] = await page.evaluate(scan, MIN);
    await page.screenshot({ path: `${OUT}/${key}.png` });
  }
  fs.writeFileSync(`${OUT}/report.json`, JSON.stringify(report, null, 1));
  let nS = 0, nF = 0;
  for(const [k, r] of Object.entries(report)){
    if(r.err){ console.log(`${k}: could not open (${r.err})`); continue; }
    nS += r.small.length; nF += r.fonts.length;
    if(r.small.length || r.fonts.length || r.over > 1) console.log(`\n## ${k}${r.over > 1 ? '  OVERFLOW ' + r.over : ''}\n  small: ${r.small.join(' | ')}\n  zoom-inputs: ${r.fonts.join(' | ')}`);
  }
  console.log(`\nsmall targets ${nS} · zooming inputs ${nF} · page errors ${errs.length}${errs.length ? ' ' + errs.slice(0, 3).join(' | ') : ''}`);
  await b.close(); srv.close();
})();
