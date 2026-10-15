import type { ActionFunctionArgs, LoaderFunctionArgs } from "react-router";
import { Form, useActionData, useLoaderData } from "react-router";

import prisma from "../db.server";
import { reviewEmailConfigured } from "../lib/email.server";
import { mediaUploadsConfigured } from "../lib/media.server";
import { authenticate } from "../shopify.server";

const defaultSettings = {
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

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { session } = await authenticate.admin(request);
  const [settings, pendingRequests, sentRequests, completedRequests] =
    await Promise.all([
      prisma.collectionSettings.findUnique({
        where: { shop: session.shop },
      }),
      prisma.reviewRequest.count({
        where: { shop: session.shop, status: "PENDING" },
      }),
      prisma.reviewRequest.count({
        where: { shop: session.shop, status: "SENT" },
      }),
      prisma.reviewRequest.count({
        where: { shop: session.shop, status: "COMPLETED" },
      }),
    ]);

  return {
    settings: settings ?? defaultSettings,
    mediaConfigured: mediaUploadsConfigured(),
    emailConfigured: reviewEmailConfigured(),
    pendingRequests,
    sentRequests,
    completedRequests,
  };
};

export const action = async ({ request }: ActionFunctionArgs) => {
  const { session } = await authenticate.admin(request);
  const formData = await request.formData();

  const requestDelayHours = Math.max(
    0,
    Math.min(720, Number(formData.get("requestDelayHours") || 48)),
  );
  const requestExpiryDays = Math.max(
    3,
    Math.min(90, Number(formData.get("requestExpiryDays") || 30)),
  );

  const data = {
    collectRating: formData.has("collectRating"),
    collectTitle: formData.has("collectTitle"),
    collectBody: formData.has("collectBody"),
    collectEmail: formData.has("collectEmail"),
    collectPhoto: formData.has("collectPhoto"),
    collectVideo: formData.has("collectVideo"),
    requireEmail: formData.has("requireEmail"),
    autoApproveFiveStar: formData.has("autoApproveFiveStar"),
    reviewRequestsEnabled: formData.has("reviewRequestsEnabled"),
    requestDelayHours: Math.round(requestDelayHours),
    requestExpiryDays: Math.round(requestExpiryDays),
  };

  await prisma.collectionSettings.upsert({
    where: { shop: session.shop },
    create: { shop: session.shop, ...data },
    update: data,
  });

  return { ok: true, message: "Collection settings saved." };
};

export default function CollectPage() {
  const data = useLoaderData<typeof loader>();
  const actionData = useActionData<typeof action>();
  const { settings } = data;

  return (
    <s-page heading="Collect">
      {actionData?.message && <s-banner tone="success">{actionData.message}</s-banner>}

      <s-section heading="Review submission form">
        <s-paragraph>
          Choose what customers can submit through the VibeProof storefront form.
        </s-paragraph>

        <Form method="post">
          <s-stack direction="block" gap="base">
            <s-checkbox label="Star rating" name="collectRating" value="on" defaultChecked={settings.collectRating}></s-checkbox>
            <s-checkbox label="Review title" name="collectTitle" value="on" defaultChecked={settings.collectTitle}></s-checkbox>
            <s-checkbox label="Written review" name="collectBody" value="on" defaultChecked={settings.collectBody}></s-checkbox>
            <s-checkbox label="Customer email" name="collectEmail" value="on" defaultChecked={settings.collectEmail}></s-checkbox>
            <s-checkbox
              label="Photo reviews"
              name="collectPhoto"
              value="on"
              defaultChecked={settings.collectPhoto}
              details={data.mediaConfigured ? "Production object storage is connected." : "Media storage is not configured in this environment."}
            ></s-checkbox>
            <s-checkbox
              label="Video reviews"
              name="collectVideo"
              value="on"
              defaultChecked={settings.collectVideo}
              details={data.mediaConfigured ? "Videos upload directly to private object storage." : "Media storage is not configured in this environment."}
            ></s-checkbox>
            <s-checkbox label="Require email" name="requireEmail" value="on" defaultChecked={settings.requireEmail}></s-checkbox>
            <s-checkbox
              label="Auto-approve 5-star reviews"
              name="autoApproveFiveStar"
              value="on"
              defaultChecked={settings.autoApproveFiveStar}
              details="Only low-risk submissions can auto-publish. Manual moderation is still recommended."
            ></s-checkbox>

            <s-divider></s-divider>

            <s-checkbox
              label="Post-purchase review requests"
              name="reviewRequestsEnabled"
              value="on"
              defaultChecked={settings.reviewRequestsEnabled}
              details="Creates purchase-linked review requests after order fulfillment. Purchase-linked submissions can earn the Verified purchase badge."
            ></s-checkbox>

            <s-grid gridTemplateColumns="1fr 1fr" gap="base">
              <s-number-field
                label="Send delay after fulfillment (hours)"
                name="requestDelayHours"
                min={0}
                max={720}
                defaultValue={String(settings.requestDelayHours)}
              ></s-number-field>
              <s-number-field
                label="Review link expiry (days)"
                name="requestExpiryDays"
                min={3}
                max={90}
                defaultValue={String(settings.requestExpiryDays)}
              ></s-number-field>
            </s-grid>

            <s-button type="submit" variant="primary">Save collection settings</s-button>
          </s-stack>
        </Form>
      </s-section>

      <s-section heading="Request delivery">
        <s-grid gridTemplateColumns="repeat(4, minmax(0, 1fr))" gap="base">
          <s-box padding="base" border="base" borderRadius="base">
            <s-text color="subdued">Email delivery</s-text>
            <s-heading>{data.emailConfigured ? "Ready" : "Needs setup"}</s-heading>
          </s-box>
          <s-box padding="base" border="base" borderRadius="base">
            <s-text color="subdued">Queued</s-text>
            <s-heading>{String(data.pendingRequests)}</s-heading>
          </s-box>
          <s-box padding="base" border="base" borderRadius="base">
            <s-text color="subdued">Sent</s-text>
            <s-heading>{String(data.sentRequests)}</s-heading>
          </s-box>
          <s-box padding="base" border="base" borderRadius="base">
            <s-text color="subdued">Completed</s-text>
            <s-heading>{String(data.completedRequests)}</s-heading>
          </s-box>
        </s-grid>

        {!data.emailConfigured && (
          <s-banner tone="warning">
            Review-request email delivery will remain queued until RESEND_API_KEY
            and REVIEW_FROM_EMAIL are configured in production.
          </s-banner>
        )}
      </s-section>

      <s-section heading="Trust rules">
        <s-paragraph>
          The Verified purchase badge is only applied when a review is submitted
          through a valid purchase-linked request generated from a fulfilled Shopify
          order. Ordinary storefront submissions never receive the badge automatically.
        </s-paragraph>
      </s-section>
    </s-page>
  );
}
