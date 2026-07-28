#!/usr/bin/env node

import path from "node:path";
import { fileURLToPath } from "node:url";
import { EVIDENCE_DEFAULTS_OPERATOR_CHECK } from "./ops-operator-checks.js";

const webappDir = path.resolve(fileURLToPath(new URL("..", import.meta.url)));
const evidenceDir = process.env.TRAVEL_EVIDENCE_DIR || "reports";

function evidencePath(fileName) {
  return path.join(evidenceDir, fileName);
}

const opsWorkflowsPath = process.env.TRAVEL_OPS_WORKFLOWS_PATH || evidencePath("ops-workflows.json");
const preflightPath = process.env.TRAVEL_PREFLIGHT_SUMMARY_PATH || evidencePath("preflight.json");
const handoffChecklistPath = process.env.TRAVEL_HANDOFF_CHECKLIST_PATH || evidencePath("handoff-checklist.md");
const handoffChecklistJsonPath = process.env.TRAVEL_HANDOFF_CHECKLIST_JSON_PATH || evidencePath("handoff-checklist.json");
const healthEvidencePath = process.env.TRAVEL_HEALTH_EVIDENCE_PATH || evidencePath("health-api-gate.txt");
const apiGateEvidencePath = process.env.TRAVEL_API_GATE_EVIDENCE_PATH || evidencePath("api-quality-gates.txt");
const backupManifestPath = process.env.TRAVEL_BACKUP_MANIFEST_PATH || evidencePath("storage-backup-manifest.json");
const backupFilePath = process.env.TRAVEL_BACKUP_FILE_PATH || evidencePath("travel-planner-backup.json");
const backupFileCheckPath = process.env.TRAVEL_BACKUP_FILE_CHECK_PATH || evidencePath("storage-backup-file-check.json");
const backupVerifyPath = process.env.TRAVEL_BACKUP_VERIFY_PATH || evidencePath("storage-backup-verify.json");
const backupVerifyManifestPath = process.env.TRAVEL_BACKUP_MANIFEST_VERIFY_PATH || backupManifestPath;
const evidencePathsPath = process.env.TRAVEL_EVIDENCE_PATHS_PATH || evidencePath("ops-evidence-paths.json");
const evidenceSummaryPath = process.env.TRAVEL_EVIDENCE_SUMMARY_PATH || evidencePath("ops-evidence-summary.json");
const evidenceSummarySchemaPath =
  process.env.TRAVEL_EVIDENCE_SUMMARY_SCHEMA_PATH ||
  evidencePath("ops-evidence-summary.schema.json");
const evidenceSummaryCheckPath =
  process.env.TRAVEL_EVIDENCE_SUMMARY_CHECK_PATH ||
  evidencePath("ops-evidence-summary-check.json");
const evidenceSummaryCheckSchemaPath =
  process.env.TRAVEL_EVIDENCE_SUMMARY_CHECK_SCHEMA_PATH ||
  evidencePath("ops-evidence-summary-check.schema.json");
const readinessReportPath = process.env.TRAVEL_READINESS_REPORT_PATH || evidencePath("ops-readiness-report.md");
const readinessReportJsonPath =
  process.env.TRAVEL_READINESS_REPORT_JSON_PATH || evidencePath("ops-readiness-report.json");
const readinessReportJsonSchemaPath =
  process.env.TRAVEL_READINESS_REPORT_JSON_SCHEMA_PATH || evidencePath("ops-readiness-report.schema.json");
const readinessReportJsonCheckPath =
  process.env.TRAVEL_READINESS_REPORT_JSON_CHECK_PATH || evidencePath("ops-readiness-report-check.json");
const readinessReportJsonCheckSchemaPath =
  process.env.TRAVEL_READINESS_REPORT_JSON_CHECK_SCHEMA_PATH ||
  evidencePath("ops-readiness-report-check.schema.json");
const readinessActionCodesPath =
  process.env.TRAVEL_READINESS_ACTION_CODES_PATH || evidencePath("ops-readiness-action-codes.json");
const readinessActionCodesSchemaPath =
  process.env.TRAVEL_READINESS_ACTION_CODES_SCHEMA_PATH ||
  evidencePath("ops-readiness-action-codes.schema.json");
const readinessActionCodesCheckPath =
  process.env.TRAVEL_READINESS_ACTION_CODES_CHECK_PATH ||
  evidencePath("ops-readiness-action-codes-check.json");
const readinessActionCodesCheckSchemaPath =
  process.env.TRAVEL_READINESS_ACTION_CODES_CHECK_SCHEMA_PATH ||
  evidencePath("ops-readiness-action-codes-check.schema.json");
const handoffReportPath = process.env.TRAVEL_HANDOFF_REPORT_PATH || evidencePath("handoff-report.md");
const handoffReportCheckPath = process.env.TRAVEL_HANDOFF_REPORT_CHECK_PATH || evidencePath("handoff-report-check.json");
const handoffReportCheckSchemaPath =
  process.env.TRAVEL_HANDOFF_REPORT_CHECK_SCHEMA_PATH ||
  evidencePath("handoff-report-check.schema.json");
const evidenceManifestPath = process.env.TRAVEL_EVIDENCE_MANIFEST_PATH || evidencePath("ops-evidence-manifest.json");

function quote(value) {
  return `'${String(value).replaceAll("'", "'\\''")}'`;
}

const lines = [
  "# Travel Planner operations evidence workflow",
  "",
  "# 1. From the webapp directory, preview paths, then capture checklist, command index, and grouped preflight evidence.",
  `cd ${quote(webappDir)}`,
  EVIDENCE_DEFAULTS_OPERATOR_CHECK.command,
  "npm run ops:evidence:paths",
  `TRAVEL_EVIDENCE_PATHS_PATH=${quote(evidencePathsPath)} npm run ops:evidence:paths:json:file`,
  `TRAVEL_HANDOFF_CHECKLIST_PATH=${quote(handoffChecklistPath)} npm run ops:handoff:checklist:file`,
  `TRAVEL_HANDOFF_CHECKLIST_JSON_PATH=${quote(handoffChecklistJsonPath)} npm run ops:handoff:checklist:json:file`,
  `TRAVEL_OPS_WORKFLOWS_PATH=${quote(opsWorkflowsPath)} npm run ops:workflows:json:file`,
  `TRAVEL_PREFLIGHT_SUMMARY_PATH=${quote(preflightPath)} npm run ops:preflight:summary`,
  "",
  "# 2. Capture health/API gate evidence when the server is running.",
  `TRAVEL_HEALTH_EVIDENCE_PATH=${quote(healthEvidencePath)} npm run ops:evidence:health:file`,
  `TRAVEL_API_GATE_EVIDENCE_PATH=${quote(apiGateEvidencePath)} npm run ops:evidence:api:file`,
  "",
  "# 3. Capture storage backup evidence before export or handoff.",
  `TRAVEL_BACKUP_MANIFEST_PATH=${quote(backupManifestPath)} npm run storage:backup:manifest`,
  `TRAVEL_BACKUP_FILE_PATH=${quote(backupFilePath)} npm run api:backup:file`,
  `TRAVEL_BACKUP_FILE_PATH=${quote(backupFilePath)} TRAVEL_BACKUP_FILE_CHECK_PATH=${quote(backupFileCheckPath)} npm run storage:backup:file-check`,
  "",
  "# 4. Capture verification evidence against the saved manifest.",
  `TRAVEL_BACKUP_MANIFEST_VERIFY_PATH=${quote(backupVerifyManifestPath)} TRAVEL_BACKUP_VERIFY_PATH=${quote(backupVerifyPath)} npm run storage:backup:verify`,
  "",
  "# 5. Generate readiness artifacts after all evidence files are present.",
  `TRAVEL_EVIDENCE_SUMMARY_PATH=${quote(evidenceSummaryPath)} npm run ops:evidence:summary:file`,
  `TRAVEL_EVIDENCE_SUMMARY_SCHEMA_PATH=${quote(evidenceSummarySchemaPath)} npm run ops:evidence:summary:schema:file`,
  `TRAVEL_EVIDENCE_SUMMARY_PATH=${quote(evidenceSummaryPath)} TRAVEL_EVIDENCE_SUMMARY_CHECK_PATH=${quote(evidenceSummaryCheckPath)} npm run ops:evidence:summary:check:file`,
  `TRAVEL_EVIDENCE_SUMMARY_CHECK_SCHEMA_PATH=${quote(evidenceSummaryCheckSchemaPath)} npm run ops:evidence:summary:check:schema:file`,
  `TRAVEL_EVIDENCE_SUMMARY_PATH=${quote(evidenceSummaryPath)} npm run ops:evidence:summary:check:gate`,
  `TRAVEL_READINESS_ACTION_CODES_PATH=${quote(readinessActionCodesPath)} npm run ops:readiness:action-codes:file`,
  `TRAVEL_READINESS_ACTION_CODES_SCHEMA_PATH=${quote(readinessActionCodesSchemaPath)} npm run ops:readiness:action-codes:schema:file`,
  `TRAVEL_READINESS_ACTION_CODES_PATH=${quote(readinessActionCodesPath)} TRAVEL_READINESS_ACTION_CODES_CHECK_PATH=${quote(readinessActionCodesCheckPath)} npm run ops:readiness:action-codes:check:file`,
  `TRAVEL_READINESS_ACTION_CODES_CHECK_SCHEMA_PATH=${quote(readinessActionCodesCheckSchemaPath)} npm run ops:readiness:action-codes:check:schema:file`,
  `TRAVEL_READINESS_ACTION_CODES_PATH=${quote(readinessActionCodesPath)} npm run ops:readiness:action-codes:check:gate`,
  `TRAVEL_EVIDENCE_SUMMARY_PATH=${quote(evidenceSummaryPath)} TRAVEL_EVIDENCE_SUMMARY_CHECK_PATH=${quote(evidenceSummaryCheckPath)} TRAVEL_READINESS_ACTION_CODES_CHECK_PATH=${quote(readinessActionCodesCheckPath)} TRAVEL_READINESS_REPORT_PATH=${quote(readinessReportPath)} npm run ops:readiness:report:file`,
  `TRAVEL_EVIDENCE_SUMMARY_PATH=${quote(evidenceSummaryPath)} TRAVEL_EVIDENCE_SUMMARY_CHECK_PATH=${quote(evidenceSummaryCheckPath)} TRAVEL_READINESS_ACTION_CODES_CHECK_PATH=${quote(readinessActionCodesCheckPath)} TRAVEL_READINESS_REPORT_JSON_PATH=${quote(readinessReportJsonPath)} npm run ops:readiness:report:json:file`,
  `TRAVEL_READINESS_REPORT_JSON_SCHEMA_PATH=${quote(readinessReportJsonSchemaPath)} npm run ops:readiness:report:json:schema:file`,
  `TRAVEL_READINESS_REPORT_JSON_PATH=${quote(readinessReportJsonPath)} TRAVEL_READINESS_REPORT_JSON_CHECK_PATH=${quote(readinessReportJsonCheckPath)} npm run ops:readiness:report:json:check:file`,
  `TRAVEL_READINESS_REPORT_JSON_CHECK_SCHEMA_PATH=${quote(readinessReportJsonCheckSchemaPath)} npm run ops:readiness:report:json:check:schema:file`,
  `TRAVEL_READINESS_REPORT_JSON_PATH=${quote(readinessReportJsonPath)} npm run ops:readiness:report:json:check:gate`,
  `TRAVEL_HANDOFF_REPORT_PATH=${quote(handoffReportPath)} npm run ops:handoff:report:file`,
  "#    Pause here: fill the handoff report before generating the final manifest.",
  "#    The manifest hashes the report file as it exists at generation time.",
  `TRAVEL_HANDOFF_REPORT_PATH=${quote(handoffReportPath)} TRAVEL_HANDOFF_REPORT_CHECK_PATH=${quote(handoffReportCheckPath)} npm run ops:handoff:report:check:file`,
  `TRAVEL_HANDOFF_REPORT_CHECK_SCHEMA_PATH=${quote(handoffReportCheckSchemaPath)} npm run ops:handoff:report:check:schema:file`,
  `TRAVEL_HANDOFF_REPORT_PATH=${quote(handoffReportPath)} npm run ops:handoff:report:check:gate`,
  `TRAVEL_READINESS_ACTION_CODES_PATH=${quote(readinessActionCodesPath)} npm run ops:readiness:action-codes:file`,
  `TRAVEL_READINESS_ACTION_CODES_SCHEMA_PATH=${quote(readinessActionCodesSchemaPath)} npm run ops:readiness:action-codes:schema:file`,
  `TRAVEL_READINESS_ACTION_CODES_PATH=${quote(readinessActionCodesPath)} TRAVEL_READINESS_ACTION_CODES_CHECK_PATH=${quote(readinessActionCodesCheckPath)} npm run ops:readiness:action-codes:check:file`,
  `TRAVEL_READINESS_ACTION_CODES_CHECK_SCHEMA_PATH=${quote(readinessActionCodesCheckSchemaPath)} npm run ops:readiness:action-codes:check:schema:file`,
  `TRAVEL_READINESS_ACTION_CODES_PATH=${quote(readinessActionCodesPath)} npm run ops:readiness:action-codes:check:gate`,
  `TRAVEL_EVIDENCE_SUMMARY_PATH=${quote(evidenceSummaryPath)} TRAVEL_EVIDENCE_SUMMARY_CHECK_PATH=${quote(evidenceSummaryCheckPath)} TRAVEL_HANDOFF_REPORT_CHECK_PATH=${quote(handoffReportCheckPath)} TRAVEL_READINESS_ACTION_CODES_CHECK_PATH=${quote(readinessActionCodesCheckPath)} TRAVEL_READINESS_REPORT_PATH=${quote(readinessReportPath)} npm run ops:readiness:report:file`,
  `TRAVEL_EVIDENCE_SUMMARY_PATH=${quote(evidenceSummaryPath)} TRAVEL_EVIDENCE_SUMMARY_CHECK_PATH=${quote(evidenceSummaryCheckPath)} TRAVEL_HANDOFF_REPORT_CHECK_PATH=${quote(handoffReportCheckPath)} TRAVEL_READINESS_ACTION_CODES_CHECK_PATH=${quote(readinessActionCodesCheckPath)} TRAVEL_READINESS_REPORT_JSON_PATH=${quote(readinessReportJsonPath)} npm run ops:readiness:report:json:file`,
  `TRAVEL_READINESS_REPORT_JSON_SCHEMA_PATH=${quote(readinessReportJsonSchemaPath)} npm run ops:readiness:report:json:schema:file`,
  `TRAVEL_READINESS_REPORT_JSON_PATH=${quote(readinessReportJsonPath)} TRAVEL_READINESS_REPORT_JSON_CHECK_PATH=${quote(readinessReportJsonCheckPath)} npm run ops:readiness:report:json:check:file`,
  `TRAVEL_READINESS_REPORT_JSON_CHECK_SCHEMA_PATH=${quote(readinessReportJsonCheckSchemaPath)} npm run ops:readiness:report:json:check:schema:file`,
  `TRAVEL_READINESS_REPORT_JSON_PATH=${quote(readinessReportJsonPath)} npm run ops:readiness:report:json:check:gate`,
  `TRAVEL_EVIDENCE_SUMMARY_PATH=${quote(evidenceSummaryPath)} TRAVEL_EVIDENCE_SUMMARY_CHECK_PATH=${quote(evidenceSummaryCheckPath)} TRAVEL_HANDOFF_REPORT_CHECK_PATH=${quote(handoffReportCheckPath)} TRAVEL_READINESS_ACTION_CODES_CHECK_PATH=${quote(readinessActionCodesCheckPath)} npm run ops:readiness:report:gate`,
  "",
  "# 6. Generate the final content-free evidence manifest after handoff checks are repaired.",
  "#    If the handoff report check fails, repair statusField.guidance, errorsBySection, missingFieldsBySection, fields[].reason, duplicate-* human-evidence diagnostics, readiness repairTargets.reasons/reasonCount/reasonLabels duplicate-human-evidence paired with positive duplicateFieldDiagnosticCount or absent when the count is zero, and readiness repairTargets.fieldMetadataAvailable/rejectedFields/rejectedFieldReasons/rejectedFieldReasonEntries/duplicateFieldDiagnostics/duplicateFieldDiagnosticCount before hashing final evidence.",
  "#    When adding duplicate diagnostic flags, update the shared readiness contract key list, count consistency, and workflow guidance together.",
  "#    When adding blocking or repair target reasons, update the shared readiness contract exports, label maps, enum/bound consumers, and workflow guidance together.",
  "#    When adding readiness check keys, update the shared readiness check key contract, required-present set, source path metadata, schema consumers, and workflow guidance together.",
  `TRAVEL_EVIDENCE_MANIFEST_PATH=${quote(evidenceManifestPath)} npm run ops:evidence:manifest:file`,
  "",
  "# Notes:",
  "# - This helper prints commands only; it does not run checks, download backups, restore, or mutate the DB.",
  "# - Workflow examples in ops-workflows output are templates; replace any <...> placeholder before running.",
  "# - Full backup JSON may contain travel content and should stay in a private backup location.",
  "# - Generated evidence files are ignored by git by default unless moved to an intentional artifact location.",
];

process.stdout.write(`${lines.join("\n")}\n`);
