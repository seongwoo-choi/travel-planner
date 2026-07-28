#!/usr/bin/env node

import path from "node:path";
import { fileURLToPath } from "node:url";

const webappDir = path.resolve(fileURLToPath(new URL("..", import.meta.url)));
const evidenceDir = process.env.TRAVEL_EVIDENCE_DIR || "reports";

function evidencePath(fileName) {
  return path.join(evidenceDir, fileName);
}

function quote(value) {
  return `'${String(value).replaceAll("'", "'\\''")}'`;
}

const evidenceSummaryPath = process.env.TRAVEL_EVIDENCE_SUMMARY_PATH || evidencePath("ops-evidence-summary.json");
const evidenceSummaryCheckPath =
  process.env.TRAVEL_EVIDENCE_SUMMARY_CHECK_PATH ||
  evidencePath("ops-evidence-summary-check.json");
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
const handoffReportCheckPath =
  process.env.TRAVEL_HANDOFF_REPORT_CHECK_PATH || evidencePath("handoff-report-check.json");
const handoffReportCheckSchemaPath =
  process.env.TRAVEL_HANDOFF_REPORT_CHECK_SCHEMA_PATH ||
  evidencePath("handoff-report-check.schema.json");
const incidentReportPath = process.env.TRAVEL_INCIDENT_REPORT_PATH || evidencePath("incident-report.md");
const incidentReportCheckPath =
  process.env.TRAVEL_INCIDENT_REPORT_CHECK_PATH || evidencePath("incident-report-check.json");
const incidentReportCheckSchemaPath =
  process.env.TRAVEL_INCIDENT_REPORT_CHECK_SCHEMA_PATH ||
  evidencePath("incident-report-check.schema.json");
const evidenceManifestPath =
  process.env.TRAVEL_EVIDENCE_MANIFEST_VERIFY_PATH ||
  process.env.TRAVEL_EVIDENCE_MANIFEST_PATH ||
  evidencePath("ops-evidence-manifest.json");
const evidenceManifestCheckPath =
  process.env.TRAVEL_EVIDENCE_MANIFEST_CHECK_PATH || evidencePath("ops-evidence-manifest-check.json");
const evidenceManifestCheckSchemaPath =
  process.env.TRAVEL_EVIDENCE_MANIFEST_CHECK_SCHEMA_PATH ||
  evidencePath("ops-evidence-manifest-check.schema.json");

const lines = [
  "# Travel Planner evidence review workflow",
  "",
  "# 1. From the webapp directory, preview the artifact paths used for this review.",
  `cd ${quote(webappDir)}`,
  "npm run ops:evidence:paths",
  "",
  "# 2. Compare the current evidence bundle against the saved hash manifest.",
  `TRAVEL_EVIDENCE_MANIFEST_VERIFY_PATH=${quote(evidenceManifestPath)} TRAVEL_EVIDENCE_MANIFEST_CHECK_PATH=${quote(evidenceManifestCheckPath)} npm run ops:evidence:manifest:check:file`,
  `TRAVEL_EVIDENCE_MANIFEST_CHECK_SCHEMA_PATH=${quote(evidenceManifestCheckSchemaPath)} npm run ops:evidence:manifest:check:schema:file`,
  `TRAVEL_EVIDENCE_MANIFEST_VERIFY_PATH=${quote(evidenceManifestPath)} npm run ops:evidence:manifest:check:gate`,
  "",
  "# 3. Check handoff report completeness for normal archived handoff bundles.",
  `TRAVEL_HANDOFF_REPORT_PATH=${quote(handoffReportPath)} TRAVEL_HANDOFF_REPORT_CHECK_PATH=${quote(handoffReportCheckPath)} npm run ops:handoff:report:check:file`,
  `TRAVEL_HANDOFF_REPORT_CHECK_SCHEMA_PATH=${quote(handoffReportCheckSchemaPath)} npm run ops:handoff:report:check:schema:file`,
  `TRAVEL_HANDOFF_REPORT_PATH=${quote(handoffReportPath)} npm run ops:handoff:report:check:gate`,
  "",
  "# 4a. If drift is accepted in a normal handoff review, fill and check the handoff report.",
  "npm run ops:handoff:report:file",
  `TRAVEL_HANDOFF_REPORT_PATH=${quote(handoffReportPath)} TRAVEL_HANDOFF_REPORT_CHECK_PATH=${quote(handoffReportCheckPath)} npm run ops:handoff:report:check:file -- --require-drift-acceptance`,
  `TRAVEL_HANDOFF_REPORT_CHECK_SCHEMA_PATH=${quote(handoffReportCheckSchemaPath)} npm run ops:handoff:report:check:schema:file`,
  `TRAVEL_HANDOFF_REPORT_PATH=${quote(handoffReportPath)} npm run ops:handoff:report:check:gate -- --require-drift-acceptance`,
  "",
  "# 4b. If drift is accepted in an incident-driven review, fill and check the incident report.",
  "npm run ops:incident:template:file",
  `TRAVEL_INCIDENT_REPORT_PATH=${quote(incidentReportPath)} TRAVEL_INCIDENT_REPORT_CHECK_PATH=${quote(incidentReportCheckPath)} npm run ops:incident:report:check:file -- --require-drift-acceptance`,
  `TRAVEL_INCIDENT_REPORT_CHECK_SCHEMA_PATH=${quote(incidentReportCheckSchemaPath)} npm run ops:incident:report:check:schema:file`,
  `TRAVEL_INCIDENT_REPORT_PATH=${quote(incidentReportPath)} npm run ops:incident:report:check:gate -- --require-drift-acceptance`,
  "",
  "# 5. Rebuild the human-readable readiness report for normal handoff reviews.",
  `TRAVEL_READINESS_ACTION_CODES_PATH=${quote(readinessActionCodesPath)} npm run ops:readiness:action-codes:file`,
  `TRAVEL_READINESS_ACTION_CODES_SCHEMA_PATH=${quote(readinessActionCodesSchemaPath)} npm run ops:readiness:action-codes:schema:file`,
  `TRAVEL_READINESS_ACTION_CODES_PATH=${quote(readinessActionCodesPath)} TRAVEL_READINESS_ACTION_CODES_CHECK_PATH=${quote(readinessActionCodesCheckPath)} npm run ops:readiness:action-codes:check:file`,
  `TRAVEL_READINESS_ACTION_CODES_CHECK_SCHEMA_PATH=${quote(readinessActionCodesCheckSchemaPath)} npm run ops:readiness:action-codes:check:schema:file`,
  `TRAVEL_READINESS_ACTION_CODES_PATH=${quote(readinessActionCodesPath)} npm run ops:readiness:action-codes:check:gate`,
  `TRAVEL_EVIDENCE_SUMMARY_PATH=${quote(evidenceSummaryPath)} TRAVEL_EVIDENCE_SUMMARY_CHECK_PATH=${quote(evidenceSummaryCheckPath)} TRAVEL_EVIDENCE_MANIFEST_CHECK_PATH=${quote(evidenceManifestCheckPath)} TRAVEL_HANDOFF_REPORT_CHECK_PATH=${quote(handoffReportCheckPath)} TRAVEL_READINESS_ACTION_CODES_CHECK_PATH=${quote(readinessActionCodesCheckPath)} TRAVEL_READINESS_REPORT_PATH=${quote(readinessReportPath)} npm run ops:readiness:report:file`,
  `TRAVEL_EVIDENCE_SUMMARY_PATH=${quote(evidenceSummaryPath)} TRAVEL_EVIDENCE_SUMMARY_CHECK_PATH=${quote(evidenceSummaryCheckPath)} TRAVEL_EVIDENCE_MANIFEST_CHECK_PATH=${quote(evidenceManifestCheckPath)} TRAVEL_HANDOFF_REPORT_CHECK_PATH=${quote(handoffReportCheckPath)} TRAVEL_READINESS_ACTION_CODES_CHECK_PATH=${quote(readinessActionCodesCheckPath)} TRAVEL_READINESS_REPORT_JSON_PATH=${quote(readinessReportJsonPath)} npm run ops:readiness:report:json:file`,
  `TRAVEL_READINESS_REPORT_JSON_SCHEMA_PATH=${quote(readinessReportJsonSchemaPath)} npm run ops:readiness:report:json:schema:file`,
  `TRAVEL_READINESS_REPORT_JSON_PATH=${quote(readinessReportJsonPath)} TRAVEL_READINESS_REPORT_JSON_CHECK_PATH=${quote(readinessReportJsonCheckPath)} npm run ops:readiness:report:json:check:file`,
  `TRAVEL_READINESS_REPORT_JSON_CHECK_SCHEMA_PATH=${quote(readinessReportJsonCheckSchemaPath)} npm run ops:readiness:report:json:check:schema:file`,
  `TRAVEL_READINESS_REPORT_JSON_PATH=${quote(readinessReportJsonPath)} npm run ops:readiness:report:json:check:gate`,
  `TRAVEL_EVIDENCE_SUMMARY_PATH=${quote(evidenceSummaryPath)} TRAVEL_EVIDENCE_SUMMARY_CHECK_PATH=${quote(evidenceSummaryCheckPath)} TRAVEL_EVIDENCE_MANIFEST_CHECK_PATH=${quote(evidenceManifestCheckPath)} TRAVEL_HANDOFF_REPORT_CHECK_PATH=${quote(handoffReportCheckPath)} TRAVEL_READINESS_ACTION_CODES_CHECK_PATH=${quote(readinessActionCodesCheckPath)} npm run ops:readiness:report:gate`,
  "",
  "# 6. For incident-driven reviews, rebuild readiness with incident-report check context.",
  `TRAVEL_READINESS_ACTION_CODES_PATH=${quote(readinessActionCodesPath)} npm run ops:readiness:action-codes:file`,
  `TRAVEL_READINESS_ACTION_CODES_SCHEMA_PATH=${quote(readinessActionCodesSchemaPath)} npm run ops:readiness:action-codes:schema:file`,
  `TRAVEL_READINESS_ACTION_CODES_PATH=${quote(readinessActionCodesPath)} TRAVEL_READINESS_ACTION_CODES_CHECK_PATH=${quote(readinessActionCodesCheckPath)} npm run ops:readiness:action-codes:check:file`,
  `TRAVEL_READINESS_ACTION_CODES_CHECK_SCHEMA_PATH=${quote(readinessActionCodesCheckSchemaPath)} npm run ops:readiness:action-codes:check:schema:file`,
  `TRAVEL_READINESS_ACTION_CODES_PATH=${quote(readinessActionCodesPath)} npm run ops:readiness:action-codes:check:gate`,
  `TRAVEL_EVIDENCE_SUMMARY_PATH=${quote(evidenceSummaryPath)} TRAVEL_EVIDENCE_SUMMARY_CHECK_PATH=${quote(evidenceSummaryCheckPath)} TRAVEL_EVIDENCE_MANIFEST_CHECK_PATH=${quote(evidenceManifestCheckPath)} TRAVEL_HANDOFF_REPORT_CHECK_PATH=${quote(handoffReportCheckPath)} TRAVEL_READINESS_ACTION_CODES_CHECK_PATH=${quote(readinessActionCodesCheckPath)} TRAVEL_INCIDENT_REPORT_CHECK_PATH=${quote(incidentReportCheckPath)} TRAVEL_READINESS_REPORT_PATH=${quote(readinessReportPath)} npm run ops:readiness:report:file`,
  `TRAVEL_EVIDENCE_SUMMARY_PATH=${quote(evidenceSummaryPath)} TRAVEL_EVIDENCE_SUMMARY_CHECK_PATH=${quote(evidenceSummaryCheckPath)} TRAVEL_EVIDENCE_MANIFEST_CHECK_PATH=${quote(evidenceManifestCheckPath)} TRAVEL_HANDOFF_REPORT_CHECK_PATH=${quote(handoffReportCheckPath)} TRAVEL_READINESS_ACTION_CODES_CHECK_PATH=${quote(readinessActionCodesCheckPath)} TRAVEL_INCIDENT_REPORT_CHECK_PATH=${quote(incidentReportCheckPath)} TRAVEL_READINESS_REPORT_JSON_PATH=${quote(readinessReportJsonPath)} npm run ops:readiness:report:json:file`,
  `TRAVEL_READINESS_REPORT_JSON_SCHEMA_PATH=${quote(readinessReportJsonSchemaPath)} npm run ops:readiness:report:json:schema:file`,
  `TRAVEL_READINESS_REPORT_JSON_PATH=${quote(readinessReportJsonPath)} TRAVEL_READINESS_REPORT_JSON_CHECK_PATH=${quote(readinessReportJsonCheckPath)} npm run ops:readiness:report:json:check:file`,
  `TRAVEL_READINESS_REPORT_JSON_CHECK_SCHEMA_PATH=${quote(readinessReportJsonCheckSchemaPath)} npm run ops:readiness:report:json:check:schema:file`,
  `TRAVEL_READINESS_REPORT_JSON_PATH=${quote(readinessReportJsonPath)} npm run ops:readiness:report:json:check:gate`,
  `TRAVEL_EVIDENCE_SUMMARY_PATH=${quote(evidenceSummaryPath)} TRAVEL_EVIDENCE_SUMMARY_CHECK_PATH=${quote(evidenceSummaryCheckPath)} TRAVEL_EVIDENCE_MANIFEST_CHECK_PATH=${quote(evidenceManifestCheckPath)} TRAVEL_HANDOFF_REPORT_CHECK_PATH=${quote(handoffReportCheckPath)} TRAVEL_READINESS_ACTION_CODES_CHECK_PATH=${quote(readinessActionCodesCheckPath)} TRAVEL_INCIDENT_REPORT_CHECK_PATH=${quote(incidentReportCheckPath)} npm run ops:readiness:report:gate`,
  "",
  "# Notes:",
  "# - This helper prints review commands only; it does not run checks or mutate data.",
  "# - A failed manifest check means at least one expected evidence file changed, disappeared, or appeared unexpectedly.",
  "# - For normal archived handoffs, use the handoff report. For incident-driven reviews, use the incident report.",
  "# - The 4a and 4b branches are alternatives; run the branch that matches the current review.",
  "# - The normal readiness refresh intentionally omits TRAVEL_INCIDENT_REPORT_CHECK_PATH so stale incident checks do not block ordinary handoff reviews.",
  "# - If evidence drift is accepted, document the manifest check report, artifact ids, approver, time, reason, and follow-up owner in the chosen report before proceeding.",
  "# - The --require-drift-acceptance flag verifies the Evidence drift acceptance section only when drift is accepted, and the readiness report shows Drift acceptance required: yes/no for the selected report check.",
  "# - Use the incident-driven readiness refresh only when the incident report check belongs to this review.",
  "# - Before accepting readiness, inspect blockingTargets with blockingReasons/blockingReasonCount/blockingReasonLabels, repairTargets including reasons/reasonCount/reasonLabels duplicate-human-evidence paired with positive duplicateFieldDiagnosticCount or absent when the count is zero, checkRepairDiagnostics fieldMetadataAvailable/rejectedFields/rejectedFieldReasons/rejectedFieldReasonEntries/duplicateFieldDiagnostics/duplicateFieldDiagnosticCount, duplicate-* fields/rejectedFields/rejectedFieldReasonEntries errors, manifestSummaryRoleArtifactsExpected, manifestSummaryRoleArtifacts, manifestSummaryRoleIndexFailures, and manifestSummaryRoleIndexFailureDetails in ops-readiness-report-check.json; record availability/reasons/reason labels/counts/rejected fields/reason counts/entry summaries/duplicate diagnostics/duplicate count, repair listed source paths or malformed human fields, and copy expected/recorded role indexes plus role-index failures/details into the matching Manifest summary role index human-record fields, or record none when each array/object is empty.",
  "# - The exact role-index human-record fields are Manifest summary role index expected, Manifest summary role index recorded, Manifest summary role index failures, and Manifest summary role index failure details; write none when the source object or array is empty.",
  "# - When adding duplicate diagnostic flags, update the shared readiness contract key list, count consistency, and workflow guidance before release.",
  "# - When adding blocking or repair target reasons, update the shared readiness contract exports, label maps, enum/bound consumers, and workflow guidance before release.",
  "# - When adding readiness check keys, update the shared readiness check key contract, required-present set, source path metadata, schema consumers, and workflow guidance before release.",
];

process.stdout.write(`${lines.join("\n")}\n`);
