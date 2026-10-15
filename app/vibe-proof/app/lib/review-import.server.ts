import { createHash } from "node:crypto";

import prisma from "../db.server";
import { csvValue, parseCsv } from "./csv.server";

export const MAX_IMPORT_BYTES = 5 * 1024 * 1024;
export const MAX_IMPORT_ROWS = 5000;

export type ReviewImportTarget = {
  productId?: string;
  productHandle?: string;
  productTitle?: string;
  forceProductMapping?: boolean;
};

export type ReviewImportInput = {
  shop: string;
  filename: string;
  csvText: string;
  externalBatchId?: string;
  target?: ReviewImportTarget;
};

function parseBool(value: string) {
  return ["1", "true", "yes", "y"].includes(value.trim().toLowerCase());
}

function digest(value: string) {
  return createHash("sha256").update(value).digest("hex");
}

export function manualBatchId(csvText: string) {
  return `manual:${digest(csvText)}`;
}

function rowImportKey(
  shop: string,
  externalBatchId: string,
  row: Record<string, string>,
  index: number,
  productId: string,
) {
  const explicit = csvValue(row, "source_review_id", "review_id", "external_id");
  const fingerprint = explicit || [
    productId,
    csvValue(row, "rating", "stars"),
    csvValue(row, "reviewer_name", "name", "author").trim().toLowerCase(),
    csvValue(row, "reviewer_email", "email").trim().toLowerCase(),
    csvValue(row, "created_at", "date"),
    csvValue(row, "body", "review", "review_body").trim(),
    String(index),
  ].join("|");
  return digest(`${shop}|${externalBatchId}|${fingerprint}`);
}

export async function importReviewCsv(input: ReviewImportInput) {
  const shop = input.shop.trim();
  if (!shop) throw new Error("shop is required");
  const bytes = Buffer.byteLength(input.csvText, "utf8");
  if (!input.csvText.trim()) throw new Error("CSV is empty");
  if (bytes > MAX_IMPORT_BYTES) throw new Error("CSV files must be 5 MB or smaller");

  const externalBatchId = (input.externalBatchId || manualBatchId(input.csvText)).slice(0, 220);
  let job = await prisma.importJob.findFirst({ where: { shop, externalBatchId } });
  if (job?.status === "COMPLETED") {
    return {
      ok: true,
      reused: true,
      jobId: job.id,
      totalRows: job.totalRows,
      importedRows: job.importedRows,
      skippedRows: job.skippedRows,
      message: `Import batch already completed: ${job.importedRows} review(s) imported.`,
    };
  }

  if (job) {
    job = await prisma.importJob.update({
      where: { id: job.id },
      data: {
        filename: input.filename.slice(0, 255),
        status: "PROCESSING",
        totalRows: 0,
        importedRows: 0,
        skippedRows: 0,
        errorsJson: null,
        completedAt: null,
      },
    });
  } else {
    job = await prisma.importJob.create({
      data: {
        shop,
        filename: input.filename.slice(0, 255),
        externalBatchId,
        status: "PROCESSING",
      },
    });
  }

  try {
    const parsed = parseCsv(input.csvText);
    const rows = parsed.rows.slice(0, MAX_IMPORT_ROWS);
    const errors: string[] = [];
    const records: Array<{
      shop: string;
      productId: string;
      productHandle: string | null;
      productTitle: string | null;
      variantTitle: string | null;
      rating: number;
      title: string | null;
      body: string;
      reviewerName: string;
      reviewerEmail: string | null;
      verifiedPurchase: boolean;
      status: string;
      source: string;
      importKey: string;
      publishedAt: Date | null;
      createdAt?: Date;
    }> = [];

    rows.forEach((row, index) => {
      const rowHandle = csvValue(row, "product_handle", "handle");
      const rowProductId = csvValue(row, "product_id");
      const forceTarget = Boolean(input.target?.forceProductMapping);
      const productHandle = forceTarget
        ? input.target?.productHandle || ""
        : rowHandle || input.target?.productHandle || "";
      const productId = forceTarget
        ? input.target?.productId || (productHandle ? `shopify-product:${productHandle}` : "")
        : rowProductId || input.target?.productId || (productHandle ? `shopify-product:${productHandle}` : "");
      const rating = Number(csvValue(row, "rating", "stars"));
      const body = csvValue(row, "body", "review", "review_body");
      const reviewerName = csvValue(row, "reviewer_name", "name", "author");
      const statusValue = csvValue(row, "status").toUpperCase();
      const status = statusValue === "PENDING" ? "PENDING" : "APPROVED";

      if (!productId || !Number.isInteger(rating) || rating < 1 || rating > 5 || !body || !reviewerName) {
        errors.push(`Row ${index + 2}: missing product, valid rating, review body, or reviewer name.`);
        return;
      }

      const createdAtRaw = csvValue(row, "created_at", "date");
      const createdAt = createdAtRaw ? new Date(createdAtRaw) : undefined;
      const validCreatedAt = createdAt && !Number.isNaN(createdAt.getTime()) ? createdAt : undefined;

      records.push({
        shop,
        productId,
        productHandle: productHandle || null,
        productTitle: (forceTarget ? input.target?.productTitle : undefined) || csvValue(row, "product_title") || input.target?.productTitle || null,
        variantTitle: csvValue(row, "variant_title", "variant") || null,
        rating,
        title: csvValue(row, "title", "review_title") || null,
        body: body.slice(0, 2000),
        reviewerName: reviewerName.slice(0, 80),
        reviewerEmail: csvValue(row, "reviewer_email", "email").trim().toLowerCase().slice(0, 160) || null,
        verifiedPurchase: parseBool(csvValue(row, "verified_purchase", "verified")),
        status,
        source: "IMPORT",
        importKey: rowImportKey(shop, externalBatchId, row, index, productId),
        publishedAt: status === "APPROVED" ? validCreatedAt ?? new Date() : null,
        ...(validCreatedAt ? { createdAt: validCreatedAt } : {}),
      });
    });

    let importedRows = 0;
    let duplicateRows = 0;
    for (let start = 0; start < records.length; start += 400) {
      const chunk = records.slice(start, start + 400);
      const keys = chunk.map((row) => row.importKey);
      const existing = await prisma.review.findMany({
        where: { importKey: { in: keys } },
        select: { importKey: true },
      });
      const existingKeys = new Set(existing.map((row) => row.importKey).filter(Boolean));
      const fresh = chunk.filter((row) => !existingKeys.has(row.importKey));
      duplicateRows += chunk.length - fresh.length;
      if (fresh.length) {
        const created = await prisma.review.createMany({ data: fresh });
        importedRows += created.count;
      }
    }

    const skippedRows = rows.length - importedRows;
    const mergedErrors = [...errors];
    if (duplicateRows) mergedErrors.push(`${duplicateRows} row(s) were already imported for this batch and were skipped.`);
    await prisma.importJob.update({
      where: { id: job.id },
      data: {
        status: "COMPLETED",
        totalRows: rows.length,
        importedRows,
        skippedRows,
        errorsJson: mergedErrors.length ? JSON.stringify(mergedErrors.slice(0, 100)) : null,
        completedAt: new Date(),
      },
    });

    return {
      ok: true,
      reused: false,
      jobId: job.id,
      totalRows: rows.length,
      importedRows,
      skippedRows,
      duplicateRows,
      message: `Imported ${importedRows} review(s); skipped ${skippedRows}.`,
    };
  } catch (error) {
    await prisma.importJob.update({
      where: { id: job.id },
      data: {
        status: "FAILED",
        errorsJson: JSON.stringify([error instanceof Error ? error.message : "Unknown import error."]),
        completedAt: new Date(),
      },
    });
    throw error;
  }
}
