# VibeProof MVP implementation status

Branch: `build/full-mvp`

## Implemented

### Admin
- Home dashboard with genuine review counts, pending moderation, published count, and published rating.
- Reviews index with search, status/source filters, approve/reject moderation, feature/unfeature, helpful totals, and merchant replies.
- Collection settings persisted per shop.
- Display settings persisted per shop with global style tokens and per-product overrides.
- AI Studio with isolated `AI_DEMO` sample generation, safe appearance presets, and merchant reply drafting.
- Analytics dashboard for VibeProof storefront views, submissions, helpful votes, media count, and approved rating.

### Data model
- Review moderation and publishing fields.
- CollectionSettings.
- WidgetTheme.
- ProductConfig.
- AnalyticsEvent.
- AI demo batch isolation.

### Storefront
- Authenticated Shopify app proxy at `/apps/vibeproof`.
- Public rating/count uses APPROVED genuine reviews only.
- Public review feed excludes `AI_DEMO`, `TEST`, pending, and rejected content.
- Review submission endpoint creates `CUSTOMER` reviews.
- Helpful votes and storefront analytics.
- Product-level enable/disable and display overrides.

### Theme App Extension implementation
Prepared under `theme-extension-template/`:
- Rating bar block.
- Review feed block.
- Review form block.
- Responsive social-style CSS.
- Storefront JavaScript.

Shopify requires theme app extensions to be scaffolded with Shopify CLI. After
scaffolding, apply the prepared files with
`bash scripts/apply-theme-extension-template.sh`.

## Integrity rules

- `AI_DEMO` is never returned publicly.
- `AI_DEMO` never affects genuine rating/count metrics.
- `TEST` never affects genuine rating/count metrics.
- Only APPROVED genuine reviews affect published ratings.
- Rejected reviews cannot remain featured.
- AI demo reviews use status `DEMO` and never receive a verified purchase badge.

## Intentionally not faked

### Direct customer photo/video upload
ReviewMedia and storefront media rendering are implemented, but customer file
upload requires production object storage/CDN and abuse controls. The app does
not store arbitrary public uploads in SQLite or pretend that upload infrastructure
exists.

### Verified-purchase matching
The data field and storefront badge are implemented. Automatic verification against
orders requires additional order scopes and protected customer-data design. It is
not enabled by default.

### External LLM provider
AI Studio workflows and safety boundaries are implemented using deterministic
preview/drafting logic. Connecting a paid model provider can be added later without
changing the `AI_DEMO` separation rules.

## Required local validation

After pulling the branch:

1. Apply the committed Prisma migration and regenerate Prisma Client.
2. Run TypeScript typecheck.
3. Validate `shopify.app.toml`.
4. Scaffold the theme app extension with Shopify CLI and apply the prepared files.
5. Restart `shopify app dev` and approve the updated scopes.
6. Add the VibeProof blocks to the development theme in the theme editor.
7. Test submit -> pending -> approve -> storefront publish.
