import type { LoaderFunctionArgs } from "react-router";
import { useLoaderData } from "react-router";

import prisma from "../db.server";
import { GENUINE_SOURCES } from "../lib/constants";
import { authenticate } from "../shopify.server";

const genuineSource = { in: [...GENUINE_SOURCES] };

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { session } = await authenticate.admin(request);
  const since = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);

  const [
    approved,
    submitted,
    mediaCount,
    helpful,
    ratingStats,
    events,
    verifiedCount,
    sourceGroups,
    topProducts,
  ] = await Promise.all([
    prisma.review.count({
      where: { shop: session.shop, source: genuineSource, status: "APPROVED" },
    }),
    prisma.review.count({
      where: { shop: session.shop, source: genuineSource, createdAt: { gte: since } },
    }),
    prisma.reviewMedia.count({
      where: {
        status: "READY",
        review: { shop: session.shop, source: genuineSource },
      },
    }),
    prisma.review.aggregate({
      where: { shop: session.shop, source: genuineSource, status: "APPROVED" },
      _sum: { helpfulCount: true },
    }),
    prisma.review.aggregate({
      where: { shop: session.shop, source: genuineSource, status: "APPROVED" },
      _avg: { rating: true },
    }),
    prisma.analyticsEvent.groupBy({
      by: ["type"],
      where: { shop: session.shop, createdAt: { gte: since } },
      _count: { _all: true },
    }),
    prisma.review.count({
      where: {
        shop: session.shop,
        source: genuineSource,
        status: "APPROVED",
        verifiedPurchase: true,
      },
    }),
    prisma.review.groupBy({
      by: ["source"],
      where: { shop: session.shop, source: genuineSource },
      _count: { _all: true },
    }),
    prisma.review.groupBy({
      by: ["productId", "productTitle"],
      where: { shop: session.shop, source: genuineSource, status: "APPROVED" },
      _count: { _all: true },
      _avg: { rating: true },
      orderBy: { _count: { productId: "desc" } },
      take: 10,
    }),
  ]);

  const eventMap = Object.fromEntries(
    events.map((event) => [event.type, event._count._all]),
  );
  const widgetViews = Number(eventMap.WIDGET_VIEW || 0);
  const reviewSubmissions = Number(eventMap.REVIEW_SUBMITTED || 0);
  const helpfulVotes30d = Number(eventMap.HELPFUL_VOTE || 0);
  const mediaOpens = Number(eventMap.MEDIA_OPEN || 0);

  return {
    approved,
    submitted,
    mediaCount,
    verifiedCount,
    helpfulVotes: helpful._sum.helpfulCount ?? 0,
    averageRating: ratingStats._avg.rating,
    widgetViews,
    reviewSubmissions,
    helpfulVotes30d,
    mediaOpens,
    submissionRate:
      widgetViews > 0 ? (reviewSubmissions / widgetViews) * 100 : 0,
    events: events.map((event) => ({
      type: event.type,
      count: event._count._all,
    })),
    sources: sourceGroups.map((source) => ({
      source: source.source,
      count: source._count._all,
    })),
    topProducts: topProducts.map((product) => ({
      productId: product.productId,
      productTitle: product.productTitle ?? "Unknown product",
      count: product._count._all,
      averageRating: product._avg.rating,
    })),
  };
};

export default function AnalyticsPage() {
  const data = useLoaderData<typeof loader>();

  return (
    <s-page heading="Analytics">
      <s-section heading="Review performance">
        <s-grid gridTemplateColumns="repeat(4, minmax(0, 1fr))" gap="base">
          <s-box padding="base" border="base" borderRadius="base">
            <s-text color="subdued">Published</s-text>
            <s-heading>{String(data.approved)}</s-heading>
          </s-box>
          <s-box padding="base" border="base" borderRadius="base">
            <s-text color="subdued">Submitted · 30d</s-text>
            <s-heading>{String(data.submitted)}</s-heading>
          </s-box>
          <s-box padding="base" border="base" borderRadius="base">
            <s-text color="subdued">Verified published</s-text>
            <s-heading>{String(data.verifiedCount)}</s-heading>
          </s-box>
          <s-box padding="base" border="base" borderRadius="base">
            <s-text color="subdued">Published rating</s-text>
            <s-heading>
              {data.averageRating === null ? "—" : data.averageRating.toFixed(1)}
            </s-heading>
          </s-box>
        </s-grid>
      </s-section>

      <s-section heading="Storefront engagement · last 30 days">
        <s-grid gridTemplateColumns="repeat(4, minmax(0, 1fr))" gap="base">
          <s-box padding="base" border="base" borderRadius="base">
            <s-text color="subdued">Widget views</s-text>
            <s-heading>{String(data.widgetViews)}</s-heading>
          </s-box>
          <s-box padding="base" border="base" borderRadius="base">
            <s-text color="subdued">Review submissions</s-text>
            <s-heading>{String(data.reviewSubmissions)}</s-heading>
          </s-box>
          <s-box padding="base" border="base" borderRadius="base">
            <s-text color="subdued">Submission rate</s-text>
            <s-heading>{data.submissionRate.toFixed(1)}%</s-heading>
          </s-box>
          <s-box padding="base" border="base" borderRadius="base">
            <s-text color="subdued">Media opens</s-text>
            <s-heading>{String(data.mediaOpens)}</s-heading>
          </s-box>
        </s-grid>
      </s-section>

      <s-section heading="Top products" padding="none">
        {data.topProducts.length === 0 ? (
          <s-box padding="base"><s-text color="subdued">No published review data yet.</s-text></s-box>
        ) : (
          <s-table>
            <s-table-header-row>
              <s-table-header>Product</s-table-header>
              <s-table-header format="numeric">Published reviews</s-table-header>
              <s-table-header format="numeric">Average</s-table-header>
            </s-table-header-row>
            <s-table-body>
              {data.topProducts.map((product) => (
                <s-table-row key={product.productId}>
                  <s-table-cell>{product.productTitle}</s-table-cell>
                  <s-table-cell>{String(product.count)}</s-table-cell>
                  <s-table-cell>{product.averageRating === null ? "—" : product.averageRating.toFixed(1)}</s-table-cell>
                </s-table-row>
              ))}
            </s-table-body>
          </s-table>
        )}
      </s-section>

      <s-section heading="Review sources" padding="none">
        <s-table>
          <s-table-header-row>
            <s-table-header>Source</s-table-header>
            <s-table-header format="numeric">Reviews</s-table-header>
          </s-table-header-row>
          <s-table-body>
            {data.sources.map((source) => (
              <s-table-row key={source.source}>
                <s-table-cell>{source.source}</s-table-cell>
                <s-table-cell>{String(source.count)}</s-table-cell>
              </s-table-row>
            ))}
          </s-table-body>
        </s-table>
      </s-section>

      <s-section heading="Event detail · last 30 days" padding="none">
        {data.events.length === 0 ? (
          <s-box padding="base"><s-text color="subdued">No storefront events recorded yet.</s-text></s-box>
        ) : (
          <s-table>
            <s-table-header-row>
              <s-table-header>Event</s-table-header>
              <s-table-header format="numeric">Count</s-table-header>
            </s-table-header-row>
            <s-table-body>
              {data.events.map((event) => (
                <s-table-row key={event.type}>
                  <s-table-cell>{event.type}</s-table-cell>
                  <s-table-cell>{String(event.count)}</s-table-cell>
                </s-table-row>
              ))}
            </s-table-body>
          </s-table>
        )}
      </s-section>

      <s-section heading="Metric integrity">
        <s-paragraph>
          AI_DEMO and TEST content is excluded from review metrics. Public rating
          metrics include APPROVED CUSTOMER, IMPORT, and MERCHANT_IMPORT reviews only.
          Widget views are deduplicated per visitor, product, and minute.
        </s-paragraph>
      </s-section>
    </s-page>
  );
}
