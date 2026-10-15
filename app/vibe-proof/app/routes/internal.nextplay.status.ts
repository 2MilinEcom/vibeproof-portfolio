import { verifySharedSecret } from "../lib/security.server";
function authorized(request: Request) {
  const expected = process.env.NEXTPLAY_INTERNAL_KEY || "";
  const provided = request.headers.get("x-nextplay-key") || "";
  return verifySharedSecret(provided, expected);
}

export async function loader({ request }: { request: Request }) {
  if (!authorized(request)) return Response.json({ error: "Unauthorized" }, { status: 401 });
  return Response.json({ ok: true, service: "vibeproof", nextplayIntegration: true });
}
