#!/usr/bin/env node
// Atlas deal gatherer — Node entry for the GitHub Actions runner.
//   node run.js <shop> [--dry]        shops: redback outline benda terminalx nike mous
// Env: DEALS_TOKEN (bearer for deals-ingest), INGEST_URL (optional override).
// Gant, adidas and KSP block datacenter IPs — they run from Benji's Chrome, see browser/.

import { mkdirSync, writeFileSync } from "node:fs";
import * as C from "./lib/common.js";
import { wooFetchDeals, WOO } from "./adapters/woo.js";
import { txFetchDeals } from "./adapters/terminalx.js";
import { nikeFetchDeals } from "./adapters/nike.js";
import { mousFetchDeals } from "./adapters/mous.js";

const INGEST_URL = process.env.INGEST_URL || "https://gsyrqhoutpshtbzastyq.supabase.co/functions/v1/deals-ingest";
const shop = process.argv[2];
const dry = process.argv.includes("--dry");
const log = (s) => console.log(new Date().toISOString().slice(11, 19), s);

const RUNNERS = {
  redback: () => wooFetchDeals("redback", C, log),
  outline: () => wooFetchDeals("outline", C, log),
  benda: () => wooFetchDeals("benda", C, log),
  gant: () => wooFetchDeals("gant", C, log),              // only works from a residential IP
  terminalx: () => txFetchDeals(C, log),
  nike: () => nikeFetchDeals(C, log),
  mous: () => mousFetchDeals(C, log),
};
if (!RUNNERS[shop]) { console.error(`usage: node run.js <${Object.keys(RUNNERS).join("|")}> [--dry]`); process.exit(2); }

mkdirSync("out", { recursive: true });
const t0 = Date.now();
let result, failure = null;
try { result = await RUNNERS[shop](); }
catch (e) { failure = e; log(`${shop}: FAILED ${e.stack || e}`); }

if (result) {
  writeFileSync(`out/${shop}.json`, JSON.stringify(result, null, 1));
  const top = result.items.slice().sort((a, b) => b.score - a.score).slice(0, 5)
    .map((i) => `  ${i.score}  ${i.title.slice(0, 50)}  ${i.price}${i.compare_price ? ` (was ${i.compare_price})` : ""}  ${i.my_size === true ? "size ok" : i.my_size === null ? "size ?" : ""}`);
  const cnt = (f) => Object.entries(result.items.reduce((a, i) => (a[f(i)] = (a[f(i)] || 0) + 1, a), {})).map(([k, v]) => `${k}:${v}`).join(" ");
  log(`${shop}: seen ${result.seen}, kept ${result.items.length}, ${((Date.now() - t0) / 1000).toFixed(0)}s\n${top.join("\n")}`);
  log(`${shop}: kinds ${cnt((i) => i.kind)} | my_size ${cnt((i) => String(i.my_size))} | images/item ${(result.items.reduce((a, i) => a + i.images.length, 0) / Math.max(1, result.items.length)).toFixed(1)} | with sizes ${result.items.filter((i) => i.sizes.length).length} | with description ${result.items.filter((i) => i.description).length}`);
  for (const i of result.items.slice(0, 2)) log(`${shop}: sample ${JSON.stringify({ ...i, description: (i.description || "").slice(0, 80), images: i.images.slice(0, 3), sizes: i.sizes.slice(0, 8) })}`);
}
if (dry) process.exit(failure ? 1 : 0);

const token = process.env.DEALS_TOKEN;
if (!token) { console.error("DEALS_TOKEN is not set"); process.exit(2); }
const run_id = await C.ingest({ url: INGEST_URL, token, shop, runner: "github",
  items: result?.items ?? [], seen: result?.seen ?? 0, error: failure ? String(failure.message || failure) : null });
log(`${shop}: ingested as run ${run_id}`);
process.exit(failure ? 1 : 0);
