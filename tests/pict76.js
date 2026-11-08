// v76 pictograms in the app: keyframes built at runtime from EX_MOV, every figure animating, reduced motion paused on the resting pose, planted hands/feet stay put (run: NODE_PATH=$(npm root -g) node tests/pict76.js)
// v76 pictograms inside the real app: keyframes built at runtime, every figure animating, planted feet stay planted
const { chromium, serve, stub, killIntro } = require('./base');
(async () => {
  const srv = serve(), port = srv.address().port, b = await chromium.launch();
  let fails = 0; const check = (n, ok, x = '') => { if(!ok) fails++; console.log(`${ok ? 'ok  ' : 'FAIL'} ${n}${x !== '' ? '  — ' + x : ''}`); };
  for (const reduced of [false, true]) {
    const ctx = await b.newContext({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true, reducedMotion: reduced ? 'reduce' : 'no-preference' });
    const page = await ctx.newPage(); const errs = []; page.on('pageerror', e => errs.push(e.message)); await stub(page);
    await page.goto(`http://127.0.0.1:${port}/index.html?fixture=demo#gym`, { waitUntil: 'load' }); await page.waitForTimeout(1100); await killIntro(page);
    await page.evaluate(() => { startFree(); }); await page.waitForTimeout(600);
    const r = await page.evaluate(() => ({ expect: Object.values(EX_MOV).reduce((a, m) => a + Object.keys(m[2]).length, 0), keys: document.getElementById('exKeys')?.sheet.cssRules.length, figs: document.querySelectorAll('#pickBody svg.exi').length,
      anims: document.getAnimations().filter(a => a.animationName && /^e\d+/.test(a.animationName)).length,
      playing: document.getAnimations().filter(a => a.animationName && /^e\d+/.test(a.animationName) && a.playState === 'running').length }));
    const tag = reduced ? 'reduced' : 'motion';
    check(`${tag}: keyframes built once, one per moving joint`, r.keys === r.expect, `${r.keys} of ${r.expect}`);
    check(`${tag}: picker shows every catalogue figure`, r.figs >= 49, String(r.figs));
    check(`${tag}: figures animate (${r.anims} joint tracks on screen)`, r.anims > 150);
    if (!reduced) check('motion: running', r.playing === r.anims, `${r.playing}/${r.anims}`);
    else check('reduced: paused on the resting pose', r.playing === 0, `${r.playing} running`);
    if (!reduced) {
      // planted feet / fixed grips measured in the app at 24 phases
      const drift = await page.evaluate(() => {
        const out = {};
        const fig = name => [...document.querySelectorAll('#pickBody .pick')].find(p => p.textContent.trim() === name)?.querySelector('svg.exi');
        const endOf = (svg, cls) => { const g = svg.querySelector('g.mv.' + cls); if(!g) return null; const _g = g, p = [...g.children].find(e => e.tagName === 'path'); const m = p.getAttribute('d').match(/L\s*([-\d.]+)[ ,]([-\d.]+)/); const q = new DOMPoint(+m[1], +m[2]).matrixTransform(svg.getScreenCTM().inverse().multiply(p.getScreenCTM())); return [q.x, q.y]; };
        for (const [n, cls] of [['Squat', 's'], ['Deadlift', 's'], ['Lunge', 's'], ['Push-Up', 'f'], ['Pull-Up', 'f'], ['Leg Press', 'f'], ['Rowing', 's']]) {
          const svg = fig(n); if (!svg) { out[n] = 'missing'; continue; }
          const an = svg.getAnimations({ subtree: true }); let p0 = null, max = 0;
          for (let k = 0; k < 24; k++) { an.forEach(a => { a.pause(); a.currentTime = k / 24 * a.effect.getTiming().duration; }); const p = endOf(svg, cls); if(!p){ max = 'no ' + cls; break; } if (!p0) p0 = p; max = Math.max(max, Math.hypot(p[0] - p0[0], p[1] - p0[1])); }
          out[n] = typeof max === 'number' ? +max.toFixed(2) : max;
        }
        return out;
      });
      for (const [n, d] of Object.entries(drift)) check(`motion: ${n} — planted limb stays put in the app`, typeof d === 'number' && d < 0.4, String(d));
    }
    check(`${tag}: no page errors`, errs.length === 0, errs.slice(0, 2).join(' | '));
    await ctx.close();
  }
  console.log(fails ? `${fails} FAILED` : 'all green'); await b.close(); srv.close(); process.exit(fails ? 1 : 0);
})();
