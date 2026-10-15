-- Expand Review with production moderation/display fields.
ALTER TABLE "Review" ADD COLUMN "featured" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "Review" ADD COLUMN "demoBatchId" TEXT;
ALTER TABLE "Review" ADD COLUMN "publishedAt" DATETIME;

-- Collection settings.
CREATE TABLE "CollectionSettings" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "shop" TEXT NOT NULL,
    "collectRating" BOOLEAN NOT NULL DEFAULT true,
    "collectTitle" BOOLEAN NOT NULL DEFAULT true,
    "collectBody" BOOLEAN NOT NULL DEFAULT true,
    "collectEmail" BOOLEAN NOT NULL DEFAULT true,
    "collectPhoto" BOOLEAN NOT NULL DEFAULT true,
    "collectVideo" BOOLEAN NOT NULL DEFAULT false,
    "requireEmail" BOOLEAN NOT NULL DEFAULT true,
    "autoApproveFiveStar" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- Storefront appearance.
CREATE TABLE "WidgetTheme" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "shop" TEXT NOT NULL,
    "layout" TEXT NOT NULL DEFAULT 'SOCIAL_FEED',
    "heading" TEXT NOT NULL DEFAULT 'THE GIRLIES SAID IT BEST',
    "accentColor" TEXT NOT NULL DEFAULT '#111111',
    "backgroundColor" TEXT NOT NULL DEFAULT '#FFFFFF',
    "textColor" TEXT NOT NULL DEFAULT '#111111',
    "borderColor" TEXT NOT NULL DEFAULT '#E5E7EB',
    "radius" INTEGER NOT NULL DEFAULT 18,
    "mediaRatio" TEXT NOT NULL DEFAULT '4/5',
    "showVerified" BOOLEAN NOT NULL DEFAULT true,
    "showHelpful" BOOLEAN NOT NULL DEFAULT true,
    "showMerchantReplies" BOOLEAN NOT NULL DEFAULT true,
    "autoMatch" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- Product-level storefront overrides.
CREATE TABLE "ProductConfig" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "shop" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "productHandle" TEXT,
    "productTitle" TEXT,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "layoutOverride" TEXT,
    "headingOverride" TEXT,
    "accentColorOverride" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- First-party VibeProof storefront analytics.
CREATE TABLE "AnalyticsEvent" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "shop" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "productId" TEXT,
    "reviewId" TEXT,
    "metadata" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE UNIQUE INDEX "CollectionSettings_shop_key" ON "CollectionSettings"("shop");
CREATE UNIQUE INDEX "WidgetTheme_shop_key" ON "WidgetTheme"("shop");
CREATE UNIQUE INDEX "ProductConfig_shop_productId_key" ON "ProductConfig"("shop", "productId");

CREATE INDEX "Review_shop_productHandle_idx" ON "Review"("shop", "productHandle");
CREATE INDEX "Review_shop_source_idx" ON "Review"("shop", "source");
CREATE INDEX "Review_shop_featured_idx" ON "Review"("shop", "featured");
CREATE INDEX "ProductConfig_shop_productHandle_idx" ON "ProductConfig"("shop", "productHandle");
CREATE INDEX "ProductConfig_shop_enabled_idx" ON "ProductConfig"("shop", "enabled");
CREATE INDEX "AnalyticsEvent_shop_createdAt_idx" ON "AnalyticsEvent"("shop", "createdAt");
CREATE INDEX "AnalyticsEvent_shop_type_createdAt_idx" ON "AnalyticsEvent"("shop", "type", "createdAt");
