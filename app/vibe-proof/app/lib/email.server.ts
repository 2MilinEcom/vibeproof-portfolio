export function reviewEmailConfigured() {
  return Boolean(process.env.RESEND_API_KEY && process.env.REVIEW_FROM_EMAIL);
}

export async function sendReviewRequestEmail(args: {
  to: string;
  productTitle: string;
  reviewUrl: string;
  shopName?: string;
}) {
  const apiKey = process.env.RESEND_API_KEY;
  const from = process.env.REVIEW_FROM_EMAIL;
  if (!apiKey || !from) return { sent: false, skipped: true };

  const subject = `How was ${args.productTitle}?`;
  const safeTitle = args.productTitle.replace(/[<>]/g, "");
  const safeShop = (args.shopName || "the store").replace(/[<>]/g, "");
  const safeUrl = args.reviewUrl.replace(/"/g, "%22");

  const response = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      from,
      to: [args.to],
      subject,
      html: `<div style="font-family:system-ui,-apple-system,sans-serif;max-width:560px;margin:auto;padding:24px"><h1 style="font-size:26px">How are you liking ${safeTitle}?</h1><p>Share your experience with ${safeShop}. Your feedback helps other shoppers.</p><p><a href="${safeUrl}" style="display:inline-block;padding:12px 18px;background:#111;color:#fff;text-decoration:none;border-radius:999px">Write a review</a></p><p style="color:#666;font-size:12px">This link is unique to your purchase and expires automatically.</p></div>`,
    }),
  });

  if (!response.ok) {
    const message = await response.text().catch(() => "");
    throw new Error(`Review email failed (${response.status}): ${message.slice(0, 200)}`);
  }

  return { sent: true, skipped: false };
}
