import { useRef } from "react";
import type { ActionFunctionArgs, LoaderFunctionArgs } from "react-router";
import { Form, Link, useFetcher, useLoaderData, useSubmit, useOutlet } from "react-router";

import prisma from "../db.server";
import { GENUINE_SOURCES } from "../lib/constants";
import { authenticate } from "../shopify.server";

const genuineSource = { in: [...GENUINE_SOURCES] };

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { session } = await authenticate.admin(request);
  const url = new URL(request.url);

  const q = url.searchParams.get("q")?.trim() ?? "";
  const status = url.searchParams.get("status") ?? "ALL";
  const source = url.searchParams.get("source") ?? "ALL";
  const page = Math.max(1, Number(url.searchParams.get("page") || 1));
  const take = 50;

  const filteredWhere = {
    shop: session.shop,
    source: source === "ALL" ? genuineSource : source,
    ...(status === "ALL" ? {} : { status }),
    ...(q
      ? {
          OR: [
            { reviewerName: { contains: q } },
            { reviewerEmail: { contains: q } },
            { title: { contains: q } },
            { body: { contains: q } },
            { productTitle: { contains: q } },
            { productHandle: { contains: q } },
          ],
        }
      : {}),
  };

  const [
    reviews,
    filteredCount,
    totalReviews,
    pendingReviews,
    approvedReviews,
    rejectedReviews,
    ratingStats,
  ] = await Promise.all([
    prisma.review.findMany({
      where: filteredWhere,
      orderBy: [{ featured: "desc" }, { createdAt: "desc" }],
      skip: (page - 1) * take,
      take,
      include: {
        media: { orderBy: { position: "asc" } },
        merchantReply: true,
      },
    }),
    prisma.review.count({ where: filteredWhere }),
    prisma.review.count({
      where: { shop: session.shop, source: genuineSource },
    }),
    prisma.review.count({
      where: { shop: session.shop, source: genuineSource, status: "PENDING" },
    }),
    prisma.review.count({
      where: { shop: session.shop, source: genuineSource, status: "APPROVED" },
    }),
    prisma.review.count({
      where: { shop: session.shop, source: genuineSource, status: "REJECTED" },
    }),
    prisma.review.aggregate({
      where: {
        shop: session.shop,
        source: genuineSource,
        status: "APPROVED",
      },
      _avg: { rating: true },
    }),
  ]);

  return {
    q,
    status,
    source,
    page,
    pages: Math.max(1, Math.ceil(filteredCount / take)),
    totalReviews,
    pendingReviews,
    approvedReviews,
    rejectedReviews,
    averageRating: ratingStats._avg.rating,
    reviews: reviews.map((review) => ({
      id: review.id,
      reviewerName: review.reviewerName,
      reviewerEmail: review.reviewerEmail,
      rating: review.rating,
      title: review.title,
      body: review.body,
      productTitle: review.productTitle ?? "Unknown product",
      productHandle: review.productHandle,
      status: review.status,
      source: review.source,
      mediaCount: review.media.length,
      helpfulCount: review.helpfulCount,
      featured: review.featured,
      verifiedPurchase: review.verifiedPurchase,
      spamScore: review.spamScore,
      hasReply: Boolean(review.merchantReply),
      createdAt: review.createdAt.toISOString(),
    })),
  };
};

export const action = async ({ request }: ActionFunctionArgs) => {
  const { session } = await authenticate.admin(request);
  const formData = await request.formData();
  const intent = String(formData.get("intent") || "");
  const singleId = formData.get("reviewId");
  const reviewIds = [
    ...formData.getAll("reviewIds").filter((value): value is string => typeof value === "string"),
    ...(typeof singleId === "string" ? [singleId] : []),
  ];

  if (reviewIds.length === 0) {
    return { ok: false, message: "Select at least one review." };
  }

  const owned = await prisma.review.findMany({
    where: {
      id: { in: reviewIds },
      shop: session.shop,
      source: genuineSource,
    },
    select: { id: true, status: true },
  });
  const ownedIds = owned.map((review) => review.id);
  if (ownedIds.length === 0) {
    return { ok: false, message: "No matching reviews found." };
  }

  if (intent === "approve" || intent === "bulk_approve") {
    const pendingIds = owned
      .filter((review) => review.status === "PENDING")
      .map((review) => review.id);
    if (pendingIds.length === 0) {
      return { ok: false, message: "Only pending reviews can be approved." };
    }
    await prisma.review.updateMany({
      where: { id: { in: pendingIds }, shop: session.shop, status: "PENDING" },
      data: { status: "APPROVED", publishedAt: new Date() },
    });
    return { ok: true, message: `Approved ${pendingIds.length} review(s).` };
  }

  if (intent === "reject" || intent === "bulk_reject") {
    const pendingIds = owned
      .filter((review) => review.status === "PENDING")
      .map((review) => review.id);
    if (pendingIds.length === 0) {
      return { ok: false, message: "Only pending reviews can be rejected." };
    }
    await prisma.review.updateMany({
      where: { id: { in: pendingIds }, shop: session.shop, status: "PENDING" },
      data: { status: "REJECTED", featured: false, publishedAt: null },
    });
    return { ok: true, message: `Rejected ${pendingIds.length} review(s).` };
  }

  if (intent === "feature" || intent === "unfeature") {
    const review = owned[0];
    if (!review || review.status !== "APPROVED") {
      return { ok: false, message: "Only approved reviews can be featured." };
    }
    await prisma.review.update({
      where: { id: review.id },
      data: { featured: intent === "feature" },
    });
    return {
      ok: true,
      message: intent === "feature" ? "Review featured." : "Review unfeatured.",
    };
  }

  if (intent === "mark_spam") {
    await prisma.review.updateMany({
      where: { id: { in: ownedIds }, shop: session.shop },
      data: {
        status: "SPAM",
        featured: false,
        publishedAt: null,
        moderationNote: "Marked as spam by merchant.",
      },
    });
    return { ok: true, message: `Marked ${ownedIds.length} review(s) as spam.` };
  }

  return { ok: false, message: "Unknown action." };
};

export default function ReviewsPage() {
  const outlet = useOutlet();
  const data = useLoaderData<typeof loader>();
  const fetcher = useFetcher<typeof action>();
  const bulkForm = useRef<HTMLFormElement>(null);
  const submit = useSubmit();

  function submitBulk(intent: string) {
    if (!bulkForm.current) return;
    const formData = new FormData(bulkForm.current);
    formData.set("intent", intent);
    submit(formData, { method: "post" });
  }
  const busyId = fetcher.formData?.get("reviewId");

  const submitSingle = (
    reviewId: string,
    intent: "approve" | "reject" | "feature" | "unfeature",
  ) => {
    fetcher.submit({ reviewId, intent }, { method: "post" });
  };

  const pageLink = (page: number) => {
    const params = new URLSearchParams();
    if (data.q) params.set("q", data.q);
    if (data.status !== "ALL") params.set("status", data.status);
    if (data.source !== "ALL") params.set("source", data.source);
    params.set("page", String(page));
    return `/app/reviews?${params.toString()}`;
  };

  if (outlet) return outlet;

  return (
    <s-page heading="Reviews">
      <s-section heading="Overview">
        <s-grid gridTemplateColumns="repeat(5, minmax(0, 1fr))" gap="base">
          <s-box padding="base" border="base" borderRadius="base">
            <s-text color="subdued">Genuine reviews</s-text>
            <s-heading>{String(data.totalReviews)}</s-heading>
          </s-box>
          <s-box padding="base" border="base" borderRadius="base">
            <s-text color="subdued">Pending</s-text>
            <s-heading>{String(data.pendingReviews)}</s-heading>
          </s-box>
          <s-box padding="base" border="base" borderRadius="base">
            <s-text color="subdued">Published</s-text>
            <s-heading>{String(data.approvedReviews)}</s-heading>
          </s-box>
          <s-box padding="base" border="base" borderRadius="base">
            <s-text color="subdued">Rejected</s-text>
            <s-heading>{String(data.rejectedReviews)}</s-heading>
          </s-box>
          <s-box padding="base" border="base" borderRadius="base">
            <s-text color="subdued">Published rating</s-text>
            <s-heading>
              {data.averageRating === null ? "—" : data.averageRating.toFixed(1)}
            </s-heading>
          </s-box>
        </s-grid>
      </s-section>

      {fetcher.data?.message && (
        <s-banner tone={fetcher.data.ok ? "success" : "critical"}>
          {fetcher.data.message}
        </s-banner>
      )}

      <s-section heading="Find reviews">
        <Form method="get">
          <s-grid gridTemplateColumns="2fr 1fr 1fr auto" gap="base" alignItems="end">
            <s-text-field
              label="Search"
              name="q"
              defaultValue={data.q}
              placeholder="Reviewer, email, product, title, or text"
              icon="search"
            ></s-text-field>
            <s-select label="Status" name="status" value={data.status}>
              <s-option value="ALL">All statuses</s-option>
              <s-option value="PENDING">Pending</s-option>
              <s-option value="APPROVED">Approved</s-option>
              <s-option value="REJECTED">Rejected</s-option>
              <s-option value="SPAM">Spam</s-option>
            </s-select>
            <s-select label="Source" name="source" value={data.source}>
              <s-option value="ALL">All genuine sources</s-option>
              <s-option value="CUSTOMER">Customer</s-option>
              <s-option value="IMPORT">Import</s-option>
              <s-option value="MERCHANT_IMPORT">Merchant import</s-option>
            </s-select>
            <s-button type="submit" variant="secondary">Filter</s-button>
          </s-grid>
        </Form>
      </s-section>

      {data.reviews.length === 0 ? (
        <s-section heading="No reviews found">
          <s-paragraph>No genuine reviews match the current filters.</s-paragraph>
        </s-section>
      ) : (
        <Form method="post" ref={bulkForm}>
          <s-section heading="All reviews" padding="none">
            <s-box padding="base">
              <s-stack direction="inline" gap="small">
                <s-button type="button" onClick={() => submitBulk("bulk_approve")} variant="primary">
                  Approve selected
                </s-button>
                <s-button type="button" onClick={() => submitBulk("bulk_reject")} variant="secondary">
                  Reject selected
                </s-button>
                <s-button type="button" onClick={() => submitBulk("mark_spam")} variant="secondary" tone="critical">
                  Mark spam
                </s-button>
              </s-stack>
            </s-box>

            <s-table>
              <s-table-header-row>
                <s-table-header>Select</s-table-header>
                <s-table-header listSlot="primary">Review</s-table-header>
                <s-table-header format="numeric">Rating</s-table-header>
                <s-table-header>Product</s-table-header>
                <s-table-header>Status</s-table-header>
                <s-table-header>Trust</s-table-header>
                <s-table-header>Media</s-table-header>
                <s-table-header>Actions</s-table-header>
              </s-table-header-row>
              <s-table-body>
                {data.reviews.map((review) => {
                  const busy = fetcher.state !== "idle" && busyId === review.id;
                  return (
                    <s-table-row key={review.id}>
                      <s-table-cell>
                        <s-checkbox
                          label={`Select ${review.reviewerName}`}
                          name="reviewIds"
                          value={review.id}
                        ></s-checkbox>
                      </s-table-cell>
                      <s-table-cell>
                        <s-stack direction="block" gap="small">
                          <Link to={`/app/reviews/${review.id}`}>
                            {review.reviewerName}
                          </Link>
                          <s-text color="subdued">
                            {review.title || review.body.slice(0, 70)}
                          </s-text>
                        </s-stack>
                      </s-table-cell>
                      <s-table-cell>{String(review.rating)}</s-table-cell>
                      <s-table-cell>{review.productTitle}</s-table-cell>
                      <s-table-cell>
                        <s-badge
                          tone={
                            review.status === "APPROVED"
                              ? "success"
                              : review.status === "PENDING"
                                ? "warning"
                                : review.status === "SPAM"
                                  ? "critical"
                                  : "neutral"
                          }
                        >
                          {review.status}
                        </s-badge>
                      </s-table-cell>
                      <s-table-cell>
                        <s-stack direction="block" gap="small">
                          {review.verifiedPurchase && <s-badge tone="success">Verified</s-badge>}
                          {review.spamScore > 0 && <s-badge tone="warning">Spam {String(review.spamScore)}</s-badge>}
                          <s-text color="subdued">{review.source}</s-text>
                        </s-stack>
                      </s-table-cell>
                      <s-table-cell>{String(review.mediaCount)}</s-table-cell>
                      <s-table-cell>
                        <s-stack direction="inline" gap="small">
                          {review.status === "PENDING" && (
                            <>
                              <s-button
                                variant="primary"
                                loading={busy}
                                onClick={() => submitSingle(review.id, "approve")}
                              >
                                Approve
                              </s-button>
                              <s-button
                                variant="secondary"
                                loading={busy}
                                onClick={() => submitSingle(review.id, "reject")}
                              >
                                Reject
                              </s-button>
                            </>
                          )}
                          {review.status === "APPROVED" && (
                            <s-button
                              variant="secondary"
                              loading={busy}
                              onClick={() =>
                                submitSingle(
                                  review.id,
                                  review.featured ? "unfeature" : "feature",
                                )
                              }
                            >
                              {review.featured ? "Unfeature" : "Feature"}
                            </s-button>
                          )}
                        </s-stack>
                      </s-table-cell>
                    </s-table-row>
                  );
                })}
              </s-table-body>
            </s-table>

            <s-box padding="base">
              <s-stack direction="inline" gap="base" alignItems="center">
                {data.page > 1 && <s-link href={pageLink(data.page - 1)}>Previous</s-link>}
                <s-text>Page {String(data.page)} of {String(data.pages)}</s-text>
                {data.page < data.pages && <s-link href={pageLink(data.page + 1)}>Next</s-link>}
              </s-stack>
            </s-box>
          </s-section>
        </Form>
      )}

      <s-section heading="Rating integrity">
        <s-paragraph>
          Public ratings use APPROVED reviews from CUSTOMER, IMPORT, and
          MERCHANT_IMPORT only. Pending, rejected, spam, TEST, and AI_DEMO content
          never affects the published rating.
        </s-paragraph>
      </s-section>
    </s-page>
  );
}
