# VibeProof Data Model

## Shop

- id
- shopDomain
- shopifyShopId
- installedAt
- uninstalledAt
- defaultThemeId
- createdAt
- updatedAt

## ProductProfile

- id
- shopId
- shopifyProductId
- handle
- title
- description
- vendor
- productType
- tags
- variantSummary
- imageSummary
- aiProfileJson
- aiProfileVersion
- createdAt
- updatedAt

## Review

- id
- shopId
- shopifyProductId
- source
- status
- rating
- title
- body
- reviewerName
- reviewerEmail
- reviewerAvatarUrl
- verifiedPurchase
- variantLabel
- submittedAt
- publishedAt
- helpfulCount
- createdAt
- updatedAt

Suggested source enum:

- CUSTOMER
- IMPORT
- MERCHANT_IMPORT
- AI_DEMO

Suggested status enum:

- PENDING
- PUBLISHED
- HIDDEN
- REJECTED

Rules:

- AI_DEMO can never set verifiedPurchase=true.
- AI_DEMO is excluded from storefront aggregate rating.
- AI_DEMO is excluded from review structured data.
- AI_DEMO is excluded from customer analytics.
- AI_DEMO cannot silently convert to CUSTOMER.

## ReviewMedia

- id
- reviewId
- type
- url
- thumbnailUrl
- altText
- sortOrder
- createdAt

Suggested type enum:

- IMAGE
- VIDEO

## MerchantReply

- id
- reviewId
- body
- publishedAt
- createdAt
- updatedAt

## WidgetTheme

- id
- shopId
- preset
- accentColor
- starColor
- textColor
- mutedTextColor
- backgroundColor
- cardBackgroundColor
- borderColor
- buttonColor
- radius
- borderStyle
- shadowStyle
- mediaRatio
- density
- showAvatar
- showVerifiedBadge
- showHelpful
- showVariant
- showDate
- createdAt
- updatedAt

## ProductThemeOverride

- id
- shopId
- shopifyProductId
- widgetThemeJson
- createdAt
- updatedAt

## DemoReviewSet

- id
- shopId
- shopifyProductId
- productProfileId
- generationPromptVersion
- requestedCount
- tone
- ratingDistributionJson
- generatedAt
- expiresAt
- createdAt

Demo review rows reference this set and always use source=AI_DEMO.

## AnalyticsEvent

- id
- shopId
- shopifyProductId
- eventType
- reviewId
- sessionHash
- metadataJson
- occurredAt

Initial event types:

- WIDGET_VIEW
- REVIEW_EXPAND
- HELPFUL_CLICK
- MEDIA_VIEW
- REVIEW_FORM_OPEN
- REVIEW_SUBMIT
- RATING_BAR_CLICK

## Aggregate rating rule

Only include reviews where:

- source != AI_DEMO
- status = PUBLISHED
- rating is present

Verified-purchase state should not be required for inclusion, but can be used as a filter or badge.
