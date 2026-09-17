# Connecting banks later

The shipped app has manual accounts and CSV imports, with no live bank connection or stored bank credentials.

For supported US/Canadian institutions, evaluate **Plaid Link + Transactions** first. Test your exact banks and business account types. Confirm country/product coverage before choosing a provider; the app's currency selector does not imply bank coverage.

Plaid currently documents a free Trial with **10 Items** (bank connections, potentially containing several accounts). Pay-as-you-go, Growth, and Custom follow. Transactions is a subscription product; optional Transactions Refresh is billed per request. Exact pricing is in your dashboard/agreement. Sandbox uses test data and is free.

Sources checked 2026-09-17: [billing](https://plaid.com/docs/account/billing/), [quickstart](https://plaid.com/docs/quickstart/), [Transactions](https://plaid.com/docs/transactions/), [launch checklist](https://plaid.com/docs/launch-checklist/).

## Implementation plan

1. An authenticated Supabase Edge Function verifies the user's JWT and workspace ownership and creates a short-lived Plaid Link token.
2. The browser opens Plaid Link and the bank's consent/OAuth flow. The app never collects bank passwords.
3. A server function exchanges the temporary public token for an access token. Keep Plaid secrets in Edge Function secrets and encrypt access tokens in server-only storage/Vault. Neither `anon` nor `authenticated` may read tokens.
4. Verify Plaid webhook signatures, timestamp/body digest and replay protection, then queue per-Item sync. Do not trust webhook-provided workspace/user IDs as authorization. See [webhook verification](https://plaid.com/docs/api/webhooks/webhook-verification/).
5. Process `/transactions/sync` added, modified, and removed rows. Stage all pages and atomically commit the rows and cursor. Serialize sync per Item, use unique provider/Item/transaction IDs, and restart from the original cursor on mutation-during-pagination. See [sync API](https://plaid.com/docs/api/products/transactions/).
6. Normalize signs deliberately: this app uses negative expense amounts and positive income; Plaid commonly uses the opposite convention. Preserve currency, posted/pending state, pending-to-posted IDs and timestamps. Match internal transfer legs to avoid double counting.
7. Keep bank-reported current/available balance snapshots separate from the ledger. Do not add imported historical transactions to a current bank balance. Reconcile the opening balance to a known cutoff.
8. Add connection status, last sync, account selection, reconnect/update mode, and disconnect. Call `/item/remove` and revoke/delete tokens on disconnect, with an explicit choice about retaining imported history.

Add a provider adapter and new reviewed database migrations for connection metadata and provider IDs. Do not reuse CSV hashes as bank transaction IDs. Test failures, retries, duplicates, pending replacements, removals, concurrent sync, and cross-workspace isolation in Sandbox before using real accounts.

Start with read access to financial data. Money movement is a separate feature and consent flow. Accounting-system integrations may later help with invoices/payroll/general-ledger needs; this release is a cash-flow tracker rather than full accounting software.
