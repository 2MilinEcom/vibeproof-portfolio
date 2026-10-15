import type { ActionFunctionArgs, LoaderFunctionArgs } from "react-router";
import { Form, useActionData, useLoaderData } from "react-router";

import prisma from "../db.server";
import { authenticate } from "../shopify.server";

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

type ProductsResponse = {
  data?: {
    products?: {
      nodes?: Array<{ id: string; title: string; handle: string }>;
    };
  };
};

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { admin, session } = await authenticate.admin(request);

  const [theme, overrides, response] = await Promise.all([
    prisma.widgetTheme.findUnique({ where: { shop: session.shop } }),
    prisma.productConfig.findMany({
      where: { shop: session.shop },
      orderBy: { updatedAt: "desc" },
      take: 50,
    }),
    admin.graphql(
      `#graphql
        query VibeProofProducts {
          products(first: 25, sortKey: TITLE) {
            nodes { id title handle }
          }
        }`,
    ),
  ]);

  const responseJson = (await response.json()) as ProductsResponse;

  return {
    theme: theme ?? defaultTheme,
    products: responseJson.data?.products?.nodes ?? [],
    overrides,
  };
};

export const action = async ({ request }: ActionFunctionArgs) => {
  const { session } = await authenticate.admin(request);
  const formData = await request.formData();
  const intent = formData.get("intent");

  if (intent === "save_theme") {
    const radiusValue = Number(formData.get("radius"));
    const radius = Number.isFinite(radiusValue)
      ? Math.max(0, Math.min(40, Math.round(radiusValue)))
      : 18;

    const data = {
      layout: String(formData.get("layout") || "SOCIAL_FEED"),
      heading: String(formData.get("heading") || "THE GIRLIES SAID IT BEST").slice(0, 80),
      accentColor: String(formData.get("accentColor") || "#111111"),
      backgroundColor: String(formData.get("backgroundColor") || "#FFFFFF"),
      textColor: String(formData.get("textColor") || "#111111"),
      borderColor: String(formData.get("borderColor") || "#E5E7EB"),
      radius,
      mediaRatio: String(formData.get("mediaRatio") || "4/5"),
      showVerified: formData.has("showVerified"),
      showHelpful: formData.has("showHelpful"),
      showMerchantReplies: formData.has("showMerchantReplies"),
      autoMatch: formData.has("autoMatch"),
    };

    await prisma.widgetTheme.upsert({
      where: { shop: session.shop },
      create: { shop: session.shop, ...data },
      update: data,
    });

    return { ok: true, message: "Storefront style saved." };
  }

  if (intent === "save_product") {
    const productId = formData.get("productId");
    const productHandle = formData.get("productHandle");
    const productTitle = formData.get("productTitle");

    if (
      typeof productId !== "string" ||
      typeof productHandle !== "string" ||
      typeof productTitle !== "string"
    ) {
      return { ok: false, message: "Missing product." };
    }

    const enabled = formData.has("enabled");
    const layoutOverride = String(formData.get("layoutOverride") || "").trim();
    const headingOverride = String(formData.get("headingOverride") || "").trim();
    const accentColorOverride = String(formData.get("accentColorOverride") || "").trim();

    await prisma.productConfig.upsert({
      where: { shop_productId: { shop: session.shop, productId } },
      create: {
        shop: session.shop,
        productId,
        productHandle,
        productTitle,
        enabled,
        layoutOverride: layoutOverride || null,
        headingOverride: headingOverride || null,
        accentColorOverride: accentColorOverride || null,
      },
      update: {
        productHandle,
        productTitle,
        enabled,
        layoutOverride: layoutOverride || null,
        headingOverride: headingOverride || null,
        accentColorOverride: accentColorOverride || null,
      },
    });

    return { ok: true, message: `Saved display settings for ${productTitle}.` };
  }

  return { ok: false, message: "Unknown action." };
};

export default function DisplayPage() {
  const { theme, products, overrides } = useLoaderData<typeof loader>();
  const actionData = useActionData<typeof action>();

  return (
    <s-page heading="Display">
      {actionData?.message && (
        <s-banner tone={actionData.ok ? "success" : "critical"}>{actionData.message}</s-banner>
      )}

      <s-section heading="Storefront review experience">
        <Form method="post">
          <input type="hidden" name="intent" value="save_theme" />
          <s-stack direction="block" gap="base">
            <s-grid gridTemplateColumns="1fr 1fr" gap="base">
              <s-select label="Layout" name="layout" value={theme.layout}>
                <s-option value="SOCIAL_FEED">Social feed</s-option>
                <s-option value="CLEAN_LIST">Clean list</s-option>
                <s-option value="REVIEW_WALL">Review wall</s-option>
                <s-option value="SPOTLIGHT">Spotlight</s-option>
                <s-option value="VIDEO_FIRST">Video first</s-option>
                <s-option value="COMPACT">Compact</s-option>
              </s-select>
              <s-text-field label="Section heading" name="heading" defaultValue={theme.heading}></s-text-field>
            </s-grid>

            <s-grid gridTemplateColumns="repeat(4, 1fr)" gap="base">
              <s-color-field label="Accent" name="accentColor" defaultValue={theme.accentColor}></s-color-field>
              <s-color-field label="Background" name="backgroundColor" defaultValue={theme.backgroundColor}></s-color-field>
              <s-color-field label="Text" name="textColor" defaultValue={theme.textColor}></s-color-field>
              <s-color-field label="Border" name="borderColor" defaultValue={theme.borderColor}></s-color-field>
            </s-grid>

            <s-grid gridTemplateColumns="1fr 1fr" gap="base">
              <s-number-field label="Corner radius" name="radius" min={0} max={40} defaultValue={String(theme.radius)}></s-number-field>
              <s-select label="Media ratio" name="mediaRatio" value={theme.mediaRatio}>
                <s-option value="4/5">Portrait 4:5</s-option>
                <s-option value="1/1">Square 1:1</s-option>
                <s-option value="9/16">Vertical 9:16</s-option>
                <s-option value="16/9">Landscape 16:9</s-option>
              </s-select>
            </s-grid>

            <s-checkbox label="Auto Match store theme" name="autoMatch" value="on" defaultChecked={theme.autoMatch}></s-checkbox>
            <s-checkbox label="Show verified purchase badge" name="showVerified" value="on" defaultChecked={theme.showVerified}></s-checkbox>
            <s-checkbox label="Show helpful actions" name="showHelpful" value="on" defaultChecked={theme.showHelpful}></s-checkbox>
            <s-checkbox label="Show merchant replies" name="showMerchantReplies" value="on" defaultChecked={theme.showMerchantReplies}></s-checkbox>

            <s-button type="submit" variant="primary">Save storefront style</s-button>
          </s-stack>
        </Form>
      </s-section>

      <s-section heading="Live style summary">
        <s-box padding="base" border="base" borderRadius="base" background="subdued">
          <s-stack direction="block" gap="base">
            <s-heading>{theme.heading}</s-heading>
            <s-text>{theme.layout.replaceAll("_", " ")} · {String(theme.radius)}px radius · {theme.mediaRatio} media</s-text>
            <s-stack direction="inline" gap="base">
              <s-badge tone={theme.showVerified ? "success" : "neutral"}>Verified {theme.showVerified ? "on" : "off"}</s-badge>
              <s-badge tone={theme.showHelpful ? "success" : "neutral"}>Helpful {theme.showHelpful ? "on" : "off"}</s-badge>
              <s-badge tone={theme.showMerchantReplies ? "success" : "neutral"}>Replies {theme.showMerchantReplies ? "on" : "off"}</s-badge>
            </s-stack>
          </s-stack>
        </s-box>
      </s-section>

      <s-section heading="Per-product overrides">
        <s-paragraph>
          Save an override for products that need a different layout, heading, or accent.
        </s-paragraph>

        {products.length === 0 ? (
          <s-text color="subdued">No products available.</s-text>
        ) : (
          <s-stack direction="block" gap="base">
            {products.map((product) => {
              const current = overrides.find((override) => override.productId === product.id);
              return (
                <Form method="post" key={product.id}>
                  <input type="hidden" name="intent" value="save_product" />
                  <input type="hidden" name="productId" value={product.id} />
                  <input type="hidden" name="productHandle" value={product.handle} />
                  <input type="hidden" name="productTitle" value={product.title} />

                  <s-box padding="base" border="base" borderRadius="base">
                    <s-stack direction="block" gap="base">
                      <s-heading>{product.title}</s-heading>
                      <s-checkbox label="Enable VibeProof" name="enabled" value="on" defaultChecked={current?.enabled ?? true}></s-checkbox>
                      <s-grid gridTemplateColumns="1fr 1fr 1fr auto" gap="base">
                        <s-select label="Layout override" name="layoutOverride" value={current?.layoutOverride ?? ""}>
                          <s-option value="">Use global layout</s-option>
                          <s-option value="SOCIAL_FEED">Social feed</s-option>
                          <s-option value="CLEAN_LIST">Clean list</s-option>
                          <s-option value="REVIEW_WALL">Review wall</s-option>
                          <s-option value="SPOTLIGHT">Spotlight</s-option>
                          <s-option value="VIDEO_FIRST">Video first</s-option>
                          <s-option value="COMPACT">Compact</s-option>
                        </s-select>
                        <s-text-field label="Heading override" name="headingOverride" defaultValue={current?.headingOverride ?? ""}></s-text-field>
                        <s-color-field label="Accent override" name="accentColorOverride" defaultValue={current?.accentColorOverride ?? theme.accentColor}></s-color-field>
                        <s-button type="submit" variant="secondary">Save</s-button>
                      </s-grid>
                    </s-stack>
                  </s-box>
                </Form>
              );
            })}
          </s-stack>
        )}
      </s-section>
    </s-page>
  );
}
