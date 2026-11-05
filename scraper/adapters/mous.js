// Mous — Shopify. Public products.json of the sale collection and the full catalogue filtered
// to what Benji wants from them: an everyday backpack, bags, wallets, iPhone 17 Pro Max cases
// and MagSafe gear, Apple Watch 45 mm bands. USD; anything over $75 is flagged for VAT.

const MOUS = "https://www.mous.co";
const COLLECTIONS = ["sale", "backpacks", "bags", "wallets", "iphone-17-pro-max-cases", "magsafe", "apple-watch-bands", "all"];
const WANT = /backpack|bag|wallet|cardholder|iphone 17 pro max|magsafe|apple watch|watch band|strap|charger|stand|mount/i;
const VAT_USD = 75;

async function mousFetchDeals({ getJson, sleep, stripHtml, qualify, kindOf }, log = () => {}) {
  const found = new Map();
  let seen = 0;
  for (const c of COLLECTIONS) {
    for (let page = 1; page <= 6; page++) {
      let d;
      try { d = await getJson(`${MOUS}/collections/${c}/products.json?limit=250&page=${page}`, { "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 Chrome/130 Safari/537.36" }); }
      catch (e) { if (page === 1) log(`mous: ${c} ${e.message.slice(0, 40)}`); break; }
      const ps = d.products || [];
      if (!ps.length) break;
      seen += ps.length;
      for (const p of ps) if (!found.has(p.id)) found.set(p.id, p);
      log(`mous: ${c} p${page} +${ps.length} (${found.size})`);
      if (ps.length < 250) break;
      await sleep(1500);                                        // Shopify rate-limits products.json
    }
    await sleep(1200);
  }
  const items = [];
  for (const p of found.values()) {
    const text = `${p.title} ${p.product_type} ${(p.tags || []).join(" ")}`;
    if (!WANT.test(text)) continue;
    const vs = (p.variants || []).filter((v) => v.available !== false);
    const v = (vs.length ? vs : p.variants || []).slice().sort((a, b) => parseFloat(a.price) - parseFloat(b.price))[0];
    if (!v) continue;
    const price = parseFloat(v.price), compare = parseFloat(v.compare_at_price || 0) || null;
    const { kind, category } = kindOf(text);
    const it = qualify({
      external_id: String(p.id), url: `${MOUS}/products/${p.handle}`, title: p.title, price, compare_price: compare > price ? compare : null,
      currency: "USD", brand: "mous", kind: kind === "other" ? "bag" : kind, category: category === "other" ? "bags" : category,
      images: (p.images || []).map((i) => i.src), description: stripHtml(p.body_html).slice(0, 2000),
      color: (p.options || []).find((o) => /colou?r/i.test(o.name))?.values?.join(", ") || null,
      sizes: [], attrs: { type: p.product_type, tags: p.tags, variants: (p.variants || []).map((x) => ({ title: x.title, price: x.price, available: x.available })), vat_flag: price > VAT_USD },
    });
    if (it) items.push(it);
  }
  return { items, seen };
}

export { mousFetchDeals };
