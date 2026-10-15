import type { ActionFunctionArgs, LoaderFunctionArgs } from "react-router";

import prisma from "../db.server";
import {
  GENUINE_SOURCES,
  PUBLIC_ANALYTICS_TYPES,
} from "../lib/constants";
import {
  createStorageKey,
  ensureBucketCors,
  mediaUploadsConfigured,
  presignObject,
  validateStoredMedia,
  validateUploadRequest,
} from "../lib/media.server";
import {
  rateLimit,
  requestFingerprint,
  sha256,
} from "../lib/security.server";
import { authenticate } from "../shopify.server";

const publicSource = { in: [...GENUINE_SOURCES] };

const defaultTheme = {
  layout: "SOCIAL_FEED",
  heading: "THE GIRLIES SAID IT BEST",
  accentColor: "#111111",
  backgroundColor: "#FFFFFF",
  textColor: "#111111",
  borderColor: "#E5E7EB",
  radius: 18,
  mediaRatio: "4/5",
  showVerified: true,
  showHelpful: true,
  showMerchantReplies: true,
  autoMatch: true,
};

const defaultCollection = {
  collectRating: true,
  collectTitle: true,
  collectBody: true,
  collectEmail: true,
  collectPhoto: true,
  collectVideo: true,
  requireEmail: true,
  autoApproveFiveStar: false,
  reviewRequestsEnabled: false,
  requestDelayHours: 48,
  requestExpiryDays: 30,
};

function json(data: unknown, init?: ResponseInit) {
  return Response.json(data, {
    ...init,
    headers: {
      "Cache-Control": "no-store",
      "X-Content-Type-Options": "nosniff",
      ...(init?.headers ?? {}),
    },
  });
}

function safeString(value: unknown, max = 5000) {
  return typeof value === "string" ? value.trim().slice(0, max) : "";
}

function safeInt(value: unknown, fallback = 0) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? Math.round(parsed) : fallback;
}

function storefrontMediaUrl(
  request: Request,
  media: { id: string; storageKey: string | null; url: string | null },
) {
  // Direct, short-lived links avoid Shopify proxy redirect rewriting and allow video ranges.
  if (media.storageKey && mediaUploadsConfigured()) {
    return presignObject("GET", media.storageKey, 600);
  }
  if (media.url) return media.url;
  const mediaId = media.id;
  const url = new URL(request.url);
  return `${url.pathname}?media_id=${encodeURIComponent(mediaId)}`;
}

function spamScore(args: {
  body: string;
  title: string;
  reviewerName: string;
  honeypot: string;
}) {
  let score = 0;
  if (args.honeypot) score += 100;
  if (args.body.length < 3) score += 30;
  const links = (args.body.match(/https?:\/\//gi) ?? []).length;
  if (links > 1) score += 40;
  if (/(.)\1{8,}/i.test(args.body)) score += 20;
  if (/\b(crypto|casino|viagra|seo service|backlink)\b/i.test(args.body)) score += 60;
  if (args.reviewerName.length < 2) score += 20;
  return score;
}

async function recordEvent(args: {
  shop: string;
  type: string;
  productId?: string;
  reviewId?: string;
  visitorHash?: string;
  eventKey?: string;
  metadata?: unknown;
}) {
  if (!PUBLIC_ANALYTICS_TYPES.has(args.type)) return;

  try {
    await prisma.analyticsEvent.create({
      data: {
        shop: args.shop,
        type: args.type,
        productId: args.productId || null,
        reviewId: args.reviewId || null,
        visitorHash: args.visitorHash || null,
        eventKey: args.eventKey || null,
        metadata: args.metadata ? JSON.stringify(args.metadata) : null,
      },
    });
  } catch (error) {
    if (
      typeof error === "object" &&
      error &&
      "code" in error &&
      error.code === "P2002"
    ) {
      return;
    }
    throw error;
  }
}

export const loader = async ({ request }: LoaderFunctionArgs) => {
  await authenticate.public.appProxy(request);

  const url = new URL(request.url);
  const shop = url.searchParams.get("shop");

  if (!shop) {
    return json({ ok: false, error: "Missing shop." }, { status: 400 });
  }

  const mediaId = url.searchParams.get("media_id")?.trim();
  if (mediaId) {
    const media = await prisma.reviewMedia.findFirst({
      where: {
        id: mediaId,
        status: "READY",
        review: {
          shop,
          source: publicSource,
          status: "APPROVED",
        },
      },
      select: { storageKey: true, url: true },
    });

    if (!media) return new Response("Not found", { status: 404 });
    if (media.storageKey) {
      return Response.redirect(presignObject("GET", media.storageKey, 60 * 60 * 6), 302);
    }
    if (media.url) return Response.redirect(media.url, 302);
    return new Response("Not found", { status: 404 });
  }

  const productHandle = url.searchParams.get("product_handle")?.trim() ?? "";
  const productId = url.searchParams.get("product_id")?.trim() ?? "";
  const ratingFilter = safeInt(url.searchParams.get("rating"), 0);
  const mediaOnly = url.searchParams.get("media") === "1";
  const sort = url.searchParams.get("sort") ?? "featured";
  const visitorHash = requestFingerprint(request, shop);

  if (!productHandle) {
    return json(
      { ok: false, error: "Missing product handle." },
      { status: 400 },
    );
  }

  const reviewWhere = {
    shop,
    productHandle,
    source: publicSource,
    status: "APPROVED",
    ...(ratingFilter >= 1 && ratingFilter <= 5 ? { rating: ratingFilter } : {}),
    ...(mediaOnly ? { media: { some: { status: "READY" } } } : {}),
  };

  const orderBy =
    sort === "newest"
      ? [{ publishedAt: "desc" as const }, { createdAt: "desc" as const }]
      : sort === "helpful"
        ? [{ helpfulCount: "desc" as const }, { createdAt: "desc" as const }]
        : [
            { featured: "desc" as const },
            { publishedAt: "desc" as const },
            { createdAt: "desc" as const },
          ];

  const [
    theme,
    productConfig,
    collection,
    reviews,
    ratingStats,
    reviewCount,
    ratingGroups,
  ] = await Promise.all([
    prisma.widgetTheme.findUnique({ where: { shop } }),
    prisma.productConfig.findFirst({ where: { shop, productHandle } }),
    prisma.collectionSettings.findUnique({ where: { shop } }),
    prisma.review.findMany({
      where: reviewWhere,
      orderBy,
      take: 50,
      include: {
        media: {
          where: { status: "READY" },
          orderBy: { position: "asc" },
        },
        merchantReply: true,
      },
    }),
    prisma.review.aggregate({
      where: {
        shop,
        productHandle,
        source: publicSource,
        status: "APPROVED",
      },
      _avg: { rating: true },
    }),
    prisma.review.count({
      where: {
        shop,
        productHandle,
        source: publicSource,
        status: "APPROVED",
      },
    }),
    prisma.review.groupBy({
      by: ["rating"],
      where: {
        shop,
        productHandle,
        source: publicSource,
        status: "APPROVED",
      },
      _count: { _all: true },
    }),
  ]);

  if (productConfig?.enabled === false) {
    return json({
      ok: true,
      enabled: false,
      productHandle,
      productId,
      rating: null,
      count: 0,
      reviews: [],
    });
  }

  const baseTheme = theme ?? defaultTheme;
  const storefrontTheme = {
    ...baseTheme,
    layout: productConfig?.layoutOverride ?? baseTheme.layout,
    heading: productConfig?.headingOverride ?? baseTheme.heading,
    accentColor: productConfig?.accentColorOverride ?? baseTheme.accentColor,
  };

  const minuteBucket = Math.floor(Date.now() / 60000);
  await recordEvent({
    shop,
    type: "WIDGET_VIEW",
    productId: productId || undefined,
    visitorHash,
    eventKey: `widget:${shop}:${productHandle}:${visitorHash}:${minuteBucket}`,
    metadata: { productHandle },
  });

  const distribution = Object.fromEntries(
    [1, 2, 3, 4, 5].map((rating) => [
      rating,
      ratingGroups.find((group) => group.rating === rating)?._count._all ?? 0,
    ]),
  );

  return json({
    ok: true,
    enabled: true,
    productHandle,
    productId,
    rating: ratingStats._avg.rating,
    count: reviewCount,
    distribution,
    theme: storefrontTheme,
    mediaUploadsConfigured: mediaUploadsConfigured(),
    collection: collection ?? defaultCollection,
    reviews: reviews.map((review) => ({
      id: review.id,
      rating: review.rating,
      title: review.title,
      body: review.body,
      reviewerName: review.reviewerName,
      verifiedPurchase: review.verifiedPurchase,
      helpfulCount: review.helpfulCount,
      featured: review.featured,
      variantTitle: review.variantTitle,
      createdAt: review.createdAt.toISOString(),
      media: review.media.map((media) => ({
        id: media.id,
        type: media.type,
        url: storefrontMediaUrl(request, media),
        altText: media.altText,
      })),
      merchantReply:
        storefrontTheme.showMerchantReplies && review.merchantReply
          ? {
              body: review.merchantReply.body,
              merchantName: review.merchantReply.merchantName,
            }
          : null,
    })),
  });
};

export const action = async ({ request }: ActionFunctionArgs) => {
  await authenticate.public.appProxy(request);

  const url = new URL(request.url);
  const shop = url.searchParams.get("shop");

  if (!shop) {
    return json({ ok: false, error: "Missing shop." }, { status: 400 });
  }

  const contentType = request.headers.get("content-type") ?? "";
  const payload = contentType.includes("application/json")
    ? await request.json()
    : Object.fromEntries(await request.formData());

  const intent = safeString(payload.intent, 80);
  const visitorHash = requestFingerprint(request, shop);

  if (intent === "event") {
    const eventType = safeString(payload.type, 80);
    if (!PUBLIC_ANALYTICS_TYPES.has(eventType)) {
      return json({ ok: false }, { status: 400 });
    }

    await recordEvent({
      shop,
      type: eventType,
      productId: safeString(payload.productId, 180) || undefined,
      reviewId: safeString(payload.reviewId, 160) || undefined,
      visitorHash,
      metadata: {
        productHandle: safeString(payload.productHandle, 255),
      },
    });
    return json({ ok: true });
  }

  if (intent === "prepare_upload") {
    const limiter = await rateLimit(
      `upload:${shop}:${visitorHash}`,
      20,
      10 * 60 * 1000,
    );
    if (!limiter.allowed) {
      return json(
        { ok: false, error: "Too many upload attempts. Try again shortly." },
        { status: 429 },
      );
    }

    const mimeType = safeString(payload.mimeType, 120);
    const bytes = safeInt(payload.bytes);
    try {
      const checked = validateUploadRequest(mimeType, bytes);
      await ensureBucketCors();
      const storageKey = createStorageKey(shop, mimeType);
      return json({
        ok: true,
        upload: {
          method: "PUT",
          url: presignObject("PUT", storageKey, 15 * 60),
          storageKey,
          kind: checked.kind,
          maxBytes: checked.maxBytes,
        },
      });
    } catch (error) {
      return json(
        {
          ok: false,
          error: error instanceof Error ? error.message : "Upload unavailable.",
        },
        { status: 400 },
      );
    }
  }

  if (intent === "helpful") {
    const reviewId = safeString(payload.reviewId, 160);
    if (!reviewId) {
      return json({ ok: false, error: "Missing review." }, { status: 400 });
    }

    const review = await prisma.review.findFirst({
      where: {
        id: reviewId,
        shop,
        source: publicSource,
        status: "APPROVED",
      },
      select: { id: true },
    });

    if (!review) {
      return json({ ok: false, error: "Review not found." }, { status: 404 });
    }

    try {
      await prisma.$transaction([
        prisma.helpfulVote.create({
          data: { shop, reviewId, voterHash: visitorHash },
        }),
        prisma.review.update({
          where: { id: reviewId },
          data: { helpfulCount: { increment: 1 } },
        }),
      ]);
      await recordEvent({
        shop,
        type: "HELPFUL_VOTE",
        reviewId,
        visitorHash,
      });
      return json({ ok: true });
    } catch (error) {
      if (
        typeof error === "object" &&
        error &&
        "code" in error &&
        error.code === "P2002"
      ) {
        return json({ ok: true, duplicate: true });
      }
      throw error;
    }
  }

  if (intent === "submit_review") {
    const limiter = await rateLimit(
      `review:${shop}:${visitorHash}`,
      6,
      60 * 60 * 1000,
    );
    if (!limiter.allowed) {
      return json(
        { ok: false, error: "Too many review attempts. Try again later." },
        { status: 429 },
      );
    }

    const productId = safeString(payload.productId, 180);
    const productHandle = safeString(payload.productHandle, 255);
    const productTitle = safeString(payload.productTitle, 255);
    const reviewerName = safeString(payload.reviewerName, 80);
    const reviewerEmail = safeString(payload.reviewerEmail, 160).toLowerCase();
    const title = safeString(payload.title, 120);
    const body = safeString(payload.body, 2000);
    const rating = safeInt(payload.rating);
    const requestToken = safeString(payload.requestToken, 200);
    const honeypot = safeString(payload.website, 200);

    let requestedMedia: unknown = [];
    try {
      requestedMedia =
        typeof payload.media === "string" ? JSON.parse(payload.media) : payload.media;
    } catch {
      requestedMedia = [];
    }

    const settings =
      (await prisma.collectionSettings.findUnique({ where: { shop } })) ??
      defaultCollection;

    if (!productHandle || !reviewerName) {
      return json(
        { ok: false, error: "Product and reviewer name are required." },
        { status: 400 },
      );
    }

    if (
      settings.collectRating &&
      (!Number.isInteger(rating) || rating < 1 || rating > 5)
    ) {
      return json(
        { ok: false, error: "Choose a rating from 1 to 5." },
        { status: 400 },
      );
    }

    if (settings.collectBody && !body) {
      return json(
        { ok: false, error: "Review text is required." },
        { status: 400 },
      );
    }

    if (
      settings.requireEmail &&
      (!reviewerEmail || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(reviewerEmail))
    ) {
      return json(
        { ok: false, error: "Enter a valid email address." },
        { status: 400 },
      );
    }

    const score = spamScore({ body, title, reviewerName, honeypot });
    if (score >= 100) {
      return json({
        ok: true,
        status: "PENDING",
        message: "Thanks! Your review was submitted for moderation.",
      });
    }

    const media = validateStoredMedia(requestedMedia).filter((item) =>
      item.type === "VIDEO" ? settings.collectVideo : settings.collectPhoto,
    );

    let reviewRequest = null;
    if (requestToken) {
      reviewRequest = await prisma.reviewRequest.findFirst({
        where: {
          shop,
          tokenHash: sha256(requestToken),
          productHandle,
          status: { in: ["PENDING", "SENT", "OPENED"] },
          expiresAt: { gt: new Date() },
        },
      });
    }

    const autoApprove =
      settings.autoApproveFiveStar && rating === 5 && score === 0;

    const review = await prisma.review.create({
      data: {
        shop,
        productId: productId || `shopify-product:${productHandle}`,
        productHandle,
        productTitle: productTitle || null,
        variantId: reviewRequest?.variantId ?? null,
        variantTitle: reviewRequest?.variantTitle ?? null,
        reviewRequestId: reviewRequest?.id ?? null,
        rating: settings.collectRating ? rating : 5,
        title: settings.collectTitle ? title || null : null,
        body: settings.collectBody ? body : "",
        reviewerName,
        reviewerEmail: settings.collectEmail ? reviewerEmail || null : null,
        verifiedPurchase: Boolean(reviewRequest),
        status: autoApprove ? "APPROVED" : "PENDING",
        source: "CUSTOMER",
        spamScore: score,
        moderationNote: score > 0 ? `Automated spam score: ${score}` : null,
        publishedAt: autoApprove ? new Date() : null,
        media: media.length
          ? {
              create: media.map((item) => ({
                type: item.type,
                storageKey: item.storageKey,
                mimeType: item.mimeType,
                bytes: item.bytes,
                altText: item.altText,
                position: item.position,
                status: "READY",
              })),
            }
          : undefined,
      },
    });

    if (reviewRequest) {
      await prisma.reviewRequest.update({
        where: { id: reviewRequest.id },
        data: { status: "COMPLETED", completedAt: new Date() },
      });
    }

    await recordEvent({
      shop,
      type: "REVIEW_SUBMITTED",
      productId: review.productId,
      reviewId: review.id,
      visitorHash,
      metadata: {
        productHandle,
        autoApproved: autoApprove,
        mediaCount: media.length,
        verifiedPurchase: Boolean(reviewRequest),
      },
    });

    return json({
      ok: true,
      status: review.status,
      message:
        review.status === "APPROVED"
          ? "Thanks! Your review is live."
          : "Thanks! Your review was submitted for moderation.",
    });
  }

  return json({ ok: false, error: "Unknown action." }, { status: 400 });
};
