// v77 phone gestures with real touch input (CDP): drag to reorder, hold-to-lift, keyboard reorder, pull sheets closed, calendar swipe, pull to reload in the installed app, 16 px fields (run: NODE_PATH=$(npm root -g) node tests/phone77.js)
// v77 phone gestures, driven with real touch input (CDP): drag to reorder, hold-to-lift, keyboard reorder,
// pull a sheet down to close it, swipe the calendar, 16 px fields on touch, desktop unchanged.
const { chromium, serve, stub, killIntro } = require('./base');
const OUT = process.argv[2] || '/tmp/atlas-v77-shots'; require('fs').mkdirSync(OUT, { recursive: true });
let fails = 0; const check = (n, ok, x = '') => { if(!ok) fails++; console.log(`${ok ? 'ok  ' : 'FAIL'} ${n}${x !== '' ? '  — ' + x : ''}`); };
const sleep = ms => new Promise(r => setTimeout(r, ms));
(async () => {
  const srv = serve(), port = srv.address().port, b = await chromium.launch();
  const ctx = await b.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, hasTouch: true, isMobile: true });
  const page = await ctx.newPage(); const errs = []; page.on('pageerror', e => errs.push(e.message)); await stub(page);
  const cdp = await ctx.newCDPSession(page);
  const touch = async (pts, opts = {}) => { // pts: [[x,y],...] first = down, last = up
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: pts[0][0], y: pts[0][1] }] });
    if(opts.hold) await sleep(opts.hold);
    for(let i = 1; i < pts.length; i++){ await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: pts[i][0], y: pts[i][1] }] }); await sleep(opts.step || 16); }
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  };
  const path = (a, b, n = 14) => Array.from({ length: n + 1 }, (_, k) => [a[0] + (b[0] - a[0]) * k / n, a[1] + (b[1] - a[1]) * k / n]);
  const centre = async sel => { const r = await page.locator(sel).first().boundingBox(); return [r.x + r.width / 2, r.y + r.height / 2]; };
  const go = async hash => { await page.goto('about:blank'); await page.goto(`http://127.0.0.1:${port}/index.html?fixture=demo#${hash}`, { waitUntil: 'load' }); await sleep(1000); await killIntro(page); await page.evaluate(() => document.querySelector('[aria-label="Fixture"]')?.remove()); await sleep(300); };
  const order = () => page.evaluate(() => gymDraft.items.map(i => i.ex));

  // ---- plan sheet in the live room ----
  await go('gym');
  await page.evaluate(() => { startKind('A'); beginSession(); }); await sleep(700);
  await page.evaluate(() => livePlan()); await sleep(600);
  check('plan: no up/down arrows left', await page.locator('#lpList [aria-label*="Move"]').count() === 0);
  check('plan: a drag handle per row', await page.locator('#lpList .ds-grip').count() === 5);
  const o0 = await order();
  await page.screenshot({ path: `${OUT}/plan-before.png` });
  // drag row 0's handle down past two rows
  const g0 = await centre('#lpList .lp-row:nth-child(1) .ds-grip'), rowH = (await page.locator('#lpList .lp-row').first().boundingBox()).height;
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: g0[0], y: g0[1] }] });
  for(let k = 1; k <= 12; k++){ await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: g0[0], y: g0[1] + rowH * 2.2 * k / 12 }] }); await sleep(16); }
  await sleep(120);
  check('plan: the row lifts while dragged', await page.locator('#lpList .lp-row.ds-lift').count() === 1);
  check('plan: neighbours slide out of the way', await page.evaluate(() => [...document.querySelectorAll('#lpList .lp-row')].filter(r => r.style.transform.includes('-')).length) === 2);
  await page.screenshot({ path: `${OUT}/plan-dragging.png` });
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] }); await sleep(450);
  const o1 = await order();
  check('plan: drag moved Bench Press from 1st to 3rd', o1[2] === o0[0] && o1[0] === o0[1] && o1[1] === o0[2], o1.join(', '));
  check('plan: you stay on the same exercise', await page.evaluate(() => gymDraft.items[_liveAt].ex) === o0[0]);
  check('plan: the pager follows the new order', await page.evaluate(() => document.querySelector('#ls0 .ls-name').textContent) === o0[1]);
  check('plan: sheet still open after the drag', await page.locator('#appBg').count() === 1);
  // press and hold on a row body, then drag up
  const r4 = await centre('#lpList .lp-row:nth-child(4) .lp-main');
  await touch(path(r4, [r4[0], r4[1] - rowH * 2.1]), { hold: 480 }); await sleep(450);
  const o2 = await order();
  check('plan: hold-and-drag on a row moves it up two', o2[1] === o1[3], o2.join(', '));
  check('plan: the release didn\'t also tap the row (sheet stays)', await page.locator('#appBg').count() === 1);
  // a quick swipe on a row body is a scroll, not a drag
  const r2 = await centre('#lpList .lp-row:nth-child(2) .lp-main');
  await touch(path(r2, [r2[0], r2[1] + 60], 6)); await sleep(300);
  check('plan: a quick swipe doesn\'t reorder', JSON.stringify(await order()) === JSON.stringify(o2));
  // keyboard on the handle
  await page.focus('#lpList .lp-row:nth-child(1) .ds-grip'); await page.keyboard.press('ArrowDown'); await sleep(200);
  const o3 = await order();
  check('plan: ↓ on the handle moves the row down', o3[1] === o2[0] && o3[0] === o2[1]);
  check('plan: focus stays on the moved handle', await page.evaluate(() => document.activeElement.closest('.lp-row') === document.querySelectorAll('#lpList .lp-row')[1]));
  // pull the sheet down by its head to close it
  const head = await page.locator('#appBg .sheet-head').boundingBox();
  await touch(path([head.x + head.width / 2, head.y + 12], [head.x + head.width / 2, head.y + 420], 12)); await sleep(600);
  check('sheet: pulled down → closed', await page.locator('#appBg').count() === 0);
  // a short pull springs back
  await page.evaluate(() => livePlan()); await sleep(600);
  const h2 = await page.locator('#appBg .sheet-head').boundingBox();
  await touch(path([h2.x + 60, h2.y + 12], [h2.x + 60, h2.y + 60], 10), { step: 40 }); await sleep(500);
  check('sheet: a short slow pull springs back', await page.locator('#appBg').count() === 1 && await page.evaluate(() => document.querySelector('#appBg .sheet').style.transform === ''));
  // the close X still works with a tap
  await page.tap('#appBg .sheet-head .icon-btn'); await sleep(500);
  check('sheet: the X still closes it', await page.locator('#appBg').count() === 0);
  check('sheet: grabber drawn on a phone sheet', await page.evaluate(() => { openSheet({title: 't', body: 'x'}); const s = getComputedStyle(document.querySelector('#appBg .sheet-head'), '::before'); const ok = s.content !== 'none' && s.width === '38px'; closeSheet(); return ok; }));

  // ---- the pending card on the gym page (before Start) ----
  await go('gym');
  await page.evaluate(() => { startKind('B'); closePicker(); }); await sleep(600);
  check('pending: a handle on each card', await page.locator('#exList .ds-grip').count() >= 2);
  const p0 = await order(), c0 = await centre('#exList .ex-card:nth-child(1) .ds-grip');
  // just past the middle of the second card (cards differ in height: the first one is open)
  const cross = await page.evaluate(() => { const c = [...document.querySelectorAll('#exList .ex-card')].map(e => e.getBoundingClientRect()); return c[1].top + c[1].height / 2 - (c[0].top + c[0].height / 2) + 12; });
  await touch(path(c0, [c0[0], c0[1] + cross], 10)); await sleep(450);
  const p1 = await order();
  check('pending: drag swaps the first two exercises', p1[0] === p0[1] && p1[1] === p0[0], p1.join(', '));

  // ---- calendar swipe ----
  await go('schedule/calendar');
  const m0 = await page.evaluate(() => window._calMonth), cal = await page.locator('#calCard .cal-grid').boundingBox();
  await touch(path([cal.x + cal.width * .8, cal.y + cal.height / 2], [cal.x + cal.width * .2, cal.y + cal.height / 2], 8)); await sleep(400);
  const m1 = await page.evaluate(() => window._calMonth);
  check('calendar: swipe left → next month', m1 > m0, `${m0} → ${m1}`);
  check('calendar: the swipe didn\'t also pick a day', await page.evaluate(() => !window._selDate));
  await touch(path([cal.x + cal.width * .2, cal.y + cal.height / 2], [cal.x + cal.width * .8, cal.y + cal.height / 2], 8)); await sleep(400);
  check('calendar: swipe right → back', await page.evaluate(() => window._calMonth) === m0);
  const day = await centre('#calCard .cal-day:not(.other)'); await page.tap('#calCard .cal-day:not(.other) >> nth=10'); await sleep(300);
  check('calendar: a tap still picks a day', await page.evaluate(() => !!window._selDate));

  // ---- fields don't zoom ----
  await go('money');
  await page.evaluate(() => expenseSheet()); await sleep(500);
  const sizes = await page.evaluate(() => [...document.querySelectorAll('#appBg input, #appBg select')].map(e => parseFloat(getComputedStyle(e).fontSize)));
  check('fields: every input in a sheet is 16 px on touch', sizes.every(s => s >= 16), sizes.join(','));
  await page.screenshot({ path: `${OUT}/expense-sheet.png` });
  // ---- a confirm sheet pulled down = Cancel ----
  await page.evaluate(() => { closeSheet(); window._askRes = 'pending'; ask({title: 'Delete this?', body: 'x', ok: 'Delete', danger: true}).then(v => { window._askRes = v; }); }); await sleep(600);
  const ab = await page.locator('.ask').boundingBox();
  await touch(path([ab.x + ab.width / 2, ab.y + 30], [ab.x + ab.width / 2, ab.y + 330], 10)); await sleep(600);
  check('ask: pulled down = cancelled', await page.evaluate(() => window._askRes) === false);
  check('no page errors (phone)', errs.length === 0, errs.slice(0, 2).join(' | '));
  await ctx.close();

  // ---- pull to reload, in the installed app ----
  const actx = await b.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, hasTouch: true, isMobile: true });
  await actx.addInitScript(() => { Object.defineProperty(navigator, 'standalone', { get: () => true }); });
  const ap = await actx.newPage(); await stub(ap); const acdp = await actx.newCDPSession(ap);
  await ap.goto(`http://127.0.0.1:${port}/index.html?fixture=demo#chores`, { waitUntil: 'load' }); await sleep(1000); await killIntro(ap); await ap.evaluate(() => document.querySelector('[aria-label="Fixture"]')?.remove());
  await ap.evaluate(() => { window._reloads = 0; const v = views.chores; views.chores = async function(){ window._reloads++; return v.apply(this, arguments); }; });
  const pull = async dist => { await acdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: 195, y: 300 }] }); for(let k = 1; k <= 10; k++){ await acdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: 195, y: 300 + dist * k / 10 }] }); await sleep(16); } await acdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] }); await sleep(700); };
  await pull(40);
  check('app: a short pull doesn\'t reload', await ap.evaluate(() => window._reloads) === 0);
  await pull(160);
  check('app: pulling the section down reloads it', await ap.evaluate(() => window._reloads) === 1);
  check('app: the reload pill goes away again', await ap.evaluate(() => { const p = document.getElementById('ptr'); return !p.classList.contains('spin'); }));
  await actx.close();

  // ---- desktop: compact sizes kept, drag works with the mouse ----
  const dctx = await b.newContext({ viewport: { width: 1280, height: 860 } }), dp = await dctx.newPage(); const derr = []; dp.on('pageerror', e => derr.push(e.message)); await stub(dp);
  await dp.goto(`http://127.0.0.1:${port}/index.html?fixture=demo#money`, { waitUntil: 'load' }); await sleep(1000); await killIntro(dp);
  await dp.evaluate(() => expenseSheet()); await sleep(400);
  check('desktop: fields keep their compact size', await dp.evaluate(() => parseFloat(getComputedStyle(document.querySelector('#appBg input')).fontSize)) < 16);
  await dp.evaluate(() => { closeSheet(); go('gym'); }); await sleep(800);
  await dp.evaluate(() => { startKind('A'); beginSession(); livePlan(); }); await sleep(800);
  const before = await dp.evaluate(() => gymDraft.items.map(i => i.ex)), g = await dp.locator('#lpList .lp-row:nth-child(1) .ds-grip').boundingBox(), rh = (await dp.locator('#lpList .lp-row').first().boundingBox()).height;
  await dp.mouse.move(g.x + g.width / 2, g.y + g.height / 2); await dp.mouse.down();
  for(let k = 1; k <= 10; k++){ await dp.mouse.move(g.x + g.width / 2, g.y + g.height / 2 + rh * 1.3 * k / 10); await sleep(16); }
  await dp.mouse.up(); await sleep(450);
  const after = await dp.evaluate(() => gymDraft.items.map(i => i.ex));
  check('desktop: mouse drag reorders too', after[1] === before[0] && after[0] === before[1], after.join(', '));
  check('no page errors (desktop)', derr.length === 0, derr.slice(0, 2).join(' | '));
  await b.close(); srv.close();
  console.log(fails ? `\n${fails} FAILED` : '\nall green'); process.exit(fails ? 1 : 0);
})();
