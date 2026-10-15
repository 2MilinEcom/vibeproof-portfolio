import type { ActionFunctionArgs } from "react-router";

import prisma from "../db.server";
import { deleteStorageObject } from "../lib/media.server";
import { sha256 } from "../lib/security.server";
import { authenticate } from "../shopify.server";

type RedactPayload = {
  customer?: { email?: string | null };
};

export const action = async ({ request }: ActionFunctionArgs) => {
  const { payload, shop } = await authenticate.webhook(request);
  const body = payload as RedactPayload;
  const email = body.customer?.email?.trim().toLowerCase();
  if (!email) return new Response();

  const reviews = await prisma.review.findMany({
    where: { shop, reviewerEmail: email },
    include: { media: true },
  });

  for (const review of reviews) {
    for (const media of review.media) {
      if (media.storageKey) {
        if (!(await deleteStorageObject(media.storageKey))) {
          return new Response("Media deletion failed. Please retry.", { status: 503 });
        }
      }
    }
  }

  const reviewIds = reviews.map((review) => review.id);
  await prisma.$transaction([
    prisma.privacyRequest.deleteMany({ where: { shop, customerEmail: email } }),
    prisma.helpfulVote.deleteMany({ where: { shop, reviewId: { in: reviewIds } } }),
    prisma.analyticsEvent.deleteMany({ where: { shop, reviewId: { in: reviewIds } } }),
    prisma.review.deleteMany({ where: { shop, reviewerEmail: email } }),
    prisma.reviewRequest.deleteMany({
      where: { shop, emailHash: sha256(email) },
    }),
  ]);

  return new Response();
};
