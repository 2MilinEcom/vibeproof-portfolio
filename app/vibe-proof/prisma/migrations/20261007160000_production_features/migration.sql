PRAGMA foreign_keys=OFF;

ALTER TABLE "Review" ADD COLUMN "reviewRequestId" TEXT;
ALTER TABLE "Review" ADD COLUMN "spamScore" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "Review" ADD COLUMN "moderationNote" TEXT;
ALTER TABLE "Review" ADD COLUMN "language" TEXT;
ALTER TABLE "Review" ADD COLUMN "editedAt" DATETIME;

ALTER TABLE "CollectionSettings" ADD COLUMN "reviewRequestsEnabled" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "CollectionSettings" ADD COLUMN "requestDelayHours" INTEGER NOT NULL DEFAULT 48;
ALTER TABLE "CollectionSettings" ADD COLUMN "requestExpiryDays" INTEGER NOT NULL DEFAULT 30;

ALTER TABLE "AnalyticsEvent" ADD COLUMN "visitorHash" TEXT;
ALTER TABLE "AnalyticsEvent" ADD COLUMN "eventKey" TEXT;

CREATE TABLE "new_ReviewMedia" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "reviewId" TEXT NOT NULL,
  "type" TEXT NOT NULL,
  "url" TEXT,
  "storageKey" TEXT,
  "mimeType" TEXT,
  "bytes" INTEGER,
  "altText" TEXT,
  "status" TEXT NOT NULL DEFAULT 'READY',
  "position" INTEGER NOT NULL DEFAULT 0,
  "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "ReviewMedia_reviewId_fkey" FOREIGN KEY ("reviewId") REFERENCES "Review" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

INSERT INTO "new_ReviewMedia" (
  "id","reviewId","type","url","altText","position","createdAt"
)
SELECT "id","reviewId","type","url","altText","position","createdAt"
FROM "ReviewMedia";

DROP TABLE "ReviewMedia";
ALTER TABLE "new_ReviewMedia" RENAME TO "ReviewMedia";

CREATE TABLE "HelpfulVote" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "shop" TEXT NOT NULL,
  "reviewId" TEXT NOT NULL,
  "voterHash" TEXT NOT NULL,
  "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE "ReviewRequest" (
  "id" TEXT NOT NULL PRIMARY KEY,
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
  "sendAfter" DATETIME NOT NULL,
  "expiresAt" DATETIME NOT NULL,
  "sentAt" DATETIME,
  "openedAt" DATETIME,
  "completedAt" DATETIME,
  "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" DATETIME NOT NULL
);

CREATE TABLE "ImportJob" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "shop" TEXT NOT NULL,
  "filename" TEXT NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'PROCESSING',
  "totalRows" INTEGER NOT NULL DEFAULT 0,
  "importedRows" INTEGER NOT NULL DEFAULT 0,
  "skippedRows" INTEGER NOT NULL DEFAULT 0,
  "errorsJson" TEXT,
  "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "completedAt" DATETIME
);

CREATE TABLE "PrivacyRequest" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "shop" TEXT NOT NULL,
  "requestId" TEXT NOT NULL,
  "type" TEXT NOT NULL DEFAULT 'DATA_REQUEST',
  "customerEmail" TEXT,
  "payloadJson" TEXT,
  "status" TEXT NOT NULL DEFAULT 'PENDING',
  "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "completedAt" DATETIME
);

CREATE TABLE "RateLimitBucket" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "key" TEXT NOT NULL,
  "count" INTEGER NOT NULL DEFAULT 0,
  "resetAt" DATETIME NOT NULL,
  "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" DATETIME NOT NULL
);

CREATE UNIQUE INDEX "AnalyticsEvent_eventKey_key" ON "AnalyticsEvent"("eventKey");
CREATE UNIQUE INDEX "HelpfulVote_reviewId_voterHash_key" ON "HelpfulVote"("reviewId", "voterHash");
CREATE INDEX "HelpfulVote_shop_createdAt_idx" ON "HelpfulVote"("shop", "createdAt");
CREATE INDEX "HelpfulVote_reviewId_idx" ON "HelpfulVote"("reviewId");
CREATE UNIQUE INDEX "ReviewRequest_tokenHash_key" ON "ReviewRequest"("tokenHash");
CREATE INDEX "ReviewRequest_shop_status_sendAfter_idx" ON "ReviewRequest"("shop", "status", "sendAfter");
CREATE INDEX "ReviewRequest_shop_orderId_idx" ON "ReviewRequest"("shop", "orderId");
CREATE INDEX "ReviewRequest_shop_productId_idx" ON "ReviewRequest"("shop", "productId");
CREATE INDEX "ImportJob_shop_createdAt_idx" ON "ImportJob"("shop", "createdAt");
CREATE UNIQUE INDEX "PrivacyRequest_shop_requestId_key" ON "PrivacyRequest"("shop", "requestId");
CREATE INDEX "PrivacyRequest_shop_status_createdAt_idx" ON "PrivacyRequest"("shop", "status", "createdAt");
CREATE UNIQUE INDEX "RateLimitBucket_key_key" ON "RateLimitBucket"("key");
CREATE INDEX "RateLimitBucket_resetAt_idx" ON "RateLimitBucket"("resetAt");
CREATE INDEX "AnalyticsEvent_shop_productId_createdAt_idx" ON "AnalyticsEvent"("shop", "productId", "createdAt");
CREATE INDEX "Review_reviewRequestId_idx" ON "Review"("reviewRequestId");
CREATE INDEX "ReviewMedia_reviewId_position_idx" ON "ReviewMedia"("reviewId", "position");
CREATE INDEX "ReviewMedia_status_idx" ON "ReviewMedia"("status");

PRAGMA foreign_keys=ON;
