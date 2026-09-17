# eB Finance

Personal and small-business finance tracking with the eB Governance auth, full top bar, status components, and grid layer. Backend: Supabase project `ugtoqsujouairnjhchca`.

## Run

Node 22+; no package installation or build required. Dependencies are vendored and pinned.

```sh
node scripts/serve.mjs
```

Open http://127.0.0.1:4173. Choose **Explore demo** (sample data in memory), or open the header's account menu to sign in/create an account. Confirm your email if required, create a workspace, then add accounts.

## Features

- Separate personal/business workspaces, one currency each; account tree and app bar.
- Accounts/opening balances; income/expense/transfer CRUD; posted/pending state; review flags; notes.
- Search, filters, sorting, pagination, monthly cash flow and category spending.
- Categories and monthly expense budgets; light/dark themes and grid density.
- CSV preview/import: `date,payee,amount` and optional `notes`, up to 1,000 rows/2 MB; duplicate protection for the same file/account. Different overlapping exports still need review.
- Filtered CSV report export with spreadsheet-formula escaping. Reports are not backup/import files.
- Governance auth/profile menu, activity log, full header and deployment-status component.

Balances include opening balances and posted entries through today. Enter debt as negative. Transfers are one database row containing both accounts and are excluded from income/spending. Monthly reports/budgets exclude pending and future-dated entries.

## Backend

The schema is **already applied** to the supplied project. `database/schema.sql` is the final reference for a fresh project, not a script to rerun here. Supabase records the applied migrations. `database/verification.sql` runs rollback-only fixtures for owner access and cross-user isolation.

All tables have RLS and authenticated owner policies. Composite foreign keys prevent cross-workspace/owner references. Money is integer cents. Category/currency changes that would invalidate existing records are rejected. Only a publishable key is shipped; there is no service-role key. Financial rows are cleared on sign-out; only preferences and the Supabase session persist locally.

This is an owner-only cash-flow tracker. Live bank sync, team sharing, invoicing, double-entry accounting, tax reports and receipt attachments are not implemented. See [bank integration plan](docs/BANK-CONNECTIONS.md), [component provenance](docs/COMPONENTS.md), and [validation](docs/VALIDATION.md).

## Hosting

Serve `public/` on any static HTTPS host. The included `wrangler.jsonc` configures `npx wrangler deploy` to publish `./public` as Cloudflare Workers Static Assets. Set the Supabase Auth Site URL and redirect allowlist to the final hostname before relying on confirmation email links. Configure SMTP as needed for your users.

Cloudflare monitoring is not configured; `deployment-status.json` deliberately reports `unknown`. Point `CFstatus.init` at a real server status endpoint when hosting is connected. Never put Cloudflare API secrets in the client.

## Checks

```sh
node scripts/check.mjs
node --test --test-isolation=none tests/domain.test.mjs
```
