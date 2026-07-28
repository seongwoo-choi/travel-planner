import { SOURCE_CHECK_PAYLOAD_FIELDS } from './ops-human-evidence-check.js';

export const READINESS_ACTION_LABELS = {
  review_metadata_drift: 'Review structured readiness metadata drift before accepting the evidence bundle.',
  review_manifest_failures: 'Review manifest failure kind artifacts, including summary-role index or operator-check drift, before accepting the evidence bundle.',
  resolve_blocking_checks: 'Resolve failed, missing, malformed, or duplicate blocking readiness evidence before handoff.',
  capture_missing_evidence: 'Capture missing evidence and regenerate readiness artifacts.',
  complete_operator_review: 'Complete operator review items before handoff.',
  ready_for_automation: 'Readiness JSON is ready for automation consumption after the contract gate passes.',
  review_readiness_payload: 'Review readiness payload before handoff.',
  regenerate_readiness_json: 'Regenerate readiness JSON, then rerun the contract check.',
};

export const READINESS_SOURCE_ACTION_CODES = [
  'review_metadata_drift',
  'review_manifest_failures',
  'resolve_blocking_checks',
  'capture_missing_evidence',
  'complete_operator_review',
  'ready_for_automation',
  'review_readiness_payload',
];

export const READINESS_DIAGNOSTIC_ONLY_ACTION_CODES = ['regenerate_readiness_json'];

export const READINESS_ALL_ACTION_CODES = [
  ...READINESS_SOURCE_ACTION_CODES,
  ...READINESS_DIAGNOSTIC_ONLY_ACTION_CODES,
];

export const READINESS_VALUES = Object.freeze([
  'ready',
  'operator_review_required',
  'not_ready',
]);

export const READINESS_CHECK_RESULT_STATUSES = Object.freeze({
  ok: 'ok',
  failed: 'failed',
});

export const READINESS_CHECK_RESULT_STATUS_VALUES = Object.freeze(
  Object.values(READINESS_CHECK_RESULT_STATUSES),
);

export const READINESS_REPORT_SCHEMA_VERSION = 1;

export const READINESS_REPORT_TARGET = 'readiness-report-json';

export const READINESS_CHECK_RESULT_SCHEMA_VERSION = 1;

export const READINESS_CHECK_RESULT_METADATA_VERSION = 1;

export const READINESS_CHECK_RESULT_TARGET = 'readiness-report-json-check-result';

export const READINESS_CHECK_RESULT_ARTIFACT = 'ops-readiness-report-check.json';

export const READINESS_CHECK_RESULT_SCHEMA_ID =
  'https://travel-planner.local/schemas/ops-readiness-report-check.schema.json';

export const READINESS_CHECK_RESULT_SCHEMA_TITLE =
  'Travel Planner operations readiness report JSON check result';

export const READINESS_CHECK_RESULT_FIELDS = Object.freeze({
  schemaVersion: 'schemaVersion',
  checkedAt: 'checkedAt',
  status: 'status',
  target: 'target',
  jsonPath: 'jsonPath',
  diagnostics: 'diagnostics',
  errors: 'errors',
});

export const READINESS_CHECK_RESULT_REQUIRED_FIELDS = Object.freeze(
  Object.values(READINESS_CHECK_RESULT_FIELDS),
);

export const READINESS_CHECK_RESULT_DIAGNOSTIC_FIELDS = Object.freeze({
  readiness: 'readiness',
  summaryStatus: 'summaryStatus',
  summaryOk: 'summaryOk',
  blockingChecks: 'blockingChecks',
  checkStatuses: 'checkStatuses',
  checkBlockingStates: 'checkBlockingStates',
  blockingTargets: 'blockingTargets',
  checkSourcePaths: 'checkSourcePaths',
  checkRepairDiagnostics: 'checkRepairDiagnostics',
  repairTargets: 'repairTargets',
  manifestMetadataFailures: 'manifestMetadataFailures',
  manifestSummaryRoleArtifactsExpected: 'manifestSummaryRoleArtifactsExpected',
  manifestSummaryRoleArtifacts: 'manifestSummaryRoleArtifacts',
  manifestSummaryRoleIndexFailures: 'manifestSummaryRoleIndexFailures',
  manifestSummaryRoleIndexFailureDetails: 'manifestSummaryRoleIndexFailureDetails',
  manifestOperatorCheckFailures: 'manifestOperatorCheckFailures',
  manifestOperatorCheckFailureDetails: 'manifestOperatorCheckFailureDetails',
  manifestFailureKinds: 'manifestFailureKinds',
  manifestFailureKindArtifacts: 'manifestFailureKindArtifacts',
  iosInstallEvidenceErrors: 'iosInstallEvidenceErrors',
  iosInstallEvidenceRepairTargets: 'iosInstallEvidenceRepairTargets',
  recommendedActionCode: 'recommendedActionCode',
  recommendedAction: 'recommendedAction',
});

export const READINESS_CHECK_RESULT_REQUIRED_DIAGNOSTIC_FIELDS = Object.freeze(
  Object.values(READINESS_CHECK_RESULT_DIAGNOSTIC_FIELDS),
);

// Shared by readiness JSON check generation and check-result schema validation.
export const READINESS_CHECK_KEYS = Object.freeze([
  'evidenceSummaryCheck',
  'manifestCheck',
  'handoffReportCheck',
  'actionCodesCheck',
  'incidentReportCheck',
]);

export const READINESS_REQUIRED_PRESENT_CHECK_KEYS = Object.freeze([
  'evidenceSummaryCheck',
  'actionCodesCheck',
]);

export const READINESS_SOURCE_PATH_CHECK_KEYS = Object.freeze([
  'evidenceSummaryCheck',
  'actionCodesCheck',
]);

export const READINESS_SOURCE_PATH_FIELDS = Object.freeze({
  evidenceSummaryCheck: 'summaryPath',
  actionCodesCheck: 'catalogPath',
});

export const READINESS_CHECK_REPAIR_DIAGNOSTIC_KEYS = Object.freeze([
  'handoffReportCheck',
  'incidentReportCheck',
]);

export const READINESS_REPAIR_DIAGNOSTIC_FIELDS = Object.freeze({
  statusGuidance: 'statusGuidance',
  errorSections: 'errorSections',
  missingFieldsBySection: 'missingFieldsBySection',
  fieldMetadataAvailable: 'fieldMetadataAvailable',
  rejectedFields: 'rejectedFields',
  rejectedFieldReasons: 'rejectedFieldReasons',
  rejectedFieldReasonEntries: 'rejectedFieldReasonEntries',
  duplicateFieldDiagnostics: 'duplicateFieldDiagnostics',
  duplicateFieldDiagnosticCount: 'duplicateFieldDiagnosticCount',
});

export const READINESS_REPAIR_DIAGNOSTIC_REQUIRED_FIELDS = Object.freeze(
  Object.values(READINESS_REPAIR_DIAGNOSTIC_FIELDS),
);

export const READINESS_REPAIR_TARGET_FIELDS = Object.freeze({
  check: 'check',
  status: 'status',
  path: 'path',
  reasons: 'reasons',
  reasonCount: 'reasonCount',
  reasonLabels: 'reasonLabels',
  statusGuidance: 'statusGuidance',
  errorSections: 'errorSections',
  errorSectionCount: 'errorSectionCount',
  missingFieldsBySection: 'missingFieldsBySection',
  missingFieldCount: 'missingFieldCount',
  fieldMetadataAvailable: 'fieldMetadataAvailable',
  rejectedFields: 'rejectedFields',
  rejectedFieldCount: 'rejectedFieldCount',
  rejectedFieldReasons: 'rejectedFieldReasons',
  rejectedFieldReasonEntries: 'rejectedFieldReasonEntries',
  duplicateFieldDiagnostics: 'duplicateFieldDiagnostics',
  duplicateFieldDiagnosticCount: 'duplicateFieldDiagnosticCount',
});

export const READINESS_REPAIR_TARGET_REQUIRED_FIELDS = Object.freeze(
  Object.values(READINESS_REPAIR_TARGET_FIELDS),
);

export const READINESS_CHECK_BLOCKING_STATE_FIELDS = Object.freeze({
  configured: 'configured',
  present: 'present',
  status: 'status',
  blocksReadiness: 'blocksReadiness',
  blockingReasons: 'blockingReasons',
  blockingReasonCount: 'blockingReasonCount',
  blockingReasonLabels: 'blockingReasonLabels',
});

export const READINESS_CHECK_BLOCKING_STATE_REQUIRED_FIELDS = Object.freeze(
  Object.values(READINESS_CHECK_BLOCKING_STATE_FIELDS),
);

export const READINESS_BLOCKING_TARGET_FIELDS = Object.freeze({
  check: 'check',
  configured: 'configured',
  present: 'present',
  status: 'status',
  path: 'path',
  blockingReasons: 'blockingReasons',
  blockingReasonCount: 'blockingReasonCount',
  blockingReasonLabels: 'blockingReasonLabels',
});

export const READINESS_BLOCKING_TARGET_REQUIRED_FIELDS = Object.freeze(
  Object.values(READINESS_BLOCKING_TARGET_FIELDS),
);

export const READINESS_REJECTED_FIELD_PROJECTION_FIELDS = Object.freeze({
  fields: SOURCE_CHECK_PAYLOAD_FIELDS.fields,
  rejectedFields: READINESS_REPAIR_DIAGNOSTIC_FIELDS.rejectedFields,
  rejectedFieldCount: READINESS_REPAIR_TARGET_FIELDS.rejectedFieldCount,
  rejectedFieldReasons: READINESS_REPAIR_DIAGNOSTIC_FIELDS.rejectedFieldReasons,
  rejectedFieldReasonEntries: READINESS_REPAIR_DIAGNOSTIC_FIELDS.rejectedFieldReasonEntries,
});

// Shared by readiness blocking diagnostics generation and check-result schema validation.
export const READINESS_BLOCKING_REASONS = Object.freeze({
  requiredCheckNotOk: 'required-check-not-ok',
  configuredCheckMissing: 'configured-check-missing',
  disabledCheckBlocking: 'disabled-check-blocking',
  explicitBlocking: 'explicit-blocking',
});

export const READINESS_BLOCKING_REASON_VALUES = Object.freeze(
  Object.values(READINESS_BLOCKING_REASONS),
);

export const READINESS_BLOCKING_REASON_LABELS = Object.freeze({
  [READINESS_BLOCKING_REASONS.requiredCheckNotOk]: 'Required readiness check status is not ok.',
  [READINESS_BLOCKING_REASONS.configuredCheckMissing]: 'Configured readiness check artifact is missing.',
  [READINESS_BLOCKING_REASONS.disabledCheckBlocking]: 'Disabled readiness check is still marked as blocking.',
  [READINESS_BLOCKING_REASONS.explicitBlocking]: 'Readiness check explicitly blocks automation.',
});

// Shared by readiness JSON check generation and check-result schema validation.
export const READINESS_REPAIR_TARGET_REASONS = Object.freeze({
  statusNotOk: 'status-not-ok',
  sectionErrors: 'section-errors',
  missingFields: 'missing-fields',
  rejectedFields: 'rejected-fields',
  duplicateHumanEvidence: 'duplicate-human-evidence',
});

export const READINESS_REPAIR_TARGET_REASON_VALUES = Object.freeze(
  Object.values(READINESS_REPAIR_TARGET_REASONS),
);

export const READINESS_REPAIR_TARGET_REASON_LABELS = Object.freeze({
  [READINESS_REPAIR_TARGET_REASONS.statusNotOk]: 'Source check status is not ok.',
  [READINESS_REPAIR_TARGET_REASONS.sectionErrors]: 'Source check has section-level errors.',
  [READINESS_REPAIR_TARGET_REASONS.missingFields]: 'Source check has missing required human-record fields.',
  [READINESS_REPAIR_TARGET_REASONS.rejectedFields]: 'Source check has rejected human-record field metadata.',
  [READINESS_REPAIR_TARGET_REASONS.duplicateHumanEvidence]: 'Source check has duplicate human-evidence metadata projections.',
});

export const READINESS_DUPLICATE_DIAGNOSTIC_FIELDS = Object.freeze({
  diagnostics: READINESS_REPAIR_DIAGNOSTIC_FIELDS.duplicateFieldDiagnostics,
  diagnosticCount: READINESS_REPAIR_DIAGNOSTIC_FIELDS.duplicateFieldDiagnosticCount,
  repairReason: READINESS_REPAIR_TARGET_REASONS.duplicateHumanEvidence,
});

// Shared by duplicate repair diagnostics generation and schema consistency rules.
export const READINESS_DUPLICATE_FIELD_DIAGNOSTIC_KEYS = Object.freeze([
  'fields',
  'rejectedFields',
  'rejectedFieldReasonEntries',
]);
