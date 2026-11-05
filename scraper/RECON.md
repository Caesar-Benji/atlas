# Deal gatherer — shop recon (2026-11-05)

Probed from a datacenter IP (plain curl + headless Chromium) and from Benji's Chrome (Israeli residential IP).

| Shop | Platform | Datacenter | Read path | Discount signal | Sizes |
|---|---|---|---|---|---|
| redback.co.il | WooCommerce | OK | Store API `/wp-json/wc/store/v1/products?on_sale=true&per_page=100&page=N` | `prices.regular_price` vs `sale_price` (minor units, ILS) | `attributes` (pa_measure / pa_w_size / pa_l_sizes) + `variations` list |
| outline.co.il | WooCommerce | OK | same, `category=carhartt-men` slug via `/products/categories` → id | same | same; brand in `pa_brand` |
| bendastore.co.il | WooCommerce | OK | same | same | same |
| gant.co.il | WooCommerce behind Cloudflare | **403** (curl and Chromium) | Store API works from a residential browser; "Shopping IL | גברים" category id 2254 (~1000 items, children 40/50/60/70/80%-off men = 2257/2258/2259/2260/2538) | same | same |
| terminalx.com | Magento PWA, SSR | OK | HTML pages: `/on-sale/men?p=N` (48 tiles/page, 17.5k items — too many) → crawl `/brands/<slug>?department_level=<men>` per brand instead; tiles `li[class*=listing-product]` with title attr, `/…/<sku>?color=` href, `final-price` / `strikethrough` rows, "NN% OFF" text, `media.terminalx.com/...cache/92af6b…` image; `__INITIAL_STATE__` JSON is also embedded | strikethrough vs final price | not on tiles (product page or size filter in URL) |
| nike.com/il | Next.js | OK (page rendered with 120 prices) | `__NEXT_DATA__` of `/il/w/mens-sale-3yaepznik1` + product-wall API for paging | compare price in wall data | sizes per product (`availableSkus`) |
| adidas.co.il | Salesforce Commerce Cloud (Demandware) + Akamai | **403** | residential browser only: `/he/men-outlet` tiles `.product-tile[data-pid]`, `.percentageoff`, "Price Reduced From ₪X To ₪Y", `assets.adidas.com/images/w_450…/<pid>_00_plp_standard.jpg`; paging via SFCC `start`/`sz` params; sizes on the product page | -% badge | product page |
| ksp.co.il | own SPA + Cloudflare challenge | **403** | residential browser only: JSON `/m_action/api/category/<id>` → `result.items[]` {uin, name, price, min_price, brandName, img, outOfStock, labels[], redMsg[], tags}, `result.next` for paging, `result.types` = subcategories keyed by id. **No old price in listings** → a KSP deal = price lower than our recorded history, or a sale-type label | history / labels | n/a |
| mous.com | Shopify | 429 on `/collections/all/products.json` from curl, 200 in a browser | `/collections/sale/products.json?limit=250` with a browser UA and a pause; USD; flag >$75 (VAT) | `compare_at_price` | n/a |

## KSP category ids (from `/m_action/api/header-menu` + `types`)
- Sound 7076 → soundbars **03215** (55 items), mounts/stands/arms **01031**
- Computers & mobile 31635 → Apple accessories **036923**, keyboards **0218**, mice **0221**, laptop accessories (docks) **028767**
- Watches 5042 → men's watches **05043**, watch/band accessories **028810** / **0105248**
- Lighting 6610 → desk lamps **06615**, smart lamps **06613**
- Bags 87863 → backpacks **096739**, wallets **029782**

## Consequence for the runner
Six shops (Redback, Outline, Benda, Terminal X, Nike, Mous) run from GitHub Actions.
Three (Gant, adidas, KSP) block datacenter IPs and must run from Benji's own network: a scheduled Claude task that requires his Mac and drives Claude in Chrome, running the same adapters as in-page JavaScript and posting to the `deals-ingest` function.
