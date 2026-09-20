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

## Known limits

- Fires on **physical NFC taps only**. Online and in-app Apple Pay do not trigger it.
- Depends on the card issuer pushing a settlement signal; some issuers suppress it.
- A foreign-currency tap carries the *original* amount, not the ILS figure Cal will charge,
  so the statement import won't dedupe it — those rows are marked `(USD 24.99)` in the
  description to make that obvious.
