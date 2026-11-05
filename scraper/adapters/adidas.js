// adidas Israel — Salesforce Commerce Cloud behind Akamai: only reachable from Benji's own
// network, so this adapter runs inside his Chrome on an adidas.co.il tab (build-browser.js
// wraps it). Outlet listing pages are parsed with DOMParser; product pages give sizes + gallery.

const ADIDAS = "https://www.adidas.co.il";
const OUTLETS = ["/he/men-outlet", "/he/men-shoes-outlet", "/he/men-clothing-outlet", "/he/men-accessories-outlet"];
const PAGE = 48;
const MAX_DETAILS = 250;

const numOf = (s) => { const m = String(s ?? "").replace(/,/g, "").match(/\d+(\.\d+)?/); return m ? parseFloat(m[0]) : null; };

function parseListing(html) {
  const doc = new DOMParser().parseFromString(html, "text/html");
  const out = [];
  for (const t of doc.querySelectorAll(".product-tile, [data-pid]")) {
    const pid = t.getAttribute("data-pid") || t.querySelector("[data-pid]")?.getAttribute("data-pid");
    const a = t.querySelector("a[href*='.html']");
    if (!pid || !a) continue;
    const txt = t.innerText || t.textContent || "";
    const from = txt.match(/From\s*₪\s*([\d,.]+)\s*To\s*₪\s*([\d,.]+)/i);
    const price = from ? numOf(from[2]) : numOf((t.querySelector(".sales .value, .main-price")?.textContent || "").split("₪").pop());
    const compare = from ? numOf(from[1]) : null;
    const off = numOf((txt.match(/-(\d+)%/) || [])[1]);
    const img = t.querySelector("img")?.getAttribute("src") || t.querySelector("img")?.getAttribute("data-src") || "";
    const title = (t.querySelector(".pdp-link, .product-name, .tile-body a")?.textContent || a.getAttribute("title") || txt.split("\n").map((s) => s.trim()).filter((s) => /\S{3,}/.test(s) && !/₪|%/.test(s))[0] || "").trim();
    const badge = (txt.match(/(Originals|Sportswear|Performance|Running|Training|Football|Terrex)/i) || [])[1] || null;
    out.push({ pid, href: a.getAttribute("href"), title, price, compare, off, img: img.replace(/\?.*/, ""), line: badge });
  }
  return out;
}

// SFCC's Product-Variation JSON: sizes with `selectable`, the zoom/large gallery, both prices,
// the description — no product-page HTML needed.
const VARIATION = `${ADIDAS}/on/demandware.store/Sites-adidas-IL-Site/he_IL/Product-Variation?quantity=1&pid=`;
async function productJson(getJson, pid) {
  const d = await getJson(VARIATION + encodeURIComponent(pid));
  const p = d.product || {};
  const gallery = p.images?.zoom?.length ? p.images.zoom : (p.images?.large || []);
  const images = [...new Set(gallery.map((i) => i.url).filter(Boolean))];
  const sizeAttr = (p.variationAttributes || []).find((a) => a.attributeId === "size");
  const sizes = (sizeAttr?.values || []).map((v) => ({ size: v.displayValue, in_stock: !!v.selectable }));
  return {
    images, sizes, description: p.longDescription || p.description || p.shortDescription || null,
    price: p.price?.sales?.value ?? null, compare: p.price?.list?.value ?? null, salePct: p.salePercentage ?? null,
    title: p.productName || null, available: p.available,
  };
}

async function adidasFetchDeals({ getText, getJson, sleep, stripHtml, qualify, kindOf }, log = () => {}) {
  const found = new Map();
  let seen = 0;
  for (const path of OUTLETS) {
    for (let start = 0; start < (globalThis.__DEALS_MAX_PAGES ? globalThis.__DEALS_MAX_PAGES * PAGE : 1500); start += PAGE) {
      let html;
      try { html = await getText(`${ADIDAS}${path}?start=${start}&sz=${PAGE}`); } catch (e) { log(`adidas: ${path} @${start} ${e.message.slice(0, 40)}`); break; }
      const tiles = parseListing(html);
      if (!tiles.length) break;
      seen += tiles.length;
      let fresh = 0;
      for (const t of tiles) if (t.price && !found.has(t.pid)) { found.set(t.pid, t); fresh++; }
      log(`adidas: ${path} @${start} tiles ${tiles.length} new ${fresh}`);
      if (!fresh || tiles.length < PAGE) break;
      await sleep(600);
    }
  }
  const items = [];
  let details = 0;
  for (const t of found.values()) {
    if (!(t.compare > t.price) && !t.off) continue;
    const { kind, category } = kindOf(t.title, t.line || "", t.href);
    let d = { images: t.img ? [t.img.replace(/w_\d+/, "w_600")] : [], sizes: [], description: null, price: null, compare: null, title: null };
    if (details < MAX_DETAILS) {
      try { d = await productJson(getJson, t.pid); details++; await sleep(350); }
      catch (e) { log(`adidas: variation ${t.pid} ${e.message.slice(0, 40)}`); }
      if (!d.images.length && t.img) d.images = [t.img.replace(/w_\d+/, "w_600")];
      if (details % 25 === 0) log(`adidas: details ${details}/${found.size}`);
    }
    const price = d.price || t.price, compare = d.compare || t.compare || (t.off ? Math.round(price / (1 - t.off / 100) * 100) / 100 : null);
    if (d.available === false) continue;
    const it = qualify({
      external_id: t.pid, url: t.href.startsWith("http") ? t.href : ADIDAS + t.href, title: d.title || t.title, price,
      compare_price: compare > price ? compare : null, brand: "adidas", kind, category,
      images: d.images, description: d.description ? stripHtml(d.description).slice(0, 2000) : null, color: null, sizes: d.sizes,
      attrs: { off: d.salePct ?? t.off, line: t.line },
    });
    if (it) items.push(it);
  }
  return { items, seen };
}

export { adidasFetchDeals, parseListing as adidasParseListing, productJson as adidasProductJson };
