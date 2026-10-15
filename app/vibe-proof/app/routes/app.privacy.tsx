import { useState } from "react";
import { useAppBridge } from "@shopify/app-bridge-react";
import type { ActionFunctionArgs, LoaderFunctionArgs } from "react-router";
import { Form, useActionData, useLoaderData } from "react-router";

import prisma from "../db.server";
import { authenticate } from "../shopify.server";

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { session } = await authenticate.admin(request);
  const requests = await prisma.privacyRequest.findMany({
    where: { shop: session.shop },
    orderBy: { createdAt: "desc" },
    take: 100,
  });

  return {
    requests: requests.map((item) => ({
      ...item,
      createdAt: item.createdAt.toISOString(),
      completedAt: item.completedAt?.toISOString() ?? null,
    })),
  };
};

export const action = async ({ request }: ActionFunctionArgs) => {
  const { session } = await authenticate.admin(request);
  const formData = await request.formData();
  const requestId = String(formData.get("requestId") || "");
  if (!requestId) return { ok: false, message: "Missing privacy request." };

  const result = await prisma.privacyRequest.updateMany({
    where: { id: requestId, shop: session.shop },
    data: { status: "COMPLETED", completedAt: new Date() },
  });

  return result.count
    ? { ok: true, message: "Privacy request marked completed." }
    : { ok: false, message: "Privacy request not found." };
};

export default function PrivacyPage() {
  const { requests } = useLoaderData<typeof loader>();
  const actionData = useActionData<typeof action>();
  const shopify = useAppBridge();
  const [downloadError, setDownloadError] = useState<string | null>(null);
  const [downloadingId, setDownloadingId] = useState<string | null>(null);

  const downloadRequest = async (id: string, requestId: string) => {
    setDownloadError(null);
    setDownloadingId(id);
    try {
      const token = await shopify.idToken();
      const response = await fetch(`/app/privacy-export?download=${encodeURIComponent(id)}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!response.ok || !response.headers.get("Content-Type")?.includes("application/json")) {
        throw new Error("Could not download this privacy request. Please try again.");
      }
      const blobUrl = URL.createObjectURL(await response.blob());
      const link = document.createElement("a");
      link.href = blobUrl;
      link.target = "_blank";
      link.rel = "noopener";
      link.download = `vibeproof-data-request-${requestId}.json`;
      document.body.appendChild(link);
      link.click();
      link.remove();
      setTimeout(() => URL.revokeObjectURL(blobUrl), 1000);
    } catch (error) {
      setDownloadError(error instanceof Error ? error.message : "Could not download this privacy request.");
    } finally {
      setDownloadingId(null);
    }
  };

  return (
    <s-page heading="Privacy">
      {downloadError && <s-banner tone="critical">{downloadError}</s-banner>}
      {actionData?.message && (
        <s-banner tone={actionData.ok ? "success" : "critical"}>{actionData.message}</s-banner>
      )}

      <s-section heading="Shopify privacy requests">
        <s-paragraph>
          VibeProof records customer data requests so the merchant can provide the
          requested review data. Customer and shop redaction webhooks delete matching
          VibeProof data and stored media automatically.
        </s-paragraph>
      </s-section>

      <s-section heading="Data requests" padding="none">
        {requests.length === 0 ? (
          <s-box padding="base"><s-text color="subdued">No pending or historical data requests.</s-text></s-box>
        ) : (
          <s-table>
            <s-table-header-row>
              <s-table-header>Request</s-table-header>
              <s-table-header>Customer</s-table-header>
              <s-table-header>Status</s-table-header>
              <s-table-header>Actions</s-table-header>
            </s-table-header-row>
            <s-table-body>
              {requests.map((item) => (
                <s-table-row key={item.id}>
                  <s-table-cell>{item.requestId}</s-table-cell>
                  <s-table-cell>{item.customerEmail ?? "—"}</s-table-cell>
                  <s-table-cell>
                    <s-badge tone={item.status === "COMPLETED" ? "success" : "warning"}>{item.status}</s-badge>
                  </s-table-cell>
                  <s-table-cell>
                    <s-stack direction="inline" gap="small">
                      <s-button
                        type="button"
                        variant="secondary"
                        disabled={downloadingId === item.id ? true : undefined}
                        onClick={() => void downloadRequest(item.id, item.requestId)}
                      >Download JSON</s-button>
                      {item.status !== "COMPLETED" && (
                        <Form method="post">
                          <input type="hidden" name="requestId" value={item.id} />
                          <s-button type="submit" variant="secondary">Mark completed</s-button>
                        </Form>
                      )}
                    </s-stack>
                  </s-table-cell>
                </s-table-row>
              ))}
            </s-table-body>
          </s-table>
        )}
      </s-section>
    </s-page>
  );
}
