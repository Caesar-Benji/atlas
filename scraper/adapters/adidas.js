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

function parseProduct(html, pid) {
  const images = [...new Set((html.match(/https:\/\/assets\.adidas\.com\/images\/[^"' \\)]+/g) || [])
    .filter((u) => u.includes(pid)).map((u) => u.replace(/w_\d+/, "w_600").replace(/\\\//g, "/")))];
  const sizes = [];
  const sizeBlock = (html.match(/"attributeId":"size"[\s\S]{0,20000}?\]\s*\}/) || [html])[0];
  for (const m of sizeBlock.matchAll(/"displayValue":"([^"]+)"[^{}]*?"selectable":(true|false)/g)) sizes.push({ size: m[1], in_stock: m[2] === "true" });
  if (!sizes.length) {
    const doc = new DOMParser().parseFromString(html, "text/html");
    for (const b of doc.querySelectorAll("[data-attr='size'] [data-attr-value], .size-item, .attribute-size button, [class*='size'] [role='radio']")) {
      const size = (b.getAttribute("data-attr-value") || b.textContent || "").trim();
      if (size) sizes.push({ size, in_stock: !/unselectable|disabled|out-of-stock|unavailable/i.test(b.className + " " + (b.getAttribute("aria-disabled") || "")) });
    }
  }
  const desc = (html.match(/"description":"((?:[^"\\]|\\.){40,2000})"/) || html.match(/<div class="[^"]*description[^"]*"[^>]*>([\s\S]{40,3000}?)<\/div>/i) || [])[1];
  const color = (html.match(/"colou?r(?:Description|Name)?":"([^"]{2,40})"/i) || [])[1];
  return { images, sizes, description: desc ? desc.replace(/\\n/g, " ").replace(/\\"/g, '"') : null, color: color || null };
}

async function adidasFetchDeals({ getText, sleep, stripHtml, qualify, kindOf }, log = () => {}) {
  const found = new Map();
  let seen = 0;
  for (const path of OUTLETS) {
    for (let start = 0; start < 1500; start += PAGE) {
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
    const { kind, category } = kindOf(t.title, t.line || "");
    let d = { images: t.img ? [t.img.replace(/w_\d+/, "w_600")] : [], sizes: [], description: null, color: null };
    if (details < MAX_DETAILS) {
      try { d = parseProduct(await getText(t.href.startsWith("http") ? t.href : ADIDAS + t.href), t.pid); details++; await sleep(500); }
      catch (e) { log(`adidas: detail ${t.pid} ${e.message.slice(0, 40)}`); }
      if (!d.images.length && t.img) d.images = [t.img.replace(/w_\d+/, "w_600")];
    }
    const it = qualify({
      external_id: t.pid, url: t.href.startsWith("http") ? t.href : ADIDAS + t.href, title: t.title, price: t.price,
      compare_price: t.compare || (t.off ? Math.round(t.price / (1 - t.off / 100) * 100) / 100 : null), brand: "adidas", kind, category,
      images: d.images, description: d.description ? stripHtml(d.description).slice(0, 2000) : null, color: d.color, sizes: d.sizes,
      attrs: { off: t.off, line: t.line },
    });
    if (it) items.push(it);
  }
  return { items, seen };
}

export { adidasFetchDeals, parseListing as adidasParseListing, parseProduct as adidasParseProduct };
