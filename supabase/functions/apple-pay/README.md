# apple-pay

Receives Apple Pay taps from the iOS Shortcuts **Transaction** automation and files them
as Atlas expenses.

    POST https://gsyrqhoutpshtbzastyq.supabase.co/functions/v1/apple-pay
    Authorization: Bearer <token>
    {"amount":"48.90","merchant":"SHUFERSAL DEAL 1234","card":"Cal Visa","currency":"ILS","date":"2026-09-20"}

`verify_jwt` is **off** — Shortcuts cannot perform a Supabase auth handshake. Auth is a
bearer token whose SHA-256 is stored in `public.webhook_tokens`; the table has RLS on and
no policies, so only the service role (this function) can read it. To revoke a token:

    update webhook_tokens set revoked = true where label = 'iphone-apple-pay';

To issue a new one, insert `encode(digest(<token>,'sha256'),'hex')` — never the token itself.

## Merchant learning

Terminal strings are messy ("SHUFERSAL DEAL 1234", "shufersal-deal 5"). `merchantKey()`
strips everything but letters and spaces and uppercases, so every branch of a shop
collapses to one key. When Benji re-categorises a tap in Atlas, the app writes that key to
`merchant_rules`; this function reads it, so later taps arrive already named and categorised.
**The normalisation is duplicated in index.html's `merchantKey()` — change both together.**

## Hardening

- **No CORS headers.** The only client is Shortcuts, which is not a browser and never
  sends a preflight. A wildcard origin here would be attack surface with no consumer.
- **Rate limit:** 30 requests/minute/token, enforced by `consume_token()` — an atomic
  check-and-consume under `SELECT ... FOR UPDATE`, so concurrent requests can't both
  read the same count and both pass. Over the limit returns 429 and stamps
  `webhook_tokens.rate_limited_at`. A Shortcut fires a few times a day, so a non-null
  value there means something other than the Shortcut is using the token — treat it as
  a leak signal and revoke.
- **Bounds:** body 8 KB (checked before parsing), merchant 200 chars, description 240,
  merchant_key 80, amount ≤ 1,000,000.
- `user_id` comes from the **token record**, never the request body, so a valid token
  cannot be aimed at another account.

## Known limits

- Fires on **physical NFC taps only**. Online and in-app Apple Pay do not trigger it.
- Depends on the card issuer pushing a settlement signal; some issuers suppress it.
- A foreign-currency tap carries the *original* amount, not the ILS figure Cal will charge,
  so the statement import won't dedupe it — those rows are marked `(USD 24.99)` in the
  description to make that obvious.
