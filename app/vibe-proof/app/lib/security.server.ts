import {
  createCipheriv,
  createDecipheriv,
  createHash,
  createHmac,
  randomBytes,
  timingSafeEqual,
} from "node:crypto";
import prisma from "../db.server";

const secret = process.env.SHOPIFY_API_SECRET || "vibeproof-dev-secret";

export function sha256(value: string) {
  return createHash("sha256").update(value).digest("hex");
}

export function stableHash(value: string) {
  return createHmac("sha256", secret).update(value).digest("hex");
}

export function requestFingerprint(request: Request, shop: string) {
  const forwarded = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim();
  const ip = forwarded || request.headers.get("cf-connecting-ip") || "unknown";
  const ua = request.headers.get("user-agent") || "unknown";
  return stableHash(`${shop}|${ip}|${ua}`);
}

export function signValue(value: string) {
  return createHmac("sha256", secret).update(value).digest("hex");
}

export function verifySignature(value: string, signature: string) {
  const expected = signValue(value);
  const a = Buffer.from(expected);
  const b = Buffer.from(signature);
  return a.length === b.length && timingSafeEqual(a, b);
}

export function verifySharedSecret(provided: string, expected: string) {
  if (!provided || !expected) return false;
  const a = Buffer.from(provided);
  const b = Buffer.from(expected);
  return a.length === b.length && timingSafeEqual(a, b);
}

function encryptionKey() {
  return createHash("sha256").update(secret).digest();
}

export function encryptValue(value: string) {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", encryptionKey(), iv);
  const encrypted = Buffer.concat([
    cipher.update(value, "utf8"),
    cipher.final(),
  ]);
  const tag = cipher.getAuthTag();
  return Buffer.concat([iv, tag, encrypted]).toString("base64url");
}

export function decryptValue(value: string) {
  const payload = Buffer.from(value, "base64url");
  const iv = payload.subarray(0, 12);
  const tag = payload.subarray(12, 28);
  const encrypted = payload.subarray(28);
  const decipher = createDecipheriv("aes-256-gcm", encryptionKey(), iv);
  decipher.setAuthTag(tag);
  return Buffer.concat([
    decipher.update(encrypted),
    decipher.final(),
  ]).toString("utf8");
}

export async function rateLimit(
  key: string,
  limit: number,
  windowMs: number,
) {
  const now = new Date();
  const existing = await prisma.rateLimitBucket.findUnique({ where: { key } });

  if (!existing || existing.resetAt <= now) {
    const resetAt = new Date(now.getTime() + windowMs);
    await prisma.rateLimitBucket.upsert({
      where: { key },
      create: { key, count: 1, resetAt },
      update: { count: 1, resetAt },
    });
    return { allowed: true, remaining: Math.max(0, limit - 1), resetAt };
  }

  if (existing.count >= limit) {
    return { allowed: false, remaining: 0, resetAt: existing.resetAt };
  }

  const updated = await prisma.rateLimitBucket.update({
    where: { key },
    data: { count: { increment: 1 } },
  });

  return {
    allowed: updated.count <= limit,
    remaining: Math.max(0, limit - updated.count),
    resetAt: updated.resetAt,
  };
}
