import { timingSafeEqual } from "node:crypto";

const PUBLIC_API_PATHS = new Set(["/health", "/health.txt", "/status"]);

function equalSecret(left, right) {
  const expected = Buffer.from(left);
  const provided = Buffer.from(right);
  return expected.length === provided.length && timingSafeEqual(expected, provided);
}

export function authorizeApiRequest({ path, configuredKey, providedKey }) {
  if (PUBLIC_API_PATHS.has(String(path || ""))) return { allowed: true };
  const expected = String(configuredKey || "");
  if (!expected) {
    return { allowed: false, status: 503, error: "access key is not configured" };
  }
  if (equalSecret(expected, String(providedKey || ""))) return { allowed: true };
  return { allowed: false, status: 401, error: "access key required" };
}
