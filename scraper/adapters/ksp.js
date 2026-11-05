// KSP — their SPA's own JSON API, reachable only from a residential IP (Cloudflare challenge
// otherwise), so this runs inside Benji's Chrome on a ksp.co.il tab. Listings carry no "was"
// price: a KSP deal is a sale-type label today, or a price below what we recorded before
// (deal_today.prev_price / lowest_price in Atlas). Every watched category is filtered to the
// things he is actually after (techMatch), then the item endpoint adds the gallery.

const KSP = "https://ksp.co.il";
// category id → what to look for there (null = everything techMatch accepts)
const KSP_CATS = {
  "03215": "soundbar",   // מקרני קול
  "01031": "arm",        // מתקני תלייה, מעמדים וזרועות
  "036923": "apple",     // אביזרים Apple
  "028810": "apple",     // אביזרים לשעונים חכמים
  "0218": "keyboard",    // מקלדות
  "0221": "mouse",       // עכברים
  "028767": "dock",      // אביזרים למחשבים ניידים (docks)
  "096739": "backpack",  // תיקי גב
  "029782": "wallet",    // ארנקים
  "05043": "watch",      // שעוני יד לגברים
  "06615": "lamp",       // מנורות שולחן
  "06613": "lamp",       // מנורות חכמות
};
const MAX_PAGES = 15;
const MAX_DETAILS = 120;   // the item endpoint throttles: ~4 s each under load
const SALE_LABEL = /sale|מבצע|black|friday|הנחה|deal|outlet|עודפים/i;

const parseJ = (s, d) => { if (s == null) return d; if (typeof s !== "string") return s; try { return JSON.parse(s); } catch { return d; } };

async function kspItem(getJson, uin) {
  try {
    const d = await getJson(`${KSP}/m_action/api/item/${uin}`);
    const r = d.result || d;
    if (!r || !r.data) return null;
    const images = (r.images || []).map((i) => (i.sizes?.l || i.sizes?.b || i.sizes?.s || {}).src).filter(Boolean).map((u) => u.replace(/\?.*/, ""));
    const spec = (r.specification?.items || []).slice(0, 40).map((x) => [String(x.head || "").trim(), String(x.body || "").replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim().slice(0, 300)]);
    return { images, description: r.data.smalldesc || r.data.description || null, spec, eilatPrice: r.data.eilatPrice || null };
  } catch { return null; }
}

async function kspFetchDeals({ getJson, sleep, stripHtml, qualify, techMatch, brandOf }, log = () => {}) {
  const found = new Map();
  let seen = 0;
  for (const [cat, want] of Object.entries(KSP_CATS)) {
    let url = `${KSP}/m_action/api/category/${cat}`;
    for (let p = 1; p <= (globalThis.__DEALS_MAX_PAGES || MAX_PAGES) && url; p++) {
      let d;
      try { d = await getJson(url); } catch (e) { log(`ksp: ${cat} p${p} ${e.message.slice(0, 40)}`); break; }
      const res = d.result || {};
      const its = Array.isArray(res.items) ? res.items : Object.values(res.items || {});
      if (!its.length) break;
      seen += its.length;
      for (const i of its) {
        if (!i.uin || i.outOfStock || !i.price) continue;
        const text = `${i.name} ${i.brandName || ""} ${i.description || ""}`;
        const m = techMatch(text);
        if (!m || (want && m.kind !== want && !(want === "apple" && m.kind === "apple"))) continue;
        if (!found.has(i.uin)) found.set(i.uin, { ...i, cat, match: m });
      }
      log(`ksp: ${cat} p${p} items ${its.length} kept ${found.size}`);
      url = res.next && Number(res.next) > p ? `${KSP}/m_action/api/category/${cat}?page=${res.next}` : null;   // next is the page number
      if (url) await sleep(500);
    }
  }
  const items = [];
  let details = 0;
  for (const i of found.values()) {
    const labels = parseJ(i.labels, []), red = parseJ(i.redMsg, []), tags = parseJ(i.tags, {});
    const on_sale = [...labels, ...red].some((l) => SALE_LABEL.test(`${l.type || ""} ${l.msg || ""}`));
    let images = i.img ? [i.img.replace(/\?.*/, "")] : [], description = i.description || null, spec = [];
    if (details < MAX_DETAILS) {
      const it = await kspItem(getJson, i.uin); details++; await sleep(700);
      if (it) {
        if (it.images.length) images = it.images;
        if (it.description && it.description.length > (description || "").length) description = it.description;
        spec = it.spec;
      }
      if (details % 25 === 0) log(`ksp: details ${details}/${found.size}`);
    }
    const price = Number(i.price), minp = Number(i.min_price) || null;
    const q = qualify({
      external_id: String(i.uin), url: `${KSP}/web/item/${i.uin}`, title: i.name, price: minp && minp < price ? minp : price, compare_price: null,
      brand: brandOf(i.brandName || "", i.name) || (i.brandName || "").toLowerCase() || null, brandRaw: i.brandName, kind: i.match.kind, category: i.match.category,
      images, description: stripHtml(description).slice(0, 2000), sizes: [], on_sale,
      attrs: { labels, redMsg: red, tags, spec, ksp_category: i.cat, eilat_price: i.eilatPrice || null, need: i.match.need },
    }, { requireDiscount: false, tech: true });
    if (q) items.push(q);
  }
  return { items, seen };
}

export { kspFetchDeals, KSP_CATS };
