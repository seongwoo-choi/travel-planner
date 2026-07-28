#!/usr/bin/env node

import { createHash } from "node:crypto";
import { mkdirSync, renameSync, rmSync, statSync, writeFileSync } from "node:fs";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { EXPECTED_OPERATOR_CHECKS } from "./ops-operator-checks.js";

const args = process.argv.slice(2);
const evidenceDir = process.env.TRAVEL_EVIDENCE_DIR || "reports";
const strict = args.includes("--strict");
const manifestArg = args.find((arg) => arg.startsWith("--manifest="));
const manifestEnvArg = args.find((arg) => arg.startsWith("--manifest-env="));
const manifestDefaultEvidenceArg = args.find((arg) => arg.startsWith("--manifest-default-evidence="));
const manifestEnvName = manifestEnvArg ? manifestEnvArg.slice("--manifest-env=".length) : "";
const manifestDefaultEvidencePath = manifestDefaultEvidenceArg
  ? evidencePath(manifestDefaultEvidenceArg.slice("--manifest-default-evidence=".length))
  : evidencePath("ops-evidence-manifest.json");
const manifestPath = manifestArg
  ? manifestArg.slice("--manifest=".length)
  : manifestEnvName
    ? process.env[manifestEnvName] || process.env.TRAVEL_EVIDENCE_MANIFEST_VERIFY_PATH || process.env.TRAVEL_EVIDENCE_MANIFEST_PATH || manifestDefaultEvidencePath
    : process.env.TRAVEL_EVIDENCE_MANIFEST_VERIFY_PATH || process.env.TRAVEL_EVIDENCE_MANIFEST_PATH || manifestDefaultEvidencePath;
const outputArg = args.find((arg) => arg.startsWith("--output="));
const outputEnvArg = args.find((arg) => arg.startsWith("--output-env="));
const outputDefaultEvidenceArg = args.find((arg) => arg.startsWith("--output-default-evidence="));
const outputEnvName = outputEnvArg ? outputEnvArg.slice("--output-env=".length) : "";
const outputDefaultEvidencePath = outputDefaultEvidenceArg
  ? evidencePath(outputDefaultEvidenceArg.slice("--output-default-evidence=".length))
  : "";
const outputPath = outputArg
  ? outputArg.slice("--output=".length)
  : outputEnvName
    ? process.env[outputEnvName] || outputDefaultEvidencePath
    : outputDefaultEvidencePath;
const STRUCTURED_READINESS_METADATA = {
  evidenceSummary: {
    artifactKind: "contract-payload",
    target: "evidence-summary",
  },
  evidenceSummarySchema: {
    artifactKind: "contract-schema",
    target: "evidence-summary",
  },
  evidenceSummaryCheck: {
    artifactKind: "contract-check-result",
    target: "evidence-summary-check-result",
    validatesTarget: "evidence-summary",
  },
  evidenceSummaryCheckSchema: {
    artifactKind: "contract-check-schema",
    target: "evidence-summary-check-result",
    validatesTarget: "evidence-summary",
  },
  readinessReportJson: {
    artifactKind: "contract-payload",
    target: "readiness-report-json",
  },
  readinessReportJsonSchema: {
    artifactKind: "contract-schema",
    target: "readiness-report-json",
  },
  readinessReportJsonCheck: {
    artifactKind: "contract-check-result",
    target: "readiness-report-json-check-result",
    validatesTarget: "readiness-report-json",
    summaryRoles: ["readiness-json-check", "blocking-summary", "repair-summary"],
  },
  readinessReportJsonCheckSchema: {
    artifactKind: "contract-check-schema",
    target: "readiness-report-json-check-result",
    validatesTarget: "readiness-report-json",
  },
  readinessActionCodes: {
    artifactKind: "contract-catalog",
    target: "readiness-action-codes",
    validatesTarget: "readiness-report-json",
  },
  readinessActionCodesSchema: {
    artifactKind: "contract-catalog-schema",
    target: "readiness-action-codes",
    validatesTarget: "readiness-report-json",
  },
  readinessActionCodesCheck: {
    artifactKind: "contract-check-result",
    target: "readiness-action-codes-check-result",
    validatesTarget: "readiness-action-codes",
  },
  readinessActionCodesCheckSchema: {
    artifactKind: "contract-check-schema",
    target: "readiness-action-codes-check-result",
    validatesTarget: "readiness-action-codes",
  },
  handoffReportCheck: {
    artifactKind: "contract-check-result",
    target: "handoff-report-check-result",
    validatesTarget: "handoff-report",
    summaryRoles: ["repair-summary"],
  },
  handoffReportCheckSchema: {
    artifactKind: "contract-check-schema",
    target: "handoff-report-check-result",
    validatesTarget: "handoff-report",
  },
  incidentReportCheck: {
    artifactKind: "contract-check-result",
    target: "incident-report-check-result",
    validatesTarget: "incident-report",
    summaryRoles: ["repair-summary"],
  },
  incidentReportCheckSchema: {
    artifactKind: "contract-check-schema",
    target: "incident-report-check-result",
    validatesTarget: "incident-report",
  },
  evidenceManifestCheck: {
    artifactKind: "contract-check-result",
    target: "evidence-manifest-check-result",
    validatesTarget: "evidence-manifest",
  },
  evidenceManifestCheckSchema: {
    artifactKind: "contract-check-schema",
    target: "evidence-manifest-check-result",
    validatesTarget: "evidence-manifest",
  },
  iosInstallQuickstart: {
    artifactKind: "human-handoff",
    target: "ios-install-quickstart",
    summaryRoles: ["ios-install-quickstart"],
  },
  iosInstallQuickstartJson: {
    artifactKind: "contract-payload",
    target: "ios-install-quickstart",
    summaryRoles: ["ios-install-quickstart"],
  },
  iosInstallQuickstartCheck: {
    artifactKind: "contract-check-result",
    target: "ios-install-quickstart-check-result",
    validatesTarget: "ios-install-quickstart",
    summaryRoles: ["ios-install-quickstart-check"],
  },
  iosInstallQuickstartCheckSchema: {
    artifactKind: "contract-check-schema",
    target: "ios-install-quickstart-check-result",
    validatesTarget: "ios-install-quickstart-check-result",
  },
};
function evidencePath(fileName) {
  return path.join(evidenceDir, fileName);
}

function resolvePath(filePath) {
  return path.isAbsolute(filePath) ? filePath : path.resolve(process.cwd(), filePath);
}

function metadataErrors(expected) {
  const required = STRUCTURED_READINESS_METADATA[expected.id];

  if (!required) return [];

  return Object.entries(required)
    .filter(([key, value]) => !metadataValueMatches(expected[key], value))
    .map(([key]) => `metadata-${key}-mismatch`);
}

function metadataValueMatches(actual, required) {
  if (Array.isArray(required)) {
    return Array.isArray(actual) && actual.length === required.length && actual.every((value, index) => value === required[index]);
  }

  return actual === required;
}

function metadataSnapshot(expected) {
  const required = STRUCTURED_READINESS_METADATA[expected.id];

  if (!required) return null;

  const snapshot = {
    artifactKind: expected.artifactKind || null,
    target: expected.target || null,
    validatesTarget: expected.validatesTarget || null,
    required,
  };

  if (Array.isArray(required.summaryRoles)) {
    snapshot.summaryRoles = Array.isArray(expected.summaryRoles) ? expected.summaryRoles : null;
  }

  return snapshot;
}

function buildSummaryRoleArtifacts(manifestArtifacts) {
  return (manifestArtifacts || []).reduce((summaryRoleArtifacts, artifact) => {
    for (const role of artifact.summaryRoles || []) {
      if (!summaryRoleArtifacts[role]) summaryRoleArtifacts[role] = [];
      summaryRoleArtifacts[role].push(artifact.id);
    }

    return summaryRoleArtifacts;
  }, {});
}

function normalizeSummaryRoleArtifacts(summaryRoleArtifacts) {
  if (!summaryRoleArtifacts || typeof summaryRoleArtifacts !== "object" || Array.isArray(summaryRoleArtifacts)) {
    return null;
  }

  return Object.fromEntries(
    Object.entries(summaryRoleArtifacts)
      .map(([role, artifactIds]) => [role, Array.isArray(artifactIds) ? artifactIds.filter((id) => typeof id === "string").sort() : []])
      .sort(([left], [right]) => left.localeCompare(right)),
  );
}

function summaryRoleIndexShapeErrors(summaryRoleArtifacts) {
  if (!summaryRoleArtifacts || typeof summaryRoleArtifacts !== "object" || Array.isArray(summaryRoleArtifacts)) {
    return [];
  }

  return Object.entries(summaryRoleArtifacts)
    .filter(([, artifactIds]) => !Array.isArray(artifactIds) || artifactIds.some((id) => typeof id !== "string"))
    .map(([role]) => `summary-role-index-${role}-invalid`);
}

function summaryRoleIndexErrors(manifest) {
  const expected = normalizeSummaryRoleArtifacts(buildSummaryRoleArtifacts(manifest.artifacts || []));
  const actual = normalizeSummaryRoleArtifacts(manifest.summaryRoleArtifacts);

  if (!actual) return Object.keys(expected || {}).length > 0 ? ["summary-role-index-missing"] : [];

  const roles = Array.from(new Set([...Object.keys(expected || {}), ...Object.keys(actual)])).sort();
  return [
    ...summaryRoleIndexShapeErrors(manifest.summaryRoleArtifacts),
    ...roles
    .filter((role) => {
      const actualHasRole = Object.prototype.hasOwnProperty.call(actual, role);
      const expectedHasRole = Object.prototype.hasOwnProperty.call(expected, role);

      return actualHasRole !== expectedHasRole || JSON.stringify(actual[role] || []) !== JSON.stringify(expected[role] || []);
    })
    .map((role) => `summary-role-index-${role}-mismatch`),
  ];
}

function normalizeOperatorChecks(operatorChecks) {
  return Array.isArray(operatorChecks)
    ? operatorChecks.filter((check) => check && typeof check === "object" && !Array.isArray(check))
    : [];
}

function operatorCheckShapeErrors(operatorChecks) {
  const seenIds = new Set();
  const duplicateIds = new Set();
  const shapeErrors = operatorChecks.flatMap((check, index) => {
    if (!check || typeof check !== "object" || Array.isArray(check)) {
      return [`operator-check-${index}-invalid`];
    }

    if (typeof check.id !== "string" || !check.id) {
      return [`operator-check-${index}-id-invalid`];
    }

    if (seenIds.has(check.id)) {
      duplicateIds.add(check.id);
    }
    seenIds.add(check.id);

    return [];
  });

  return [
    ...shapeErrors,
    ...Array.from(duplicateIds).sort().map((id) => `operator-check-${id}-duplicate`),
  ];
}

function operatorCheckErrors(manifest) {
  if (!Array.isArray(manifest.operatorChecks)) return ["operator-checks-missing"];

  const checksById = new Map(normalizeOperatorChecks(manifest.operatorChecks).map((check) => [check.id, check]));
  return [
    ...operatorCheckShapeErrors(manifest.operatorChecks),
    ...Object.entries(EXPECTED_OPERATOR_CHECKS).flatMap(([id, required]) => {
      const check = checksById.get(id);
      if (!check) return [`operator-check-${id}-missing`];

      return Object.entries(required)
        .filter(([key, value]) => check[key] !== value)
        .map(([key]) => `operator-check-${id}-${key}-mismatch`);
    }),
  ];
}

function buildSummaryRoleIndexFailureDetails(expected, actual, failures) {
  return failures.map((failure) => {
    const match = failure.match(/^summary-role-index-(.+)-(mismatch|invalid)$/);
    const role = match ? match[1] : null;

    return {
      failure,
      role,
      expected: role ? expected[role] || [] : [],
      recorded: role ? actual[role] || [] : [],
      expectedRoles: Object.keys(expected).sort(),
      recordedRoles: Object.keys(actual).sort(),
    };
  });
}

function operatorCheckDetailValue(value) {
  if (value === null || typeof value === "undefined") return null;
  if (typeof value === "string") return value;
  if (typeof value === "number" || typeof value === "boolean") return String(value);

  try {
    return JSON.stringify(value);
  } catch {
    return String(value);
  }
}

function buildOperatorCheckFailureDetails(recordedChecks, failures) {
  const recordedCheckList = Array.isArray(recordedChecks) ? recordedChecks : [];
  const checksById = new Map(normalizeOperatorChecks(recordedChecks).map((check) => [check.id, check]));

  return failures.map((failure) => {
    const prefix = "operator-check-";
    const topLevelMissing = "operator-checks-missing";
    const missingSuffix = "-missing";
    const mismatchSuffix = "-mismatch";
    const duplicateSuffix = "-duplicate";
    const invalidSuffix = "-invalid";
    const idInvalidSuffix = "-id-invalid";
    let id = null;
    let field = null;
    let expected = null;
    let recorded = null;

    if (failure === topLevelMissing) {
      expected = "operatorChecks array";
      recorded = "missing";
    } else if (failure.startsWith(prefix) && failure.endsWith(idInvalidSuffix)) {
      const index = Number(failure.slice(prefix.length, -idInvalidSuffix.length));
      field = `operatorChecks[${index}].id`;
      expected = "string";
      recorded = operatorCheckDetailValue(recordedCheckList[index] && recordedCheckList[index].id);
    } else if (failure.startsWith(prefix) && failure.endsWith(invalidSuffix)) {
      const index = Number(failure.slice(prefix.length, -invalidSuffix.length));
      field = `operatorChecks[${index}]`;
      expected = "object";
      recorded = operatorCheckDetailValue(recordedCheckList[index]);
    } else if (failure.startsWith(prefix) && failure.endsWith(duplicateSuffix)) {
      id = failure.slice(prefix.length, -duplicateSuffix.length);
      field = "id";
      expected = "unique operator check id";
      recorded = id;
    } else if (failure.startsWith(prefix) && failure.endsWith(missingSuffix)) {
      id = failure.slice(prefix.length, -missingSuffix.length);
      expected = "present";
      recorded = "missing";
    } else if (failure.startsWith(prefix) && failure.endsWith(mismatchSuffix)) {
      const body = failure.slice(prefix.length, -mismatchSuffix.length);
      const parts = body.split("-");
      field = parts.pop() || null;
      id = parts.join("-");
      expected = operatorCheckDetailValue(EXPECTED_OPERATOR_CHECKS[id] && EXPECTED_OPERATOR_CHECKS[id][field]);
      recorded = operatorCheckDetailValue(checksById.get(id) && checksById.get(id)[field]);
    }

    return {
      failure,
      id,
      field,
      expected,
      recorded,
    };
  });
}

async function checkArtifact(expected) {
  const absolutePath = resolvePath(expected.path);
  const manifestMetadataErrors = metadataErrors(expected);
  try {
    const stat = statSync(absolutePath);
    if (!stat.isFile()) {
      const errors = expected.present ? ["not-a-file", ...manifestMetadataErrors] : manifestMetadataErrors;

      return {
        id: expected.id,
        label: expected.label,
        path: expected.path,
        status: errors.length === 0 ? "ok" : "failed",
        errors,
        expected: {
          present: expected.present,
          bytes: expected.bytes,
          sha256: expected.sha256,
          metadata: metadataSnapshot(expected),
        },
        actual: {
          present: false,
          bytes: 0,
          sha256: null,
        },
      };
    }

    const body = await readFile(absolutePath);
    const actual = {
      present: true,
      bytes: stat.size,
      sha256: createHash("sha256").update(body).digest("hex"),
      modifiedAt: stat.mtime.toISOString(),
    };
    const errors = [];

    errors.push(...manifestMetadataErrors);
    if (!expected.present) errors.push("presence-changed");
    if (expected.present && expected.bytes !== actual.bytes) errors.push("bytes-mismatch");
    if (expected.present && expected.sha256 !== actual.sha256) errors.push("sha256-mismatch");

    return {
      id: expected.id,
      label: expected.label,
      path: expected.path,
      status: errors.length === 0 ? "ok" : "failed",
      errors,
      expected: {
        present: expected.present,
        bytes: expected.bytes,
        sha256: expected.sha256,
        modifiedAt: expected.modifiedAt || null,
        metadata: metadataSnapshot(expected),
      },
      actual,
    };
  } catch (error) {
    if (error && error.code === "ENOENT") {
      const errors = expected.present ? ["missing", ...manifestMetadataErrors] : manifestMetadataErrors;

      return {
        id: expected.id,
        label: expected.label,
        path: expected.path,
        status: errors.length === 0 ? "ok" : "failed",
        errors,
        expected: {
          present: expected.present,
          bytes: expected.bytes,
          sha256: expected.sha256,
          modifiedAt: expected.modifiedAt || null,
          metadata: metadataSnapshot(expected),
        },
        actual: {
          present: false,
          bytes: 0,
          sha256: null,
          modifiedAt: null,
        },
      };
    }

    return {
      id: expected.id,
      label: expected.label,
      path: expected.path,
      status: "failed",
      errors: [error.message],
      expected: {
        present: expected.present,
        bytes: expected.bytes,
        sha256: expected.sha256,
        modifiedAt: expected.modifiedAt || null,
        metadata: metadataSnapshot(expected),
      },
      actual: {
        present: false,
        bytes: 0,
        sha256: null,
        modifiedAt: null,
      },
    };
  }
}

function writeOutput(filePath, body) {
  const resolvedPath = resolvePath(filePath);
  const tempPath = `${resolvedPath}.tmp-${process.pid}`;
  try {
    mkdirSync(path.dirname(resolvedPath), { recursive: true });
    writeFileSync(tempPath, body, "utf8");
    renameSync(tempPath, resolvedPath);
    console.error(`ops evidence manifest check wrote ${resolvedPath}`);
  } catch (error) {
    rmSync(tempPath, { force: true });
    console.error(`ops evidence manifest check failed: ${resolvedPath} (${error.message})`);
    process.exit(1);
  }
}

let manifest;
try {
  manifest = JSON.parse(await readFile(resolvePath(manifestPath), "utf8"));
} catch (error) {
  console.error(`ops evidence manifest check failed: cannot read manifest ${manifestPath} (${error.message})`);
  process.exit(1);
}

const checkedArtifacts = await Promise.all((manifest.artifacts || []).map(checkArtifact));
const summaryRoleArtifactsExpected = normalizeSummaryRoleArtifacts(buildSummaryRoleArtifacts(manifest.artifacts || [])) || {};
const summaryRoleArtifacts = normalizeSummaryRoleArtifacts(manifest.summaryRoleArtifacts) || {};
const summaryRoleIndexFailures = summaryRoleIndexErrors(manifest);
const summaryRoleIndexFailureDetails = buildSummaryRoleIndexFailureDetails(
  summaryRoleArtifactsExpected,
  summaryRoleArtifacts,
  summaryRoleIndexFailures,
);
const operatorCheckFailures = operatorCheckErrors(manifest);
const operatorCheckFailureDetails = buildOperatorCheckFailureDetails(
  manifest.operatorChecks,
  operatorCheckFailures,
);
const failures = checkedArtifacts.filter((artifact) => artifact.status !== "ok");
const failureIds = [
  ...failures.map((artifact) => artifact.id),
  ...(summaryRoleIndexFailures.length > 0 ? ["summaryRoleArtifacts"] : []),
  ...(operatorCheckFailures.length > 0 ? ["operatorChecks"] : []),
];
const metadataFailures = checkedArtifacts
  .filter((artifact) => artifact.errors.some((error) => error.startsWith("metadata-")))
  .map((artifact) => artifact.id);
const knownFailureErrors = ["missing", "not-a-file", "bytes-mismatch", "sha256-mismatch", "presence-changed"];
const failureKindArtifacts = {
  metadata: metadataFailures,
  summaryRoleIndex: summaryRoleIndexFailures.length > 0 ? ["summaryRoleArtifacts"] : [],
  operatorChecks: operatorCheckFailures.length > 0 ? ["operatorChecks"] : [],
  missing: checkedArtifacts.filter((artifact) => artifact.errors.includes("missing")).map((artifact) => artifact.id),
  notAFile: checkedArtifacts.filter((artifact) => artifact.errors.includes("not-a-file")).map((artifact) => artifact.id),
  bytes: checkedArtifacts.filter((artifact) => artifact.errors.includes("bytes-mismatch")).map((artifact) => artifact.id),
  sha256: checkedArtifacts.filter((artifact) => artifact.errors.includes("sha256-mismatch")).map((artifact) => artifact.id),
  presence: checkedArtifacts.filter((artifact) => artifact.errors.includes("presence-changed")).map((artifact) => artifact.id),
  other: checkedArtifacts
    .filter((artifact) =>
      artifact.errors.some((error) => !error.startsWith("metadata-") && !knownFailureErrors.includes(error)),
    )
    .map((artifact) => artifact.id),
};
const failureKinds = {
  metadata: failureKindArtifacts.metadata.length,
  summaryRoleIndex: failureKindArtifacts.summaryRoleIndex.length,
  operatorChecks: failureKindArtifacts.operatorChecks.length,
  missing: failureKindArtifacts.missing.length,
  notAFile: failureKindArtifacts.notAFile.length,
  bytes: failureKindArtifacts.bytes.length,
  sha256: failureKindArtifacts.sha256.length,
  presence: failureKindArtifacts.presence.length,
  other: failureKindArtifacts.other.length,
};
const body = `${JSON.stringify(
  {
    schemaVersion: 1,
    checkedAt: new Date().toISOString(),
    status: failureIds.length === 0 ? "ok" : "failed",
    manifestPath,
    manifestGeneratedAt: manifest.generatedAt || null,
    evidenceDir: manifest.evidenceDir || evidenceDir,
    operatorCheckFailures,
    operatorCheckFailureDetails,
    summaryRoleArtifactsExpected,
    summaryRoleArtifacts,
    summaryRoleIndexFailures,
    summaryRoleIndexFailureDetails,
    failures: failureIds,
    metadataFailures,
    failureKinds,
    failureKindArtifacts,
    artifacts: checkedArtifacts,
  },
  null,
  2,
)}\n`;

if (outputPath) writeOutput(outputPath, body);
process.stdout.write(body);

if (strict && failureIds.length > 0) {
  process.exitCode = 1;
}
