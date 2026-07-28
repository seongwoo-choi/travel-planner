export const IOS_EVIDENCE_STALE_AFTER_ENV_VAR = "TRAVEL_IOS_EVIDENCE_STALE_AFTER_HOURS";
export const DEFAULT_IOS_EVIDENCE_STALE_AFTER_HOURS = 24;

function readNonNegativeInt(value, fallback) {
  const parsed = Number.parseInt(String(value ?? ""), 10);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : fallback;
}

export function buildIosEvidenceFreshnessPolicy(env = process.env) {
  return {
    staleAfterHours: Math.max(1, readNonNegativeInt(env[IOS_EVIDENCE_STALE_AFTER_ENV_VAR], DEFAULT_IOS_EVIDENCE_STALE_AFTER_HOURS)),
    staleAfterEnvVar: IOS_EVIDENCE_STALE_AFTER_ENV_VAR,
  };
}

export function buildIosEvidenceFreshnessSchema({ minimumStaleAfterHours = 1, staleAfterEnvVarSchema = { const: IOS_EVIDENCE_STALE_AFTER_ENV_VAR } } = {}) {
  return {
    type: "object",
    additionalProperties: false,
    required: [
      "staleAfterHours",
      "staleAfterEnvVar",
    ],
    properties: {
      staleAfterHours: {
        type: "integer",
        minimum: minimumStaleAfterHours,
      },
      staleAfterEnvVar: staleAfterEnvVarSchema,
    },
  };
}
