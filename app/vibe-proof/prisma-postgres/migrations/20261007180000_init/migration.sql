CREATE TABLE "Session" (
  "id" TEXT NOT NULL,
  "shop" TEXT NOT NULL,
  "state" TEXT NOT NULL,
  "isOnline" BOOLEAN NOT NULL DEFAULT false,
  "scope" TEXT,
  "expires" TIMESTAMP(3),
  "accessToken" TEXT NOT NULL,
  "userId" BIGINT,
  "firstName" TEXT,
  "lastName" TEXT,
  "email" TEXT,
  "accountOwner" BOOLEAN NOT NULL DEFAULT false,
  "locale" TEXT,
  "collaborator" BOOLEAN DEFAULT false,
  "emailVerified" BOOLEAN DEFAULT false,
  "refreshToken" TEXT,
  "refreshTokenExpires" TIMESTAMP(3),
  CONSTRAINT "Session_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "Review" (
  "id" TEXT NOT NULL,
  "shop" TEXT NOT NULL,
  "productId" TEXT NOT NULL,
  "productHandle" TEXT,
  "productTitle" TEXT,
  "variantId" TEXT,
  "variantTitle" TEXT,
  "reviewRequestId" TEXT,
  "rating" INTEGER NOT NULL,
  "title" TEXT,
  "body" TEXT NOT NULL,
  "reviewerName" TEXT NOT NULL,
  "reviewerEmail" TEXT,
  "verifiedPurchase" BOOLEAN NOT NULL DEFAULT false,
  "status" TEXT NOT NULL DEFAULT 'PENDING',
  "source" TEXT NOT NULL DEFAULT 'CUSTOMER',
  "helpfulCount" INTEGER NOT NULL DEFAULT 0,
  "featured" BOOLEAN NOT NULL DEFAULT false,
  "demoBatchId" TEXT,
  "spamScore" INTEGER NOT NULL DEFAULT 0,
  "moderationNote" TEXT,
  "language" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  "publishedAt" TIMESTAMP(3),
  "editedAt" TIMESTAMP(3),
  CONSTRAINT "Review_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "ReviewMedia" (
  "id" TEXT NOT NULL,
  "reviewId" TEXT NOT NULL,
  "type" TEXT NOT NULL,
  "url" TEXT,
  "storageKey" TEXT,
  "mimeType" TEXT,
  "bytes" INTEGER,
  "altText" TEXT,
  "status" TEXT NOT NULL DEFAULT 'READY',
  "position" INTEGER NOT NULL DEFAULT 0,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "ReviewMedia_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "MerchantReply" (
  "id" TEXT NOT NULL,
  "reviewId" TEXT NOT NULL,
  "body" TEXT NOT NULL,
  "merchantName" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "MerchantReply_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "CollectionSettings" (
  "id" TEXT NOT NULL,
  "shop" TEXT NOT NULL,
  "collectRating" BOOLEAN NOT NULL DEFAULT true,
  "collectTitle" BOOLEAN NOT NULL DEFAULT true,
  "collectBody" BOOLEAN NOT NULL DEFAULT true,
  "collectEmail" BOOLEAN NOT NULL DEFAULT true,
  "collectPhoto" BOOLEAN NOT NULL DEFAULT true,
  "collectVideo" BOOLEAN NOT NULL DEFAULT true,
  "requireEmail" BOOLEAN NOT NULL DEFAULT true,
  "autoApproveFiveStar" BOOLEAN NOT NULL DEFAULT false,
  "reviewRequestsEnabled" BOOLEAN NOT NULL DEFAULT false,
  "requestDelayHours" INTEGER NOT NULL DEFAULT 48,
  "requestExpiryDays" INTEGER NOT NULL DEFAULT 30,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "CollectionSettings_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "WidgetTheme" (
  "id" TEXT NOT NULL,
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
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "WidgetTheme_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "ProductConfig" (
  "id" TEXT NOT NULL,
  "shop" TEXT NOT NULL,
  "productId" TEXT NOT NULL,
  "productHandle" TEXT,
  "productTitle" TEXT,
  "enabled" BOOLEAN NOT NULL DEFAULT true,
  "layoutOverride" TEXT,
  "headingOverride" TEXT,
  "accentColorOverride" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "ProductConfig_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "AnalyticsEvent" (
  "id" TEXT NOT NULL,
  "shop" TEXT NOT NULL,
  "type" TEXT NOT NULL,
  "productId" TEXT,
  "reviewId" TEXT,
  "visitorHash" TEXT,
  "eventKey" TEXT,
  "metadata" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "AnalyticsEvent_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "HelpfulVote" (
  "id" TEXT NOT NULL,
  "shop" TEXT NOT NULL,
  "reviewId" TEXT NOT NULL,
  "voterHash" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "HelpfulVote_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "ReviewRequest" (
  "id" TEXT NOT NULL,
  "shop" TEXT NOT NULL,
  "tokenHash" TEXT NOT NULL,
  "tokenEncrypted" TEXT NOT NULL,
  "emailHash" TEXT NOT NULL,
  "emailEncrypted" TEXT NOT NULL,
  "orderId" TEXT,
  "productId" TEXT NOT NULL,
  "productHandle" TEXT,
  "productTitle" TEXT,
  "variantId" TEXT,
  "variantTitle" TEXT,
  "status" TEXT NOT NULL DEFAULT 'PENDING',
  "sendAfter" TIMESTAMP(3) NOT NULL,
  "expiresAt" TIMESTAMP(3) NOT NULL,
  "sentAt" TIMESTAMP(3),
  "openedAt" TIMESTAMP(3),
  "completedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "ReviewRequest_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "ImportJob" (
  "id" TEXT NOT NULL,
  "shop" TEXT NOT NULL,
  "filename" TEXT NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'PROCESSING',
  "totalRows" INTEGER NOT NULL DEFAULT 0,
  "importedRows" INTEGER NOT NULL DEFAULT 0,
  "skippedRows" INTEGER NOT NULL DEFAULT 0,
  "errorsJson" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "completedAt" TIMESTAMP(3),
  CONSTRAINT "ImportJob_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "PrivacyRequest" (
  "id" TEXT NOT NULL,
  "shop" TEXT NOT NULL,
  "requestId" TEXT NOT NULL,
  "type" TEXT NOT NULL DEFAULT 'DATA_REQUEST',
  "customerEmail" TEXT,
  "payloadJson" TEXT,
  "status" TEXT NOT NULL DEFAULT 'PENDING',
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "completedAt" TIMESTAMP(3),
  CONSTRAINT "PrivacyRequest_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "RateLimitBucket" (
  "id" TEXT NOT NULL,
  "key" TEXT NOT NULL,
  "count" INTEGER NOT NULL DEFAULT 0,
  "resetAt" TIMESTAMP(3) NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "RateLimitBucket_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "MerchantReply_reviewId_key" ON "MerchantReply"("reviewId");
CREATE UNIQUE INDEX "CollectionSettings_shop_key" ON "CollectionSettings"("shop");
CREATE UNIQUE INDEX "WidgetTheme_shop_key" ON "WidgetTheme"("shop");
CREATE UNIQUE INDEX "ProductConfig_shop_productId_key" ON "ProductConfig"("shop", "productId");
CREATE UNIQUE INDEX "AnalyticsEvent_eventKey_key" ON "AnalyticsEvent"("eventKey");
CREATE UNIQUE INDEX "HelpfulVote_reviewId_voterHash_key" ON "HelpfulVote"("reviewId", "voterHash");
CREATE UNIQUE INDEX "ReviewRequest_tokenHash_key" ON "ReviewRequest"("tokenHash");
CREATE UNIQUE INDEX "PrivacyRequest_shop_requestId_key" ON "PrivacyRequest"("shop", "requestId");
CREATE UNIQUE INDEX "RateLimitBucket_key_key" ON "RateLimitBucket"("key");

CREATE INDEX "Review_shop_productId_idx" ON "Review"("shop", "productId");
CREATE INDEX "Review_shop_productHandle_idx" ON "Review"("shop", "productHandle");
CREATE INDEX "Review_shop_status_idx" ON "Review"("shop", "status");
CREATE INDEX "Review_shop_source_idx" ON "Review"("shop", "source");
CREATE INDEX "Review_shop_featured_idx" ON "Review"("shop", "featured");
CREATE INDEX "Review_shop_createdAt_idx" ON "Review"("shop", "createdAt");
CREATE INDEX "Review_reviewRequestId_idx" ON "Review"("reviewRequestId");
CREATE INDEX "ReviewMedia_reviewId_position_idx" ON "ReviewMedia"("reviewId", "position");
CREATE INDEX "ReviewMedia_status_idx" ON "ReviewMedia"("status");
CREATE INDEX "ProductConfig_shop_productHandle_idx" ON "ProductConfig"("shop", "productHandle");
CREATE INDEX "ProductConfig_shop_enabled_idx" ON "ProductConfig"("shop", "enabled");
CREATE INDEX "AnalyticsEvent_shop_createdAt_idx" ON "AnalyticsEvent"("shop", "createdAt");
CREATE INDEX "AnalyticsEvent_shop_type_createdAt_idx" ON "AnalyticsEvent"("shop", "type", "createdAt");
CREATE INDEX "AnalyticsEvent_shop_productId_createdAt_idx" ON "AnalyticsEvent"("shop", "productId", "createdAt");
CREATE INDEX "HelpfulVote_shop_createdAt_idx" ON "HelpfulVote"("shop", "createdAt");
CREATE INDEX "HelpfulVote_reviewId_idx" ON "HelpfulVote"("reviewId");
CREATE INDEX "ReviewRequest_shop_status_sendAfter_idx" ON "ReviewRequest"("shop", "status", "sendAfter");
CREATE INDEX "ReviewRequest_shop_orderId_idx" ON "ReviewRequest"("shop", "orderId");
CREATE INDEX "ReviewRequest_shop_productId_idx" ON "ReviewRequest"("shop", "productId");
CREATE INDEX "ImportJob_shop_createdAt_idx" ON "ImportJob"("shop", "createdAt");
CREATE INDEX "PrivacyRequest_shop_status_createdAt_idx" ON "PrivacyRequest"("shop", "status", "createdAt");
CREATE INDEX "RateLimitBucket_resetAt_idx" ON "RateLimitBucket"("resetAt");

ALTER TABLE "ReviewMedia" ADD CONSTRAINT "ReviewMedia_reviewId_fkey"
  FOREIGN KEY ("reviewId") REFERENCES "Review"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "MerchantReply" ADD CONSTRAINT "MerchantReply_reviewId_fkey"
  FOREIGN KEY ("reviewId") REFERENCES "Review"("id") ON DELETE CASCADE ON UPDATE CASCADE;
