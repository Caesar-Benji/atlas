// Terminal X — Magento PWA with server-rendered listing pages. We walk each brand page
// (`/brands/<slug>?p=N`, 48 tiles a page), keep men's tiles that show a strikethrough price,
// then open each kept product page once for its gallery and sizes.

const TX = "https://www.terminalx.com";
// slugs as listed on /brands (checked 2026-11-05); Boss, Barbour, Dockers, Massimo Dutti are not sold there
const TX_BRANDS = ["gant", "tommy-hilfiger", "lacoste", "carhartt-wip", "levis", "dickies", "fred-perry", "superdry", "timberland", "ralph-lauren", "nike", "adidas-all"];
const MAX_PAGES = 25;        // per brand, 24 tiles a page
const MAX_DETAILS = 450;     // product pages per run

const numOf = (s) => { const m = String(s ?? "").replace(/,/g, "").match(/\d+(\.\d+)?/); return m ? parseFloat(m[0]) : null; };
const hiRes = (u) => u.replace(/\/cache\/[0-9a-f]{32}\//, "/cache/f112238e8f1f2b1b4c4b0f8e9d6a5c3b/"); // 1200×1600 cache per CLAUDE.md

function parseTiles(html) {
  const out = [];
  const parts = html.split(/<li class="listing-product_/).slice(1);
  for (const p of parts) {
    const block = p.slice(0, p.indexOf("</li>") > 0 ? p.indexOf("</li>") : 6000);
    const title = (block.match(/title="([^"]+)"/) || [])[1];
    const href = (block.match(/href="(\/[^"?]+)(\?[^"]*)?"/) || []);
    const img = (block.match(/src="(https:\/\/media\.terminalx\.com[^"]+)"/) || [])[1];
    const fin = block.match(/final-price[^>]*>([\s\S]*?)<\/div>/);
    const strike = block.match(/strikethrough[^>]*>([\s\S]*?)<\/div>/);
    const off = (block.match(/(\d+)% OFF/) || [])[1];
    const brand = (block.match(/brand[^>]*>([^<]{2,40})</i) || [])[1];
    if (!title || !href[1]) continue;
    const price = numOf((fin || [])[1]), compare = numOf((strike || [])[1]);
    out.push({ title: title.replace(/&quot;/g, '"').replace(/&#x27;/g, "'"), path: href[1], query: href[2] || "", img, price, compare, off: off ? Number(off) : null, brand });
  }
  return out;
}

function parseDetail(html, sku) {
  // every catalog image of this sku, de-duplicated, hi-res cache
  const imgs = [...new Set((html.match(/https:\/\/media\.terminalx\.com\/pub\/media\/catalog\/product\/cache\/[0-9a-f]{32}\/[^"'\\ )]+/g) || [])
    .filter((u) => u.toLowerCase().includes(sku.slice(0, 7).toLowerCase())).map((u) => u.replace(/\\\//g, "/")))].map(hiRes);
  // sizes: Magento configurable options carry {"label":"XL",…} next to a stock flag in most builds
  const sizes = [];
  const seen = new Set();
  for (const m of html.matchAll(/"label":"(XXS|XS|S|M|L|XL|XXL|2XL|3XL|\d{2}(?:\/\d{2})?|\d{2}\.5|ONE SIZE|One Size)"(?:,[^{}]{0,200}?"(?:is_in_stock|in_stock|stock_status|out_of_stock|isInStock)":\s*("?[A-Z_a-z]+"?|true|false))?/g)) {
    const size = m[1]; if (seen.has(size)) continue; seen.add(size);
    const st = m[2] == null ? null : /true|IN_STOCK|"in_stock"/i.test(m[2]) && !/OUT_OF_STOCK|false/i.test(m[2]);
    sizes.push({ size, in_stock: st });
  }
  const desc = (html.match(/"description":\s*\{\s*"html":\s*"((?:[^"\\]|\\.)*)"/) || html.match(/"short_description":\s*"((?:[^"\\]|\\.)*)"/) || [])[1];
  const color = (html.match(/"color":\s*"([^"]{1,40})"/) || html.match(/"color_label":\s*"([^"]{1,40})"/) || [])[1];
  return { images: imgs, sizes, description: desc ? desc.replace(/\\n/g, " ").replace(/\\"/g, '"') : null, color: color || null };
}

async function txFetchDeals({ getText, sleep, stripHtml, qualify, brandOf, kindOf }, log = () => {}) {
  const found = new Map();
  let seen = 0;
  for (const slug of TX_BRANDS) {
    for (let p = 1; p <= MAX_PAGES; p++) {
      let html;
      try { html = await getText(`${TX}/brands/${slug}${p > 1 ? `?p=${p}` : ""}`); }
      catch (e) { if (p === 1) log(`terminalx: no brand page ${slug} (${e.message.slice(0, 30)})`); break; }
      const tiles = parseTiles(html);
      if (!tiles.length) break;
      seen += tiles.length;
      let kept = 0;
      for (const t of tiles) {
        if (!/גברים|\bmen\b|unisex/i.test(t.title)) continue;
        if (!t.price || !(t.compare > t.price)) continue;
        const sku = t.path.split("/").pop();
        if (found.has(sku)) continue;
        found.set(sku, { ...t, sku, slug }); kept++;
      }
      log(`terminalx: ${slug} p${p} tiles ${tiles.length} kept ${kept}`);
      if (tiles.length < 24 || !kept && p > 3) break;
      await sleep(400);
    }
  }

  const items = [];
  let details = 0;
  for (const t of found.values()) {
    const title = t.title.replace(/\s*\/\s*גברים\s*$/, "").trim();
    const { kind, category } = kindOf(title);
    let detail = { images: t.img ? [hiRes(t.img)] : [], sizes: [], description: null, color: null };
    if (details < MAX_DETAILS) {
      try { detail = parseDetail(await getText(`${TX}${t.path}${t.query}`), t.sku); details++; await sleep(250); }
      catch (e) { log(`terminalx: detail ${t.sku} ${e.message.slice(0, 40)}`); }
      if (!detail.images.length && t.img) detail.images = [hiRes(t.img)];
    }
    const it = qualify({
      external_id: t.sku, url: `${TX}${t.path}${t.query}`, title, price: t.price, compare_price: t.compare,
      brand: brandOf(t.brand, t.slug, title), brandRaw: t.brand, kind, category, images: detail.images,
      description: detail.description ? stripHtml(detail.description).slice(0, 2000) : null, color: detail.color, sizes: detail.sizes,
      attrs: { off: t.off, brand_page: t.slug, color_query: t.query },
    }, { requireBrand: true });
    if (it) items.push(it);
  }
  return { items, seen };
}

export { txFetchDeals, parseTiles, parseDetail };
