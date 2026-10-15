import type { ActionFunctionArgs } from "react-router";

import prisma from "../db.server";
import { deleteStorageObject } from "../lib/media.server";
import { authenticate } from "../shopify.server";

export const action = async ({ request }: ActionFunctionArgs) => {
  const { shop } = await authenticate.webhook(request);

  const media = await prisma.reviewMedia.findMany({
    where: { review: { shop } },
    select: { storageKey: true },
  });

  for (const item of media) {
    if (item.storageKey) {
      if (!(await deleteStorageObject(item.storageKey))) {
        return new Response("Media deletion failed. Please retry.", { status: 503 });
      }
    }
  }

  await prisma.$transaction([
    prisma.rateLimitBucket.deleteMany({
      where: { OR: [{ key: { startsWith: `review:${shop}:` } }, { key: { startsWith: `upload:${shop}:` } }] },
    }),
    prisma.helpfulVote.deleteMany({ where: { shop } }),
    prisma.analyticsEvent.deleteMany({ where: { shop } }),
    prisma.importJob.deleteMany({ where: { shop } }),
    prisma.privacyRequest.deleteMany({ where: { shop } }),
    prisma.reviewRequest.deleteMany({ where: { shop } }),
    prisma.productConfig.deleteMany({ where: { shop } }),
    prisma.widgetTheme.deleteMany({ where: { shop } }),
    prisma.collectionSettings.deleteMany({ where: { shop } }),
    prisma.review.deleteMany({ where: { shop } }),
    prisma.session.deleteMany({ where: { shop } }),
  ]);

  return new Response();
};
