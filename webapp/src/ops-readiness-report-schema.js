#!/usr/bin/env node

import fs from 'node:fs';
import path from 'node:path';

import {
  READINESS_ACTION_LABELS,
  READINESS_SOURCE_ACTION_CODES,
} from './ops-readiness-action-code-contract.js';
import {
  CHECK_FIELD_REASON_VALUES,
  REJECTED_FIELD_REASON_VALUES,
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

function buildSchema() {
  return {
    $schema: 'https://json-schema.org/draft/2020-12/schema',
    $id: 'https://travel-planner.local/schemas/ops-readiness-report.schema.json',
    title: 'Travel Planner operations readiness report JSON',
    metadata: {
      target: 'readiness-report-json',
      artifact: 'ops-readiness-report.json',
      actionCodes: Object.fromEntries(
        READINESS_SOURCE_ACTION_CODES.map((code) => [code, READINESS_ACTION_LABELS[code]]),
      ),
    },
    type: 'object',
    additionalProperties: false,
    required: [
      'schemaVersion',
      'generatedAt',
      'target',
      'readiness',
      'recommendedActionCode',
      'recommendedAction',
      'evidenceSummary',
      'evidenceSummaryCheck',
      'manifestCheck',
      'handoffReportCheck',
      'actionCodesCheck',
      'incidentReportCheck',
    ],
    properties: {
      schemaVersion: { const: 1 },
      generatedAt: { type: 'string', format: 'date-time' },
      target: { const: 'readiness-report-json' },
      readiness: {
        type: 'string',
        enum: ['ready', 'operator_review_required', 'not_ready'],
      },
      recommendedActionCode: {
        type: 'string',
        enum: READINESS_SOURCE_ACTION_CODES,
      },
      recommendedAction: { type: 'string' },
      evidenceSummary: { $ref: '#/$defs/evidenceSummary' },
      evidenceSummaryCheck: { $ref: '#/$defs/checkResult' },
      manifestCheck: { $ref: '#/$defs/checkResult' },
      handoffReportCheck: { $ref: '#/$defs/checkResult' },
      actionCodesCheck: { $ref: '#/$defs/checkResult' },
      incidentReportCheck: { $ref: '#/$defs/checkResult' },
    },
    $defs: {
      stringList: {
        type: 'array',
        items: { type: 'string' },
      },
      nullableString: {
        anyOf: [{ type: 'string' }, { type: 'null' }],
      },
      evidenceSummary: {
        type: 'object',
        additionalProperties: false,
        required: [
          'path',
          'generatedAt',
          'status',
          'ok',
          'evidenceDir',
          'strictFailures',
          'manualReviewRequired',
          'missingArtifacts',
          'missingManualEvidence',
          'iosInstallEvidence',
        ],
        properties: {
          path: { type: 'string' },
          generatedAt: { $ref: '#/$defs/nullableString' },
          status: { type: 'string' },
          ok: { type: 'boolean' },
          evidenceDir: { $ref: '#/$defs/nullableString' },
          strictFailures: { $ref: '#/$defs/stringList' },
          manualReviewRequired: { $ref: '#/$defs/stringList' },
          missingArtifacts: { $ref: '#/$defs/stringList' },
          missingManualEvidence: { $ref: '#/$defs/stringList' },
          iosInstallEvidence: {
            type: 'array',
            items: {
              type: 'object',
              additionalProperties: true,
              required: ['id', 'label', 'status', 'envPath', 'file', 'present', 'bytes', 'modifiedAt'],
              properties: {
                id: { type: 'string' },
                label: { type: 'string' },
                status: { type: 'string' },
                envPath: { type: 'string' },
                file: { type: 'string' },
                present: { type: 'boolean' },
                bytes: { type: 'number' },
                modifiedAt: { $ref: '#/$defs/nullableString' },
                action: { type: 'string' },
                title: { type: 'string' },
                nextCommand: { type: 'string' },
                phoneFirst: { type: 'boolean' },
                phoneStep: { type: 'string' },
                installUrl: { type: 'string' },
                shortInstallUrl: { type: 'string' },
                proofSaveHash: { type: 'string' },
                proofSaveTargetId: { type: 'string' },
                proofSaveUrl: { type: 'string' },
                installStartReadiness: { type: 'string' },
                recommendedShortInstallUrl: { type: 'string' },
                recommendedInstallUrl: { type: 'string' },
                sessionQrUrl: { type: 'string' },
                nextActionBoardUrl: { type: 'string' },
                postInstallAppHomeUrl: { type: 'string' },
                postInstallNewPlanUrl: { type: 'string' },
                appHomeFirstPlanUrl: { type: 'string' },
                handoffCheckStatus: { type: 'string' },
                handoffProofSaveHash: { type: 'string' },
                handoffProofSaveTargetId: { type: 'string' },
                handoffProofSaveUrl: { type: 'string' },
                handoffPostInstallAppHomeUrl: { type: 'string' },
                handoffPostInstallNewPlanUrl: { type: 'string' },
                handoffIssueCount: { type: 'number' },
                quickstartCheckStatus: { type: 'string' },
                quickstartUrlOrigin: { type: 'string' },
                quickstartUrlSameOrigin: { type: 'boolean' },
                quickstartProofSaveHash: { type: 'string' },
                quickstartProofSaveTargetId: { type: 'string' },
                quickstartProofSaveUrl: { type: 'string' },
                quickstartPostInstallAppHomeUrl: { type: 'string' },
                quickstartPostInstallNewPlanUrl: { type: 'string' },
                quickstartCompletionStatusUrl: { type: 'string' },
                quickstartPrepareCommand: { type: 'string' },
                quickstartStatusCommand: { type: 'string' },
                quickstartFinishCommand: { type: 'string' },
                quickstartStepCount: { type: 'number' },
                quickstartRecoveryHintCount: { type: 'number' },
                quickstartIssueCount: { type: 'number' },
                beforePhoneTerminalCommand: { type: 'string' },
                beforePhoneFinalTerminalCommand: { type: 'string' },
                beforePhoneFinalThenNextTerminalCommand: { type: 'string' },
                afterPhoneThenAllTerminalCommand: { type: 'string' },
                afterPhoneThenAllFinalTerminalCommand: { type: 'string' },
                stepCount: { type: 'number' },
                launchProofStatus: { type: 'string' },
                launchProofSummary: { type: 'string' },
                launchProofDisplayMode: { type: 'string' },
                launchProofAppModeState: { type: 'string' },
                launchProofAppModeTitle: { type: 'string' },
                launchProofAppModeDetail: { type: 'string' },
                launchProofCapturedAt: { type: 'string' },
                launchProofSavedAt: { type: 'string' },
                launchProofOk: { type: 'boolean' },
                launchProofStandalone: { type: 'boolean' },
                readinessMode: { type: 'string' },
                handoffReady: { type: 'boolean' },
                requireInstallRunbook: { type: 'boolean' },
                installReadinessSource: { type: 'string' },
                installReadinessHttps: { type: 'boolean' },
                installReadinessSameWifiRequired: { type: 'boolean' },
                installReadinessSafariRequired: { type: 'boolean' },
                installReadinessSummary: { type: 'string' },
                nextActionFinalGateCommand: { type: 'string' },
                phaseCount: { type: 'number' },
                installSessionUrl: { type: 'string' },
                installSessionQrUrl: { type: 'string' },
                installHandoffFetchUrl: { type: 'string' },
                installHandoffFetchOk: { type: 'boolean' },
                installHandoffFetchStatus: { type: 'string' },
                installHandoffFetchSummary: { type: 'string' },
                installSessionQrFetchUrl: { type: 'string' },
                installSessionQrFetchTargetUrl: { type: 'string' },
                installSessionQrFetchOk: { type: 'boolean' },
                installSessionQrFetchStatus: { type: 'string' },
                installSessionQrFetchSummary: { type: 'string' },
                installSessionQrFetchHttpStatus: { type: 'number' },
                installSessionQrFetchContentType: { type: 'string' },
                installSessionQrTargetParamFetchUrl: { type: 'string' },
                installSessionQrTargetParamFetchTargetUrl: { type: 'string' },
                installSessionQrTargetParamFetchOk: { type: 'boolean' },
                installSessionQrTargetParamFetchStatus: { type: 'string' },
                installSessionQrTargetParamFetchSummary: { type: 'string' },
                installSessionQrTargetParamFetchHttpStatus: { type: 'number' },
                installSessionQrTargetParamFetchContentType: { type: 'string' },
                sessionRecoveryOk: { type: 'boolean' },
                sessionRecoveryStatus: { type: 'string' },
                sessionRecoveryUrl: { type: 'string' },
                sessionRecoveryTriggerField: { type: 'string' },
                sessionRecoveryTriggerValue: { type: 'boolean' },
                sessionRecoverySequenceCount: { type: 'number' },
                sessionRecoveryHandoffEvidenceCommand: { type: 'string' },
                sessionRecoveryHandoffEvidenceTerminalCommand: { type: 'string' },
                sessionRecoverySessionEvidenceCommand: { type: 'string' },
                sessionRecoverySessionEvidenceTerminalCommand: { type: 'string' },
                sessionRecoveryHandoffSessionEvidenceCommand: { type: 'string' },
                sessionRecoveryHandoffSessionEvidenceTerminalCommand: { type: 'string' },
                sessionRecoveryFinalGateCommand: { type: 'string' },
                sessionRecoveryIssueCount: { type: 'number' },
              },
            },
          },
        },
      },
      checkResult: {
        type: 'object',
        additionalProperties: false,
        allOf: [
          {
            if: {
              properties: { fieldMetadataAvailable: { const: true } },
              required: ['fieldMetadataAvailable'],
            },
            then: {
              properties: { fields: { minItems: 1 } },
            },
          },
          {
            if: {
              properties: { fieldMetadataAvailable: { const: false } },
              required: ['fieldMetadataAvailable'],
            },
            then: {
              properties: { fields: { maxItems: 0 } },
            },
          },
        ],
        required: [
          'configured',
          'present',
          'path',
          'status',
          'metadataFailures',
          'summaryRoleArtifactsExpected',
          'summaryRoleArtifacts',
          'summaryRoleIndexFailures',
          'summaryRoleIndexFailureDetails',
          'operatorCheckFailures',
          'operatorCheckFailureDetails',
          'failureKinds',
          'failureKindArtifacts',
          'statusGuidance',
          'errorsBySection',
          'missingFieldsBySection',
          'fields',
          'fieldMetadataAvailable',
          'rejectedFields',
          'rejectedFieldCount',
          'rejectedFieldReasons',
          'rejectedFieldReasonEntries',
          'errors',
          'blocksReadiness',
        ],
        properties: {
          configured: { type: 'boolean' },
          present: { type: 'boolean' },
          path: { type: 'string' },
          status: { type: 'string' },
          checkedAt: { $ref: '#/$defs/nullableString' },
          reportPath: { $ref: '#/$defs/nullableString' },
          summaryPath: { $ref: '#/$defs/nullableString' },
          catalogPath: { $ref: '#/$defs/nullableString' },
          manifestGeneratedAt: { $ref: '#/$defs/nullableString' },
          requireDriftAcceptance: { type: 'boolean' },
          failures: { $ref: '#/$defs/stringList' },
          metadataFailures: { $ref: '#/$defs/stringList' },
          summaryRoleArtifactsExpected: {
            type: 'object',
            additionalProperties: { $ref: '#/$defs/stringList' },
          },
          summaryRoleArtifacts: {
            type: 'object',
            additionalProperties: { $ref: '#/$defs/stringList' },
          },
          summaryRoleIndexFailures: { $ref: '#/$defs/stringList' },
          summaryRoleIndexFailureDetails: {
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
          operatorCheckFailures: { $ref: '#/$defs/stringList' },
          operatorCheckFailureDetails: {
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
          failureKinds: {
            type: 'object',
            additionalProperties: { type: 'number' },
          },
          failureKindArtifacts: {
            type: 'object',
            additionalProperties: { $ref: '#/$defs/stringList' },
          },
          statusGuidance: { $ref: '#/$defs/nullableString' },
          errorsBySection: {
            type: 'object',
            additionalProperties: { $ref: '#/$defs/stringList' },
          },
          missingFieldsBySection: {
            type: 'object',
            additionalProperties: { $ref: '#/$defs/stringList' },
          },
          fields: {
            description: 'Canonical repair metadata source used to derive rejectedFields and rejected-field reason summaries; exact duplicate field records are rejected, and an empty array means no field-level repair metadata is available.',
            default: [],
            type: 'array',
            uniqueItems: true,
            items: {
              type: 'object',
              additionalProperties: false,
              required: ['label', 'section', 'scope', 'present', 'accepted', 'reason'],
              properties: {
                label: { type: 'string' },
                section: { $ref: '#/$defs/nullableString' },
                scope: { $ref: '#/$defs/nullableString' },
                present: { type: 'boolean' },
                accepted: { type: 'boolean' },
                reason: {
                  type: 'string',
                  enum: CHECK_FIELD_REASON_VALUES,
                },
              },
            },
          },
          fieldMetadataAvailable: {
            description: 'True when fields contains generated field-level repair metadata and must match whether fields is non-empty; false when field-level repair metadata is unavailable.',
            type: 'boolean',
            default: false,
          },
          rejectedFields: {
            description: 'Derived from fields entries where accepted is false; exact duplicate rejected-field objects are rejected.',
            default: [],
            type: 'array',
            uniqueItems: true,
            items: {
              type: 'object',
              additionalProperties: false,
              required: ['label', 'section', 'scope', 'reason'],
              properties: {
                label: { type: 'string' },
                section: { $ref: '#/$defs/nullableString' },
                scope: { $ref: '#/$defs/nullableString' },
                reason: {
                  type: 'string',
                  enum: REJECTED_FIELD_REASON_VALUES,
                },
              },
            },
          },
          rejectedFieldCount: {
            description: 'Derived from rejectedFields.length.',
            type: 'integer',
            minimum: 0,
            default: 0,
          },
          rejectedFieldReasons: {
            description: 'Reason-count projection derived from rejectedFields; present reason keys use positive integer counts.',
            default: {},
            type: 'object',
            maxProperties: REJECTED_FIELD_REASON_VALUES.length,
            propertyNames: {
              enum: REJECTED_FIELD_REASON_VALUES,
            },
            additionalProperties: { type: 'integer', minimum: 1 },
          },
          rejectedFieldReasonEntries: {
            description: 'Reason-count entries derived from rejectedFieldReasons, ordered by the canonical rejected-field reason enum, bounded to that reason vocabulary, rejecting exact duplicate entries, and including only positive integer counts.',
            default: [],
            type: 'array',
            maxItems: REJECTED_FIELD_REASON_VALUES.length,
            uniqueItems: true,
            items: {
              type: 'object',
              additionalProperties: false,
              required: ['reason', 'count'],
              properties: {
                reason: {
                  type: 'string',
                  enum: REJECTED_FIELD_REASON_VALUES,
                },
                count: { type: 'integer', minimum: 1 },
              },
            },
          },
          errors: { $ref: '#/$defs/stringList' },
          allowedValues: { $ref: '#/$defs/stringList' },
          value: { $ref: '#/$defs/nullableString' },
          blocksReadiness: { type: 'boolean' },
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
  console.error(`ops-readiness-report-schema failed: ${error.message}`);
  process.exitCode = 1;
}
