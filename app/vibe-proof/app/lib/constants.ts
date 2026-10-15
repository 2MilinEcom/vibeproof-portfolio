export const GENUINE_SOURCES = ["CUSTOMER", "IMPORT", "MERCHANT_IMPORT"] as const;
export const INTERNAL_SOURCES = ["AI_DEMO", "TEST"] as const;
export const PUBLIC_REVIEW_STATUS = "APPROVED";
export const REVIEW_STATUSES = ["PENDING", "APPROVED", "REJECTED", "SPAM"] as const;

export const PUBLIC_REVIEW_WHERE = {
  status: PUBLIC_REVIEW_STATUS,
  source: { in: [...GENUINE_SOURCES] },
} as const;

export const MAX_REVIEW_MEDIA = 5;
export const MAX_IMAGE_BYTES = 10 * 1024 * 1024;
export const MAX_VIDEO_BYTES = 80 * 1024 * 1024;
export const ALLOWED_IMAGE_TYPES = ["image/jpeg", "image/png", "image/webp", "image/heic"] as const;
export const ALLOWED_VIDEO_TYPES = ["video/mp4", "video/quicktime", "video/webm"] as const;

export const PUBLIC_ANALYTICS_TYPES = new Set([
  "WIDGET_VIEW",
  "FEED_VIEW",
  "MEDIA_OPEN",
  "FORM_OPEN",
  "REVIEW_SUBMITTED",
  "HELPFUL_VOTE",
  "REVIEW_FILTER",
]);
