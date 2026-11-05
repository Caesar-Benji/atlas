// Atlas — deal gatherer receiver (v74).
//
// The daily runners (GitHub Actions for the shops that allow datacenter traffic, a
// scheduled Claude task in Benji's Chrome for Gant / adidas / KSP) POST batches of
// normalised products here. One POST = one shop, up to 500 items; the first POST of a run
// omits run_id and gets one back; the last carries final:true, which retires products the
// shop no longer lists and closes the run.
//
// verify_jwt is off — auth is a bearer token whose SHA-256 lives in public.webhook_tokens
// (same pattern as apple-pay). CORS is open because the Mac runner posts from a shop's page.

import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

const MAX_BODY = 4 * 1024 * 1024;
const MAX_ITEMS = 500;
const RATE_LIMIT = 120; // per minute per token — a run is a few dozen POSTs
const SHOPS = new Set(["gant", "adidas", "ksp", "outline", "redback", "benda", "terminalx", "nike", "mous"]);

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, content-type, x-atlas-token",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json", ...CORS } });

async function sha256(s: string): Promise<string> {
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(s));
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, "0")).join("");
}
const israelDate = (d: Date) =>
  new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Jerusalem", year: "numeric", month: "2-digit", day: "2-digit" }).format(d);

const str = (v: unknown, n: number) => (v == null ? null : String(v).trim().slice(0, n) || null);
const num = (v: unknown) => { const n = typeof v === "number" ? v : parseFloat(String(v ?? "").replace(/[^\d.]/g, "")); return isFinite(n) && n > 0 ? Math.round(n * 100) / 100 : null; };
const arr = (v: unknown, n: number) => Array.isArray(v) ? v.slice(0, n) : [];
const obj = (v: unknown) => (v && typeof v === "object" && !Array.isArray(v)) ? v as Record<string, unknown> : {};

type Item = {
  external_id: string; url: string; title: string; price: number; compare_price: number | null;
  brand: string | null; category: string | null; kind: string | null; gender: string;
  image_url: string | null; images: string[]; description: string | null; color: string | null;
  sizes: unknown[]; my_size: boolean | null; attrs: Record<string, unknown>; currency: string; score: number;
};

function normalise(raw: unknown): Item | null {
  const r = obj(raw);
  const external_id = str(r.external_id, 120), url = str(r.url, 600), title = str(r.title, 300);
  const price = num(r.price);
  if (!external_id || !url || !title || price === null) return null;
  const images = arr(r.images, 24).map((x) => str(x, 600)).filter(Boolean) as string[];
  const image_url = str(r.image_url, 600) ?? images[0] ?? null;
  const compare = num(r.compare_price);
  return {
    external_id, url, title, price,
    compare_price: compare && compare > price ? compare : null,
    brand: str(r.brand, 80), category: str(r.category, 40), kind: str(r.kind, 40),
    gender: str(r.gender, 12) ?? "men",
    image_url, images: images.length ? images : (image_url ? [image_url] : []),
    description: str(r.description, 4000), color: str(r.color, 80),
    sizes: arr(r.sizes, 60).map((s) => { const o = obj(s); return { size: str(o.size, 20), in_stock: o.in_stock == null ? null : !!o.in_stock }; }).filter((s) => s.size),
    my_size: r.my_size == null ? null : !!r.my_size,
    attrs: obj(r.attrs), currency: (str(r.currency, 3) ?? "ILS").toUpperCase(),
    score: Math.max(0, Math.min(100, Number(r.score) || 0)),
  };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: CORS });
  if (req.method !== "POST") return json({ error: "POST only" }, 405);
  if (Number(req.headers.get("content-length") ?? 0) > MAX_BODY) return json({ error: "payload too large" }, 413);

  const auth = req.headers.get("authorization") ?? "";
  const token = auth.replace(/^Bearer\s+/i, "").trim() || (req.headers.get("x-atlas-token") ?? "").trim();
  if (!token) return json({ error: "missing token" }, 401);

  const sb = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, { auth: { persistSession: false } });
  const { data: tok } = await sb.from("webhook_tokens").select("id,user_id,revoked").eq("token_sha256", await sha256(token)).maybeSingle();
  if (!tok || tok.revoked) return json({ error: "bad token" }, 401);
  const { data: gate, error: gateErr } = await sb.rpc("consume_token", { p_id: tok.id, p_limit: RATE_LIMIT }).maybeSingle();
  if (gateErr) return json({ error: "rate check failed" }, 500);
  if (!gate?.allowed) return json({ error: "rate limited" }, 429);

  let body: Record<string, unknown>;
  try { body = obj(await req.json()); } catch { return json({ error: "bad json" }, 400); }

  const shop = str(body.shop, 20);
  if (!shop || !SHOPS.has(shop)) return json({ error: "unknown shop", shop }, 400);
  const runner = str(body.runner, 20) ?? "github";
  const today = israelDate(new Date());
  const user_id = tok.user_id;

  // 1. the run row
  let run_id = Number(body.run_id) || null;
  if (run_id) {
    const { data: run } = await sb.from("deal_runs").select("id").eq("id", run_id).eq("user_id", user_id).eq("shop", shop).maybeSingle();
    if (!run) return json({ error: "unknown run_id" }, 400);
  } else {
    const { data: run, error } = await sb.from("deal_runs").insert({ user_id, shop, runner }).select("id").single();
    if (error) return json({ error: error.message }, 500);
    run_id = run.id;
  }

  // 2. the items
  const rawItems = arr(body.items, MAX_ITEMS);
  const items = rawItems.map(normalise).filter(Boolean) as Item[];
  const seenIds = new Set<string>();
  const products = items.filter((it) => (seenIds.has(it.external_id) ? false : (seenIds.add(it.external_id), true)))
    .map((it) => ({
      user_id, shop, external_id: it.external_id, url: it.url, title: it.title, brand: it.brand,
      category: it.category, kind: it.kind, gender: it.gender, image_url: it.image_url, images: it.images,
      description: it.description, color: it.color, sizes: it.sizes, my_size: it.my_size, attrs: it.attrs,
      currency: it.currency, score: it.score, last_seen: today, active: true,
    }));

  let upserted = 0;
  if (products.length) {
    const { data: rows, error } = await sb.from("deal_products")
      .upsert(products, { onConflict: "user_id,shop,external_id", ignoreDuplicates: false })
      .select("id,external_id");
    if (error) {
      await sb.from("deal_runs").update({ status: "error", error: error.message.slice(0, 500), finished_at: new Date().toISOString() }).eq("id", run_id);
      return json({ error: error.message, run_id }, 500);
    }
    const idOf = new Map(rows.map((r) => [r.external_id, r.id]));
    const prices = items.filter((it) => idOf.has(it.external_id)).map((it) => ({
      product_id: idOf.get(it.external_id), seen_on: today, price: it.price, compare_price: it.compare_price,
      discount_pct: it.compare_price ? Math.round((1 - it.price / it.compare_price) * 100) : null,
    }));
    const { error: perr } = await sb.from("deal_prices").upsert(prices, { onConflict: "product_id,seen_on" });
    if (perr) return json({ error: perr.message, run_id }, 500);
    upserted = rows.length;
  }

  // 3. run bookkeeping
  const { data: run } = await sb.from("deal_runs").select("items_seen,items_kept").eq("id", run_id).single();
  const patch: Record<string, unknown> = {
    items_seen: (run?.items_seen ?? 0) + (body.seen != null ? Number(body.seen) || 0 : rawItems.length),
    items_kept: (run?.items_kept ?? 0) + upserted,
  };
  const errMsg = str(body.error, 500);
  if (errMsg) { patch.status = "error"; patch.error = errMsg; patch.finished_at = new Date().toISOString(); }
  else if (body.final) {
    // whatever this shop listed before and not today is gone
    await sb.from("deal_products").update({ active: false }).eq("user_id", user_id).eq("shop", shop).lt("last_seen", today);
    patch.status = "ok"; patch.finished_at = new Date().toISOString();
  }
  await sb.from("deal_runs").update(patch).eq("id", run_id);

  return json({ ok: true, run_id, received: rawItems.length, upserted, dropped: rawItems.length - items.length, today });
});
