import type { ActionFunctionArgs, LoaderFunctionArgs } from "react-router";
import { Form, redirect, useActionData, useLoaderData } from "react-router";

import prisma from "../db.server";
import { GENUINE_SOURCES } from "../lib/constants";
import { deleteStorageObject, presignObject } from "../lib/media.server";
import { authenticate } from "../shopify.server";

const genuineSource = { in: [...GENUINE_SOURCES] };

export const loader = async ({ request, params }: LoaderFunctionArgs) => {
  const { session } = await authenticate.admin(request);
  const reviewId = params.reviewId;
  if (!reviewId) throw new Response("Not found", { status: 404 });

  const review = await prisma.review.findFirst({
    where: { id: reviewId, shop: session.shop, source: genuineSource },
    include: {
      media: { orderBy: { position: "asc" } },
      merchantReply: true,
    },
  });

  if (!review) throw new Response("Not found", { status: 404 });

  return {
    review: {
      ...review,
      createdAt: review.createdAt.toISOString(),
      updatedAt: review.updatedAt.toISOString(),
      publishedAt: review.publishedAt?.toISOString() ?? null,
      media: review.media.map((media) => ({
        ...media,
        createdAt: media.createdAt.toISOString(),
        previewUrl: media.storageKey
          ? presignObject("GET", media.storageKey, 60 * 60)
          : media.url,
      })),
      merchantReply: review.merchantReply
        ? {
            ...review.merchantReply,
            createdAt: review.merchantReply.createdAt.toISOString(),
            updatedAt: review.merchantReply.updatedAt.toISOString(),
          }
        : null,
    },
  };
};

export const action = async ({ request, params }: ActionFunctionArgs) => {
  const { session } = await authenticate.admin(request);
  const reviewId = params.reviewId;
  if (!reviewId) return { ok: false, message: "Missing review." };

  const review = await prisma.review.findFirst({
    where: { id: reviewId, shop: session.shop, source: genuineSource },
    include: { media: true },
  });
  if (!review) return { ok: false, message: "Review not found." };

  const formData = await request.formData();
  const intent = String(formData.get("intent") || "");

  if (intent === "save_review") {
    const rating = Number(formData.get("rating"));
    const reviewerName = String(formData.get("reviewerName") || "").trim().slice(0, 80);
    const reviewerEmail = String(formData.get("reviewerEmail") || "").trim().toLowerCase().slice(0, 160);
    const title = String(formData.get("title") || "").trim().slice(0, 120);
    const body = String(formData.get("body") || "").trim().slice(0, 2000);

    if (!reviewerName || !body || !Number.isInteger(rating) || rating < 1 || rating > 5) {
      return { ok: false, message: "Name, review text, and a 1–5 rating are required." };
    }

    await prisma.review.update({
      where: { id: review.id },
      data: {
        rating,
        reviewerName,
        reviewerEmail: reviewerEmail || null,
        title: title || null,
        body,
        editedAt: new Date(),
      },
    });
    return { ok: true, message: "Review updated." };
  }

  if (intent === "requeue") {
    await prisma.review.update({
      where: { id: review.id },
      data: {
        status: "PENDING",
        featured: false,
        publishedAt: null,
        moderationNote: "Returned to moderation by merchant.",
      },
    });
    return { ok: true, message: "Review returned to pending." };
  }

  if (intent === "save_reply") {
    if (review.status !== "APPROVED") {
      return { ok: false, message: "Approve the review before posting a public reply." };
    }
    const body = String(formData.get("replyBody") || "").trim().slice(0, 1200);
    if (!body) return { ok: false, message: "Enter a reply." };

    await prisma.merchantReply.upsert({
      where: { reviewId: review.id },
      create: {
        reviewId: review.id,
        body,
        merchantName: "Store team",
      },
      update: { body },
    });
    return { ok: true, message: "Merchant reply saved." };
  }

  if (intent === "delete_reply") {
    await prisma.merchantReply.deleteMany({ where: { reviewId: review.id } });
    return { ok: true, message: "Merchant reply removed." };
  }

  if (intent === "delete_media") {
    const mediaId = String(formData.get("mediaId") || "");
    const media = review.media.find((item) => item.id === mediaId);
    if (!media) return { ok: false, message: "Media not found." };

    if (media.storageKey) {
      await deleteStorageObject(media.storageKey).catch(() => false);
    }
    await prisma.reviewMedia.delete({ where: { id: media.id } });
    return { ok: true, message: "Media removed." };
  }

  if (intent === "delete_review") {
    for (const media of review.media) {
      if (media.storageKey) {
        await deleteStorageObject(media.storageKey).catch(() => false);
      }
    }
    await prisma.review.delete({ where: { id: review.id } });
    return redirect("/app/reviews");
  }

  return { ok: false, message: "Unknown action." };
};

export default function ReviewDetailPage() {
  const { review } = useLoaderData<typeof loader>();
  const actionData = useActionData<typeof action>();

  return (
    <s-page heading={`Review by ${review.reviewerName}`}>
      <s-link href="/app/reviews">← Back to reviews</s-link>

      {actionData?.message && (
        <s-banner tone={actionData.ok ? "success" : "critical"}>
          {actionData.message}
        </s-banner>
      )}

      <s-section heading="Review details">
        <s-stack direction="inline" gap="base">
          <s-badge tone={review.status === "APPROVED" ? "success" : review.status === "PENDING" ? "warning" : "neutral"}>
            {review.status}
          </s-badge>
          <s-badge tone={review.verifiedPurchase ? "success" : "neutral"}>
            {review.verifiedPurchase ? "Verified purchase" : "Unverified"}
          </s-badge>
          <s-text>{review.source}</s-text>
          <s-text>Helpful: {String(review.helpfulCount)}</s-text>
          {review.spamScore > 0 && <s-badge tone="warning">Spam score {String(review.spamScore)}</s-badge>}
        </s-stack>

        <Form method="post">
          <input type="hidden" name="intent" value="save_review" />
          <s-stack direction="block" gap="base">
            <s-grid gridTemplateColumns="1fr 1fr" gap="base">
              <s-text-field label="Reviewer name" name="reviewerName" defaultValue={review.reviewerName}></s-text-field>
              <s-email-field label="Reviewer email" name="reviewerEmail" defaultValue={review.reviewerEmail ?? ""}></s-email-field>
            </s-grid>
            <s-grid gridTemplateColumns="180px 1fr" gap="base">
              <s-number-field label="Rating" name="rating" min={1} max={5} defaultValue={String(review.rating)}></s-number-field>
              <s-text-field label="Title" name="title" defaultValue={review.title ?? ""}></s-text-field>
            </s-grid>
            <s-text-area label="Review" name="body" rows={7} defaultValue={review.body}></s-text-area>
            <s-text color="subdued">Product: {review.productTitle ?? review.productHandle ?? review.productId}</s-text>
            {review.variantTitle && <s-text color="subdued">Variant: {review.variantTitle}</s-text>}
            {review.moderationNote && <s-text color="subdued">{review.moderationNote}</s-text>}
            <s-button type="submit" variant="primary">Save review</s-button>
          </s-stack>
        </Form>
      </s-section>

      <s-section heading="Customer media">
        {review.media.length === 0 ? (
          <s-text color="subdued">No media attached.</s-text>
        ) : (
          <s-grid gridTemplateColumns="repeat(auto-fit, minmax(180px, 1fr))" gap="base">
            {review.media.map((media) => (
              <s-box key={media.id} padding="base" border="base" borderRadius="base">
                <s-stack direction="block" gap="small">
                  {media.previewUrl && media.type === "VIDEO" ? (
                    // Customer uploads do not include caption files; preserve audio for moderation.
                    // eslint-disable-next-line jsx-a11y/media-has-caption
                    <video src={media.previewUrl} controls playsInline style={{ width: "100%", borderRadius: 12 }} />
                  ) : media.previewUrl ? (
                    <img src={media.previewUrl} alt={media.altText ?? "Customer review media"} style={{ width: "100%", borderRadius: 12 }} />
                  ) : null}
                  <s-text>{media.type}</s-text>
                  <Form method="post">
                    <input type="hidden" name="intent" value="delete_media" />
                    <input type="hidden" name="mediaId" value={media.id} />
                    <s-button type="submit" variant="secondary" tone="critical">Remove media</s-button>
                  </Form>
                </s-stack>
              </s-box>
            ))}
          </s-grid>
        )}
      </s-section>

      <s-section heading="Merchant reply">
        <Form method="post">
          <input type="hidden" name="intent" value="save_reply" />
          <s-stack direction="block" gap="base">
            <s-text-area
              label="Public reply"
              name="replyBody"
              rows={4}
              defaultValue={review.merchantReply?.body ?? ""}
              placeholder="Thanks for sharing your experience!"
            ></s-text-area>
            <s-stack direction="inline" gap="base">
              <s-button type="submit" variant="primary">Save reply</s-button>
            </s-stack>
          </s-stack>
        </Form>
        {review.merchantReply && (
          <Form method="post">
            <input type="hidden" name="intent" value="delete_reply" />
            <s-button type="submit" variant="secondary" tone="critical">Delete reply</s-button>
          </Form>
        )}
      </s-section>

      <s-section heading="Moderation">
        <s-stack direction="inline" gap="base">
          {review.status !== "PENDING" && (
            <Form method="post">
              <input type="hidden" name="intent" value="requeue" />
              <s-button type="submit" variant="secondary">Return to pending</s-button>
            </Form>
          )}
          <Form method="post">
            <input type="hidden" name="intent" value="delete_review" />
            <s-button type="submit" variant="secondary" tone="critical">Delete review permanently</s-button>
          </Form>
        </s-stack>
      </s-section>
    </s-page>
  );
}
