export const loader = async () => {
  return Response.json(
    { ok: true, service: "vibeproof", timestamp: new Date().toISOString() },
    {
      headers: {
        "Cache-Control": "no-store",
        "X-Content-Type-Options": "nosniff",
      },
    },
  );
};

export default function HealthRoute() {
  return null;
}
