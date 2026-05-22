const DEFAULT_ORIGIN = "http://localhost:3000";

export function getAppOrigin() {
  const fromEnv = process.env.NEXT_PUBLIC_APP_ORIGIN || process.env.APP_ORIGIN;
  return (fromEnv || DEFAULT_ORIGIN).replace(/\/$/, "");
}

export function getArchiveEndpoint() {
  return `${getAppOrigin()}/api/archive`;
}

export function getBookmarkletEndpoint() {
  return `${getAppOrigin()}/api/bookmarklet`;
}

export function getCorsAllowlist() {
  return [
    getAppOrigin(),
    "https://www.instagram.com",
    "https://instagram.com"
  ];
}

export function corsHeaders(origin) {
  const allowlist = getCorsAllowlist();
  const allowed = allowlist.includes(origin) ? origin : allowlist[0];
  return {
    "Access-Control-Allow-Origin": allowed,
    "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, X-Instantiate-Source",
    "Access-Control-Max-Age": "86400",
    "Vary": "Origin"
  };
}

export const MAX_ARCHIVE_BYTES = 10 * 1024 * 1024;
