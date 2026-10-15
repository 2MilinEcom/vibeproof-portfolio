import { randomUUID } from "node:crypto";
import type { ActionFunctionArgs, LoaderFunctionArgs } from "react-router";
import { Form, useActionData, useLoaderData } from "react-router";

import prisma from "../db.server";
import { aiConfigured, generateAiText } from "../lib/ai.server";
import { GENUINE_SOURCES } from "../lib/constants";
import { authenticate } from "../shopify.server";

const genuineSource = { in: [...GENUINE_SOURCES] };

const demoBodies = [
  "The fit feels really flattering and easy to style.",
  "The fabric looks cute in photos and the silhouette is exactly what I wanted.",
  "I love how this looks dressed up or kept casual.",
  "The cut is super fun and the overall look feels very social-ready.",
  "This would be such a good going-out piece.",
  "The shape is really cute and the details stand out in person.",
];

const demoNames = ["Mia R.", "Ava K.", "Nia S.", "Sofia T.", "Jade M.", "Layla C."];

const presetMap = {
  SPOILD_NATIVE: {
    accentColor: "#111111",
    backgroundColor: "#FFFFFF",
    textColor: "#111111",
    borderColor: "#E5E7EB",
    heading: "THE GIRLIES SAID IT BEST",
    layout: "SOCIAL_FEED",
  },
  SOFT_GIRL: {
    accentColor: "#D96C9C",
    backgroundColor: "#FFF8FB",
    textColor: "#2A1D24",
    borderColor: "#F1D6E2",
    heading: "LOVE NOTES FROM THE GIRLIES",
    layout: "REVIEW_WALL",
  },
  AFTER_DARK: {
    accentColor: "#FFFFFF",
    backgroundColor: "#111111",
    textColor: "#FFFFFF",
    borderColor: "#333333",
    heading: "THE GIRLIES SAID IT BEST",
    layout: "SPOTLIGHT",
  },
} as const;

type PresetName = keyof typeof presetMap;

type ProductsResponse = {
  data?: {
    products?: {
      nodes?: Array<{ id: string; title: string; handle: string }>;
    };
  };
};

function fallbackPreset(prompt: string): PresetName {
  const value = prompt.toLowerCase();
  if (
    value.includes("pink") ||
    value.includes("soft") ||
    value.includes("girly") ||
    value.includes("romantic")
  ) {
    return "SOFT_GIRL";
  }
  if (
    value.includes("dark") ||
    value.includes("black") ||
    value.includes("night") ||
    value.includes("moody")
  ) {
    return "AFTER_DARK";
  }
  return "SPOILD_NATIVE";
}

async function classifyPreset(prompt: string): Promise<PresetName> {
  if (!aiConfigured()) return fallbackPreset(prompt);

  const result = await generateAiText({
    instructions:
      "You map a merchant design request to exactly one VibeProof preset. " +
      "Return only one token: SPOILD_NATIVE, SOFT_GIRL, or AFTER_DARK. " +
      "Do not return CSS, explanations, or any other text.",
    input: prompt.slice(0, 1000),
    maxOutputTokens: 20,
  });

  const token = result?.trim().toUpperCase();
  return token && token in presetMap
    ? (token as PresetName)
    : fallbackPreset(prompt);
}

function safeReplyFallback(tone: string) {
  return tone === "short"
    ? "Thanks so much for sharing this with us 💕"
    : tone === "helpful"
      ? "Thanks for sharing your experience. We really appreciate the feedback and the time you took to let us know."
      : "Aww thank you for sharing this with us 💕 We really appreciate the support and love hearing how it worked for you.";
}

async function draftMerchantReply(tone: string, excerpt: string) {
  if (!excerpt || !aiConfigured()) return safeReplyFallback(tone);

  return (
    (await generateAiText({
      instructions:
        "Draft a merchant reply to a customer review. Keep it warm, concise, and grounded only in the review text. " +
        "Never invent shipping, durability, manufacturing, medical, safety, product-results, or customer-history claims. " +
        "Do not imply a purchase is verified. Do not offer compensation. " +
        "Tone must be one of friendly, short, or helpful. Output only the reply.",
      input: `Tone: ${tone}\nCustomer review: ${excerpt.slice(0, 2000)}`,
      maxOutputTokens: tone === "short" ? 90 : 180,
    })) ?? safeReplyFallback(tone)
  );
}

function parseDemoLines(value: string | null, count: number) {
  if (!value) return [];
  try {
    const parsed = JSON.parse(value) as unknown;
    if (!Array.isArray(parsed)) return [];
    return parsed.slice(0, count).flatMap((item, index) => {
      if (!item || typeof item !== "object") return [];
      const row = item as Record<string, unknown>;
      const rating = Number(row.rating);
      const title = typeof row.title === "string" ? row.title.trim().slice(0, 80) : "";
      const body = typeof row.body === "string" ? row.body.trim().slice(0, 500) : "";
      if (!body || !Number.isInteger(rating) || rating < 3 || rating > 5) return [];
      return [{
        rating,
        title: title || (index % 2 === 0 ? "Cute fit" : "Love the look"),
        body,
      }];
    });
  } catch {
    return [];
  }
}

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { admin, session } = await authenticate.admin(request);

  const [demoCount, approvedCount, response] = await Promise.all([
    prisma.review.count({
      where: { shop: session.shop, source: "AI_DEMO" },
    }),
    prisma.review.count({
      where: {
        shop: session.shop,
        source: genuineSource,
        status: "APPROVED",
      },
    }),
    admin.graphql(
      `#graphql
        query VibeProofProducts {
          products(first: 25, sortKey: TITLE) {
            nodes {
              id
              title
              handle
            }
          }
        }`,
    ),
  ]);

  const responseJson = (await response.json()) as ProductsResponse;

  return {
    demoCount,
    approvedCount,
    aiReady: aiConfigured(),
    products: responseJson.data?.products?.nodes ?? [],
  };
};

export const action = async ({ request }: ActionFunctionArgs) => {
  const { session } = await authenticate.admin(request);
  const formData = await request.formData();
  const intent = formData.get("intent");

  if (intent === "generate_demo") {
    const productId = formData.get("productId");
    const productHandle = formData.get("productHandle");
    const productTitle = formData.get("productTitle");
    const requestedCount = Number(formData.get("count") || 6);
    const count = [6, 12, 24].includes(requestedCount) ? requestedCount : 6;

    if (
      typeof productId !== "string" ||
      typeof productHandle !== "string" ||
      typeof productTitle !== "string"
    ) {
      return { ok: false, message: "Choose a product." };
    }

    let generated: Array<{ rating: number; title: string; body: string }> = [];
    if (aiConfigured()) {
      const raw = await generateAiText({
        instructions:
          "Create safe fictional demo reviews for an ecommerce review-app preview. " +
          "They are visibly AI demo content, not real testimonials. Return only valid JSON as an array of objects " +
          'with keys "rating" (integer 3-5), "title", and "body". ' +
          "Avoid medical, safety, shipping, durability, manufacturing, guaranteed-results, or unverified factual claims. " +
          "Keep each body under 45 words and vary phrasing.",
        input: `Product name: ${productTitle.slice(0, 180)}\nCreate ${count} demo reviews.`,
        maxOutputTokens: Math.min(3000, count * 120),
      });
      generated = parseDemoLines(raw, count);
    }

    const batchId = randomUUID();
    const rows = Array.from({ length: count }, (_, index) => {
      const ai = generated[index];
      return {
        shop: session.shop,
        productId,
        productHandle,
        productTitle,
        rating: ai?.rating ?? 4 + (index % 2),
        title: ai?.title ?? (index % 2 === 0 ? "Cute fit" : "Love the look"),
        body: ai?.body ?? demoBodies[index % demoBodies.length],
        reviewerName: demoNames[index % demoNames.length],
        verifiedPurchase: false,
        status: "DEMO",
        source: "AI_DEMO",
        helpfulCount: 0,
        featured: false,
        demoBatchId: batchId,
      };
    });

    await prisma.review.createMany({ data: rows });

    return {
      ok: true,
      message: `Created ${count} AI preview reviews. They remain isolated from genuine ratings.`,
    };
  }

  if (intent === "clear_demo") {
    const result = await prisma.review.deleteMany({
      where: { shop: session.shop, source: "AI_DEMO" },
    });
    return {
      ok: true,
      message: `Removed ${result.count} AI preview reviews.`,
    };
  }

  if (intent === "apply_preset") {
    const presetName = formData.get("preset");
    if (typeof presetName !== "string" || !(presetName in presetMap)) {
      return { ok: false, message: "Unknown appearance preset." };
    }

    const preset = presetMap[presetName as PresetName];
    await prisma.widgetTheme.upsert({
      where: { shop: session.shop },
      create: { shop: session.shop, ...preset },
      update: preset,
    });

    return {
      ok: true,
      message: "Appearance preset applied. Review it in Display before publishing.",
    };
  }

  if (intent === "design_prompt") {
    const prompt = String(formData.get("designPrompt") || "").trim();
    if (!prompt) return { ok: false, message: "Enter a design direction." };

    const presetName = await classifyPreset(prompt);
    const preset = presetMap[presetName];

    await prisma.widgetTheme.upsert({
      where: { shop: session.shop },
      create: { shop: session.shop, ...preset },
      update: preset,
    });

    return {
      ok: true,
      message: `Design direction mapped to ${presetName.replaceAll("_", " ")}. Review it in Display before publishing.`,
    };
  }

  if (intent === "draft_reply") {
    const tone = String(formData.get("tone") || "friendly");
    const excerpt = String(formData.get("excerpt") || "").trim();
    const draft = await draftMerchantReply(tone, excerpt);

    return {
      ok: true,
      replyDraft: draft,
      message: aiConfigured()
        ? "AI reply draft generated. Edit it before posting."
        : "Safe local reply draft generated. Connect OpenAI to enable contextual drafting.",
    };
  }

  if (intent === "analyze_reviews") {
    const reviews = await prisma.review.findMany({
      where: {
        shop: session.shop,
        source: genuineSource,
        status: "APPROVED",
      },
      orderBy: { createdAt: "desc" },
      take: 100,
      select: {
        rating: true,
        title: true,
        body: true,
        productTitle: true,
        verifiedPurchase: true,
      },
    });

    if (reviews.length === 0) {
      return { ok: false, message: "Publish at least one genuine review first." };
    }

    if (!aiConfigured()) {
      const average =
        reviews.reduce((sum, review) => sum + review.rating, 0) / reviews.length;
      return {
        ok: true,
        analysis:
          `Local summary: ${reviews.length} published genuine review(s), averaging ${average.toFixed(1)} stars. ` +
          "Connect OpenAI for theme, sentiment, and recurring-feedback analysis.",
        message: "Local review summary generated.",
      };
    }

    const payload = reviews.map((review) => ({
      rating: review.rating,
      title: review.title,
      body: review.body,
      product: review.productTitle,
      verifiedPurchase: review.verifiedPurchase,
    }));

    const analysis =
      (await generateAiText({
        instructions:
          "Analyze genuine customer reviews for a merchant. Summarize only what the supplied reviews support. " +
          "Return concise sections named Overall sentiment, Recurring praise, Recurring friction, Product insights, and Suggested merchant actions. " +
          "Do not infer medical, safety, durability, shipping, manufacturing, or performance claims beyond the text. " +
          "Call out uncertainty when evidence is thin.",
        input: JSON.stringify(payload),
        maxOutputTokens: 900,
      })) ?? "No analysis was returned.";

    return { ok: true, analysis, message: "AI review analysis generated." };
  }

  return { ok: false, message: "Unknown AI Studio action." };
};

export default function AIStudioPage() {
  const { demoCount, approvedCount, aiReady, products } =
    useLoaderData<typeof loader>();
  const actionData = useActionData<typeof action>();

  return (
    <s-page heading="AI Studio">
      <s-section heading="AI status">
        <s-stack direction="inline" gap="base" alignItems="center">
          <s-badge tone={aiReady ? "success" : "warning"}>
            {aiReady ? "OpenAI connected" : "OpenAI setup needed"}
          </s-badge>
          <s-text>{String(approvedCount)} genuine published review(s)</s-text>
        </s-stack>
        {!aiReady && (
          <s-paragraph>
            VibeProof keeps safe deterministic fallbacks active until OPENAI_API_KEY
            is configured. Demo isolation and rating integrity do not depend on AI.
          </s-paragraph>
        )}
      </s-section>

      <s-section heading="Demo content safety">
        <s-stack direction="block" gap="base">
          <s-badge tone="info">AI Preview</s-badge>
          <s-paragraph>
            AI-generated samples use source AI_DEMO, never receive a verified badge,
            never contribute to genuine ratings or analytics, and are never returned
            by the public storefront reviews API.
          </s-paragraph>
          <s-text>Current AI preview reviews: {String(demoCount)}</s-text>
          {actionData?.message && (
            <s-banner tone={actionData.ok ? "success" : "critical"}>
              {actionData.message}
            </s-banner>
          )}
        </s-stack>
      </s-section>

      <s-section heading="Review intelligence">
        <s-paragraph>
          Analyze up to the latest 100 published genuine reviews for recurring praise,
          friction, product themes, and merchant actions.
        </s-paragraph>
        <Form method="post">
          <input type="hidden" name="intent" value="analyze_reviews" />
          <s-button type="submit" variant="primary">
            Analyze published reviews
          </s-button>
        </Form>
        {actionData?.analysis && (
          <s-box padding="base" border="base" borderRadius="base">
            <s-text>{actionData.analysis}</s-text>
          </s-box>
        )}
      </s-section>

      <s-section heading="Generate AI preview reviews">
        {products.length === 0 ? (
          <s-text color="subdued">No Shopify products available.</s-text>
        ) : (
          <s-stack direction="block" gap="base">
            {products.map((product) => (
              <Form method="post" key={product.id}>
                <input type="hidden" name="intent" value="generate_demo" />
                <input type="hidden" name="productId" value={product.id} />
                <input type="hidden" name="productHandle" value={product.handle} />
                <input type="hidden" name="productTitle" value={product.title} />

                <s-box padding="base" border="base" borderRadius="base">
                  <s-grid gridTemplateColumns="1fr 180px auto" gap="base" alignItems="end">
                    <s-stack direction="block" gap="small">
                      <s-heading>{product.title}</s-heading>
                      <s-text color="subdued">{product.handle}</s-text>
                    </s-stack>
                    <s-select label="Preview count" name="count" value="6">
                      <s-option value="6">6 samples</s-option>
                      <s-option value="12">12 samples</s-option>
                      <s-option value="24">24 samples</s-option>
                    </s-select>
                    <s-button type="submit" variant="secondary">
                      Generate preview
                    </s-button>
                  </s-grid>
                </s-box>
              </Form>
            ))}

            <Form method="post">
              <input type="hidden" name="intent" value="clear_demo" />
              <s-button type="submit" variant="secondary" tone="critical">
                Clear all AI preview content
              </s-button>
            </Form>
          </s-stack>
        )}
      </s-section>

      <s-section heading="Appearance suggestions">
        <s-paragraph>
          AI can choose only from VibeProof&apos;s constrained design presets. It never
          writes arbitrary storefront CSS.
        </s-paragraph>
        <s-stack direction="inline" gap="base">
          {(["SPOILD_NATIVE", "SOFT_GIRL", "AFTER_DARK"] as const).map((preset) => (
            <Form method="post" key={preset}>
              <input type="hidden" name="intent" value="apply_preset" />
              <input type="hidden" name="preset" value={preset} />
              <s-button type="submit" variant="secondary">
                {preset.replaceAll("_", " ")}
              </s-button>
            </Form>
          ))}
        </s-stack>
      </s-section>

      <s-section heading="Design prompt">
        <Form method="post">
          <input type="hidden" name="intent" value="design_prompt" />
          <s-grid gridTemplateColumns="1fr auto" gap="base" alignItems="end">
            <s-text-field
              label="Design direction"
              name="designPrompt"
              placeholder="Soft pink, romantic, social and elevated"
            ></s-text-field>
            <s-button type="submit" variant="secondary">
              Suggest appearance
            </s-button>
          </s-grid>
        </Form>
      </s-section>

      <s-section heading="Merchant reply draft">
        <Form method="post">
          <input type="hidden" name="intent" value="draft_reply" />
          <s-stack direction="block" gap="base">
            <s-select label="Tone" name="tone" value="friendly">
              <s-option value="friendly">Friendly</s-option>
              <s-option value="short">Short</s-option>
              <s-option value="helpful">Helpful</s-option>
            </s-select>
            <s-text-area
              label="Review excerpt"
              name="excerpt"
              rows={4}
              placeholder="Paste the review text you want to respond to."
            ></s-text-area>
            <s-button type="submit" variant="primary">Draft reply</s-button>
            {actionData?.replyDraft && (
              <s-box padding="base" border="base" borderRadius="base">
                <s-text>{actionData.replyDraft}</s-text>
              </s-box>
            )}
          </s-stack>
        </Form>
      </s-section>
    </s-page>
  );
}
