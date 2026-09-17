# Governance components

Source: `emptinessbliss15-cell/eB-Holarchy`, commit `24da206bfd08b9cb022a907f2f94d2b562d4ce70`, whose application title is eB Governance.

- Governance `auth.js`, with accessible input labels and password clearing. Finance supplies the existing API contract against its own Supabase project. The Governance impersonation selector has no actors available in Finance.
- `eBStatus.js`: original status line and activity log.
- `CFstatus.js`: original Cloudflare status/activity dialog. It truthfully displays `unknown` until deployment monitoring is configured.
- `eBGrid.js`, `eBComboBox.js`, VanillaGrid, hcg-autocomplete: reused grid/component layer. Finance edits use validated dialogs.
- `governance.css`, logo and favicon: reused appearance assets, extended by `finance.css`.
- Full header: logo/tools menu, brand, descriptor, operating-context workspace selector, Cloudflare status, refresh and account menu; followed by the activity status and finance app bar.

The browser Supabase bundle is vendored at the exact version recorded in `public/vendor/SUPABASE.json`. `manifest.json` records asset checksums and provenance.

Reusing the Governance auth UI does not create cross-project single sign-on. Credentials/sessions are specific to the supplied Finance Supabase project. Editable profile metadata is not used for authorization.
