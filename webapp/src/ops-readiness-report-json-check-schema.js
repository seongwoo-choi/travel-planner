#!/usr/bin/env node

import fs from 'node:fs';
import path from 'node:path';

import {
  READINESS_ACTION_LABELS,
  READINESS_ALL_ACTION_CODES,
  READINESS_BLOCKING_REASON_LABELS as BLOCKING_REASON_LABELS,
  READINESS_BLOCKING_REASON_VALUES as BLOCKING_REASON_VALUES,
  READINESS_BLOCKING_TARGET_FIELDS,
  READINESS_BLOCKING_TARGET_REQUIRED_FIELDS,
  READINESS_CHECK_BLOCKING_STATE_FIELDS,
  READINESS_CHECK_BLOCKING_STATE_REQUIRED_FIELDS,
  READINESS_CHECK_KEYS,
  READINESS_CHECK_REPAIR_DIAGNOSTIC_KEYS,
  READINESS_CHECK_RESULT_ARTIFACT,
  READINESS_CHECK_RESULT_DIAGNOSTIC_FIELDS,
  READINESS_CHECK_RESULT_FIELDS,
  READINESS_CHECK_RESULT_METADATA_VERSION,
  READINESS_CHECK_RESULT_REQUIRED_DIAGNOSTIC_FIELDS,
  READINESS_CHECK_RESULT_REQUIRED_FIELDS,
  READINESS_CHECK_RESULT_SCHEMA_ID,
  READINESS_CHECK_RESULT_SCHEMA_TITLE,
  READINESS_CHECK_RESULT_SCHEMA_VERSION,
  READINESS_CHECK_RESULT_STATUS_VALUES,
  READINESS_CHECK_RESULT_TARGET,
  READINESS_DUPLICATE_DIAGNOSTIC_FIELDS,
  READINESS_DUPLICATE_FIELD_DIAGNOSTIC_KEYS as DUPLICATE_FIELD_DIAGNOSTIC_KEYS,
  READINESS_REPAIR_TARGET_REASON_LABELS as REPAIR_TARGET_REASON_LABELS,
  READINESS_REPAIR_TARGET_REASONS as REPAIR_TARGET_REASONS,
  READINESS_REPAIR_TARGET_REASON_VALUES as REPAIR_TARGET_REASON_VALUES,
  READINESS_REPAIR_TARGET_FIELDS,
  READINESS_REPAIR_TARGET_REQUIRED_FIELDS,
  READINESS_REPAIR_DIAGNOSTIC_FIELDS,
  READINESS_REPAIR_DIAGNOSTIC_REQUIRED_FIELDS,
  READINESS_REJECTED_FIELD_PROJECTION_FIELDS,
  READINESS_REPORT_TARGET,
  READINESS_REQUIRED_PRESENT_CHECK_KEYS,
  READINESS_SOURCE_PATH_CHECK_KEYS,
  READINESS_SOURCE_PATH_FIELDS,
  READINESS_VALUES,
} from './ops-readiness-action-code-contract.js';
import {
  CHECK_FIELD_REASON_VALUES,
  REJECTED_FIELD_FIELDS,
  REJECTED_FIELD_REASON_ENTRY_FIELDS,
  REJECTED_FIELD_REASON_ENTRY_REQUIRED_FIELDS,
  REJECTED_FIELD_REASON_VALUES,
  REJECTED_FIELD_REQUIRED_FIELDS,
  SOURCE_CHECK_PAYLOAD_FIELDS,
  SOURCE_CHECK_PAYLOAD_REQUIRED_FIELDS,
  SOURCE_CHECK_FIELD_FIELDS,
  SOURCE_CHECK_FIELD_REQUIRED_FIELDS,
} from './ops-human-evidence-check.js';

function parseArgs(argv) {
  const args = {
    outputPath: '',
    outputEnv: '',
    outputDefaultEvidence: '',
  };

  for (const arg of argv) {
    if (arg.startsWith('--output=')) {
      args.outputPath = arg.slice('--output='.length);
    } else if (arg.startsWith('--output-env=')) {
      args.outputEnv = arg.slice('--output-env='.length);
    } else if (arg.startsWith('--output-default-evidence=')) {
      args.outputDefaultEvidence = arg.slice('--output-default-evidence='.length);
    } else {
      throw new Error(`Unknown argument: ${arg}`);
    }
  }

  if (!args.outputPath && args.outputEnv) {
    args.outputPath = process.env[args.outputEnv] || '';
  }

  if (!args.outputPath && args.outputDefaultEvidence) {
    args.outputPath = path.join(
      process.env.TRAVEL_EVIDENCE_DIR || 'reports',
      args.outputDefaultEvidence,
    );
  }

  return args;
}

const DUPLICATE_FIELD_DIAGNOSTIC_DEFAULT = Object.freeze(Object.fromEntries(
  DUPLICATE_FIELD_DIAGNOSTIC_KEYS.map((key) => [key, false]),
));

function duplicateDiagnosticProperties(values) {
  return Object.fromEntries(
    DUPLICATE_FIELD_DIAGNOSTIC_KEYS.map((key) => [key, { const: values[key] }]),
  );
}

function duplicateDiagnosticCase(values) {
  return {
    properties: {
      duplicateFieldDiagnostics: {
        properties: duplicateDiagnosticProperties(values),
        required: DUPLICATE_FIELD_DIAGNOSTIC_KEYS,
      },
    },
    required: ['duplicateFieldDiagnostics'],
  };
}

function duplicateDiagnosticCases() {
  return Array.from(
    { length: 2 ** DUPLICATE_FIELD_DIAGNOSTIC_KEYS.length },
    (_, mask) => {
      const values = Object.fromEntries(
        DUPLICATE_FIELD_DIAGNOSTIC_KEYS.map((key, index) => [
          key,
          Boolean(mask & (1 << index)),
        ]),
      );
      const count = DUPLICATE_FIELD_DIAGNOSTIC_KEYS
        .filter((key) => values[key])
        .length;

      return { count, schema: duplicateDiagnosticCase(values) };
    },
  );
}

function duplicateDiagnosticCountRule(count, cases) {
  return {
    if: { anyOf: cases },
    then: {
      properties: {
        [READINESS_REPAIR_DIAGNOSTIC_FIELDS.duplicateFieldDiagnosticCount]: { const: count },
      },
    },
  };
}

function duplicateDiagnosticCountConsistency() {
  const casesByCount = duplicateDiagnosticCases()
    .reduce((groups, item) => {
      if (!groups.has(item.count)) {
        groups.set(item.count, []);
      }

      groups.get(item.count).push(item.schema);
      return groups;
    }, new Map());

  return {
    allOf: Array.from(casesByCount.entries())
      .map(([count, cases]) => duplicateDiagnosticCountRule(count, cases)),
  };
}

function duplicateHumanEvidenceReasonConsistency() {
  return {
    allOf: [
      {
        if: {
          properties: { [READINESS_REPAIR_TARGET_FIELDS.duplicateFieldDiagnosticCount]: { const: 0 } },
          required: [READINESS_REPAIR_TARGET_FIELDS.duplicateFieldDiagnosticCount],
        },
        then: {
          properties: {
            [READINESS_REPAIR_TARGET_FIELDS.reasons]: {
              not: {
                contains: { const: REPAIR_TARGET_REASONS.duplicateHumanEvidence },
              },
            },
          },
        },
      },
      {
        if: {
          properties: { [READINESS_REPAIR_TARGET_FIELDS.duplicateFieldDiagnosticCount]: { minimum: 1 } },
          required: [READINESS_REPAIR_TARGET_FIELDS.duplicateFieldDiagnosticCount],
        },
        then: {
          properties: {
            [READINESS_REPAIR_TARGET_FIELDS.reasons]: {
              contains: { const: REPAIR_TARGET_REASONS.duplicateHumanEvidence },
            },
          },
        },
      },
    ],
  };
}

function repairTargetReasonLabelConsistency() {
  return reasonLabelConsistency(
    READINESS_REPAIR_TARGET_FIELDS.reasons,
    READINESS_REPAIR_TARGET_FIELDS.reasonLabels,
    REPAIR_TARGET_REASON_VALUES,
  );
}

function blockingReasonLabelConsistency() {
  return reasonLabelConsistency(
    READINESS_CHECK_BLOCKING_STATE_FIELDS.blockingReasons,
    READINESS_CHECK_BLOCKING_STATE_FIELDS.blockingReasonLabels,
    BLOCKING_REASON_VALUES,
  );
}

function blockingReasonCountConsistency() {
  return reasonCountConsistency(
    READINESS_CHECK_BLOCKING_STATE_FIELDS.blockingReasons,
    READINESS_CHECK_BLOCKING_STATE_FIELDS.blockingReasonCount,
    BLOCKING_REASON_VALUES.length,
  );
}

function blockingTargetReasonLabelConsistency() {
  return reasonLabelConsistency(
    READINESS_BLOCKING_TARGET_FIELDS.blockingReasons,
    READINESS_BLOCKING_TARGET_FIELDS.blockingReasonLabels,
    BLOCKING_REASON_VALUES,
  );
}

function blockingTargetReasonCountConsistency() {
  return reasonCountConsistency(
    READINESS_BLOCKING_TARGET_FIELDS.blockingReasons,
    READINESS_BLOCKING_TARGET_FIELDS.blockingReasonCount,
    BLOCKING_REASON_VALUES.length,
  );
}

function repairTargetReasonCountConsistency() {
  return reasonCountConsistency(
    READINESS_REPAIR_TARGET_FIELDS.reasons,
    READINESS_REPAIR_TARGET_FIELDS.reasonCount,
    REPAIR_TARGET_REASON_VALUES.length,
  );
}

function reasonLabelConsistency(reasonsProperty, labelsProperty, reasonValues) {
  return {
    allOf: reasonValues.flatMap((reason) => [
      {
        if: {
          properties: {
            [reasonsProperty]: { contains: { const: reason } },
          },
          required: [reasonsProperty],
        },
        then: {
          properties: {
            [labelsProperty]: { required: [reason] },
          },
        },
      },
      {
        if: {
          properties: {
            [labelsProperty]: { required: [reason] },
          },
          required: [labelsProperty],
        },
        then: {
          properties: {
            [reasonsProperty]: { contains: { const: reason } },
          },
        },
      },
    ]),
  };
}

function reasonCountConsistency(reasonsProperty, countProperty, maxCount) {
  return {
    allOf: Array.from({ length: maxCount + 1 }, (_, count) => ({
      if: {
        properties: {
          [reasonsProperty]: {
            minItems: count,
            maxItems: count,
          },
        },
        required: [reasonsProperty],
      },
      then: {
        properties: {
          [countProperty]: { const: count },
        },
      },
    })),
  };
}

function buildSchema() {
  return {
    $schema: 'https://json-schema.org/draft/2020-12/schema',
    $id: READINESS_CHECK_RESULT_SCHEMA_ID,
    title: READINESS_CHECK_RESULT_SCHEMA_TITLE,
    metadata: {
      metadataVersion: READINESS_CHECK_RESULT_METADATA_VERSION,
      target: READINESS_CHECK_RESULT_TARGET,
      validatesTarget: READINESS_REPORT_TARGET,
      artifact: READINESS_CHECK_RESULT_ARTIFACT,
      checkResultFields: READINESS_CHECK_RESULT_FIELDS,
      checkResultRequiredFields: READINESS_CHECK_RESULT_REQUIRED_FIELDS,
      checkResultDiagnosticFields: READINESS_CHECK_RESULT_DIAGNOSTIC_FIELDS,
      checkResultRequiredDiagnosticFields: READINESS_CHECK_RESULT_REQUIRED_DIAGNOSTIC_FIELDS,
      checkBlockingStateFields: READINESS_CHECK_BLOCKING_STATE_FIELDS,
      checkBlockingStateRequiredFields: READINESS_CHECK_BLOCKING_STATE_REQUIRED_FIELDS,
      checkRepairDiagnosticKeys: READINESS_CHECK_REPAIR_DIAGNOSTIC_KEYS,
      checkResultStatusValues: READINESS_CHECK_RESULT_STATUS_VALUES,
      actionCodes: READINESS_ACTION_LABELS,
      recommendedActionFields: {
        actionCode: READINESS_CHECK_RESULT_DIAGNOSTIC_FIELDS.recommendedActionCode,
        actionText: READINESS_CHECK_RESULT_DIAGNOSTIC_FIELDS.recommendedAction,
      },
      sourcePathFields: {
        diagnostics: READINESS_CHECK_RESULT_DIAGNOSTIC_FIELDS.checkSourcePaths,
        ...Object.fromEntries(READINESS_SOURCE_PATH_CHECK_KEYS.map((key) => [key, key])),
      },
      sourcePathSourceFields: READINESS_SOURCE_PATH_FIELDS,
      readinessSummaryFields: {
        readiness: READINESS_CHECK_RESULT_DIAGNOSTIC_FIELDS.readiness,
        summaryStatus: READINESS_CHECK_RESULT_DIAGNOSTIC_FIELDS.summaryStatus,
        summaryOk: READINESS_CHECK_RESULT_DIAGNOSTIC_FIELDS.summaryOk,
        blockingChecks: READINESS_CHECK_RESULT_DIAGNOSTIC_FIELDS.blockingChecks,
        checkStatuses: READINESS_CHECK_RESULT_DIAGNOSTIC_FIELDS.checkStatuses,
        checkBlockingStates: READINESS_CHECK_RESULT_DIAGNOSTIC_FIELDS.checkBlockingStates,
      },
      readinessValues: READINESS_VALUES,
      readinessCheckKeys: READINESS_CHECK_KEYS,
      requiredPresentCheckKeys: READINESS_REQUIRED_PRESENT_CHECK_KEYS,
      blockingReasons: BLOCKING_REASON_VALUES,
      blockingReasonLabels: BLOCKING_REASON_LABELS,
      repairTargetReasons: REPAIR_TARGET_REASON_VALUES,
      repairTargetReasonLabels: REPAIR_TARGET_REASON_LABELS,
      duplicateDiagnosticKeys: DUPLICATE_FIELD_DIAGNOSTIC_KEYS,
      duplicateDiagnosticFields: READINESS_DUPLICATE_DIAGNOSTIC_FIELDS,
      rejectedFieldReasons: REJECTED_FIELD_REASON_VALUES,
      rejectedFieldProjectionFields: READINESS_REJECTED_FIELD_PROJECTION_FIELDS,
      rejectedFieldReasonProjectionFields: {
        reasonCounts: READINESS_REPAIR_DIAGNOSTIC_FIELDS.rejectedFieldReasons,
        reasonEntries: READINESS_REPAIR_DIAGNOSTIC_FIELDS.rejectedFieldReasonEntries,
        reasonEntryReason: REJECTED_FIELD_REASON_ENTRY_FIELDS.reason,
        reasonEntryCount: REJECTED_FIELD_REASON_ENTRY_FIELDS.count,
      },
      sourceCheckPayloadFields: SOURCE_CHECK_PAYLOAD_FIELDS,
      sourceCheckPayloadRequiredFields: SOURCE_CHECK_PAYLOAD_REQUIRED_FIELDS,
      sourceCheckFieldFields: SOURCE_CHECK_FIELD_FIELDS,
      sourceCheckFieldRequiredFields: SOURCE_CHECK_FIELD_REQUIRED_FIELDS,
      sourceCheckFieldReasonValues: CHECK_FIELD_REASON_VALUES,
      rejectedFieldItemFields: REJECTED_FIELD_FIELDS,
      rejectedFieldRequiredFields: REJECTED_FIELD_REQUIRED_FIELDS,
      rejectedFieldReasonEntryFields: REJECTED_FIELD_REASON_ENTRY_FIELDS,
      rejectedFieldReasonEntryRequiredFields: REJECTED_FIELD_REASON_ENTRY_REQUIRED_FIELDS,
      checkRepairDiagnosticFields: READINESS_REPAIR_DIAGNOSTIC_FIELDS,
      checkRepairDiagnosticRequiredFields: READINESS_REPAIR_DIAGNOSTIC_REQUIRED_FIELDS,
      blockingTargetFields: READINESS_BLOCKING_TARGET_FIELDS,
      blockingTargetRequiredFields: READINESS_BLOCKING_TARGET_REQUIRED_FIELDS,
      repairTargetFields: READINESS_REPAIR_TARGET_FIELDS,
      repairTargetRequiredFields: READINESS_REPAIR_TARGET_REQUIRED_FIELDS,
      compactTargetFields: {
        blocking: {
          check: READINESS_BLOCKING_TARGET_FIELDS.check,
          configured: READINESS_BLOCKING_TARGET_FIELDS.configured,
          present: READINESS_BLOCKING_TARGET_FIELDS.present,
          status: READINESS_BLOCKING_TARGET_FIELDS.status,
          path: READINESS_BLOCKING_TARGET_FIELDS.path,
          blockingReasons: READINESS_BLOCKING_TARGET_FIELDS.blockingReasons,
          blockingReasonCount: READINESS_BLOCKING_TARGET_FIELDS.blockingReasonCount,
          blockingReasonLabels: READINESS_BLOCKING_TARGET_FIELDS.blockingReasonLabels,
        },
        repair: {
          check: READINESS_REPAIR_TARGET_FIELDS.check,
          status: READINESS_REPAIR_TARGET_FIELDS.status,
          path: READINESS_REPAIR_TARGET_FIELDS.path,
          reasons: READINESS_REPAIR_TARGET_FIELDS.reasons,
          reasonCount: READINESS_REPAIR_TARGET_FIELDS.reasonCount,
          reasonLabels: READINESS_REPAIR_TARGET_FIELDS.reasonLabels,
          statusGuidance: READINESS_REPAIR_TARGET_FIELDS.statusGuidance,
          errorSectionCount: READINESS_REPAIR_TARGET_FIELDS.errorSectionCount,
          missingFieldCount: READINESS_REPAIR_TARGET_FIELDS.missingFieldCount,
          fieldMetadataAvailable: READINESS_REPAIR_TARGET_FIELDS.fieldMetadataAvailable,
          rejectedFieldCount: READINESS_REPAIR_TARGET_FIELDS.rejectedFieldCount,
          duplicateFieldDiagnosticCount: READINESS_REPAIR_TARGET_FIELDS.duplicateFieldDiagnosticCount,
        },
      },
      manifestDiagnosticFields: {
        metadataFailures: READINESS_CHECK_RESULT_DIAGNOSTIC_FIELDS.manifestMetadataFailures,
        summaryRoleArtifactsExpected: READINESS_CHECK_RESULT_DIAGNOSTIC_FIELDS.manifestSummaryRoleArtifactsExpected,
        summaryRoleArtifacts: READINESS_CHECK_RESULT_DIAGNOSTIC_FIELDS.manifestSummaryRoleArtifacts,
        summaryRoleIndexFailures: READINESS_CHECK_RESULT_DIAGNOSTIC_FIELDS.manifestSummaryRoleIndexFailures,
        summaryRoleIndexFailureDetails: READINESS_CHECK_RESULT_DIAGNOSTIC_FIELDS.manifestSummaryRoleIndexFailureDetails,
        operatorCheckFailures: READINESS_CHECK_RESULT_DIAGNOSTIC_FIELDS.manifestOperatorCheckFailures,
        operatorCheckFailureDetails: READINESS_CHECK_RESULT_DIAGNOSTIC_FIELDS.manifestOperatorCheckFailureDetails,
        failureKinds: READINESS_CHECK_RESULT_DIAGNOSTIC_FIELDS.manifestFailureKinds,
        failureKindArtifacts: READINESS_CHECK_RESULT_DIAGNOSTIC_FIELDS.manifestFailureKindArtifacts,
      },
      reasonRoutingFields: {
        blocking: {
          reasons: READINESS_CHECK_BLOCKING_STATE_FIELDS.blockingReasons,
          reasonCount: READINESS_CHECK_BLOCKING_STATE_FIELDS.blockingReasonCount,
          reasonLabels: READINESS_CHECK_BLOCKING_STATE_FIELDS.blockingReasonLabels,
        },
        repairTarget: {
          reasons: READINESS_REPAIR_TARGET_FIELDS.reasons,
          reasonCount: READINESS_REPAIR_TARGET_FIELDS.reasonCount,
          reasonLabels: READINESS_REPAIR_TARGET_FIELDS.reasonLabels,
        },
      },
    },
    type: 'object',
    additionalProperties: false,
    required: READINESS_CHECK_RESULT_REQUIRED_FIELDS,
    properties: {
      [READINESS_CHECK_RESULT_FIELDS.schemaVersion]: { const: READINESS_CHECK_RESULT_SCHEMA_VERSION },
      [READINESS_CHECK_RESULT_FIELDS.checkedAt]: { type: 'string', format: 'date-time' },
      [READINESS_CHECK_RESULT_FIELDS.status]: {
        type: 'string',
        enum: READINESS_CHECK_RESULT_STATUS_VALUES,
      },
      [READINESS_CHECK_RESULT_FIELDS.target]: { const: READINESS_REPORT_TARGET },
      [READINESS_CHECK_RESULT_FIELDS.jsonPath]: { type: 'string' },
      [READINESS_CHECK_RESULT_FIELDS.diagnostics]: { $ref: '#/$defs/diagnostics' },
      [READINESS_CHECK_RESULT_FIELDS.errors]: {
        type: 'array',
        items: { type: 'string' },
      },
    },
    $defs: {
      nullableString: {
        anyOf: [{ type: 'string' }, { type: 'null' }],
      },
      nullableBoolean: {
        anyOf: [{ type: 'boolean' }, { type: 'null' }],
      },
      diagnostics: {
        type: 'object',
        additionalProperties: false,
        required: READINESS_CHECK_RESULT_REQUIRED_DIAGNOSTIC_FIELDS,
        properties: {
          [READINESS_CHECK_RESULT_DIAGNOSTIC_FIELDS.readiness]: { $ref: '#/$defs/nullableString' },
          [READINESS_CHECK_RESULT_DIAGNOSTIC_FIELDS.summaryStatus]: { $ref: '#/$defs/nullableString' },
          [READINESS_CHECK_RESULT_DIAGNOSTIC_FIELDS.summaryOk]: { $ref: '#/$defs/nullableBoolean' },
          [READINESS_CHECK_RESULT_DIAGNOSTIC_FIELDS.blockingChecks]: {
            type: 'array',
            items: { type: 'string' },
          },
          [READINESS_CHECK_RESULT_DIAGNOSTIC_FIELDS.checkStatuses]: {
            type: 'object',
            additionalProperties: { type: 'string' },
            required: READINESS_CHECK_KEYS,
          },
          [READINESS_CHECK_RESULT_DIAGNOSTIC_FIELDS.checkBlockingStates]: {
            type: 'object',
            additionalProperties: false,
            required: READINESS_CHECK_KEYS,
            properties: Object.fromEntries(
              READINESS_CHECK_KEYS.map((key) => [key, { $ref: '#/$defs/checkBlockingState' }]),
            ),
          },
          [READINESS_CHECK_RESULT_DIAGNOSTIC_FIELDS.blockingTargets]: {
            type: 'array',
            items: { $ref: '#/$defs/blockingTarget' },
          },
          [READINESS_CHECK_RESULT_DIAGNOSTIC_FIELDS.checkSourcePaths]: {
            type: 'object',
            additionalProperties: false,
            required: READINESS_SOURCE_PATH_CHECK_KEYS,
            properties: Object.fromEntries(
              READINESS_SOURCE_PATH_CHECK_KEYS.map((key) => [key, { $ref: '#/$defs/nullableString' }]),
            ),
          },
          [READINESS_CHECK_RESULT_DIAGNOSTIC_FIELDS.checkRepairDiagnostics]: {
            type: 'object',
            additionalProperties: false,
            required: READINESS_CHECK_REPAIR_DIAGNOSTIC_KEYS,
            properties: Object.fromEntries(
              READINESS_CHECK_REPAIR_DIAGNOSTIC_KEYS.map((key) => [
                key,
                { $ref: '#/$defs/repairDiagnostic' },
              ]),
            ),
          },
          [READINESS_CHECK_RESULT_DIAGNOSTIC_FIELDS.repairTargets]: {
            type: 'array',
            items: { $ref: '#/$defs/repairTarget' },
          },
          [READINESS_CHECK_RESULT_DIAGNOSTIC_FIELDS.manifestMetadataFailures]: {
            type: 'array',
            items: { type: 'string' },
          },
          [READINESS_CHECK_RESULT_DIAGNOSTIC_FIELDS.manifestSummaryRoleArtifactsExpected]: {
            type: 'object',
            additionalProperties: {
              type: 'array',
              items: { type: 'string' },
            },
          },
          [READINESS_CHECK_RESULT_DIAGNOSTIC_FIELDS.manifestSummaryRoleArtifacts]: {
            type: 'object',
            additionalProperties: {
              type: 'array',
              items: { type: 'string' },
            },
          },
          [READINESS_CHECK_RESULT_DIAGNOSTIC_FIELDS.manifestSummaryRoleIndexFailures]: {
            type: 'array',
            items: { type: 'string' },
          },
          [READINESS_CHECK_RESULT_DIAGNOSTIC_FIELDS.manifestSummaryRoleIndexFailureDetails]: {
            type: 'array',
            items: {
              type: 'object',
              additionalProperties: false,
              required: ['failure', 'role', 'expected', 'recorded', 'expectedRoles', 'recordedRoles'],
              properties: {
                failure: { type: 'string' },
                role: { anyOf: [{ type: 'string' }, { type: 'null' }] },
                expected: { $ref: '#/$defs/stringList' },
                recorded: { $ref: '#/$defs/stringList' },
                expectedRoles: { $ref: '#/$defs/stringList' },
                recordedRoles: { $ref: '#/$defs/stringList' },
              },
            },
          },
          [READINESS_CHECK_RESULT_DIAGNOSTIC_FIELDS.manifestOperatorCheckFailures]: {
            type: 'array',
            items: { type: 'string' },
          },
          [READINESS_CHECK_RESULT_DIAGNOSTIC_FIELDS.manifestOperatorCheckFailureDetails]: {
            type: 'array',
            items: {
              type: 'object',
              additionalProperties: false,
              required: ['failure', 'id', 'field', 'expected', 'recorded'],
              properties: {
                failure: { type: 'string' },
                id: { anyOf: [{ type: 'string' }, { type: 'null' }] },
                field: { anyOf: [{ type: 'string' }, { type: 'null' }] },
                expected: { anyOf: [{ type: 'string' }, { type: 'null' }] },
                recorded: { anyOf: [{ type: 'string' }, { type: 'null' }] },
              },
            },
          },
          [READINESS_CHECK_RESULT_DIAGNOSTIC_FIELDS.manifestFailureKinds]: {
            type: 'object',
            additionalProperties: { type: 'number' },
          },
          [READINESS_CHECK_RESULT_DIAGNOSTIC_FIELDS.manifestFailureKindArtifacts]: {
            type: 'object',
            additionalProperties: {
              type: 'array',
              items: { type: 'string' },
            },
          },
          [READINESS_CHECK_RESULT_DIAGNOSTIC_FIELDS.iosInstallEvidenceErrors]: {
            type: 'array',
            items: { type: 'string' },
          },
          [READINESS_CHECK_RESULT_DIAGNOSTIC_FIELDS.iosInstallEvidenceRepairTargets]: {
            type: 'array',
            items: {
              type: 'object',
              additionalProperties: false,
              required: ['index', 'id', 'file', 'errors'],
              properties: {
                index: { anyOf: [{ type: 'integer', minimum: 0 }, { type: 'null' }] },
                id: { type: 'string' },
                file: { anyOf: [{ type: 'string' }, { type: 'null' }] },
                errors: {
                  type: 'array',
                  items: { type: 'string' },
                },
                recommendedCommand: { type: 'string' },
                recommendedNpmScript: { type: 'string' },
              },
            },
          },
          [READINESS_CHECK_RESULT_DIAGNOSTIC_FIELDS.recommendedActionCode]: {
            type: 'string',
            enum: READINESS_ALL_ACTION_CODES,
          },
          [READINESS_CHECK_RESULT_DIAGNOSTIC_FIELDS.recommendedAction]: { type: 'string' },
        },
      },
      checkBlockingState: {
        type: 'object',
        additionalProperties: false,
        allOf: [
          { $ref: '#/$defs/blockingReasonLabelConsistency' },
          { $ref: '#/$defs/blockingReasonCountConsistency' },
        ],
        required: READINESS_CHECK_BLOCKING_STATE_REQUIRED_FIELDS,
        properties: {
          [READINESS_CHECK_BLOCKING_STATE_FIELDS.configured]: { type: 'boolean' },
          [READINESS_CHECK_BLOCKING_STATE_FIELDS.present]: { type: 'boolean' },
          [READINESS_CHECK_BLOCKING_STATE_FIELDS.status]: { type: 'string' },
          [READINESS_CHECK_BLOCKING_STATE_FIELDS.blocksReadiness]: { type: 'boolean' },
          [READINESS_CHECK_BLOCKING_STATE_FIELDS.blockingReasons]: {
            description: 'Blocking reason codes; the empty array pairs with the empty blockingReasonLabels object for non-blocking check states.',
            type: 'array',
            default: [],
            maxItems: BLOCKING_REASON_VALUES.length,
            uniqueItems: true,
            items: {
              type: 'string',
              enum: BLOCKING_REASON_VALUES,
            },
          },
          [READINESS_CHECK_BLOCKING_STATE_FIELDS.blockingReasonCount]: {
            description: 'Derived count of blockingReasons; the empty default is 0.',
            type: 'integer',
            minimum: 0,
            maximum: BLOCKING_REASON_VALUES.length,
            default: 0,
          },
          [READINESS_CHECK_BLOCKING_STATE_FIELDS.blockingReasonLabels]: { $ref: '#/$defs/blockingReasonLabels' },
        },
      },
      repairDiagnostic: {
        type: 'object',
        additionalProperties: false,
        allOf: [{ $ref: '#/$defs/duplicateFieldDiagnosticCountConsistency' }],
        required: READINESS_REPAIR_DIAGNOSTIC_REQUIRED_FIELDS,
        properties: {
          [READINESS_REPAIR_DIAGNOSTIC_FIELDS.statusGuidance]: { $ref: '#/$defs/nullableString' },
          [READINESS_REPAIR_DIAGNOSTIC_FIELDS.errorSections]: {
            type: 'array',
            items: { type: 'string' },
          },
          [READINESS_REPAIR_DIAGNOSTIC_FIELDS.missingFieldsBySection]: {
            type: 'object',
            additionalProperties: {
              type: 'array',
              items: { type: 'string' },
            },
          },
          [READINESS_REPAIR_DIAGNOSTIC_FIELDS.fieldMetadataAvailable]: {
            description: 'True when fields contains generated field-level repair metadata and must match whether fields is non-empty; false when field-level repair metadata is unavailable.',
            type: 'boolean',
            default: false,
          },
          [READINESS_REPAIR_DIAGNOSTIC_FIELDS.rejectedFields]: {
            description: 'Derived from fields entries where accepted is false; exact duplicate rejected-field objects are rejected.',
            default: [],
            type: 'array',
            uniqueItems: true,
            items: { $ref: '#/$defs/rejectedField' },
          },
          [READINESS_REPAIR_DIAGNOSTIC_FIELDS.rejectedFieldReasons]: {
            description: 'Reason-count projection derived from rejectedFields; present reason keys use positive integer counts.',
            default: {},
            $ref: '#/$defs/rejectedFieldReasonCounts',
          },
          [READINESS_REPAIR_DIAGNOSTIC_FIELDS.rejectedFieldReasonEntries]: {
            description: 'Reason-count entries derived from rejectedFieldReasons, ordered by the canonical rejected-field reason enum, bounded to that reason vocabulary, rejecting exact duplicate entries, and including only positive integer counts.',
            default: [],
            $ref: '#/$defs/rejectedFieldReasonEntries',
          },
          [READINESS_REPAIR_DIAGNOSTIC_FIELDS.duplicateFieldDiagnostics]: { $ref: '#/$defs/duplicateFieldDiagnostics' },
          [READINESS_REPAIR_DIAGNOSTIC_FIELDS.duplicateFieldDiagnosticCount]: {
            description: 'Derived count of true duplicateFieldDiagnostics flags for check repair diagnostics; must stay aligned with fields, rejectedFields, and rejectedFieldReasonEntries booleans, and default 0 pairs with the all-false duplicateFieldDiagnostics empty state.',
            type: 'integer',
            minimum: 0,
            maximum: DUPLICATE_FIELD_DIAGNOSTIC_KEYS.length,
            default: 0,
          },
        },
      },
      blockingTarget: {
        type: 'object',
        additionalProperties: false,
        allOf: [
          { $ref: '#/$defs/blockingTargetReasonLabelConsistency' },
          { $ref: '#/$defs/blockingTargetReasonCountConsistency' },
        ],
        required: READINESS_BLOCKING_TARGET_REQUIRED_FIELDS,
        properties: {
          [READINESS_BLOCKING_TARGET_FIELDS.check]: {
            type: 'string',
            enum: READINESS_CHECK_KEYS,
          },
          [READINESS_BLOCKING_TARGET_FIELDS.configured]: { type: 'boolean' },
          [READINESS_BLOCKING_TARGET_FIELDS.present]: { type: 'boolean' },
          [READINESS_BLOCKING_TARGET_FIELDS.status]: { type: 'string' },
          [READINESS_BLOCKING_TARGET_FIELDS.path]: { $ref: '#/$defs/nullableString' },
          [READINESS_BLOCKING_TARGET_FIELDS.blockingReasons]: {
            description: 'Blocking reason codes for this compact blocking target; labels must use the same keys in blockingReasonLabels.',
            type: 'array',
            default: [],
            maxItems: BLOCKING_REASON_VALUES.length,
            uniqueItems: true,
            items: {
              type: 'string',
              enum: BLOCKING_REASON_VALUES,
            },
          },
          [READINESS_BLOCKING_TARGET_FIELDS.blockingReasonCount]: {
            description: 'Derived count of blockingReasons for this compact blocking target.',
            type: 'integer',
            minimum: 0,
            maximum: BLOCKING_REASON_VALUES.length,
            default: 0,
          },
          [READINESS_BLOCKING_TARGET_FIELDS.blockingReasonLabels]: { $ref: '#/$defs/blockingReasonLabels' },
        },
      },
      repairTarget: {
        type: 'object',
        additionalProperties: false,
        allOf: [
          { $ref: '#/$defs/duplicateFieldDiagnosticCountConsistency' },
          { $ref: '#/$defs/duplicateHumanEvidenceReasonConsistency' },
          { $ref: '#/$defs/repairTargetReasonLabelConsistency' },
          { $ref: '#/$defs/repairTargetReasonCountConsistency' },
        ],
        required: READINESS_REPAIR_TARGET_REQUIRED_FIELDS,
        properties: {
          [READINESS_REPAIR_TARGET_FIELDS.check]: {
            type: 'string',
            enum: READINESS_CHECK_REPAIR_DIAGNOSTIC_KEYS,
          },
          [READINESS_REPAIR_TARGET_FIELDS.status]: { $ref: '#/$defs/nullableString' },
          [READINESS_REPAIR_TARGET_FIELDS.path]: { $ref: '#/$defs/nullableString' },
          [READINESS_REPAIR_TARGET_FIELDS.reasons]: {
            description: 'Repair routing reasons; the empty array pairs with the empty reasonLabels object, and duplicate-human-evidence is required when duplicateFieldDiagnosticCount is positive and rejected when the count is zero.',
            type: 'array',
            default: [],
            maxItems: REPAIR_TARGET_REASON_VALUES.length,
            uniqueItems: true,
            items: {
              type: 'string',
              enum: REPAIR_TARGET_REASON_VALUES,
            },
          },
          [READINESS_REPAIR_TARGET_FIELDS.reasonCount]: {
            description: 'Derived count of reasons for this compact repair target.',
            type: 'integer',
            minimum: 0,
            maximum: REPAIR_TARGET_REASON_VALUES.length,
            default: 0,
          },
          [READINESS_REPAIR_TARGET_FIELDS.reasonLabels]: {
            description: 'Human-readable labels keyed by each repair routing reason; keys must match reasons and values come from the shared readiness action-code contract.',
            type: 'object',
            default: {},
            additionalProperties: false,
            properties: Object.fromEntries(
              REPAIR_TARGET_REASON_VALUES.map((reason) => [
                reason,
                { const: REPAIR_TARGET_REASON_LABELS[reason] },
              ]),
            ),
          },
          [READINESS_REPAIR_TARGET_FIELDS.statusGuidance]: { $ref: '#/$defs/nullableString' },
          [READINESS_REPAIR_TARGET_FIELDS.errorSections]: {
            type: 'array',
            items: { type: 'string' },
          },
          [READINESS_REPAIR_TARGET_FIELDS.errorSectionCount]: { type: 'integer', minimum: 0 },
          [READINESS_REPAIR_TARGET_FIELDS.missingFieldsBySection]: {
            type: 'object',
            additionalProperties: {
              type: 'array',
              items: { type: 'string' },
            },
          },
          [READINESS_REPAIR_TARGET_FIELDS.missingFieldCount]: { type: 'integer', minimum: 0 },
          [READINESS_REPAIR_TARGET_FIELDS.fieldMetadataAvailable]: {
            description: 'True when fields contains generated field-level repair metadata and must match whether fields is non-empty; false when field-level repair metadata is unavailable.',
            type: 'boolean',
            default: false,
          },
          [READINESS_REPAIR_TARGET_FIELDS.rejectedFields]: {
            description: 'Derived from fields entries where accepted is false; exact duplicate rejected-field objects are rejected.',
            default: [],
            type: 'array',
            uniqueItems: true,
            items: { $ref: '#/$defs/rejectedField' },
          },
          [READINESS_REPAIR_TARGET_FIELDS.rejectedFieldCount]: {
            description: 'Derived from rejectedFields.length.',
            type: 'integer',
            minimum: 0,
            default: 0,
          },
          [READINESS_REPAIR_TARGET_FIELDS.rejectedFieldReasons]: {
            description: 'Reason-count projection derived from rejectedFields; present reason keys use positive integer counts.',
            default: {},
            $ref: '#/$defs/rejectedFieldReasonCounts',
          },
          [READINESS_REPAIR_TARGET_FIELDS.rejectedFieldReasonEntries]: {
            description: 'Reason-count entries derived from rejectedFieldReasons, ordered by the canonical rejected-field reason enum, bounded to that reason vocabulary, rejecting exact duplicate entries, and including only positive integer counts.',
            default: [],
            $ref: '#/$defs/rejectedFieldReasonEntries',
          },
          [READINESS_REPAIR_TARGET_FIELDS.duplicateFieldDiagnostics]: { $ref: '#/$defs/duplicateFieldDiagnostics' },
          [READINESS_REPAIR_TARGET_FIELDS.duplicateFieldDiagnosticCount]: {
            description: 'Derived count of true duplicateFieldDiagnostics flags for repair targets; must stay aligned with fields, rejectedFields, and rejectedFieldReasonEntries booleans, default 0 pairs with the all-false duplicateFieldDiagnostics empty state, and positive counts correspond to the duplicate-human-evidence repair reason.',
            type: 'integer',
            minimum: 0,
            maximum: DUPLICATE_FIELD_DIAGNOSTIC_KEYS.length,
            default: 0,
          },
        },
      },
      blockingReasonLabelConsistency: blockingReasonLabelConsistency(),
      blockingReasonCountConsistency: blockingReasonCountConsistency(),
      blockingTargetReasonLabelConsistency: blockingTargetReasonLabelConsistency(),
      blockingTargetReasonCountConsistency: blockingTargetReasonCountConsistency(),
      repairTargetReasonCountConsistency: repairTargetReasonCountConsistency(),
      blockingReasonLabels: {
        description: 'Human-readable labels keyed by each blocking reason; keys must match blockingReasons and values come from the shared readiness action-code contract.',
        type: 'object',
        default: {},
        additionalProperties: false,
        properties: Object.fromEntries(
          BLOCKING_REASON_VALUES.map((reason) => [
            reason,
            { const: BLOCKING_REASON_LABELS[reason] },
          ]),
        ),
      },
      duplicateFieldDiagnosticCountConsistency: duplicateDiagnosticCountConsistency(),
      duplicateHumanEvidenceReasonConsistency: duplicateHumanEvidenceReasonConsistency(),
      repairTargetReasonLabelConsistency: repairTargetReasonLabelConsistency(),
      duplicateFieldDiagnostics: {
        description: 'Duplicate human-evidence metadata diagnostics derived from the source check payload; the all-false default pairs with duplicateFieldDiagnosticCount 0, and true values feed the positive count plus duplicate-human-evidence repair reason.',
        type: 'object',
        default: DUPLICATE_FIELD_DIAGNOSTIC_DEFAULT,
        additionalProperties: false,
        required: DUPLICATE_FIELD_DIAGNOSTIC_KEYS,
        properties: Object.fromEntries(
          DUPLICATE_FIELD_DIAGNOSTIC_KEYS.map((key) => [
            key,
            { type: 'boolean', default: false },
          ]),
        ),
      },
      rejectedField: {
        type: 'object',
        additionalProperties: false,
        required: REJECTED_FIELD_REQUIRED_FIELDS,
        properties: {
          [REJECTED_FIELD_FIELDS.label]: { type: 'string' },
          [REJECTED_FIELD_FIELDS.section]: { $ref: '#/$defs/nullableString' },
          [REJECTED_FIELD_FIELDS.scope]: { $ref: '#/$defs/nullableString' },
          [REJECTED_FIELD_FIELDS.reason]: {
            type: 'string',
            enum: REJECTED_FIELD_REASON_VALUES,
          },
        },
      },
      rejectedFieldReasonCounts: {
        default: {},
        type: 'object',
        maxProperties: REJECTED_FIELD_REASON_VALUES.length,
        propertyNames: {
          enum: REJECTED_FIELD_REASON_VALUES,
        },
        additionalProperties: { type: 'integer', minimum: 1 },
      },
      rejectedFieldReasonEntries: {
        default: [],
        type: 'array',
        maxItems: REJECTED_FIELD_REASON_VALUES.length,
        uniqueItems: true,
        items: {
          type: 'object',
          additionalProperties: false,
          required: REJECTED_FIELD_REASON_ENTRY_REQUIRED_FIELDS,
          properties: {
            [REJECTED_FIELD_REASON_ENTRY_FIELDS.reason]: {
              type: 'string',
              enum: REJECTED_FIELD_REASON_VALUES,
            },
            [REJECTED_FIELD_REASON_ENTRY_FIELDS.count]: { type: 'integer', minimum: 1 },
          },
        },
      },
    },
  };
}

function writeOutput(outputPath, contents) {
  const absolutePath = path.resolve(process.cwd(), outputPath);
  const outputDir = path.dirname(absolutePath);
  const tempPath = `${absolutePath}.tmp-${process.pid}`;

  try {
    fs.mkdirSync(outputDir, { recursive: true });
    fs.writeFileSync(tempPath, contents);
    fs.renameSync(tempPath, absolutePath);
  } catch (error) {
    fs.rmSync(tempPath, { force: true });
    throw error;
  }
}

function main() {
  const args = parseArgs(process.argv.slice(2));
  const output = `${JSON.stringify(buildSchema(), null, 2)}\n`;

  if (args.outputPath) {
    writeOutput(args.outputPath, output);
  }

  process.stdout.write(output);
}

try {
  main();
} catch (error) {
  console.error(`ops-readiness-report-json-check-schema failed: ${error.message}`);
  process.exitCode = 1;
}
