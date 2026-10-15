# VibeProof Architecture

## Goals

VibeProof is a Shopify review app optimized for social-native presentation, product-aware AI previews, and merchant-controlled styling.

The architecture must support:

- one or more Shopify stores
- real customer reviews
- AI demo reviews kept structurally separate
- photo/video review media
- global store styling
- per-product styling overrides
- product-aware AI context
- theme app extension storefront blocks
- merchant moderation and analytics

## Application layers

### Shopify embedded admin app

Responsibilities:

- authenticated merchant access
- product selection
- review moderation
- appearance settings
- AI Studio
- analytics
- installation/onboarding
- theme-extension setup guidance

Recommended implementation:

- TypeScript
- Shopify React Router app stack
- Polaris UI
- App Bridge

### Backend

Responsibilities:

- Shopify Admin API access
- review CRUD
- product sync/cache
- AI product profiling
- AI demo review generation
- color recommendation generation
- media metadata
- analytics events
- merchant replies
- review verification

### Database

Recommended:

- PostgreSQL
- Prisma

Primary entities:

- Shop
- ProductProfile
- Review
- ReviewMedia
- MerchantReply
- WidgetTheme
- ProductThemeOverride
- DemoReviewSet
- AnalyticsEvent

### Storefront

Use a Shopify Theme App Extension.

Initial app blocks:

- Rating Micro-Bar
- Social Review Feed
- Clean Review List
- Featured Review
- UGC Gallery
- Review Submission Trigger

The storefront code should remain lightweight and not perform AI work at request time.

### AI layer

AI operates only in merchant/admin workflows.

Initial capabilities:

- product profile extraction
- demo review generation
- color palette suggestions
- product-image palette direction
- merchant response suggestions
- sentiment/topic summaries

No AI-generated demo record may be counted as a genuine review.

## Spoild integration target

Primary store:

- example-store.myshopify.com
- public domain: example.com

Theme baseline:

- Copy of shrine-pro-v1-2-3-186-section

The first integration should prefer app blocks and app embeds rather than directly editing live theme files.

## First end-to-end path

1. Merchant installs VibeProof.
2. App authenticates to Shopify.
3. Merchant selects a product.
4. Product data is normalized into ProductProfile.
5. Merchant generates AI preview reviews.
6. Merchant previews layout and palette.
7. Merchant saves global or per-product design settings.
8. Theme app block reads configuration.
9. Real reviews are collected independently.
10. Review aggregates use only genuine eligible review records.
