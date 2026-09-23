// Atlas — Apple Pay tap receiver.
//
// The iOS Shortcuts "Transaction" automation fires the moment a contactless tap
// completes and POSTs {amount, merchant, card, date, currency} here. We normalise the
// merchant string, apply whatever category/name Benji taught us for it, and insert the
// expense. verify_jwt is off because Shortcuts can't do a Supabase auth handshake —
// auth is instead a bearer token whose SHA-256 lives in public.webhook_tokens, so it
// can be revoked without redeploying.
//
// Deliberately NO CORS headers: the only client is Shortcuts, which is not a browser and
// never sends a preflight. A wildcard origin here would be surface with no consumer.

import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

const MAX_BODY = 8 * 1024;   // a tap payload is ~150 bytes
const MAX_MERCHANT = 200;    // terminal strings are short; anything longer is junk or abuse
const MAX_DESC = 240;
const RATE_LIMIT = 30;       // requests per minute per token

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });

async function sha256(s: string): Promise<string> {
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(s));
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

// "SHUFERSAL DEAL 1234" and "shufersal deal  #77" both collapse to "SHUFERSAL DEAL",
// so one taught rule covers every branch of the same shop. Hebrew is preserved.
// NOTE: index.html has an identical merchantKey() — change both together.
function merchantKey(raw: string): string {
  return raw
    .normalize("NFKC")
    .replace(/[^\p{L} ]+/gu, " ")
    .replace(/\s+/g, " ")
    .trim()
    .toUpperCase()
    .slice(0, 80);
}

// Shortcuts sends the amount in the device locale; be liberal about what we accept.
function parseAmount(v: unknown): number | null {
  if (typeof v === "number") return isFinite(v) ? Math.abs(v) : null;
  if (typeof v !== "string") return null;
  let s = v.replace(/[^\d.,-]/g, "").trim();
  if (s.includes(",") && s.includes(".")) {
    s = s.lastIndexOf(",") > s.lastIndexOf(".")
      ? s.replace(/\./g, "").replace(",", ".")
      : s.replace(/,/g, "");
  } else if (s.includes(",")) {
    s = /,\d{1,2}$/.test(s) ? s.replace(",", ".") : s.replace(/,/g, "");
  }
  const n = Math.abs(parseFloat(s));
  return isFinite(n) ? n : null;
}

// Calendar date in Israel for an instant — DST-aware, so a 23:30 tap in January is
// still today (a fixed +3h put it on tomorrow for half the year).
const israelDate = (d: Date) =>
  new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Jerusalem", year: "numeric", month: "2-digit", day: "2-digit" }).format(d);

// Accept an ISO date, a plain YYYY-MM-DD, or nothing (then: today in Israel).
function parseDate(v: unknown): string {
  if (typeof v !== "string" || !v.trim()) return israelDate(new Date());
  // a bare date, or a local timestamp with no zone, is already in Benji's calendar
  const m = v.match(/^\s*(\d{4})-(\d{2})-(\d{2})(?![T\d])|^\s*(\d{4})-(\d{2})-(\d{2})T[\d:.]+\s*$/);
  if (m) return m[1] ? `${m[1]}-${m[2]}-${m[3]}` : `${m[4]}-${m[5]}-${m[6]}`;
  const d = new Date(v);                       // anything with a zone (…Z, +02:00) is an instant
  return isNaN(+d) ? israelDate(new Date()) : israelDate(d);
}

// Shortcuts may hand over the symbol or a local code rather than ISO 4217.
function normCurrency(v: unknown): string {
  const c = clip(v, 8).toUpperCase().replace(/\s+/g, "");
  if (!c || c === "₪" || c === "NIS" || c === "ILS" || c === "שח" || c === 'ש"ח' || c === "IL") return "ILS";
  if (c === "$" || c === "US$") return "USD";
  if (c === "€") return "EUR";
  if (c === "£") return "GBP";
  return c;
}

const clip = (v: unknown, n: number) => String(v ?? "").trim().slice(0, n);

Deno.serve(async (req) => {
  if (req.method !== "POST") return json({ error: "POST only" }, 405);

  const declared = Number(req.headers.get("content-length") ?? 0);
  if (declared > MAX_BODY) return json({ error: "payload too large" }, 413);

  const auth = req.headers.get("authorization") ?? "";
  const token = auth.replace(/^Bearer\s+/i, "").trim() ||
    (req.headers.get("x-atlas-token") ?? "").trim();
  if (!token) return json({ error: "missing token" }, 401);

  const sb = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    { auth: { persistSession: false } },
  );

  const { data: tok } = await sb
    .from("webhook_tokens")
    .select("id,user_id,revoked")
    .eq("token_sha256", await sha256(token))
    .maybeSingle();
  if (!tok || tok.revoked) return json({ error: "bad token" }, 401);

  // Atomic check-and-consume under a row lock, before any work is done on the payload.
  const { data: gate, error: gateErr } = await sb
    .rpc("consume_token", { p_id: tok.id, p_limit: RATE_LIMIT })
    .maybeSingle();
  if (gateErr) return json({ error: "rate check failed" }, 500);
  if (!gate?.allowed) {
    return json({
      error: "rate limited",
      message: `More than ${RATE_LIMIT} requests in a minute on this token — refused.`,
    }, 429);
  }

  let body: Record<string, unknown>;
  try { body = await req.json(); } catch { return json({ error: "bad json" }, 400); }

  const amount = parseAmount(body.amount);
  if (amount === null || amount === 0) {
    // Surfaced straight into the Shortcut's notification: when the magic variables aren't
    // mapped (or a manual run supplies none) every field arrives empty, and guessing at
    // that from a bare "bad amount" is miserable on a phone.
    const seen = Object.keys(body).length
      ? Object.entries(body).map(([k, v]) => `${k}=${v === "" ? "(empty)" : JSON.stringify(v)}`).join("  ")
      : "(no fields at all)";
    return json({
      error: "no usable amount",
      message: `Shortcut sent: ${seen}`,
      hint: "Open 'Get contents of URL' > Request Body and set each field to the matching Transaction variable.",
    }, 400);
  }
  if (amount > 1_000_000) return json({ error: "amount out of range", got: amount }, 400);

  const rawMerchant = clip(body.merchant, MAX_MERCHANT);
  const key = merchantKey(rawMerchant);
  const currency = normCurrency(body.currency);
  const spent_at = parseDate(body.date);
  const card = clip(body.card, 80);

  // The Transaction automation is known to fire twice for one tap on some cards. The same
  // merchant and amount within two minutes is the same tap — acknowledge it, insert nothing.
  {
    const since = new Date(Date.now() - 2 * 60_000).toISOString();
    let q = sb.from("expenses").select("id").eq("user_id", tok.user_id).eq("source", "applepay")
      .eq("amount", amount).gte("created_at", since).limit(1);
    q = key ? q.eq("merchant_key", key) : q.is("merchant_key", null);
    const { data: dup } = await q;
    if (dup && dup.length) {
      return json({ ok: true, id: dup[0].id, duplicate: true, amount, currency,
        message: `Already logged: ${rawMerchant || "Apple Pay"} · ${amount}` });
    }
  }

  // What did Benji last call this merchant?
  let category = "Other";
  let description = rawMerchant || card || "Apple Pay";
  if (key) {
    const { data: rule } = await sb
      .from("merchant_rules")
      .select("category,description")
      .eq("user_id", tok.user_id).eq("merchant_key", key)
      .maybeSingle();
    if (rule) {
      category = rule.category ?? "Other";
      if (rule.description) description = rule.description;
    }
  }
  // A foreign-currency tap is the original amount, not what Cal will actually charge —
  // say so on the row so it's obvious why the statement won't match it later.
  if (currency !== "ILS") description = `${description} (${currency} ${amount})`;
  description = description.slice(0, MAX_DESC);

  const { data: ins, error } = await sb.from("expenses").insert({
    user_id: tok.user_id, amount, category, description,
    spent_at, source: "applepay",
    merchant: rawMerchant || null, merchant_key: key || null,
  }).select("id").single();
  if (error) return json({ error: error.message }, 500);

  // Returned so the Shortcut can show it in its completion notification.
  return json({
    ok: true, id: ins.id, amount, currency, category, description,
    learned: category !== "Other",
    message: `${description} · ${currency === "ILS" ? "₪" : currency + " "}${amount} · ${category}`,
  });
});
