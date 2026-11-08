// v75 live workout harness: focus pager, rest takeover, sounds, plan sheet, reload, finish.
const { chromium, serve, stub, killIntro } = require('./base');
const fs = require('fs');
const OUT = process.argv[2] || '/tmp/atlas-v75-shots'; fs.mkdirSync(OUT, { recursive: true });
let fails = 0, n = 0;
const check = (name, ok, extra = '') => { n++; if (!ok) fails++; console.log(`${ok ? 'ok  ' : 'FAIL'} ${name}${extra !== '' ? '  — ' + extra : ''}`); };
const sleep = ms => new Promise(r => setTimeout(r, ms));

// audio spy: every oscillator start, with its frequency
const SPY = () => {
  window.__osc = [];
  const sv = AudioParam.prototype.setValueAtTime;   // oscillator frequencies are the only params set above 50
  AudioParam.prototype.setValueAtTime = function (v) { if (v > 50) window.__osc.push(Math.round(v * 100) / 100); return sv.apply(this, arguments); };
};

async function open(b, { w, h, touch, fx = 'demo', reduced = false }) {
  const ctx = await b.newContext({ viewport: { width: w, height: h }, deviceScaleFactor: 2, hasTouch: touch, isMobile: touch, reducedMotion: reduced ? 'reduce' : 'no-preference' });
  const page = await ctx.newPage();
  page.errors = [];
  page.on('pageerror', e => page.errors.push(String(e.message || e)));
  page.on('console', m => { if (m.type() === 'error' && !/404|Failed to load|ERR_/.test(m.text())) page.errors.push(m.text()); });
  await page.addInitScript(SPY);
  await stub(page);
  await page.goto(`http://127.0.0.1:${PORT}/index.html?fixture=${fx}#gym`, { waitUntil: 'load' });
  await sleep(1100); await killIntro(page); await sleep(300);
  await page.evaluate(() => { const f = document.querySelector('[aria-label="Fixture"]'); if (f) f.style.display = 'none';
    window.__snd = []; const p = Snd.play; Snd.play = (nm, a) => { window.__snd.push(nm + (a ? ':' + a : '')); return p(nm, a); }; });
  return { ctx, page };
}
const tap = async (page, sel, touch) => touch ? page.tap(sel) : page.click(sel);
const st = page => page.evaluate(() => ({
  open: liveOpenNow(), at: _liveAt, view: _restView, rest: !!_rest, total: _rest && _rest.total,
  items: gymDraft ? gymDraft.items.map(i => [i.ex, i.done, i.sets]) : null,
  slides: document.querySelectorAll('#liveTrack .ls').length,
  cta: (document.getElementById('liveCta') || {}).textContent || '',
  next: (document.querySelector('.lv-next') || {}).textContent || '',
  lrvOn: (document.getElementById('liveRestV') || { classList: { contains: () => false } }).classList.contains('on'),
  pill: (() => { const p = document.getElementById('livePill'); return p && !p.hidden ? p.textContent.trim() : ''; })(),
  snd: window.__snd.slice(), osc: window.__osc.length, ac: Snd.state(),
}));

let PORT;
(async () => {
  const srv = serve(); PORT = srv.address().port;
  const b = await chromium.launch();

  /* ================= phone ================= */
  {
    const touch = true, { ctx, page } = await open(b, { w: 390, h: 844, touch });
    await page.evaluate(() => startKind('A')); await sleep(500);
    await tap(page, '#pickGo', touch); await sleep(700);
    let s = await st(page);
    check('phone: Start opens the room', s.open && s.slides === 5, `${s.slides} slides`);
    check('phone: lands on the first exercise', s.at === 0 && /Set 1 done/.test(s.cta), s.cta);
    check('phone: the Start tap woke the audio', s.ac === 'running', s.ac);
    check('phone: next line names exercise 2', /Then.*Incline Bench Press/.test(s.next), s.next);
    check('phone: one progress segment per exercise', await page.locator('#liveProg button').count() === 5);
    await page.screenshot({ path: `${OUT}/phone-focus.png` });

    // log set 1
    const osc0 = s.osc;
    await tap(page, '#liveCta', touch); await sleep(650);
    s = await st(page);
    check('phone: set logged', s.items[0][1] === 1);
    check('phone: set sound fired', s.snd.includes('set'));
    check('phone: oscillators really started (659/988 Hz)', await page.evaluate(o => window.__osc.slice(o).includes(659.25) && window.__osc.slice(o).includes(987.77), osc0));
    check('phone: rest takes over the screen', s.lrvOn && s.view === 'rest' && s.rest);
    const lrvBox = await page.locator('#liveRestV').boundingBox();
    check('phone: rest screen covers the whole room', lrvBox && lrvBox.width >= 389 && lrvBox.height >= 843, JSON.stringify(lrvBox));
    const t1 = await page.locator('#lrvT').textContent();
    check('phone: countdown shows ~1:29', /^1:(29|30)$/.test(t1), t1);
    check('phone: rest names what was done', /Bench Press · set 1 of 4 done/.test(await page.locator('.lrv-what').textContent()));
    check('phone: up next = set 2 of the same exercise', /Bench Press[\s\S]*Set 2 of 4 · 70 kg × 8/.test(await page.locator('.lrv-next').textContent()));
    check('phone: progress segment 1 is a quarter full', await page.evaluate(() => document.querySelector('#liveProg button').style.getPropertyValue('--f')) === '0.250');
    await page.screenshot({ path: `${OUT}/phone-rest.png` });
    // ring moves on animation frames
    const off1 = await page.evaluate(() => +document.getElementById('lrvArc').style.strokeDashoffset); await sleep(600);
    const off2 = await page.evaluate(() => +document.getElementById('lrvArc').style.strokeDashoffset);
    check('phone: ring drains', off2 > off1, `${off1} → ${off2}`);
    // −15
    await tap(page, '.lrv-b[aria-label="15 seconds less"]', touch); await sleep(150);
    s = await st(page); check('phone: −15 shortens this rest', s.total === 75, String(s.total));
    // hide → pill
    await tap(page, '.lrv-top .icon-btn', touch); await sleep(500);
    s = await st(page);
    check('phone: chevron hides the rest screen, rest keeps running', !s.lrvOn && s.rest && /Rest\s*1:\d\d/.test(s.pill), s.pill);
    check('phone: peeking shows set 2 and an undo', /Set 2 done/.test(s.cta) && await page.locator('.lv-acts .lv-sq[aria-label="Undo the last set"]').count() === 1);
    await page.screenshot({ path: `${OUT}/phone-peek.png` });
    await tap(page, '#livePill', touch); await sleep(500);
    s = await st(page); check('phone: the pill brings the rest screen back', s.lrvOn && s.view === 'rest');
    // countdown: last three seconds tick, then the chime and Go
    await page.evaluate(() => { _rest.end = Date.now() + 3300; window.__snd = []; });
    await sleep(1400); await page.screenshot({ path: `${OUT}/phone-last3.png` });
    check('phone: last seconds beat', await page.evaluate(() => document.getElementById('liveRestV').classList.contains('last')));
    await sleep(2300);
    s = await st(page);
    check('phone: 3·2·1 ticks then the chime', JSON.stringify(s.snd) === JSON.stringify(['tick:3', 'tick:2', 'tick:1', 'go']), JSON.stringify(s.snd));
    check('phone: Go screen', s.view === 'go' && /Go/.test(await page.locator('.lrv-t b').textContent()));
    await page.screenshot({ path: `${OUT}/phone-go.png` });
    await sleep(1900);
    s = await st(page); check('phone: Go clears itself', !s.lrvOn && s.view === null && !s.rest);
    // a rest that ran out while the phone slept closes quietly
    await tap(page, '#liveCta', touch); await sleep(400);
    await page.evaluate(() => { window.__snd = []; _rest.end = Date.now() - 60000; restTick(); });
    await sleep(300); s = await st(page);
    check('phone: stale rest ends without a late chime', !s.snd.includes('go') && !s.lrvOn, JSON.stringify(s.snd));
    // swipe down dismisses (synthetic pointer drag)
    await tap(page, '#liveCta', touch); await sleep(500);
    await page.evaluate(async () => {
      const v = document.getElementById('liveRestV'), at = (type, y) => v.dispatchEvent(new PointerEvent(type, { bubbles: true, pointerId: 7, clientX: 195, clientY: y, pointerType: 'touch' }));
      at('pointerdown', 250); for (let y = 260; y <= 560; y += 30) { at('pointermove', y); await new Promise(r => setTimeout(r, 16)); } at('pointerup', 560);
    });
    await sleep(600); s = await st(page);
    check('phone: swipe down sends the rest screen away, rest keeps running', !s.lrvOn && s.rest && !!s.pill);
    // a short pull springs back
    await tap(page, '#livePill', touch); await sleep(450);
    await page.evaluate(async () => {
      const v = document.getElementById('liveRestV'), at = (type, y) => v.dispatchEvent(new PointerEvent(type, { bubbles: true, pointerId: 8, clientX: 195, clientY: y, pointerType: 'touch' }));
      at('pointerdown', 300); at('pointermove', 330); await new Promise(r => setTimeout(r, 120)); at('pointermove', 340); await new Promise(r => setTimeout(r, 120)); at('pointerup', 340);
    });
    await sleep(500); s = await st(page);
    check('phone: a short pull springs back', s.lrvOn && await page.evaluate(() => document.getElementById('liveRestV').style.transform === ''));
    // skip
    await tap(page, '.lrv-skip', touch); await sleep(400);
    s = await st(page); check('phone: Skip ends the rest', !s.rest && !s.lrvOn && !s.pill);
    check('phone: three sets logged so far on bench', s.items[0][1] === 3, JSON.stringify(s.items[0]));
    await tap(page, '#liveCta', touch); await sleep(500);
    s = await st(page);
    check('phone: the last set of bench: rest says done, points at the next exercise', /Bench Press done · 4 sets/.test(await page.locator('.lrv-what').textContent()) && /Incline Bench Press[\s\S]*Set 1 of 3/.test(await page.locator('.lrv-next').textContent()));
    await page.screenshot({ path: `${OUT}/phone-rest-exdone.png` });
    await tap(page, '.lrv-skip', touch); await sleep(400);
    s = await st(page);

    // bench is finished now (4 of 4): the page turned to exercise 2
    check('phone: finishing an exercise turns the page', s.at === 1 && /Set 1 done/.test(s.cta), `at ${s.at} · ${s.cta}`);
    check('phone: finished slide marked done', await page.evaluate(() => document.getElementById('ls0').classList.contains('fin')));

    // a real touch swipe on the pager (CDP touch events)
    const cdp = await ctx.newCDPSession(page);
    const swipe = async (x0, x1, y) => {
      await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: x0, y }] });
      for (let k = 1; k <= 8; k++) { await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: x0 + (x1 - x0) * k / 8, y }] }); await sleep(12); }
      await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
    };
    await swipe(330, 60, 300); await sleep(900);
    s = await st(page); check('phone: swiping left goes to the next exercise', s.at === 2, String(s.at));
    check('phone: progress follows the page', await page.evaluate(() => document.querySelectorAll('#liveProg button')[2].classList.contains('cur')));
    await swipe(60, 330, 300); await sleep(900);
    s = await st(page); check('phone: swiping right comes back', s.at === 1, String(s.at));
    // a swipe that starts on a wheel scrolls the wheel, never the page
    const wheelY = await page.evaluate(() => { const r = document.querySelector('#ls1 .wheel-col.int').getBoundingClientRect(); return r.top + r.height / 2; });
    await swipe(330, 60, wheelY); await sleep(700);
    s = await st(page); check('phone: horizontal drag on a wheel stays on the exercise', s.at === 1, String(s.at));

    // wheels: change sets 3 → 5 on exercise 2
    await page.evaluate(() => { const c = document.querySelector('#ls1 .wheel-col[data-k="sets"]'); c.scrollTop = 4 * c._rows[0].offsetHeight; c.dispatchEvent(new Event('scroll')); });
    await sleep(300);
    s = await st(page);
    check('phone: sets wheel → 5 planned', s.items[1][2] === 5, JSON.stringify(s.items[1]));
    check('phone: five dots drawn', await page.locator('#lsSets1 .set-dots button').count() === 5);
    check('phone: header total follows (bench 4 + 5 + 3 + 3 + 3)', /of 18 sets/.test(await page.locator('#liveStats').textContent()), await page.locator('#liveStats').textContent());
    // kg wheel on exercise 2
    await page.evaluate(() => { const c = document.querySelector('#ls1 .wheel-col.int'); c.scrollTop = (c._n + 5) * c._rows[0].offsetHeight; c.dispatchEvent(new Event('scroll')); });
    await sleep(300);
    check('phone: kg wheel writes the draft', await page.evaluate(() => gymDraft.items[1].kg) === 75, String(await page.evaluate(() => gymDraft.items[1].kg)));

    // tap a dot ahead / undo
    await page.evaluate(() => document.querySelectorAll('#lsSets1 .set-dots button')[2].click()); await sleep(200);
    s = await st(page); check('phone: tapping dot 3 marks three sets', s.items[1][1] === 3 && !s.rest);
    await tap(page, '.lv-acts .lv-sq[aria-label="Undo the last set"]', touch); await sleep(200);
    s = await st(page); check('phone: undo takes one back', s.items[1][1] === 2);

    // plan sheet
    await tap(page, '.lv-acts .lv-sq[aria-label="All exercises"]', touch); await sleep(500);
    check('phone: plan sheet lists five', await page.locator('#lpList .lp-row').count() === 5);
    check('phone: plan marks the current one', /Incline Bench Press/.test(await page.locator('#lpList .lp-row:has(.pill)').textContent()));
    await page.screenshot({ path: `${OUT}/phone-plan.png` });
    await page.evaluate(() => lpMove(4, -1)); await sleep(200);
    s = await st(page);
    check('phone: reorder moves the exercise', s.items[3][0] === 'Triceps Pushdown' && s.items[4][0] === 'Dumbbell Shoulder Press', s.items.map(i => i[0]).join(', '));
    check('phone: reorder keeps you on the same exercise', s.items[s.at][0] === 'Incline Bench Press');
    check('phone: slides follow the new order', await page.evaluate(() => document.querySelector('#ls3 .ls-name').textContent) === 'Triceps Pushdown');
    await page.evaluate(() => lpRest(15)); await sleep(100);
    check('phone: rest length +15 → 1:45', await page.locator('#lpRestV').textContent() === '1:45' && await page.evaluate(() => restLen()) === 105);
    await page.evaluate(() => lpRest(-15));
    // add an exercise from the plan
    await page.evaluate(() => { closeSheet(); openPicker(); }); await sleep(500);
    await page.evaluate(() => pickTap(EX_CAT.findIndex(e => e[0] === 'Lateral Raise'))); await sleep(100);
    await page.evaluate(() => closePicker()); await sleep(500);
    s = await st(page);
    check('phone: added exercise gets a page and you land on it', s.slides === 6 && s.items[s.at][0] === 'Lateral Raise', `${s.slides} · ${s.items[s.at] && s.items[s.at][0]}`);
    await page.evaluate(() => livePlan()); await sleep(400);
    await page.evaluate(() => lpDel(5)); await sleep(300);
    s = await st(page); check('phone: remove without logged sets needs no question', s.slides === 5 && !(await page.locator('.ask').count()));
    await page.evaluate(() => closeSheet()); await sleep(350);

    // reload mid-rest: back in the room, on the same page, rest screen up
    await page.evaluate(() => liveGo(1, false)); await sleep(200);
    await tap(page, '#liveCta', touch); await sleep(400);
    await page.goto(`http://127.0.0.1:${PORT}/index.html?fixture=demo&keep=1#gym`, { waitUntil: 'load' }); await sleep(1300); await killIntro(page); await sleep(500);
    await page.evaluate(() => { const f = document.querySelector('[aria-label="Fixture"]'); if (f) f.style.display = 'none';
      window.__snd = []; const p = Snd.play; Snd.play = (nm, a) => { window.__snd.push(nm + (a ? ':' + a : '')); return p(nm, a); }; });
    s = await page.evaluate(() => ({ open: liveOpenNow(), at: _liveAt, view: _restView, rest: !!_rest, on: document.getElementById('liveRestV')?.classList.contains('on') }));
    check('phone: reload mid-rest reopens on the same exercise with the countdown', s.open && s.at === 1 && s.view === 'rest' && s.rest && s.on, JSON.stringify(s));
    await page.evaluate(() => restSkip());

    // minimise / resume
    await tap(page, '.lv-head .icon-btn[aria-label="Minimise"]', touch); await sleep(600);
    check('phone: minimise shows the Resume banner', !(await page.evaluate(() => liveOpenNow())) && await page.locator('.sess-live').count() === 1);
    await page.evaluate(() => restStart(60)); await sleep(400);
    check('phone: minimised banner shows the rest countdown', /rest [01]:\d\d/.test(await page.locator('#sessRest').textContent()), await page.locator('#sessRest').textContent());
    await page.evaluate(() => restStop()); await sleep(300);
    await page.evaluate(() => liveOpen()); await sleep(500);
    check('phone: resume reopens on the same exercise', await page.evaluate(() => liveOpenNow() && _liveAt === 1));

    // mute
    await tap(page, '#liveSnd', touch); await sleep(200);
    const oscM = await page.evaluate(() => window.__osc.length);
    check('phone: mute stores off', await page.evaluate(() => localStorage.getItem('atlas_gym_sound')) === 'off');
    await tap(page, '#liveCta', touch); await sleep(300);
    check('phone: muted — no oscillator', await page.evaluate(() => window.__osc.length) === oscM);
    await page.evaluate(() => restSkip());
    await tap(page, '#liveSnd', touch); await sleep(200);
    check('phone: unmuting plays a sample', await page.evaluate(o => window.__osc.length > o, oscM));

    // everything done → done screen → finish
    await page.evaluate(() => { gymDraft.items.forEach((it, i) => { it.done = isCardio(it.ex) ? 1 : exPlanned(it); }); gymDraft.items[4].done = exPlanned(gymDraft.items[4]) - 1; draftSave(); liveRender(); liveGo(4, false); window.__snd = []; });
    await sleep(300);
    await tap(page, '#liveCta', touch); await sleep(800);
    s = await st(page);
    check('phone: last set → done screen, no rest', s.view === 'done' && s.lrvOn && !s.rest);
    check('phone: done sound', s.snd.includes('done'), JSON.stringify(s.snd));
    await page.screenshot({ path: `${OUT}/phone-done.png` });
    // +1 after Keep going is an extra set with a rest, not another done screen
    await tap(page, '.lrv-link', touch); await sleep(450);
    check('phone: Keep going → Finish workout button', /Finish workout/.test((await st(page)).cta));
    await tap(page, '.lv-acts .lv-sq[aria-label="Log one more set"]', touch); await sleep(500);
    s = await st(page); check('phone: extra set after everything → rest, no second done screen', s.view === 'rest' && s.rest && s.items[4][2] === s.items[4][1], JSON.stringify(s.items[4]));
    await page.evaluate(() => restSkip());
    await page.evaluate(() => { _restView = 'done'; liveRestPaint(); }); await sleep(400);
    await tap(page, '.lrv-dacts .lrv-skip', touch); await sleep(600);
    check('phone: Finish & save opens the review over the room', await page.locator('#finBg').count() === 1 && !(await st(page)).lrvOn);
    await page.screenshot({ path: `${OUT}/phone-finish.png` });
    await page.click('#finishBtn'); await sleep(1200);
    check('phone: saved — room gone, draft cleared', await page.evaluate(() => !liveOpenNow() && !gymDraft && !localStorage.getItem('atlas_gym_draft')));
    check('phone: no horizontal overflow', await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth) <= 1);
    check('phone: no page errors', page.errors.length === 0, page.errors.slice(0, 3).join(' | '));
    await ctx.close();
  }

  /* ================= desktop ================= */
  {
    const { ctx, page } = await open(b, { w: 1280, h: 860, touch: false });
    await page.evaluate(() => startKind('B')); await sleep(400);
    await page.click('#pickGo'); await sleep(700);
    check('desktop: room opens', await page.evaluate(() => liveOpenNow()));
    check('desktop: prev hidden on the first page, next shown', await page.evaluate(() => document.querySelector('.lv-nav.prev').disabled && !document.querySelector('.lv-nav.next').disabled && getComputedStyle(document.querySelector('.lv-nav.next')).display === 'flex'));
    await page.click('.lv-nav.next'); await sleep(700);
    check('desktop: arrow button pages on', await page.evaluate(() => _liveAt) === 1);
    await page.keyboard.press('ArrowRight'); await sleep(700);
    check('desktop: → key pages on', await page.evaluate(() => _liveAt) === 2);
    await page.keyboard.press('ArrowLeft'); await sleep(700);
    check('desktop: ← key pages back', await page.evaluate(() => _liveAt) === 1);
    await page.screenshot({ path: `${OUT}/desktop-focus.png` });
    await page.click('#liveCta'); await sleep(700);
    await page.screenshot({ path: `${OUT}/desktop-rest.png` });
    await page.keyboard.press('Escape'); await sleep(400);
    check('desktop: Esc hides the rest screen', await page.evaluate(() => !_restView && !!_rest));
    await page.click('#livePill'); await sleep(500);
    // mouse drag down dismisses
    await page.mouse.move(640, 200); await page.mouse.down(); for (let y = 210; y <= 620; y += 40) { await page.mouse.move(640, y); await sleep(16); } await page.mouse.up();
    await sleep(600);
    check('desktop: mouse drag dismisses the rest screen', await page.evaluate(() => !_restView && !!_rest));
    check('desktop: no page errors', page.errors.length === 0, page.errors.slice(0, 3).join(' | '));
    await page.evaluate(() => { restStop(); gymDraft = null; draftSave(); liveClose(); });
    await ctx.close();
  }

  /* ================= worst case, 320 ================= */
  {
    const touch = true, { ctx, page } = await open(b, { w: 320, h: 568, touch, fx: 'worst' });
    await page.evaluate(() => { startFree(); addEx('Bench Press'); addEx('Single-arm landmine rotational press with a pause at the top and a very long custom name'); addEx('Treadmill'); paintPicker(); }); await sleep(400);
    await page.evaluate(() => { gymDraft.items[0].kg = 102.5; gymDraft.items[0].sets = 12; draftSave(); });
    await tap(page, '#pickGo', touch); await sleep(700);
    const over = async () => page.evaluate(() => [...document.querySelectorAll('.ls-in, .lv-bar, .lv-head')].map(e => e.scrollWidth - e.clientWidth).reduce((a, b) => Math.max(a, b), 0));
    check('worst: room opens with 3 pages', await page.evaluate(() => document.querySelectorAll('#liveTrack .ls').length) === 3);
    check('worst: 12 dots wrap without overflow', (await over()) <= 1, String(await over()));
    await page.screenshot({ path: `${OUT}/worst-12sets.png` });
    await page.evaluate(() => liveGo(1, false)); await sleep(300);
    check('worst: long name wraps without overflow', (await over()) <= 1, String(await over()));
    await page.screenshot({ path: `${OUT}/worst-longname.png` });
    await page.evaluate(() => liveGo(2, false)); await sleep(300);
    check('worst: cardio page has minutes and km wheels', await page.locator('#ls2 .wheel').count() === 2);
    await tap(page, '#liveCta', touch); await sleep(500);
    check('worst: cardio Done logs it', await page.evaluate(() => gymDraft.items[2].done) === 1);
    await page.screenshot({ path: `${OUT}/worst-rest.png` });
    check('worst: rest controls fit', await page.evaluate(() => { const r = document.querySelector('.lrv-ctl').getBoundingClientRect(); return r.left >= 0 && r.right <= 320; }));
    check('worst: no page errors', page.errors.length === 0, page.errors.slice(0, 3).join(' | '));
    await ctx.close();
  }

  /* ================= reduced motion ================= */
  {
    const touch = true, { ctx, page } = await open(b, { w: 390, h: 844, touch, reduced: true });
    await page.evaluate(() => startKind('legs')); await sleep(400);
    await tap(page, '#pickGo', touch); await sleep(500);
    await tap(page, '#liveCta', touch); await sleep(400);
    check('reduced: rest screen fades, no travel', await page.evaluate(() => getComputedStyle(document.getElementById('liveRestV')).transform) === 'none');
    check('reduced: no page errors', page.errors.length === 0, page.errors.slice(0, 3).join(' | '));
    await ctx.close();
  }

  await b.close(); srv.close();
  console.log(`\n${n - fails}/${n} passed`);
  process.exit(fails ? 1 : 0);
})();
