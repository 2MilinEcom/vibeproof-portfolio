import type { ActionFunctionArgs } from "react-router";
import { authenticate } from "../shopify.server";
import db from "../db.server";

export const action = async ({ request }: ActionFunctionArgs) => {
  const { shop, topic } = await authenticate.webhook(request);

  console.log(`Received ${topic} webhook for ${shop}`);

  // Shopify sends shop/redact after uninstall. Keep merchant/customer data until
  // that compliance event so stored media can be removed safely, but immediately
  // remove app sessions so the uninstalled shop cannot keep using admin access.
  await db.session.deleteMany({ where: { shop } });

  return new Response();
};
