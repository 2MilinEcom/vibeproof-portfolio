import { randomBytes } from "node:crypto";
import type { ActionFunctionArgs } from "react-router";

import prisma from "../db.server";
import { encryptValue, sha256 } from "../lib/security.server";
import { authenticate } from "../shopify.server";

type FulfilledOrder = {
  id?: number | string;
  contact_email?: string | null;
  email?: string | null;
  line_items?: Array<{
    product_id?: number | string | null;
    variant_id?: number | string | null;
    title?: string | null;
    variant_title?: string | null;
  }>;
};

type ProductLookup = {
  data?: {
    product?: {
      id: string;
      title: string;
      handle: string;
    } | null;
  };
};

export const action = async ({ request }: ActionFunctionArgs) => {
  const { admin, payload, shop } = await authenticate.webhook(request);
  const settings = await prisma.collectionSettings.findUnique({
    where: { shop },
  });

  if (!settings?.reviewRequestsEnabled) return new Response();

  const order = payload as FulfilledOrder;
  const email = (order.contact_email || order.email || "").trim().toLowerCase();
  if (!email || !admin) return new Response();

  const sendAfter = new Date(
    Date.now() + settings.requestDelayHours * 60 * 60 * 1000,
  );
  const expiresAt = new Date(
    sendAfter.getTime() + settings.requestExpiryDays * 24 * 60 * 60 * 1000,
  );

  for (const item of order.line_items ?? []) {
    if (!item.product_id) continue;

    const productId = `gid://shopify/Product/${item.product_id}`;
    const response = await admin.graphql(
      `#graphql
        query VibeProofReviewRequestProduct($id: ID!) {
          product(id: $id) {
            id
            title
            handle
          }
        }`,
      { variables: { id: productId } },
    );

    const json = (await response.json()) as ProductLookup;
    const product = json.data?.product;
    if (!product) continue;

    const existing = await prisma.reviewRequest.findFirst({
      where: {
        shop,
        orderId: String(order.id ?? ""),
        productId: product.id,
      },
      select: { id: true },
    });
    if (existing) continue;

    const token = randomBytes(32).toString("base64url");
    await prisma.reviewRequest.create({
      data: {
        shop,
        tokenHash: sha256(token),
        tokenEncrypted: encryptValue(token),
        emailHash: sha256(email),
        emailEncrypted: encryptValue(email),
        orderId: String(order.id ?? ""),
        productId: product.id,
        productHandle: product.handle,
        productTitle: product.title,
        variantId: item.variant_id
          ? `gid://shopify/ProductVariant/${item.variant_id}`
          : null,
        variantTitle: item.variant_title || null,
        status: "PENDING",
        sendAfter,
        expiresAt,
      },
    });
  }

  return new Response();
};
