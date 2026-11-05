// WooCommerce Store API adapter — Redback, Outline, Benda (GitHub) and Gant (Benji's Chrome).
// Same code, different config. Sale items only (on_sale=true), every gallery image, the
// description, the shop's attributes, and per-size stock from the variations endpoint.

const WOO = {
  redback:  { base: "https://redback.co.il",          brand: "redback",  query: "",                requireBrand: false },
  outline:  { base: "https://www.outline.co.il",      brand: null,       query: "&category=59",    requireBrand: true },   // 59 = CARHARTT MEN
  benda:    { base: "https://www.bendastore.co.il",   brand: null,       query: "",                requireBrand: false, tech: true },  // electronics/home outlet
  gant:     { base: "https://www.gant.co.il",         brand: "gant",     query: "&category=2254",  requireBrand: false },  // Shopping IL | men
};

const MAX_STOCK = 150;      // variations calls per run
const SIZE_TAX = /pa_(measure|size|sizes|w_size|l_sizes|shoe|shoes)|מידה|size/i;

function wooPrice(p) {
  const m = 10 ** (p.prices?.currency_minor_unit ?? 2);
  return { price: Number(p.prices?.price) / m, compare: Number(p.prices?.regular_price) / m, currency: p.prices?.currency_code || "ILS" };
}

async function wooFetchDeals(shop, { getJson, sleep, stripHtml, qualify, brandOf, kindOf }, log = () => {}) {
  const cfg = WOO[shop];
  const api = `${cfg.base}/wp-json/wc/store/v1/products`;
  const raw = [];
  for (let page = 1; page <= (globalThis.__DEALS_MAX_PAGES || 40); page++) {
    const r = await fetch(`${api}?on_sale=true&per_page=100&page=${page}${cfg.query}`, { headers: { Accept: "application/json" } });
    if (r.status === 400) break;                                 // past the last page
    if (!r.ok) throw new Error(`${r.status} on page ${page}`);
    const d = await r.json();
    if (!d.length) break;
    raw.push(...d);
    const pages = Number(r.headers.get("x-wp-totalpages") || 1);
    log(`${shop}: page ${page}/${pages} (${raw.length})`);
    if (page >= pages) break;
    await sleep(250);
  }

  // pass 1: the shop-side rules; pass 2: per-size stock for the best MAX_STOCK (Gant's Store API
  // answers a variations call in ~3 s behind Cloudflare, so a thousand of them is not an option)
  const pre = [];
  let n = 0;
  for (const p of raw) {
    if (++n % 200 === 0) log(`${shop}: checked ${n}/${raw.length}, kept ${pre.length}`);
    const { price, compare, currency } = wooPrice(p);
    if (!price) continue;
    const cats = (p.categories || []).map((c) => c.name);
    const attrs = Object.fromEntries((p.attributes || []).map((a) => [a.name, a.terms.map((t) => t.name)]));
    const brandRaw = (p.attributes || []).find((a) => /pa_brand|מותג|brand/i.test(a.taxonomy + a.name))?.terms?.[0]?.name
      || (p.brands || [])[0]?.name || "";
    const color = (p.attributes || []).find((a) => /pa_colou?r|צבע/i.test(a.taxonomy + a.name))?.terms?.map((t) => t.name).join(", ") || null;
    const sizeAttr = (p.attributes || []).find((a) => SIZE_TAX.test(a.taxonomy + " " + a.name) && !/colou?r|צבע/i.test(a.taxonomy));
    const title = stripHtml(p.name);
    const { kind, category } = kindOf(title, cats.join(" "));
    const sizes = sizeAttr ? sizeAttr.terms.map((t) => ({ size: t.name, in_stock: null })) : [];
    const it = qualify({
      external_id: p.id, url: p.permalink, title, price, compare_price: compare > price ? compare : null, currency,
      brand: cfg.brand || brandOf(title, brandRaw), brandRaw, categories: cats, kind, category,
      images: (p.images || []).map((i) => i.src), description: stripHtml(p.short_description || p.description).slice(0, 2000),
      color, sizes, attrs: { ...attrs, sku: p.sku, in_stock: p.is_in_stock },
    }, { requireBrand: cfg.requireBrand, tech: !!cfg.tech });
    if (it) pre.push({ it, p, sizeAttr, cats });
  }
  pre.sort((a, b) => b.it.score - a.it.score);
  const items = [];
  let stocked = 0;
  for (const { it, p, sizeAttr, cats } of pre) {
    if (sizeAttr && p.type === "variable" && stocked < MAX_STOCK) {
      try {
        const vs = await getJson(`${api}?type=variation&parent=${p.id}&per_page=100`);
        stocked++;
        if (stocked % 25 === 0) log(`${shop}: stock ${stocked}/${Math.min(MAX_STOCK, pre.length)}`);
        const stock = new Map();
        for (const v of vs) {
          // Store API variations carry attributes[] on most shops; Gant's come as "מידה: XL, צבע: Navy"
          let sz = (v.attributes || []).find((a) => SIZE_TAX.test(a.name) || sizeAttr.name === a.name)?.value;
          if (!sz && typeof v.variation === "string") {
            const part = v.variation.split(",").map((x) => x.split(":").map((y) => y.trim())).find(([nm]) => nm === sizeAttr.name || SIZE_TAX.test(nm));
            sz = part && part[1];
          }
          if (sz) stock.set(sz, (stock.get(sz) ?? false) || !!v.is_in_stock);
        }
        if (stock.size) {
          const sizes = [...stock].map(([size, in_stock]) => ({ size, in_stock }));
          const re = qualify({ ...it, my_size: undefined, sizes, on_sale: it.attrs.on_sale, categories: cats }, { requireBrand: cfg.requireBrand, tech: !!cfg.tech });
          if (re) items.push(re);                                // else: his size is sold out
          await sleep(150);
          continue;
        }
      } catch (e) { log(`${shop}: variations ${p.id} ${e.message}`); }
    }
    items.push(it);
  }
  return { items, seen: raw.length };
}

export { WOO, wooFetchDeals };
