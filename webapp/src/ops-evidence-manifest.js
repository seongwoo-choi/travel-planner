#!/usr/bin/env node

import { createHash } from "node:crypto";
import { mkdirSync, renameSync, rmSync, statSync, writeFileSync } from "node:fs";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { OPERATOR_CHECKS } from "./ops-operator-checks.js";

const args = process.argv.slice(2);
const evidenceDir = process.env.TRAVEL_EVIDENCE_DIR || "reports";
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

function evidencePath(fileName) {
  return path.join(evidenceDir, fileName);
}

function artifact(id, label, envName, defaultFile, metadata = {}) {
  const override = process.env[envName] || "";
  return {
    id,
    label,
    envName,
    source: override ? "override" : "default",
    path: override || evidencePath(defaultFile),
    ...metadata,
  };
}

const artifacts = [
  artifact("evidencePaths", "Evidence paths preview", "TRAVEL_EVIDENCE_PATHS_PATH", "ops-evidence-paths.json"),
  artifact("workflowIndex", "Workflow index", "TRAVEL_OPS_WORKFLOWS_PATH", "ops-workflows.json"),
  artifact("handoffChecklist", "Handoff checklist", "TRAVEL_HANDOFF_CHECKLIST_PATH", "handoff-checklist.md"),
  artifact("handoffChecklistJson", "Handoff checklist JSON", "TRAVEL_HANDOFF_CHECKLIST_JSON_PATH", "handoff-checklist.json"),
  artifact("preflight", "Preflight summary", "TRAVEL_PREFLIGHT_SUMMARY_PATH", "preflight.json"),
  artifact("preflightOffline", "Offline preflight summary", "TRAVEL_PREFLIGHT_SUMMARY_PATH", "preflight-offline.json"),
  artifact("healthGate", "Health gate evidence", "TRAVEL_HEALTH_EVIDENCE_PATH", "health-api-gate.txt"),
  artifact("protectedApiGate", "Protected API gate evidence", "TRAVEL_API_GATE_EVIDENCE_PATH", "api-quality-gates.txt"),
  artifact("iosInstallQuickstart", "iOS install quickstart", "TRAVEL_IOS_INSTALL_QUICKSTART_PATH", "ios-install-quickstart.txt", {
    artifactKind: "human-handoff",
    target: "ios-install-quickstart",
    summaryRoles: ["ios-install-quickstart"],
  }),
  artifact("iosInstallQuickstartJson", "iOS install quickstart JSON", "TRAVEL_IOS_INSTALL_QUICKSTART_JSON_PATH", "ios-install-quickstart.json", {
    artifactKind: "contract-payload",
    target: "ios-install-quickstart",
    summaryRoles: ["ios-install-quickstart"],
  }),
  artifact("iosInstallQuickstartCheck", "iOS install quickstart check", "TRAVEL_IOS_INSTALL_QUICKSTART_CHECK_PATH", "ios-install-quickstart-check.json", {
    artifactKind: "contract-check-result",
    target: "ios-install-quickstart-check-result",
    validatesTarget: "ios-install-quickstart",
    summaryRoles: ["ios-install-quickstart-check"],
  }),
  artifact("iosInstallQuickstartCheckSchema", "iOS install quickstart check-result schema", "TRAVEL_IOS_INSTALL_QUICKSTART_CHECK_SCHEMA_PATH", "ios-install-quickstart-check.schema.json", {
    artifactKind: "contract-check-schema",
    target: "ios-install-quickstart-check-result",
    validatesTarget: "ios-install-quickstart-check-result",
  }),
  artifact("iosInstallRunbook", "iOS install runbook", "TRAVEL_IOS_INSTALL_RUNBOOK_PATH", "ios-install-runbook.txt", {
    target: "ios-install-runbook",
    summaryRoles: ["ios-install-runbook"],
  }),
  artifact("iosInstallRunbookJson", "iOS install runbook JSON", "TRAVEL_IOS_INSTALL_RUNBOOK_JSON_PATH", "ios-install-runbook.json", {
    artifactKind: "contract-payload",
    target: "ios-install-runbook",
    summaryRoles: ["ios-install-runbook"],
  }),
  artifact("iosInstallRunbookSchema", "iOS install runbook JSON schema", "TRAVEL_IOS_INSTALL_RUNBOOK_SCHEMA_PATH", "ios-install-runbook.schema.json", {
    artifactKind: "contract-schema",
    target: "ios-install-runbook",
    validatesTarget: "ios-install-runbook",
  }),
  artifact("iosInstallRunbookCheck", "iOS install runbook check", "TRAVEL_IOS_INSTALL_RUNBOOK_CHECK_PATH", "ios-install-runbook-check.json", {
    artifactKind: "contract-check-result",
    target: "ios-install-runbook-check-result",
    validatesTarget: "ios-install-runbook",
    summaryRoles: ["ios-install-runbook-check"],
  }),
  artifact("iosInstallRunbookCheckSchema", "iOS install runbook check-result schema", "TRAVEL_IOS_INSTALL_RUNBOOK_CHECK_SCHEMA_PATH", "ios-install-runbook-check.schema.json", {
    artifactKind: "contract-check-schema",
    target: "ios-install-runbook-check-result",
    validatesTarget: "ios-install-runbook-check-result",
  }),
  artifact("iosInstallSessionSchema", "iOS install session schema", "TRAVEL_IOS_INSTALL_SESSION_SCHEMA_PATH", "ios-install-session.schema.json", {
    artifactKind: "contract-schema",
    target: "ios-install-session",
    validatesTarget: "ios-install-session",
  }),
  artifact("iosInstallSessionCheck", "iOS install session recovery check", "TRAVEL_IOS_INSTALL_SESSION_CHECK_PATH", "ios-install-session-check.json", {
    artifactKind: "contract-check-result",
    target: "ios-install-session-check-result",
    validatesTarget: "ios-install-session",
    summaryRoles: ["ios-install-session-check", "ios-install-session-recovery"],
  }),
  artifact("iosInstallCheck", "iOS install readiness check", "TRAVEL_IOS_INSTALL_CHECK_PATH", "ios-install-check.json", {
    artifactKind: "contract-check-result",
    target: "ios-install-check-result",
    summaryRoles: ["ios-install-readiness"],
  }),
  artifact("iosInstallCheckStrict", "iOS install strict readiness check", "TRAVEL_IOS_INSTALL_CHECK_STRICT_PATH", "ios-install-check.strict.json", {
    artifactKind: "contract-check-result",
    target: "ios-install-check-result",
    evidenceVariant: "strict",
    summaryRoles: ["ios-install-readiness", "ios-install-strict-readiness"],
  }),
  artifact("iosInstallCheckProof", "iOS install proof readiness check", "TRAVEL_IOS_INSTALL_CHECK_PROOF_PATH", "ios-install-check.proof.json", {
    artifactKind: "contract-check-result",
    target: "ios-install-check-result",
    evidenceVariant: "proof",
    summaryRoles: ["ios-install-readiness", "ios-install-proof-readiness"],
  }),
  artifact("iosInstallCheckSchema", "iOS install readiness check schema", "TRAVEL_IOS_INSTALL_CHECK_SCHEMA_PATH", "ios-install-check.schema.json", {
    artifactKind: "contract-check-schema",
    target: "ios-install-check-result",
    validatesTarget: "ios-install-check-result",
  }),
  artifact("iosLaunchProof", "iOS Home Screen launch proof", "TRAVEL_IOS_LAUNCH_PROOF_PATH", "ios-launch-proof.json", {
    artifactKind: "contract-payload",
    target: "ios-launch-proof",
    summaryRoles: ["ios-launch-proof"],
  }),
  artifact("iosLaunchProofCheck", "iOS Home Screen launch proof check", "TRAVEL_IOS_LAUNCH_PROOF_CHECK_PATH", "ios-launch-proof-check.json", {
    artifactKind: "contract-check-result",
    target: "ios-launch-proof-check-result",
    validatesTarget: "ios-launch-proof",
    summaryRoles: ["ios-launch-proof-check"],
  }),
  artifact("iosLaunchProofSchema", "iOS Home Screen launch proof schema", "TRAVEL_IOS_LAUNCH_PROOF_SCHEMA_PATH", "ios-launch-proof.schema.json", {
    artifactKind: "contract-schema",
    target: "ios-launch-proof",
    validatesTarget: "ios-launch-proof",
  }),
  artifact("iosInstallHandoff", "iOS install handoff", "TRAVEL_IOS_INSTALL_HANDOFF_PATH", "ios-install-handoff.md", {
    artifactKind: "human-handoff",
    target: "ios-install-handoff",
    validatesTarget: "ios-install-evidence-loop",
    summaryRoles: ["ios-install-handoff"],
  }),
  artifact("iosInstallNext", "iOS install next-step action", "TRAVEL_IOS_INSTALL_NEXT_PATH", "ios-install-next.json", {
    artifactKind: "contract-check-result",
    target: "ios-install-next-action",
    validatesTarget: "ios-install-evidence-loop",
    summaryRoles: ["ios-install-next"],
  }),
  artifact("iosInstallNextSchema", "iOS install next-step schema", "TRAVEL_IOS_INSTALL_NEXT_SCHEMA_PATH", "ios-install-next.schema.json", {
    artifactKind: "contract-schema",
    target: "ios-install-next-action",
    validatesTarget: "ios-install-next-action",
  }),
  artifact("iosInstallSummary", "iOS install completion summary", "TRAVEL_IOS_INSTALL_SUMMARY_PATH", "ios-install-summary.json", {
    artifactKind: "contract-check-result",
    target: "ios-install-completion-summary",
    validatesTarget: "ios-install-evidence-loop",
    summaryRoles: ["ios-install-summary"],
  }),
  artifact("iosInstallSummarySchema", "iOS install completion summary schema", "TRAVEL_IOS_INSTALL_SUMMARY_SCHEMA_PATH", "ios-install-summary.schema.json", {
    artifactKind: "contract-check-schema",
    target: "ios-install-completion-summary",
    validatesTarget: "ios-install-completion-summary",
  }),
  artifact("iosInstallSummaryCheck", "iOS install completion summary check", "TRAVEL_IOS_INSTALL_SUMMARY_CHECK_PATH", "ios-install-summary-check.json", {
    artifactKind: "contract-check-result",
    target: "ios-install-completion-summary-check-result",
    validatesTarget: "ios-install-completion-summary",
    summaryRoles: ["ios-install-summary-check"],
  }),
  artifact("backupFile", "Backup file", "TRAVEL_BACKUP_FILE_PATH", "travel-planner-backup.json"),
  artifact("backupFileCheck", "Backup file check", "TRAVEL_BACKUP_FILE_CHECK_PATH", "storage-backup-file-check.json"),
  artifact("backupManifest", "Backup manifest", "TRAVEL_BACKUP_MANIFEST_PATH", "storage-backup-manifest.json"),
  artifact("backupManifestVerify", "Backup manifest for verify", "TRAVEL_BACKUP_MANIFEST_VERIFY_PATH", "storage-backup-manifest.json"),
  artifact("backupVerify", "Backup verification", "TRAVEL_BACKUP_VERIFY_PATH", "storage-backup-verify.json"),
  artifact("evidenceSummary", "Evidence summary", "TRAVEL_EVIDENCE_SUMMARY_PATH", "ops-evidence-summary.json", {
    artifactKind: "contract-payload",
    target: "evidence-summary",
  }),
  artifact("evidenceSummarySchema", "Evidence summary schema", "TRAVEL_EVIDENCE_SUMMARY_SCHEMA_PATH", "ops-evidence-summary.schema.json", {
    artifactKind: "contract-schema",
    target: "evidence-summary",
  }),
  artifact("evidenceSummaryCheck", "Evidence summary check", "TRAVEL_EVIDENCE_SUMMARY_CHECK_PATH", "ops-evidence-summary-check.json", {
    artifactKind: "contract-check-result",
    target: "evidence-summary-check-result",
    validatesTarget: "evidence-summary",
  }),
  artifact("evidenceSummaryCheckSchema", "Evidence summary check-result schema", "TRAVEL_EVIDENCE_SUMMARY_CHECK_SCHEMA_PATH", "ops-evidence-summary-check.schema.json", {
    artifactKind: "contract-check-schema",
    target: "evidence-summary-check-result",
    validatesTarget: "evidence-summary",
  }),
  artifact("readinessReport", "Readiness report", "TRAVEL_READINESS_REPORT_PATH", "ops-readiness-report.md"),
  artifact("readinessReportJson", "Readiness report JSON", "TRAVEL_READINESS_REPORT_JSON_PATH", "ops-readiness-report.json", {
    artifactKind: "contract-payload",
    target: "readiness-report-json",
  }),
  artifact("readinessReportJsonSchema", "Readiness report JSON schema", "TRAVEL_READINESS_REPORT_JSON_SCHEMA_PATH", "ops-readiness-report.schema.json", {
    artifactKind: "contract-schema",
    target: "readiness-report-json",
  }),
  artifact("readinessReportJsonCheck", "Readiness report JSON check, blocking summary, and repair summary", "TRAVEL_READINESS_REPORT_JSON_CHECK_PATH", "ops-readiness-report-check.json", {
    artifactKind: "contract-check-result",
    target: "readiness-report-json-check-result",
    validatesTarget: "readiness-report-json",
    summaryRoles: ["readiness-json-check", "blocking-summary", "repair-summary"],
  }),
  artifact("readinessReportJsonCheckSchema", "Readiness report JSON check schema", "TRAVEL_READINESS_REPORT_JSON_CHECK_SCHEMA_PATH", "ops-readiness-report-check.schema.json", {
    artifactKind: "contract-check-schema",
    target: "readiness-report-json-check-result",
    validatesTarget: "readiness-report-json",
  }),
  artifact("readinessActionCodes", "Readiness action-code catalog", "TRAVEL_READINESS_ACTION_CODES_PATH", "ops-readiness-action-codes.json", {
    artifactKind: "contract-catalog",
    target: "readiness-action-codes",
    validatesTarget: "readiness-report-json",
  }),
  artifact("readinessActionCodesSchema", "Readiness action-code catalog schema", "TRAVEL_READINESS_ACTION_CODES_SCHEMA_PATH", "ops-readiness-action-codes.schema.json", {
    artifactKind: "contract-catalog-schema",
    target: "readiness-action-codes",
    validatesTarget: "readiness-report-json",
  }),
  artifact("readinessActionCodesCheck", "Readiness action-code catalog check", "TRAVEL_READINESS_ACTION_CODES_CHECK_PATH", "ops-readiness-action-codes-check.json", {
    artifactKind: "contract-check-result",
    target: "readiness-action-codes-check-result",
    validatesTarget: "readiness-action-codes",
  }),
  artifact("readinessActionCodesCheckSchema", "Readiness action-code catalog check-result schema", "TRAVEL_READINESS_ACTION_CODES_CHECK_SCHEMA_PATH", "ops-readiness-action-codes-check.schema.json", {
    artifactKind: "contract-check-schema",
    target: "readiness-action-codes-check-result",
    validatesTarget: "readiness-action-codes",
  }),
  artifact("handoffReport", "Handoff report", "TRAVEL_HANDOFF_REPORT_PATH", "handoff-report.md"),
  artifact("handoffReportCheck", "Handoff report check and repair summary", "TRAVEL_HANDOFF_REPORT_CHECK_PATH", "handoff-report-check.json", {
    artifactKind: "contract-check-result",
    target: "handoff-report-check-result",
    validatesTarget: "handoff-report",
    summaryRoles: ["repair-summary"],
  }),
  artifact("handoffReportCheckSchema", "Handoff report check-result schema", "TRAVEL_HANDOFF_REPORT_CHECK_SCHEMA_PATH", "handoff-report-check.schema.json", {
    artifactKind: "contract-check-schema",
    target: "handoff-report-check-result",
    validatesTarget: "handoff-report",
  }),
  artifact("incidentReport", "Incident report", "TRAVEL_INCIDENT_REPORT_PATH", "incident-report.md"),
  artifact("incidentReportCheck", "Incident report check and repair summary", "TRAVEL_INCIDENT_REPORT_CHECK_PATH", "incident-report-check.json", {
    artifactKind: "contract-check-result",
    target: "incident-report-check-result",
    validatesTarget: "incident-report",
    summaryRoles: ["repair-summary"],
  }),
  artifact("incidentReportCheckSchema", "Incident report check-result schema", "TRAVEL_INCIDENT_REPORT_CHECK_SCHEMA_PATH", "incident-report-check.schema.json", {
    artifactKind: "contract-check-schema",
    target: "incident-report-check-result",
    validatesTarget: "incident-report",
  }),
];

const operatorChecks = OPERATOR_CHECKS;

async function inspectArtifact(item) {
  const absolutePath = path.resolve(process.cwd(), item.path);
  try {
    const stat = statSync(absolutePath);
    if (!stat.isFile()) {
      return {
        ...item,
        present: false,
        bytes: 0,
        sha256: null,
        modifiedAt: null,
        error: "not-a-file",
      };
    }

    const body = await readFile(absolutePath);
    return {
      ...item,
      present: true,
      bytes: stat.size,
      sha256: createHash("sha256").update(body).digest("hex"),
      modifiedAt: stat.mtime.toISOString(),
      error: null,
    };
  } catch (error) {
    if (error && error.code === "ENOENT") {
      return {
        ...item,
        present: false,
        bytes: 0,
        sha256: null,
        modifiedAt: null,
        error: null,
      };
    }

    return {
      ...item,
      present: false,
      bytes: 0,
      sha256: null,
      modifiedAt: null,
      error: error.message,
    };
  }
}

function writeOutput(filePath, body) {
  const resolvedPath = path.resolve(process.cwd(), filePath);
  const tempPath = `${resolvedPath}.tmp-${process.pid}`;
  try {
    mkdirSync(path.dirname(resolvedPath), { recursive: true });
    writeFileSync(tempPath, body, "utf8");
    renameSync(tempPath, resolvedPath);
    console.error(`ops evidence manifest wrote ${resolvedPath}`);
  } catch (error) {
    rmSync(tempPath, { force: true });
    console.error(`ops evidence manifest failed: ${resolvedPath} (${error.message})`);
    process.exit(1);
  }
}

function buildSummaryRoleArtifacts(inspectedArtifacts) {
  const roleIndex = inspectedArtifacts.reduce((summaryRoleArtifacts, artifact) => {
    for (const role of artifact.summaryRoles || []) {
      if (!summaryRoleArtifacts[role]) summaryRoleArtifacts[role] = [];
      summaryRoleArtifacts[role].push(artifact.id);
    }

    return summaryRoleArtifacts;
  }, {});

  return Object.fromEntries(
    Object.entries(roleIndex)
      .map(([role, artifactIds]) => [role, artifactIds.slice().sort()])
      .sort(([left], [right]) => left.localeCompare(right)),
  );
}

const inspectedArtifacts = await Promise.all(artifacts.map(inspectArtifact));
const body = `${JSON.stringify(
  {
    schemaVersion: 1,
    generatedAt: new Date().toISOString(),
    evidenceDir,
    operatorChecks,
    summaryRoleArtifacts: buildSummaryRoleArtifacts(inspectedArtifacts),
    artifacts: inspectedArtifacts,
  },
  null,
  2,
)}\n`;

if (outputPath) writeOutput(outputPath, body);
process.stdout.write(body);
