import { createGroundedTripPlan } from "./grounded-planner-service.js";
import { normalizeGroundedTripInput, renderGroundedTripPlan } from "./grounded-plan-output.js";

const SNAPSHOT_STATUSES = Object.freeze({
  places: ["verified", "degraded", "unavailable"],
  weather: ["verified", "degraded", "unavailable", "forecast_horizon", "partial_forecast_horizon"],
  timezone: ["verified", "degraded", "unavailable"],
  travel: ["verified", "degraded", "unavailable", "unverified"],
});

const ISO_TIMESTAMP = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:\d{2})$/;
const CREDENTIAL_QUERY_KEYS = /(?:^|[-_])(?:api[-_]?key|key|token|access[-_]?(?:token|id)|auth|authorization|credential|secret|signature|sig|password|passwd)(?:$|[-_])/i;

function requireSafeSourceUrls(value) {
  if (!value || typeof value !== "object") return;
  for (const [key, nested] of Object.entries(value)) {
    const isUrl = key === "sourceUrl"
      || (key === "source" && /^https?:\/\//i.test(String(nested || "")));
    if (isUrl && nested) {
      let url;
      try {
        url = new URL(String(nested));
      } catch {
        throw new TypeError("evidence sourceUrl must be an absolute HTTP(S) URL");
      }
      if (!["http:", "https:"].includes(url.protocol)) {
        throw new TypeError("evidence sourceUrl must be an absolute HTTP(S) URL");
      }
      const hasCredential = url.username
        || url.password
        || [...url.searchParams.keys()].some((name) => CREDENTIAL_QUERY_KEYS.test(name));
      if (hasCredential) throw new TypeError("evidence contains a credential-bearing source URL");
    }
    requireSafeSourceUrls(nested);
  }
}

function requireSnapshot(evidence, name, currentTime) {
  const snapshot = evidence[name];
  if (!snapshot || typeof snapshot !== "object" || Array.isArray(snapshot)) {
    throw new TypeError(`evidence.${name} is required`);
  }
  const status = String(snapshot.status || "").trim();
  if (!SNAPSHOT_STATUSES[name].includes(status)) {
    throw new TypeError(`evidence.${name}.status must be one of ${SNAPSHOT_STATUSES[name].join(", ")}`);
  }
  const fetchedAt = String(snapshot.fetchedAt || "").trim();
  const fetchedAtMs = Date.parse(fetchedAt);
  if (!ISO_TIMESTAMP.test(fetchedAt) || Number.isNaN(fetchedAtMs)) {
    throw new TypeError(`evidence.${name}.fetchedAt must be an ISO timestamp`);
  }
  const expiresAt = String(snapshot.expiresAt || "").trim();
  const expiresAtMs = Date.parse(expiresAt);
  if (!ISO_TIMESTAMP.test(expiresAt) || Number.isNaN(expiresAtMs)) {
    throw new TypeError(`evidence.${name}.expiresAt must be an ISO timestamp`);
  }
  if (expiresAtMs <= fetchedAtMs) {
    throw new RangeError(`evidence.${name}.expiresAt must be after fetchedAt`);
  }
  if (fetchedAtMs > currentTime + 5 * 60 * 1000) {
    throw new RangeError(`evidence.${name}.fetchedAt cannot be in the future`);
  }
  if (currentTime >= expiresAtMs) {
    throw new RangeError(`evidence.${name} expired at ${expiresAt}`);
  }
  if (name === "places" && (!Array.isArray(snapshot.searchCoverage) || snapshot.searchCoverage.length === 0)) {
    throw new TypeError("evidence.places.searchCoverage must be a non-empty array");
  }
  if (name === "places" && snapshot.searchCoverage.some((entry) =>
    !String(entry?.key || "").trim()
      || !["verified", "degraded", "unavailable"].includes(entry?.status))) {
    throw new TypeError("evidence.places.searchCoverage entries require a key and a recognized status");
  }
  return snapshot;
}

function collectorsFromEvidence(evidence, now) {
  if (!evidence || typeof evidence !== "object" || Array.isArray(evidence)) {
    throw new TypeError("evidence object is required");
  }
  requireSafeSourceUrls(evidence);
  const currentTime = now().getTime();
  if (!Number.isFinite(currentTime)) throw new TypeError("now must return a valid Date");
  const places = requireSnapshot(evidence, "places", currentTime);
  const weather = requireSnapshot(evidence, "weather", currentTime);
  const timezone = requireSnapshot(evidence, "timezone", currentTime);
  const travel = requireSnapshot(evidence, "travel", currentTime);
  return {
    places: { collect: async () => places },
    weather: {
      resolveTimezone: async () => timezone,
      collect: async () => weather,
    },
    travel: { collect: async () => travel },
  };
}

export async function generateGroundedPlan({
  input,
  evidence,
  now = () => new Date(),
}) {
  const trip = normalizeGroundedTripInput(input);
  const result = await createGroundedTripPlan({
    trip,
    collectors: collectorsFromEvidence(evidence, now),
    now,
  });
  return {
    model: "travel-planner-harness-v1",
    plan: renderGroundedTripPlan(result, trip),
    status: result.status,
    groundedPlan: result.plan,
    evidence: result.evidence,
  };
}
