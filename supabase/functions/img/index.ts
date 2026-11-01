// Atlas Wardrobe image proxy: fetches a product photo from one of the shops Benji buys from and returns it with
// CORS headers, so the signed-in app can read its pixels (cut the garment out of the white, measure its outline).
// Callers must present a valid Supabase JWT (verify_jwt on). Only these hosts, only https, only images; cached a week.
const ALLOW = new Set(['media.terminalx.com', 'assets.adidas.com', 'static.nike.com', 'www.adidas.co.il']);
const CORS = {'access-control-allow-origin': '*', 'access-control-allow-methods': 'GET, OPTIONS', 'access-control-allow-headers': 'authorization, apikey, content-type'};

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response(null, {status: 204, headers: CORS});
  const u = new URL(req.url).searchParams.get('u') || '';
  let target: URL;
  try { target = new URL(u); } catch { return new Response('bad url', {status: 400, headers: CORS}); }
  if (target.protocol !== 'https:' || !ALLOW.has(target.hostname)) return new Response('host not allowed', {status: 403, headers: CORS});
  let r: Response;
  try {
    r = await fetch(target.toString(), {headers: {'user-agent': 'Mozilla/5.0 (Atlas wardrobe image proxy)', 'accept': 'image/*'}});
  } catch (e) {
    return new Response('upstream failed: ' + (e as Error).message, {status: 502, headers: CORS});
  }
  const type = r.headers.get('content-type') || 'image/jpeg';
  if (!r.ok || !type.startsWith('image/')) return new Response('upstream ' + r.status, {status: r.ok ? 415 : r.status, headers: CORS});
  const h = new Headers(CORS);
  h.set('content-type', type);
  h.set('cache-control', 'private, max-age=604800');
  return new Response(r.body, {status: 200, headers: h});
});
