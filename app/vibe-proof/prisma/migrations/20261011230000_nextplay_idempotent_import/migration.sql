ALTER TABLE "Review" ADD COLUMN "importKey" TEXT;
ALTER TABLE "ImportJob" ADD COLUMN "externalBatchId" TEXT;
CREATE UNIQUE INDEX "Review_importKey_key" ON "Review"("importKey");
CREATE UNIQUE INDEX "ImportJob_shop_externalBatchId_key" ON "ImportJob"("shop", "externalBatchId");
