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
const MAX_DETAILS = 300;
const SALE_LABEL = /sale|מבצע|black|friday|הנחה|deal|outlet|עודפים/i;

const parseJ = (s, d) => { if (s == null) return d; if (typeof s !== "string") return s; try { return JSON.parse(s); } catch { return d; } };

async function kspItem(getJson, uin) {
  for (const u of [`${KSP}/m_action/api/item/${uin}`, `${KSP}/m_action/api/item/${uin}?language=he`]) {
    try {
      const d = await getJson(u);
      const r = d.result || d;
      if (r && (r.data || r.images || r.img || r.name)) return r.data || r;
    } catch { /* try the next form */ }
  }
  return null;
}

async function kspFetchDeals({ getJson, sleep, stripHtml, qualify, techMatch, brandOf }, log = () => {}) {
  const found = new Map();
  let seen = 0;
  for (const [cat, want] of Object.entries(KSP_CATS)) {
    let url = `${KSP}/m_action/api/category/${cat}`;
    for (let p = 1; p <= MAX_PAGES && url; p++) {
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
      url = res.next ? (String(res.next).startsWith("http") ? res.next : `${KSP}${String(res.next).startsWith("/") ? "" : "/m_action/api/category/"}${res.next}`) : null;
      if (url) await sleep(500);
    }
  }
  const items = [];
  let details = 0;
  for (const i of found.values()) {
    const labels = parseJ(i.labels, []), red = parseJ(i.redMsg, []), tags = parseJ(i.tags, {});
    const on_sale = [...labels, ...red].some((l) => SALE_LABEL.test(`${l.type || ""} ${l.msg || ""}`));
    let images = i.img ? [i.img] : [], description = i.description || null;
    if (details < MAX_DETAILS) {
      const it = await kspItem(getJson, i.uin); details++; await sleep(400);
      if (it) {
        const imgs = [];
        const walk = (o, dp = 0) => { if (!o || typeof o !== "object" || dp > 6) return; for (const k in o) { const v = o[k]; if (typeof v === "string" && /^https?:\/\/ksp\.co\.il\/(shop\/items|images)\/.+\.(jpe?g|png|webp)/i.test(v)) imgs.push(v.replace(/\?.*/, "")); else if (typeof v === "object") walk(v, dp + 1); } };
        walk(it);
        if (imgs.length) images = [...new Set([...images, ...imgs])];
        if (typeof it.description === "string" && it.description.length > (description || "").length) description = it.description;
      }
    }
    const price = Number(i.price), minp = Number(i.min_price) || null;
    const q = qualify({
      external_id: String(i.uin), url: `${KSP}/web/item/${i.uin}`, title: i.name, price: minp && minp < price ? minp : price, compare_price: null,
      brand: brandOf(i.brandName || "", i.name) || (i.brandName || "").toLowerCase() || null, brandRaw: i.brandName, kind: i.match.kind, category: i.match.category,
      images, description: stripHtml(description).slice(0, 2000), sizes: [], on_sale,
      attrs: { labels, redMsg: red, tags, ksp_category: i.cat, eilat_price: i.eilatPrice || null, need: i.match.need },
    }, { requireDiscount: false, tech: true });
    if (q) items.push(q);
  }
  return { items, seen };
}

export { kspFetchDeals, KSP_CATS };
