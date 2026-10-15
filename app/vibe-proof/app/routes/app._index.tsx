import type { HeadersFunction, LoaderFunctionArgs } from "react-router";
import { useLoaderData } from "react-router";
import { boundary } from "@shopify/shopify-app-react-router/server";

import prisma from "../db.server";
import { GENUINE_SOURCES } from "../lib/constants";
import { reviewEmailConfigured } from "../lib/email.server";
import { mediaUploadsConfigured } from "../lib/media.server";
import { authenticate } from "../shopify.server";

const genuineSource = { in: [...GENUINE_SOURCES] };

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { session } = await authenticate.admin(request);

  const [
    total,
    pending,
    approved,
    ratingStats,
    demoCount,
    widgetTheme,
    queuedRequests,
    latestImport,
  ] = await Promise.all([
    prisma.review.count({ where: { shop: session.shop, source: genuineSource } }),
    prisma.review.count({ where: { shop: session.shop, source: genuineSource, status: "PENDING" } }),
    prisma.review.count({ where: { shop: session.shop, source: genuineSource, status: "APPROVED" } }),
    prisma.review.aggregate({
      where: { shop: session.shop, source: genuineSource, status: "APPROVED" },
      _avg: { rating: true },
    }),
    prisma.review.count({ where: { shop: session.shop, source: "AI_DEMO" } }),
    prisma.widgetTheme.findUnique({ where: { shop: session.shop } }),
    prisma.reviewRequest.count({ where: { shop: session.shop, status: "PENDING" } }),
    prisma.importJob.findFirst({ where: { shop: session.shop }, orderBy: { createdAt: "desc" } }),
  ]);

  return {
    total,
    pending,
    approved,
    averageRating: ratingStats._avg.rating,
    demoCount,
    displayConfigured: Boolean(widgetTheme),
    mediaConfigured: mediaUploadsConfigured(),
    emailConfigured: reviewEmailConfigured(),
    queuedRequests,
    latestImportStatus: latestImport?.status ?? null,
  };
};

export default function Index() {
  const data = useLoaderData<typeof loader>();

  return (
    <s-page heading="VibeProof">
      <s-section heading="Reviews made for the scroll">
        <s-paragraph>
          Turn customer reviews into social proof shoppers actually want to browse.
        </s-paragraph>
      </s-section>

      <s-section heading="Store health">
        <s-grid gridTemplateColumns="repeat(4, minmax(0, 1fr))" gap="base">
          <s-box padding="base" border="base" borderRadius="base">
            <s-text color="subdued">Genuine reviews</s-text>
            <s-heading>{String(data.total)}</s-heading>
          </s-box>
          <s-box padding="base" border="base" borderRadius="base">
            <s-text color="subdued">Pending moderation</s-text>
            <s-heading>{String(data.pending)}</s-heading>
          </s-box>
          <s-box padding="base" border="base" borderRadius="base">
            <s-text color="subdued">Published</s-text>
            <s-heading>{String(data.approved)}</s-heading>
          </s-box>
          <s-box padding="base" border="base" borderRadius="base">
            <s-text color="subdued">Published rating</s-text>
            <s-heading>{data.averageRating === null ? "—" : data.averageRating.toFixed(1)}</s-heading>
          </s-box>
        </s-grid>
      </s-section>

      <s-section heading="Launch readiness">
        <s-stack direction="block" gap="base">
          <s-stack direction="inline" gap="base" alignItems="center">
            <s-badge tone={data.displayConfigured ? "success" : "warning"}>
              {data.displayConfigured ? "Display configured" : "Display setup needed"}
            </s-badge>
            <s-badge tone={data.mediaConfigured ? "success" : "warning"}>
              {data.mediaConfigured ? "Media storage ready" : "Media storage needs setup"}
            </s-badge>
            <s-badge tone={data.emailConfigured ? "success" : "warning"}>
              {data.emailConfigured ? "Review email ready" : "Review email needs setup"}
            </s-badge>
          </s-stack>
          <s-text>{String(data.queuedRequests)} post-purchase request(s) queued</s-text>
          {data.latestImportStatus && <s-text>Latest import: {data.latestImportStatus}</s-text>}
        </s-stack>
      </s-section>

      <s-section heading="Integrity">
        <s-stack direction="block" gap="base">
          <s-text>{String(data.demoCount)} isolated AI preview reviews</s-text>
          <s-paragraph>
            Only approved CUSTOMER, IMPORT, and MERCHANT_IMPORT reviews contribute
            to public ratings. AI demo content remains isolated from storefront
            output, ratings, exports, and genuine review analytics.
          </s-paragraph>
        </s-stack>
      </s-section>
    </s-page>
  );
}

export const headers: HeadersFunction = (headersArgs) => boundary.headers(headersArgs);
