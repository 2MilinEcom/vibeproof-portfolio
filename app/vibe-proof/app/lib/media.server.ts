import { createHash, createHmac, randomUUID } from "node:crypto";
import {
  ALLOWED_IMAGE_TYPES,
  ALLOWED_VIDEO_TYPES,
  MAX_IMAGE_BYTES,
  MAX_VIDEO_BYTES,
} from "./constants";

type S3Config = {
  endpoint: URL;
  accessKeyId: string;
  secretAccessKey: string;
  bucket: string;
  region: string;
};

function config(): S3Config | null {
  const endpoint = process.env.AWS_ENDPOINT_URL;
  const accessKeyId = process.env.AWS_ACCESS_KEY_ID;
  const secretAccessKey = process.env.AWS_SECRET_ACCESS_KEY;
  const bucket = process.env.AWS_S3_BUCKET_NAME;
  const region = process.env.AWS_DEFAULT_REGION || "auto";
  if (!endpoint || !accessKeyId || !secretAccessKey || !bucket) return null;
  return {
    endpoint: new URL(endpoint),
    accessKeyId,
    secretAccessKey,
    bucket,
    region,
  };
}

function hmac(key: Buffer | string, value: string) {
  return createHmac("sha256", key).update(value).digest();
}

function hexSha(value: string | Buffer) {
  return createHash("sha256").update(value).digest("hex");
}

function awsDate(date: Date) {
  return date.toISOString().replace(/[:-]|\.\d{3}/g, "");
}

function encodePath(key: string) {
  return key
    .split("/")
    .map((segment) => encodeURIComponent(segment))
    .join("/");
}

function signingKey(secret: string, date: string, region: string) {
  const dateKey = hmac(`AWS4${secret}`, date);
  const regionKey = hmac(dateKey, region);
  const serviceKey = hmac(regionKey, "s3");
  return hmac(serviceKey, "aws4_request");
}

function bucketBaseUrl() {
  const cfg = config();
  if (!cfg) throw new Error("Object storage is not configured.");
  const host = `${cfg.bucket}.${cfg.endpoint.host}`;
  return new URL(`${cfg.endpoint.protocol}//${host}/`);
}

function objectUrl(key: string) {
  const url = bucketBaseUrl();
  url.pathname = `/${encodePath(key)}`;
  return url;
}

export function mediaUploadsConfigured() {
  return Boolean(config());
}

export function validateUploadRequest(mimeType: string, bytes: number) {
  const isImage = (ALLOWED_IMAGE_TYPES as readonly string[]).includes(mimeType);
  const isVideo = (ALLOWED_VIDEO_TYPES as readonly string[]).includes(mimeType);
  if (!isImage && !isVideo) throw new Error("Unsupported media type.");
  const maxBytes = isImage ? MAX_IMAGE_BYTES : MAX_VIDEO_BYTES;
  if (!Number.isFinite(bytes) || bytes < 1 || bytes > maxBytes) {
    throw new Error(
      isImage
        ? "Images must be 10 MB or smaller."
        : "Videos must be 80 MB or smaller.",
    );
  }
  return { kind: isImage ? "IMAGE" : "VIDEO", maxBytes } as const;
}

export function createStorageKey(shop: string, mimeType: string) {
  const ext =
    mimeType === "image/jpeg"
      ? "jpg"
      : mimeType === "image/png"
        ? "png"
        : mimeType === "image/webp"
          ? "webp"
          : mimeType === "image/heic"
            ? "heic"
            : mimeType === "video/quicktime"
              ? "mov"
              : mimeType === "video/webm"
                ? "webm"
                : "mp4";
  const shopSlug = shop.replace(/[^a-z0-9-]/gi, "-").slice(0, 80);
  return `reviews/${shopSlug}/${randomUUID()}.${ext}`;
}

export function presignObject(
  method: "GET" | "PUT" | "DELETE",
  key: string,
  expiresSeconds = 3600,
) {
  const cfg = config();
  if (!cfg) throw new Error("Object storage is not configured.");

  const now = new Date();
  const amzDate = awsDate(now);
  const dateStamp = amzDate.slice(0, 8);
  const credentialScope = `${dateStamp}/${cfg.region}/s3/aws4_request`;
  const url = objectUrl(key);

  const params = new URLSearchParams({
    "X-Amz-Algorithm": "AWS4-HMAC-SHA256",
    "X-Amz-Credential": `${cfg.accessKeyId}/${credentialScope}`,
    "X-Amz-Date": amzDate,
    "X-Amz-Expires": String(Math.max(60, Math.min(604800, expiresSeconds))),
    "X-Amz-SignedHeaders": "host",
  });

  const canonicalQuery = [...params.entries()]
    .sort(([a, av], [b, bv]) => (a === b ? av.localeCompare(bv) : a.localeCompare(b)))
    .map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(v)}`)
    .join("&");

  const canonicalRequest = [
    method,
    url.pathname,
    canonicalQuery,
    `host:${url.host}\n`,
    "host",
    "UNSIGNED-PAYLOAD",
  ].join("\n");

  const stringToSign = [
    "AWS4-HMAC-SHA256",
    amzDate,
    credentialScope,
    hexSha(canonicalRequest),
  ].join("\n");

  const signature = createHmac(
    "sha256",
    signingKey(cfg.secretAccessKey, dateStamp, cfg.region),
  )
    .update(stringToSign)
    .digest("hex");

  params.set("X-Amz-Signature", signature);
  url.search = params.toString();
  return url.toString();
}

function signedHeadersRequest(
  method: string,
  url: URL,
  body: string,
  contentType: string,
) {
  const cfg = config();
  if (!cfg) throw new Error("Object storage is not configured.");

  const now = new Date();
  const amzDate = awsDate(now);
  const dateStamp = amzDate.slice(0, 8);
  const payloadHash = hexSha(body);
  const signedHeaders = "content-type;host;x-amz-content-sha256;x-amz-date";
  const canonicalQuery = url.searchParams
    .toString()
    .split("&")
    .filter(Boolean)
    .map((part) => {
      const [key, value = ""] = part.split("=");
      return [decodeURIComponent(key), decodeURIComponent(value)] as const;
    })
    .sort(([a, av], [b, bv]) => (a === b ? av.localeCompare(bv) : a.localeCompare(b)))
    .map(([key, value]) => `${encodeURIComponent(key)}=${encodeURIComponent(value)}`)
    .join("&");

  const canonicalHeaders = [
    `content-type:${contentType}`,
    `host:${url.host}`,
    `x-amz-content-sha256:${payloadHash}`,
    `x-amz-date:${amzDate}`,
    "",
  ].join("\n");

  const canonicalRequest = [
    method,
    url.pathname,
    canonicalQuery,
    canonicalHeaders,
    signedHeaders,
    payloadHash,
  ].join("\n");

  const scope = `${dateStamp}/${cfg.region}/s3/aws4_request`;
  const stringToSign = [
    "AWS4-HMAC-SHA256",
    amzDate,
    scope,
    hexSha(canonicalRequest),
  ].join("\n");

  const signature = createHmac(
    "sha256",
    signingKey(cfg.secretAccessKey, dateStamp, cfg.region),
  )
    .update(stringToSign)
    .digest("hex");

  return {
    "Content-Type": contentType,
    "x-amz-content-sha256": payloadHash,
    "x-amz-date": amzDate,
    Authorization:
      `AWS4-HMAC-SHA256 Credential=${cfg.accessKeyId}/${scope}, SignedHeaders=${signedHeaders}, Signature=${signature}`,
  };
}

let corsConfigured = false;

export async function ensureBucketCors() {
  if (corsConfigured || !config()) return;
  const url = bucketBaseUrl();
  url.search = "cors=";
  const body =
    '<?xml version="1.0" encoding="UTF-8"?>' +
    '<CORSConfiguration xmlns="http://s3.amazonaws.com/doc/2006-03-01/">' +
    "<CORSRule>" +
    "<AllowedOrigin>*</AllowedOrigin>" +
    "<AllowedMethod>PUT</AllowedMethod>" +
    "<AllowedHeader>*</AllowedHeader>" +
    "<ExposeHeader>ETag</ExposeHeader>" +
    "<MaxAgeSeconds>3600</MaxAgeSeconds>" +
    "</CORSRule>" +
    "</CORSConfiguration>";

  const response = await fetch(url, {
    method: "PUT",
    headers: signedHeadersRequest("PUT", url, body, "application/xml"),
    body,
  });

  if (!response.ok) {
    throw new Error(`Unable to configure media CORS (${response.status}).`);
  }
  corsConfigured = true;
}

export async function deleteStorageObject(key: string) {
  const response = await fetch(presignObject("DELETE", key, 300), {
    method: "DELETE",
  });
  return response.ok || response.status === 404;
}

export function validateStoredMedia(
  value: unknown,
): {
  type: "IMAGE" | "VIDEO";
  storageKey: string;
  mimeType?: string;
  bytes?: number;
  altText?: string;
  position: number;
}[] {
  if (!Array.isArray(value)) return [];

  return value.slice(0, 5).flatMap((item, position) => {
    if (!item || typeof item !== "object") return [];
    const record = item as Record<string, unknown>;
    const storageKey =
      typeof record.storageKey === "string" ? record.storageKey.trim() : "";
    if (!storageKey.startsWith("reviews/") || storageKey.includes("..")) return [];

    const mimeType =
      typeof record.mimeType === "string" ? record.mimeType : undefined;
    const bytes =
      typeof record.bytes === "number" && Number.isFinite(record.bytes)
        ? Math.round(record.bytes)
        : undefined;

    if (!mimeType || !bytes) return [];
    let valid;
    try {
      valid = validateUploadRequest(mimeType, bytes);
    } catch {
      return [];
    }

    return [{
      type: valid.kind,
      storageKey,
      mimeType,
      bytes,
      altText:
        typeof record.altText === "string"
          ? record.altText.slice(0, 240)
          : undefined,
      position,
    }];
  });
}
