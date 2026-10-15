# VibeProof

VibeProof is a Shopify product reviews app built around social-native storefront experiences, product-aware AI previews, and brand-aware design customization.

## First store

- Storefront: https://example.com
- Shopify shop: example-store.myshopify.com
- Theme baseline: Copy of shrine-pro-v1-2-3-186-section
- Working app name: VibeProof

## Product direction

VibeProof should make reviews feel like modern social content rather than a traditional review table.

Core storefront surfaces:

- Rating micro-bar
- Social review feed
- Clean review list
- UGC gallery
- Featured review
- Review submission flow

Core merchant surfaces:

- Dashboard
- Review moderation
- Collection settings
- Display / appearance studio
- AI Studio
- Product overrides
- Analytics

## AI principles

AI can:

- Build a structured product profile from Shopify product data
- Generate realistic product-aware demo content for preview
- Suggest storefront palettes and complementary colors
- Extract palette directions from product imagery
- Suggest merchant replies
- Summarize customer sentiment

AI demo content is never treated as a genuine customer review.

Demo content must:

- be stored with a distinct source such as `AI_DEMO`
- never affect real rating averages or review counts
- never receive a verified-purchase badge
- never emit review structured data
- never be included in customer-review analytics
- never silently convert into a real review

## Technical direction

Planned stack:

- Shopify embedded app
- TypeScript
- Shopify React Router app stack
- PostgreSQL
- Prisma
- Shopify Theme App Extension
- Polaris-based admin UI
- Lightweight storefront JavaScript and CSS
- Object storage/CDN for customer media
- AI service for product understanding, previews, color suggestions, reply assistance, and sentiment

## Initial Spoild test products

Primary:

- High Slit SPOILD Lacy Short 2-Piece Set

Secondary:

- High Slit 2-Piece Lounge Set
- Adjustable Intimates FITS ALL
- Satin Intimates Robe Cover Up
- The Spoil'd Lace Slit Dress

These products give us coverage for high variant counts, color/size variants, customizable variants, and different visual directions.

## MVP milestone

The first end-to-end milestone is:

1. Install VibeProof on Spoild
2. Select a Shopify product
3. Build its product profile
4. Generate clearly labeled AI preview reviews
5. Pick or generate a color palette
6. Preview the Social Review Feed
7. Add the VibeProof theme block to a product template
8. See the configured widget on the storefront
9. Collect and moderate genuine reviews separately

## Repository status

The repository is being bootstrapped in stages. Shopify CLI-generated application files should be added only after the Shopify scaffold can be generated and validated in a supported development environment.
