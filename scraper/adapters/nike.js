// Nike IL — the men's sale wall comes from Nike's product-wall JSON (the same call the page
// makes); sizes and the full gallery come from each product page's __NEXT_DATA__.
// Nike's payload shapes move around, so everything is found by walking for known keys.

const NIKE = "https://www.nike.com";
const API = "https://api.nike.com";
const WALL_PATH = "/il/w/mens-sale-3yaepznik1";   // all men's sale (shoes + clothing + accessories)
const MAX_DETAILS = 300;

function walk(o, fn, depth = 0) {
  if (!o || typeof o !== "object" || depth > 14) return;
  fn(o);
  for (const k in o) if (o[k] && typeof o[k] === "object") walk(o[k], fn, depth + 1);
}
const money = (v) => { const n = typeof v === "number" ? v : parseFloat(String(v ?? "").replace(/[^\d.]/g, "")); return isFinite(n) && n > 0 ? n : null; };

function wallProducts(data) {
  const out = [];
  walk(data, (o) => {
    const url = o.pdpUrl?.url || o.pdpUrl || (typeof o.url === "string" && /\/il\/t\//.test(o.url) ? o.url : null);
    const title = o.copy?.title || o.title;
    if (!url || !title || !o.prices) return;
    const price = money(o.prices.currentPrice ?? o.prices.current), initial = money(o.prices.initialPrice ?? o.prices.initial ?? o.prices.fullPrice);
    const imgs = [o.colorwayImages?.portraitURL, o.colorwayImages?.squarishURL, o.images?.portraitURL, o.images?.squarishURL].filter(Boolean);
    out.push({ id: o.productCode || o.globalProductId || o.styleColor || o.pid || url.split("/").pop(), url: url.startsWith("http") ? url : NIKE + url,
      title, subtitle: o.copy?.subTitle || o.subtitle || "", price, compare: initial && initial > price ? initial : null,
      images: imgs, color: o.colorDescription || o.displayColors?.colorDescription || null, discounted: !!o.prices.discounted });
  });
  return out;
}

function detail(html) {
  const m = html.match(/<script id="__NEXT_DATA__"[^>]*>([\s\S]*?)<\/script>/);
  if (!m) return { images: [], sizes: [], description: null };
  let data; try { data = JSON.parse(m[1]); } catch { return { images: [], sizes: [], description: null }; }
  const images = new Set(), sizes = new Map();
  let description = null;
  walk(data, (o) => {
    for (const k of ["portraitURL", "squarishURL", "imageURL", "url"]) {
      const u = o[k]; if (typeof u === "string" && /static\.nike\.com\/a\/images\//.test(u)) images.add(u.replace(/\/t_[A-Za-z0-9_]+\//, "/t_PDP_1280_v1/"));
    }
    if (o.localizedSize || o.nikeSize) {
      const size = o.localizedSize || o.nikeSize;
      const st = o.available ?? o.isAvailable ?? (o.status ? /ACTIVE|IN_STOCK/i.test(o.status) : null) ?? (o.level ? o.level !== "OOS" : null);
      if (!sizes.has(size) || st === true) sizes.set(size, st);
    }
    if (!description && typeof o.descriptionPreview === "string") description = o.descriptionPreview;
    if (!description && typeof o.description === "string" && o.description.length > 40) description = o.description;
  });
  // Nike IL lists EU sizes as "EU 45" / "45"; keep the label as shown
  return { images: [...images], sizes: [...sizes].map(([size, in_stock]) => ({ size: String(size), in_stock: in_stock == null ? null : !!in_stock })), description };
}

async function nikeFetchDeals({ getJson, getText, sleep, stripHtml, qualify, kindOf }, log = () => {}) {
  const found = new Map();
  let seen = 0;
  // page 1 is in the wall page's __NEXT_DATA__, and so is the exact `next` API link (it carries
  // attributeIds the API insists on); we just follow it until it runs out
  const html = await getText(`${NIKE}${WALL_PATH}`);
  const m = html.match(/<script id="__NEXT_DATA__"[^>]*>([\s\S]*?)<\/script>/);
  if (!m) throw new Error("nike: no __NEXT_DATA__ on the wall page");
  const wall = JSON.parse(m[1]).props?.pageProps?.initialState?.Wall;
  let ps = wallProducts(wall?.productGroupings || []);
  let next = wall?.pageData?.next || null;
  const total = wall?.pageData?.totalResources;
  for (let guard = 0; guard < 60; guard++) {
    seen += ps.length;
    for (const p of ps) if (p.price && !found.has(p.id)) found.set(p.id, p);
    log(`nike: +${ps.length} (${found.size}/${total ?? "?"})${next ? "" : " — end"}`);
    if (!next) break;
    await sleep(400);
    let d;
    try { d = await getJson(`${API}${next}`, { "nike-api-caller-id": "nike:dotcom:browse:wall.client" }); }
    catch (e) { log(`nike: next ${e.message.slice(0, 60)}`); break; }
    ps = wallProducts(d.productGroupings || d);
    next = d.pages?.next || null;
    if (!ps.length) break;
  }
  const items = [];
  let details = 0;
  for (const p of found.values()) {
    if (!(p.compare > p.price) && !p.discounted) continue;
    const title = `${p.title} ${p.subtitle}`.trim();
    const { kind, category } = kindOf(title);
    let dt = { images: p.images, sizes: [], description: null };
    if (details < MAX_DETAILS) {
      try { const d = detail(await getText(p.url)); details++; dt = { images: d.images.length ? d.images : p.images, sizes: d.sizes, description: d.description }; await sleep(300); }
      catch (e) { log(`nike: detail ${p.id} ${e.message.slice(0, 40)}`); }
    }
    const it = qualify({
      external_id: p.id, url: p.url, title, price: p.price, compare_price: p.compare, brand: "nike", kind, category,
      images: dt.images, description: dt.description ? stripHtml(dt.description).slice(0, 2000) : null, color: p.color, sizes: dt.sizes,
      on_sale: p.discounted, attrs: { subtitle: p.subtitle },
    });
    if (it) items.push(it);
  }
  return { items, seen };
}

export { nikeFetchDeals, wallProducts, detail as nikeDetail };
