import { verifySharedSecret } from "../lib/security.server";
import { importReviewCsv } from "../lib/review-import.server";

function authorized(request: Request) {
  const expected = process.env.NEXTPLAY_INTERNAL_KEY || "";
  const provided = request.headers.get("x-nextplay-key") || "";
  return verifySharedSecret(provided, expected);
}

export async function action({ request }: { request: Request }) {
  if (!authorized(request)) return Response.json({ error: "Unauthorized" }, { status: 401 });
  try {
    const body = await request.json();
    const csvText = typeof body.csvText === "string" ? body.csvText : "";
    const shop = typeof body.shop === "string" ? body.shop : "";
    const externalBatchId = typeof body.externalBatchId === "string" ? body.externalBatchId : "";
    if (!shop || !externalBatchId || !csvText) {
      return Response.json({ error: "shop, externalBatchId, and csvText are required" }, { status: 400 });
    }
    const result = await importReviewCsv({
      shop,
      filename: typeof body.filename === "string" ? body.filename : "nextplay-reviews.csv",
      csvText,
      externalBatchId,
      target: {
        productId: typeof body.productId === "string" ? body.productId : undefined,
        productHandle: typeof body.productHandle === "string" ? body.productHandle : undefined,
        productTitle: typeof body.productTitle === "string" ? body.productTitle : undefined,
        forceProductMapping: body.forceProductMapping !== false,
      },
    });
    return Response.json(result);
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : String(error) }, { status: 400 });
  }
}
