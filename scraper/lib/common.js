// Atlas deal gatherer — shared rules. Runs in Node 20 (GitHub Actions) AND, concatenated by
// build-browser.js, inside a shop's page in Benji's Chrome. So: no imports, no Node APIs
// beyond fetch, and the single `export` line at the bottom is what the build strips.

// ---------- Benji ----------
const ME = {
  tops: ["L", "XL", "XXL", "2XL"],                      // XL primary; L for slim brands, XXL for shrink-prone
  pants: ["34", "W34", "34/32", "34/34", "34W", "50", "EU 50", "L"],
  shoes: ["45", "45.0", "EU 45", "EU45", "10.5", "UK 10.5", "US 11", "11"],
  watch_mm: 45,
  tv_in: 65,
};

// Clothing brands that count ("brand is enough"). Keys are what we normalise to.
const BRANDS = {
  "gant": ["gant"], "tommy hilfiger": ["tommy hilfiger", "tommy jeans", "tommy"], "ralph lauren": ["ralph lauren", "polo ralph"],
  "lacoste": ["lacoste"], "carhartt": ["carhartt"], "hugo boss": ["hugo boss", "boss"], "massimo dutti": ["massimo dutti"],
  "levi's": ["levi", "levis"], "dockers": ["dockers"], "timberland": ["timberland"], "redback": ["redback"], "dickies": ["dickies"],
  "barbour": ["barbour"], "fred perry": ["fred perry"], "superdry": ["superdry"], "nike": ["nike", "jordan"], "adidas": ["adidas"],
};
const BRAND_TIER = { gant: 1, "ralph lauren": 1, "hugo boss": 1, lacoste: 1, barbour: 1, "tommy hilfiger": .9, "massimo dutti": .9,
  "fred perry": .9, carhartt: .8, timberland: .8, "levi's": .7, dockers: .7, redback: .7, superdry: .6, dickies: .6, nike: .7, adidas: .7 };

function brandOf(...texts) {
  const t = texts.filter(Boolean).join(" ").toLowerCase();
  for (const [name, keys] of Object.entries(BRANDS)) if (keys.some((k) => t.includes(k))) return name;
  return null;
}

// ---------- what a thing is ----------
// [regex over title+categories (lowercase), kind, category]. First match wins; order matters.
const KINDS = [
  [/sweatpant|jogger|מכנסי טרנינג|טרנינג/, "sweatpants", "clothes"],
  [/jersey|חולצת משחק|kit\b|מדי /, "kit", "clothes"],
  [/polo|פולו/, "polo", "clothes"],
  [/oxford|מכופתר|button|shirt(?!.*t-shirt)|חולצה מכופתרת/, "shirt", "clothes"],
  [/t-?shirt|tee\b|טי שירט|חולצת טי/, "tee", "clothes"],
  [/hoodie|קפוצ|sweatshirt|סווטשירט|crewneck/, "sweat", "clothes"],
  [/knit|sweater|cardigan|סריג|סוודר|pullover/, "knit", "clothes"],
  [/jacket|coat|parka|puffer|overshirt|מעיל|ג'קט|ז'קט|vest|ווסט/, "jacket", "clothes"],
  [/chino|צ'ינו|trouser|pant|jeans|ג'ינס|מכנס/, "pants", "clothes"],
  [/short|ברמודה|מכנסיים קצרים/, "shorts", "clothes"],
  [/swim|בגד ים/, "swim", "clothes"],
  [/boxer|brief|תחתונ|sock|גרב/, "underwear", "clothes"],
  [/samba|gazelle|air force|dunk|campus|superstar|stan smith|sneaker|סניקרס|נעלי ספורט|trainer/, "sneakers", "shoes"],
  [/loafer|מוקסין|derby|oxford shoe|boot|מגף|chelsea|נעל/, "shoes", "shoes"],
  [/cap\b|כובע מצחייה|beanie|כובע גרב|bucket|hat\b|כובע/, "hat", "hats"],
  [/scarf|צעיף|glove|כפפ|belt|חגור/, "accessory", "clothes"],
  [/backpack|תיק גב|rucksack/, "backpack", "bags"],
  [/weekender|duffel|duffle|תיק נסיעות|tote|messenger|תיק צד|תיק כתף|bag\b/, "bag", "bags"],
  [/wallet|ארנק|cardholder/, "wallet", "bags"],
  [/soundbar|sound bar|מקרן קול|jbl bar/, "soundbar", "audio"],
  [/airpods|אוזניות|headphone|earbud/, "earbuds", "audio"],
  [/dock|docking|תחנת עגינה|hub\b|thunderbolt/, "dock", "desk"],
  [/keyboard|מקלדת/, "keyboard", "desk"],
  [/mouse\b|עכבר/, "mouse", "desk"],
  [/monitor arm|זרוע|mount|מעמד למסך|stand/, "arm", "desk"],
  [/desk mat|משטח|deskmat|mousepad|פד לעכבר/, "deskmat", "desk"],
  [/light ?bar|מנורת מסך|screenbar|lamp|מנורה|תאורה|light/, "lamp", "lights"],
  [/apple watch|רצועה|band\b|strap|magsafe|charger|מטען|iphone 17|מגן ל|case\b/, "apple", "apple"],
  [/watch|שעון/, "watch", "watches"],
];
function kindOf(...texts) {
  const t = texts.filter(Boolean).join(" ").toLowerCase();
  for (const [re, kind, category] of KINDS) if (re.test(t)) return { kind, category };
  return { kind: "other", category: "other" };
}
const EXCLUDE_KINDS = new Set(["sweatpants", "kit", "underwear", "swim"]);
const NOT_MEN = /(?<!\p{L})(women|womens|woman|ladies|נשים|אישה|לאישה|לנשים|ילד|ילדים|ילדות|לילד|לילדים|לילדות|לנערים|לנערות|לתינוק|לתינוקות|kids|boys|girls|baby|תינוק|תינוקות|junior|נוער|youth|נערות|נערים)(?!\p{L})/iu;

// ---------- sizes ----------
function normSize(s) {
  return String(s ?? "").toUpperCase().replace(/\s+/g, " ").replace(/^EU ?/, "").replace(/^US ?/, "").replace(/^UK ?/, "").trim();
}
function sizeFits(kind, category, sizeLabel) {
  const s = normSize(sizeLabel);
  if (!s) return false;
  const first = s.split(/[\/ ]/)[0];                      // "34/32" → "34", "XL (52)" → "XL"
  if (category === "shoes") return ME.shoes.map(normSize).includes(s) || /^45(\.0)?$/.test(first);
  if (kind === "pants" || kind === "shorts") return ME.pants.map(normSize).includes(s) || /^W?34$/.test(first) || first === "50";
  return ME.tops.map(normSize).includes(s) || ["L", "XL", "XXL", "2XL"].includes(first);
}
// sizes: [{size, in_stock}] → true / false / null (shop gave no sizes or no stock info)
function mySize(kind, category, sizes) {
  if (category === "hats" || kind === "accessory" || !["clothes", "shoes"].includes(category)) return null;
  if (!sizes || !sizes.length) return null;
  const fits = sizes.filter((x) => sizeFits(kind, category, x.size));
  if (!fits.length) return false;
  if (fits.every((x) => x.in_stock == null)) return null;
  return fits.some((x) => x.in_stock !== false);
}

// ---------- tech relevance ----------
// For KSP / tech categories: keep only what Benji is actually after.
const TECH_WANT = [
  [/jbl bar|soundbar|מקרן קול|sonos|samsung.*hw-q|bose smart soundbar|atmos/i, "soundbar", "audio", 1],
  [/airpods pro|airpods max/i, "earbuds", "audio", .6],
  [/תחנת עגינה|docking|dock|thunderbolt 4|usb-c hub|caldigit|anker.*hub|dell wd|hp.*dock/i, "dock", "desk", 1],
  [/מקלדת מכנית|mechanical keyboard|keychron|logitech mx mechanical|razer.*keyboard|corsair.*keyboard|מקלדת.*(mx|rgb)/i, "keyboard", "desk", .9],
  [/mx master|logitech mx|razer.*mouse|עכבר אלחוטי/i, "mouse", "desk", .7],
  [/זרוע למסך|monitor arm|ergotron|זרוע.*מסך/i, "arm", "desk", .8],
  [/screenbar|light bar|מנורת מסך|benq.*bar|xiaomi.*monitor light|מנורת שולחן|desk lamp|מנורה חכמה/i, "lamp", "lights", .7],
  [/apple watch.*(רצועה|band|strap|loop|milanese|leather)|(רצועה|band|strap).*(apple watch|45|46|44)|magsafe|מטען.*(iphone|apple)|iphone 17 pro max/i, "apple", "apple", .7],
  [/תיק גב|backpack|rucksack/i, "backpack", "bags", 1],
  [/ארנק|wallet/i, "wallet", "bags", .5],
  [/seiko|casio|tissot|orient|citizen|g-shock|timex/i, "watch", "watches", .6],
];
function techMatch(text) {
  for (const [re, kind, category, need] of TECH_WANT) if (re.test(text)) return { kind, category, need };
  return null;
}

// ---------- score ----------
const NEED = { backpack: 1, soundbar: 1, dock: 1, keyboard: .9, apple: .7, arm: .8, lamp: .6, wallet: .5, watch: .6, earbuds: .6, mouse: .7, deskmat: .4,
  polo: .8, shirt: .8, knit: .8, jacket: .8, pants: .7, chino: .7, sneakers: .7, shoes: .7, tee: .5, sweat: .6, shorts: .4, hat: .5, accessory: .3, bag: .6, other: .3 };
const GYM = /dri-?fit|aeroready|training|אימון|running|ריצה|gym|climacool|techfit|dry/i;
const LIFESTYLE = /samba|gazelle|campus|spezial|handball|air force|dunk|cortez|killshot|blazer|air max/i;

function score(it) {
  const disc = it.compare_price && it.price ? Math.max(0, 1 - it.price / it.compare_price) : (it.on_sale ? .15 : 0);
  const need = it.need ?? NEED[it.kind] ?? .3;
  const tier = BRAND_TIER[it.brand] ?? .5;
  const size = it.my_size === true ? 1 : it.my_size === false ? 0 : .5;
  let s = 45 * Math.min(disc, .7) / .7 + 25 * need + 15 * tier + 10 * size;
  const t = `${it.title} ${it.description ?? ""}`;
  if ((it.brand === "nike" || it.brand === "adidas") && (GYM.test(t) || LIFESTYLE.test(t))) s += 5;
  return Math.round(Math.min(100, s) * 10) / 10;
}

// ---------- filters ----------
// Apply the shared rules to a raw item (already carrying title/price/etc.). Returns the item
// ready for ingest or null if it is not for Benji.
function qualify(it, { requireDiscount = true, requireBrand = false, tech = false } = {}) {
  const text = `${it.title} ${(it.categories || []).join(" ")} ${it.description || ""}`;
  if (NOT_MEN.test(it.title) && !/גברים|\bmen\b|unisex|יוניסקס/i.test(it.title + " " + (it.categories || []).join(" "))) return null;
  if (it.gender && it.gender !== "men" && it.gender !== "unisex") return null;
  let { kind, category } = it.kind ? { kind: it.kind, category: it.category } : kindOf(text);
  let need;
  if (tech) {
    const m = techMatch(text);
    if (!m) return null;
    ({ kind, category, need } = m);
  }
  if (EXCLUDE_KINDS.has(kind)) return null;
  if (!it.brand) it.brand = brandOf(it.title, it.brandRaw);
  if (requireBrand && !it.brand) return null;
  const on_sale = !!(it.compare_price && it.compare_price > it.price) || !!it.on_sale;
  if (requireDiscount && !on_sale) return null;
  const my_size = it.my_size ?? mySize(kind, category, it.sizes);
  if (my_size === false) return null;                     // the shop says: not in his size
  const out = {
    external_id: String(it.external_id), url: it.url, title: it.title.trim(), price: it.price,
    compare_price: it.compare_price || null, brand: it.brand, category, kind, gender: it.gender || "men",
    image_url: it.image_url || (it.images || [])[0] || null, images: it.images || [], description: it.description || null,
    color: it.color || null, sizes: it.sizes || [], my_size, currency: it.currency || "ILS",
    attrs: { ...(it.attrs || {}), on_sale, need },
  };
  out.score = score({ ...out, on_sale, need });
  return out;
}

// ---------- transport ----------
async function sleep(ms) { return new Promise((r) => setTimeout(r, ms)); }
async function getJson(url, headers = {}, tries = 3) {
  for (let i = 0; i < tries; i++) {
    const r = await fetch(url, { headers: { Accept: "application/json", ...headers } });
    if (r.status === 429 || r.status >= 500) { await sleep(1500 * (i + 1)); continue; }
    if (!r.ok) throw new Error(`${r.status} ${url}`);
    return r.json();
  }
  throw new Error(`gave up ${url}`);
}
async function getText(url, headers = {}, tries = 3) {
  for (let i = 0; i < tries; i++) {
    const r = await fetch(url, { headers: { Accept: "text/html,*/*", ...headers } });
    if (r.status === 429 || r.status >= 500) { await sleep(1500 * (i + 1)); continue; }
    if (!r.ok) throw new Error(`${r.status} ${url}`);
    return r.text();
  }
  throw new Error(`gave up ${url}`);
}
const stripHtml = (h) => String(h ?? "").replace(/<[^>]+>/g, " ").replace(/&nbsp;/g, " ").replace(/&amp;/g, "&").replace(/&#8211;/g, "–").replace(/&quot;/g, '"').replace(/\s+/g, " ").trim();

// Sends a shop's items to deals-ingest in batches; returns the run id.
async function ingest({ url, token, shop, runner, items, seen, error }) {
  let run_id = null;
  const post = async (body) => {
    const r = await fetch(url, { method: "POST", headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      body: JSON.stringify({ shop, runner, run_id, ...body }) });
    const j = await r.json().catch(() => ({}));
    if (!r.ok) throw new Error(`ingest ${r.status}: ${j.error || ""}`);
    run_id = j.run_id;
    return j;
  };
  if (error) { await post({ items: [], seen: seen || 0, error: String(error).slice(0, 500) }); return run_id; }
  const B = 200;
  if (!items.length) { await post({ items: [], seen: seen || 0, final: true }); return run_id; }
  for (let i = 0; i < items.length; i += B) {
    const last = i + B >= items.length;
    await post({ items: items.slice(i, i + B), seen: i === 0 ? (seen || items.length) : 0, final: last });
  }
  return run_id;
}

export { ME, BRANDS, brandOf, kindOf, techMatch, mySize, sizeFits, score, qualify, sleep, getJson, getText, stripHtml, ingest, NOT_MEN };
