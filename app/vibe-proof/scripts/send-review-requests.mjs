import { createDecipheriv, createHash } from "node:crypto";
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();
const secret = process.env.SHOPIFY_API_SECRET || "";

function key() {
  return createHash("sha256").update(secret).digest();
}

function decrypt(value) {
  const payload = Buffer.from(value, "base64url");
  const iv = payload.subarray(0, 12);
  const tag = payload.subarray(12, 28);
  const encrypted = payload.subarray(28);
  const decipher = createDecipheriv("aes-256-gcm", key(), iv);
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(encrypted), decipher.final()]).toString("utf8");
}

async function sendEmail({ to, productTitle, reviewUrl, shop }) {
  const apiKey = process.env.RESEND_API_KEY;
  const from = process.env.REVIEW_FROM_EMAIL;
  if (!apiKey || !from) return false;

  const safeTitle = productTitle.replace(/[<>]/g, "");
  const safeShop = shop.replace(".myshopify.com", "").replace(/[<>]/g, "");
  const safeUrl = reviewUrl.replace(/"/g, "%22");

  const response = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      from,
      to: [to],
      subject: `How was ${productTitle}?`,
      html: `<div style="font-family:system-ui,-apple-system,sans-serif;max-width:560px;margin:auto;padding:24px"><h1>How are you liking ${safeTitle}?</h1><p>Share your experience with ${safeShop}. Your feedback helps other shoppers.</p><p><a href="${safeUrl}" style="display:inline-block;padding:12px 18px;background:#111;color:#fff;text-decoration:none;border-radius:999px">Write a review</a></p><p style="color:#666;font-size:12px">This purchase-linked review request expires automatically.</p></div>`,
    }),
  });
  return response.ok;
}

async function main() {
  const now = new Date();

  await prisma.reviewRequest.updateMany({
    where: {
      status: { in: ["PENDING", "SENT", "OPENED"] },
      expiresAt: { lte: now },
    },
    data: { status: "EXPIRED" },
  });

  if (!process.env.RESEND_API_KEY || !process.env.REVIEW_FROM_EMAIL || !secret) {
    console.log("Review request sender is waiting for required email and app credentials.");
    return;
  }

  const due = await prisma.reviewRequest.findMany({
    where: {
      status: "PENDING",
      sendAfter: { lte: now },
      expiresAt: { gt: now },
      productHandle: { not: null },
    },
    orderBy: { sendAfter: "asc" },
    take: 100,
  });

  let sent = 0;
  for (const request of due) {
    try {
      const token = decrypt(request.tokenEncrypted);
      const email = decrypt(request.emailEncrypted);
      const reviewUrl =
        `https://${request.shop}/products/${request.productHandle}?vp_request=${encodeURIComponent(token)}#vibeproof-review-form`;
      const ok = await sendEmail({
        to: email,
        productTitle: request.productTitle || "your purchase",
        reviewUrl,
        shop: request.shop,
      });
      if (!ok) continue;

      await prisma.reviewRequest.update({
        where: { id: request.id },
        data: { status: "SENT", sentAt: new Date() },
      });
      sent += 1;
    } catch (error) {
      console.error("Review request send failed", request.id, error);
    }
  }

  console.log(`Processed ${due.length} due review requests; sent ${sent}.`);
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
