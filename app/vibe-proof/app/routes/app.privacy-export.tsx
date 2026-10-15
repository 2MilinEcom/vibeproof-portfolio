import type { LoaderFunctionArgs } from "react-router";
import prisma from "../db.server";
import { authenticate } from "../shopify.server";

// A resource route returns the attachment directly instead of rendering the dashboard.
export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { session } = await authenticate.admin(request);
  const url = new URL(request.url);
  const downloadId = url.searchParams.get("download");

  if (downloadId) {
    const item = await prisma.privacyRequest.findFirst({
      where: { id: downloadId, shop: session.shop },
    });
    if (!item) throw new Response("Not found", { status: 404 });
    return new Response(item.payloadJson || "{}", {
      headers: {
        "Content-Type": "application/json; charset=utf-8",
        "Content-Disposition": `attachment; filename="vibeproof-data-request-${item.requestId}.json"`,
      },
    });
  }

  throw new Response("Missing privacy request", { status: 400 });
};
