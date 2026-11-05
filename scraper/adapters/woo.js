// WooCommerce Store API adapter — Redback, Outline, Benda (GitHub) and Gant (Benji's Chrome).
// Same code, different config. Sale items only (on_sale=true), every gallery image, the
// description, the shop's attributes, and per-size stock from the variations endpoint.

const WOO = {
  redback:  { base: "https://redback.co.il",          brand: "redback",  query: "",                requireBrand: false },
  outline:  { base: "https://www.outline.co.il",      brand: null,       query: "&category=59",    requireBrand: true },   // 59 = CARHARTT MEN
  benda:    { base: "https://www.bendastore.co.il",   brand: null,       query: "",                requireBrand: true },
  gant:     { base: "https://www.gant.co.il",         brand: "gant",     query: "&category=2254",  requireBrand: false },  // Shopping IL | men
};

const SIZE_TAX = /pa_(measure|size|sizes|w_size|l_sizes|shoe|shoes)|מידה|size/i;

function wooPrice(p) {
  const m = 10 ** (p.prices?.currency_minor_unit ?? 2);
  return { price: Number(p.prices?.price) / m, compare: Number(p.prices?.regular_price) / m, currency: p.prices?.currency_code || "ILS" };
}

async function wooFetchDeals(shop, { getJson, sleep, stripHtml, qualify, brandOf, kindOf }, log = () => {}) {
  const cfg = WOO[shop];
  const api = `${cfg.base}/wp-json/wc/store/v1/products`;
  const raw = [];
  for (let page = 1; page <= 40; page++) {
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

  const items = [];
  for (const p of raw) {
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
    // sizes as listed; stock per variation fetched below only when a size of his exists
    let sizes = sizeAttr ? sizeAttr.terms.map((t) => ({ size: t.name, in_stock: null })) : [];
    const pre = qualify({
      external_id: p.id, url: p.permalink, title, price, compare_price: compare > price ? compare : null, currency,
      brand: cfg.brand || brandOf(title, brandRaw), brandRaw, categories: cats, kind, category,
      images: (p.images || []).map((i) => i.src), description: stripHtml(p.short_description || p.description).slice(0, 2000),
      color, sizes, attrs: { ...attrs, sku: p.sku, in_stock: p.is_in_stock },
    }, { requireBrand: cfg.requireBrand });
    if (!pre) continue;
    if (sizeAttr && p.type === "variable") {
      try {
        const vs = await getJson(`${api}?type=variation&parent=${p.id}&per_page=100`);
        const stock = new Map();
        for (const v of vs) {
          const sz = (v.attributes || []).find((a) => SIZE_TAX.test(a.name) || sizeAttr.name === a.name)?.value;
          if (sz) stock.set(sz, (stock.get(sz) ?? false) || !!v.is_in_stock);
        }
        if (stock.size) {
          sizes = [...stock].map(([size, in_stock]) => ({ size, in_stock }));
          const re = qualify({ ...pre, my_size: undefined, sizes, on_sale: pre.attrs.on_sale, categories: cats }, { requireBrand: cfg.requireBrand });
          if (!re) continue;                                   // his size is sold out
          items.push(re);
          await sleep(150);
          continue;
        }
      } catch (e) { log(`${shop}: variations ${p.id} ${e.message}`); }
    }
    items.push(pre);
  }
  return { items, seen: raw.length };
}

export { WOO, wooFetchDeals };
