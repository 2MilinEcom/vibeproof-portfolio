import type { ActionFunctionArgs } from "react-router";

import prisma from "../db.server";
import { authenticate } from "../shopify.server";

type DataRequestPayload = {
  customer?: { email?: string | null };
  data_request?: { id?: number | string };
};

export const action = async ({ request }: ActionFunctionArgs) => {
  const { payload, shop } = await authenticate.webhook(request);
  const body = payload as DataRequestPayload;
  const email = body.customer?.email?.trim().toLowerCase();
  const requestId = String(body.data_request?.id ?? "");
  if (!email || !requestId) return new Response();

  const reviews = await prisma.review.findMany({
    where: { shop, reviewerEmail: email },
    include: { media: true, merchantReply: true },
    orderBy: { createdAt: "desc" },
  });

  const payloadJson = JSON.stringify({
    reviews: reviews.map((review) => ({
      id: review.id,
      productId: review.productId,
      productHandle: review.productHandle,
      rating: review.rating,
      title: review.title,
      body: review.body,
      reviewerName: review.reviewerName,
      reviewerEmail: review.reviewerEmail,
      verifiedPurchase: review.verifiedPurchase,
      status: review.status,
      createdAt: review.createdAt,
      media: review.media.map((media) => ({
        type: media.type,
        storageKey: media.storageKey,
      })),
      merchantReply: review.merchantReply?.body ?? null,
    })),
  });

  await prisma.privacyRequest.upsert({
    where: { shop_requestId: { shop, requestId } },
    create: {
      shop,
      requestId,
      type: "DATA_REQUEST",
      customerEmail: email,
      payloadJson,
      status: "PENDING",
    },
    update: {
      customerEmail: email,
      payloadJson,
      status: "PENDING",
      completedAt: null,
    },
  });

  return new Response();
};
