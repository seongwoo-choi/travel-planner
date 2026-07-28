#!/usr/bin/env node

import fs from 'node:fs';
import path from 'node:path';

import {
  READINESS_ACTION_LABELS,
  READINESS_BLOCKING_TARGET_FIELDS as BLOCKING_TARGET_FIELDS,
  READINESS_BLOCKING_REASON_LABELS as BLOCKING_REASON_LABELS,
  READINESS_BLOCKING_REASONS as BLOCKING_REASONS,
  READINESS_CHECK_BLOCKING_STATE_FIELDS as CHECK_BLOCKING_STATE_FIELDS,
  READINESS_CHECK_REPAIR_DIAGNOSTIC_KEYS,
  READINESS_CHECK_RESULT_DIAGNOSTIC_FIELDS as DIAGNOSTIC_FIELDS,
  READINESS_CHECK_RESULT_FIELDS,
  READINESS_CHECK_KEYS as REQUIRED_CHECKS,
  READINESS_CHECK_RESULT_SCHEMA_VERSION,
  READINESS_CHECK_RESULT_STATUSES,
  READINESS_DUPLICATE_FIELD_DIAGNOSTIC_KEYS as DUPLICATE_FIELD_DIAGNOSTIC_KEYS,
  READINESS_REPAIR_TARGET_REASON_LABELS as REPAIR_TARGET_REASON_LABELS,
  READINESS_REPAIR_TARGET_REASONS as REPAIR_TARGET_REASONS,
  READINESS_REPAIR_TARGET_FIELDS as REPAIR_TARGET_FIELDS,
  READINESS_REPAIR_DIAGNOSTIC_FIELDS as REPAIR_DIAGNOSTIC_FIELDS,
  READINESS_REPORT_SCHEMA_VERSION,
  READINESS_REPORT_TARGET,
  READINESS_REQUIRED_PRESENT_CHECK_KEYS,
  READINESS_SOURCE_PATH_CHECK_KEYS,
  READINESS_SOURCE_PATH_FIELDS,
  READINESS_SOURCE_ACTION_CODES,
  READINESS_VALUES,
} from './ops-readiness-action-code-contract.js';
import {
  CHECK_FIELD_REASONS,
  REJECTED_FIELD_FIELDS,
  REJECTED_FIELD_REASON_ENTRY_FIELDS,
  REJECTED_FIELD_REASONS,
  SOURCE_CHECK_PAYLOAD_FIELDS,
  SOURCE_CHECK_PAYLOAD_REQUIRED_FIELDS,
  SOURCE_CHECK_FIELD_FIELDS,
  buildRejectedFieldReasonEntries,
  buildRejectedFieldReasons,
  buildRejectedFields,
} from './ops-human-evidence-check.js';

const READINESS_VALUE_SET = new Set(READINESS_VALUES);
const REQUIRED_PRESENT_CHECKS = new Set(READINESS_REQUIRED_PRESENT_CHECK_KEYS);
const SOURCE_RECOMMENDED_ACTION_CODES = new Set(READINESS_SOURCE_ACTION_CODES);

function parseArgs(argv) {
  const args = {
    strict: false,
    jsonPath:
      process.env.TRAVEL_READINESS_REPORT_JSON_PATH ||
      path.join(process.env.TRAVEL_EVIDENCE_DIR || 'reports', 'ops-readiness-report.json'),
    outputPath: '',
    outputEnv: '',
    outputDefaultEvidence: '',
  };

  for (const arg of argv) {
    if (arg === '--strict') {
      args.strict = true;
    } else if (arg.startsWith('--json=')) {
      args.jsonPath = arg.slice('--json='.length);
    } else if (arg.startsWith('--json-env=')) {
      args.jsonPath = process.env[arg.slice('--json-env='.length)] || args.jsonPath;
    } else if (arg.startsWith('--output=')) {
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

function isObject(value) {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function isStringList(value) {
  return Array.isArray(value) && value.every((item) => typeof item === 'string');
}

function isNumberRecord(value) {
  return isObject(value) && Object.values(value).every((item) => typeof item === 'number');
}

function isNonNegativeInteger(value) {
  return Number.isInteger(value) && value >= 0;
}

function isPositiveInteger(value) {
  return Number.isInteger(value) && value > 0;
}

function buildReasonLabels(reasons, labels) {
  return Object.fromEntries(
    reasons.map((reason) => [reason, labels[reason]]),
  );
}

function isStringListRecord(value) {
  return isObject(value) && Object.values(value).every(isStringList);
}

function isSummaryRoleIndexFailureDetailList(value) {
  return Array.isArray(value) && value.every((detail) =>
    isObject(detail) &&
    typeof detail.failure === 'string' &&
    (typeof detail.role === 'string' || detail.role === null) &&
    isStringList(detail.expected) &&
    isStringList(detail.recorded) &&
    isStringList(detail.expectedRoles) &&
    isStringList(detail.recordedRoles)
  );
}

function isOperatorCheckFailureDetailList(value) {
  return Array.isArray(value) && value.every((detail) =>
    isObject(detail) &&
    typeof detail.failure === 'string' &&
    (typeof detail.id === 'string' || detail.id === null) &&
    (typeof detail.field === 'string' || detail.field === null) &&
    (typeof detail.expected === 'string' || detail.expected === null) &&
    (typeof detail.recorded === 'string' || detail.recorded === null)
  );
}

function isNullableString(value) {
  return value === null || typeof value === 'string';
}

function requireStringList(errors, payload, key) {
  if (!isStringList(payload[key])) {
    errors.push(`invalid-${key}`);
  }
}

function isIosInstallEvidenceList(value) {
  return Array.isArray(value) && value.every((item) =>
    isObject(item) &&
    typeof item.id === 'string' &&
    typeof item.label === 'string' &&
    typeof item.status === 'string' &&
    typeof item.envPath === 'string' &&
    typeof item.file === 'string' &&
    typeof item.present === 'boolean' &&
    typeof item.bytes === 'number' &&
    isNullableString(item.modifiedAt) &&
    (item.action === undefined || typeof item.action === 'string') &&
    (item.proofSaveHash === undefined || typeof item.proofSaveHash === 'string') &&
    (item.proofSaveTargetId === undefined || typeof item.proofSaveTargetId === 'string') &&
    (item.proofSaveUrl === undefined || typeof item.proofSaveUrl === 'string') &&
    (item.launchProofStatus === undefined || typeof item.launchProofStatus === 'string') &&
    (item.launchProofSummary === undefined || typeof item.launchProofSummary === 'string') &&
    (item.launchProofDisplayMode === undefined || typeof item.launchProofDisplayMode === 'string') &&
    (item.launchProofAppModeState === undefined || typeof item.launchProofAppModeState === 'string') &&
    (item.launchProofAppModeTitle === undefined || typeof item.launchProofAppModeTitle === 'string') &&
    (item.launchProofAppModeDetail === undefined || typeof item.launchProofAppModeDetail === 'string') &&
    (item.launchProofCapturedAt === undefined || typeof item.launchProofCapturedAt === 'string') &&
    (item.launchProofSavedAt === undefined || typeof item.launchProofSavedAt === 'string') &&
    (item.launchProofOk === undefined || typeof item.launchProofOk === 'boolean') &&
    (item.launchProofStandalone === undefined || typeof item.launchProofStandalone === 'boolean') &&
    (item.readinessMode === undefined || typeof item.readinessMode === 'string') &&
    (item.installStartReadiness === undefined || typeof item.installStartReadiness === 'string') &&
    (item.recommendedShortInstallUrl === undefined || typeof item.recommendedShortInstallUrl === 'string') &&
    (item.recommendedInstallUrl === undefined || typeof item.recommendedInstallUrl === 'string') &&
    (item.sessionQrUrl === undefined || typeof item.sessionQrUrl === 'string') &&
    (item.nextActionBoardUrl === undefined || typeof item.nextActionBoardUrl === 'string') &&
    (item.postInstallAppHomeUrl === undefined || typeof item.postInstallAppHomeUrl === 'string') &&
    (item.postInstallNewPlanUrl === undefined || typeof item.postInstallNewPlanUrl === 'string') &&
    (item.appHomeFirstPlanUrl === undefined || typeof item.appHomeFirstPlanUrl === 'string') &&
    (item.handoffCheckStatus === undefined || typeof item.handoffCheckStatus === 'string') &&
    (item.handoffProofSaveHash === undefined || typeof item.handoffProofSaveHash === 'string') &&
    (item.handoffProofSaveTargetId === undefined || typeof item.handoffProofSaveTargetId === 'string') &&
    (item.handoffProofSaveUrl === undefined || typeof item.handoffProofSaveUrl === 'string') &&
    (item.handoffPostInstallAppHomeUrl === undefined || typeof item.handoffPostInstallAppHomeUrl === 'string') &&
    (item.handoffPostInstallNewPlanUrl === undefined || typeof item.handoffPostInstallNewPlanUrl === 'string') &&
    (item.handoffIssueCount === undefined || typeof item.handoffIssueCount === 'number') &&
    (item.quickstartCheckStatus === undefined || typeof item.quickstartCheckStatus === 'string') &&
    (item.quickstartUrlOrigin === undefined || typeof item.quickstartUrlOrigin === 'string') &&
    (item.quickstartUrlSameOrigin === undefined || typeof item.quickstartUrlSameOrigin === 'boolean') &&
    (item.quickstartProofSaveHash === undefined || typeof item.quickstartProofSaveHash === 'string') &&
    (item.quickstartProofSaveTargetId === undefined || typeof item.quickstartProofSaveTargetId === 'string') &&
    (item.quickstartProofSaveUrl === undefined || typeof item.quickstartProofSaveUrl === 'string') &&
    (item.quickstartPostInstallAppHomeUrl === undefined || typeof item.quickstartPostInstallAppHomeUrl === 'string') &&
    (item.quickstartPostInstallNewPlanUrl === undefined || typeof item.quickstartPostInstallNewPlanUrl === 'string') &&
    (item.quickstartCompletionStatusUrl === undefined || typeof item.quickstartCompletionStatusUrl === 'string') &&
    (item.quickstartPrepareCommand === undefined || typeof item.quickstartPrepareCommand === 'string') &&
    (item.quickstartStatusCommand === undefined || typeof item.quickstartStatusCommand === 'string') &&
    (item.quickstartFinishCommand === undefined || typeof item.quickstartFinishCommand === 'string') &&
    (item.quickstartStepCount === undefined || typeof item.quickstartStepCount === 'number') &&
    (item.quickstartRecoveryHintCount === undefined || typeof item.quickstartRecoveryHintCount === 'number') &&
    (item.quickstartIssueCount === undefined || typeof item.quickstartIssueCount === 'number') &&
    (item.beforePhoneTerminalCommand === undefined || typeof item.beforePhoneTerminalCommand === 'string') &&
    (item.beforePhoneFinalTerminalCommand === undefined || typeof item.beforePhoneFinalTerminalCommand === 'string') &&
    (item.beforePhoneFinalThenNextTerminalCommand === undefined || typeof item.beforePhoneFinalThenNextTerminalCommand === 'string') &&
    (item.afterPhoneThenAllTerminalCommand === undefined || typeof item.afterPhoneThenAllTerminalCommand === 'string') &&
    (item.afterPhoneThenAllFinalTerminalCommand === undefined || typeof item.afterPhoneThenAllFinalTerminalCommand === 'string') &&
    (item.stepCount === undefined || typeof item.stepCount === 'number') &&
    (item.handoffReady === undefined || typeof item.handoffReady === 'boolean') &&
    (item.installReadinessSource === undefined || typeof item.installReadinessSource === 'string') &&
    (item.installReadinessHttps === undefined || typeof item.installReadinessHttps === 'boolean') &&
    (item.installReadinessSameWifiRequired === undefined || typeof item.installReadinessSameWifiRequired === 'boolean') &&
    (item.installReadinessSafariRequired === undefined || typeof item.installReadinessSafariRequired === 'boolean') &&
    (item.installReadinessSummary === undefined || typeof item.installReadinessSummary === 'string') &&
    (item.nextActionFinalGateCommand === undefined || typeof item.nextActionFinalGateCommand === 'string') &&
    (item.phaseCount === undefined || typeof item.phaseCount === 'number') &&
    (item.requireInstallRunbook === undefined || typeof item.requireInstallRunbook === 'boolean') &&
    (item.installSessionUrl === undefined || typeof item.installSessionUrl === 'string') &&
    (item.installSessionQrUrl === undefined || typeof item.installSessionQrUrl === 'string') &&
    (item.installHandoffFetchUrl === undefined || typeof item.installHandoffFetchUrl === 'string') &&
    (item.installHandoffFetchOk === undefined || typeof item.installHandoffFetchOk === 'boolean') &&
    (item.installHandoffFetchStatus === undefined || typeof item.installHandoffFetchStatus === 'string') &&
    (item.installHandoffFetchSummary === undefined || typeof item.installHandoffFetchSummary === 'string') &&
    (item.installSessionQrFetchUrl === undefined || typeof item.installSessionQrFetchUrl === 'string') &&
    (item.installSessionQrFetchTargetUrl === undefined || typeof item.installSessionQrFetchTargetUrl === 'string') &&
    (item.installSessionQrFetchOk === undefined || typeof item.installSessionQrFetchOk === 'boolean') &&
    (item.installSessionQrFetchStatus === undefined || typeof item.installSessionQrFetchStatus === 'string') &&
    (item.installSessionQrFetchSummary === undefined || typeof item.installSessionQrFetchSummary === 'string') &&
    (item.installSessionQrFetchHttpStatus === undefined || typeof item.installSessionQrFetchHttpStatus === 'number') &&
    (item.installSessionQrFetchContentType === undefined || typeof item.installSessionQrFetchContentType === 'string') &&
    (item.installSessionQrTargetParamFetchUrl === undefined || typeof item.installSessionQrTargetParamFetchUrl === 'string') &&
    (item.installSessionQrTargetParamFetchTargetUrl === undefined || typeof item.installSessionQrTargetParamFetchTargetUrl === 'string') &&
    (item.installSessionQrTargetParamFetchOk === undefined || typeof item.installSessionQrTargetParamFetchOk === 'boolean') &&
    (item.installSessionQrTargetParamFetchStatus === undefined || typeof item.installSessionQrTargetParamFetchStatus === 'string') &&
    (item.installSessionQrTargetParamFetchSummary === undefined || typeof item.installSessionQrTargetParamFetchSummary === 'string') &&
    (item.installSessionQrTargetParamFetchHttpStatus === undefined || typeof item.installSessionQrTargetParamFetchHttpStatus === 'number') &&
    (item.installSessionQrTargetParamFetchContentType === undefined || typeof item.installSessionQrTargetParamFetchContentType === 'string') &&
    (item.sessionRecoveryOk === undefined || typeof item.sessionRecoveryOk === 'boolean') &&
    (item.sessionRecoveryStatus === undefined || typeof item.sessionRecoveryStatus === 'string') &&
    (item.sessionRecoveryUrl === undefined || typeof item.sessionRecoveryUrl === 'string') &&
    (item.sessionRecoveryTriggerField === undefined || typeof item.sessionRecoveryTriggerField === 'string') &&
    (item.sessionRecoveryTriggerValue === undefined || typeof item.sessionRecoveryTriggerValue === 'boolean') &&
    (item.sessionRecoverySequenceCount === undefined || typeof item.sessionRecoverySequenceCount === 'number') &&
    (item.sessionRecoveryHandoffEvidenceCommand === undefined || typeof item.sessionRecoveryHandoffEvidenceCommand === 'string') &&
    (item.sessionRecoveryHandoffEvidenceTerminalCommand === undefined || typeof item.sessionRecoveryHandoffEvidenceTerminalCommand === 'string') &&
    (item.sessionRecoverySessionEvidenceCommand === undefined || typeof item.sessionRecoverySessionEvidenceCommand === 'string') &&
    (item.sessionRecoverySessionEvidenceTerminalCommand === undefined || typeof item.sessionRecoverySessionEvidenceTerminalCommand === 'string') &&
    (item.sessionRecoveryHandoffSessionEvidenceCommand === undefined || typeof item.sessionRecoveryHandoffSessionEvidenceCommand === 'string') &&
    (item.sessionRecoveryHandoffSessionEvidenceTerminalCommand === undefined || typeof item.sessionRecoveryHandoffSessionEvidenceTerminalCommand === 'string') &&
    (item.sessionRecoveryFinalGateCommand === undefined || typeof item.sessionRecoveryFinalGateCommand === 'string') &&
    (item.sessionRecoveryIssueCount === undefined || typeof item.sessionRecoveryIssueCount === 'number') &&
    (item.id !== 'iosInstallSessionCheck' || item.status !== 'present' || item.sessionRecoveryOk === true)
  );
}

function iosInstallEvidenceErrors(value) {
  if (!Array.isArray(value)) return ['iosInstallEvidence-not-array'];

  const errors = [];
  const requiredFields = {
    id: 'string',
    label: 'string',
    status: 'string',
    envPath: 'string',
    file: 'string',
    present: 'boolean',
    bytes: 'number',
  };
  const optionalStringFields = [
    'action',
    'title',
    'nextCommand',
    'phoneStep',
    'installUrl',
    'shortInstallUrl',
    'proofSaveHash',
    'proofSaveTargetId',
    'proofSaveUrl',
    'launchProofStatus',
    'launchProofSummary',
    'launchProofDisplayMode',
    'launchProofAppModeState',
    'launchProofAppModeTitle',
    'launchProofAppModeDetail',
    'launchProofCapturedAt',
    'launchProofSavedAt',
    'readinessMode',
    'installStartReadiness',
    'recommendedShortInstallUrl',
    'recommendedInstallUrl',
    'sessionQrUrl',
    'nextActionBoardUrl',
    'postInstallAppHomeUrl',
    'postInstallNewPlanUrl',
    'appHomeFirstPlanUrl',
    'handoffCheckStatus',
    'handoffProofSaveHash',
    'handoffProofSaveTargetId',
    'handoffProofSaveUrl',
    'handoffPostInstallAppHomeUrl',
    'handoffPostInstallNewPlanUrl',
    'handoffIssueCount',
    'quickstartCheckStatus',
    'quickstartUrlOrigin',
    'quickstartProofSaveHash',
    'quickstartProofSaveTargetId',
    'quickstartProofSaveUrl',
    'quickstartPostInstallAppHomeUrl',
    'quickstartPostInstallNewPlanUrl',
    'quickstartCompletionStatusUrl',
    'quickstartPrepareCommand',
    'quickstartStatusCommand',
    'quickstartFinishCommand',
    'beforePhoneTerminalCommand',
    'beforePhoneFinalTerminalCommand',
    'beforePhoneFinalThenNextTerminalCommand',
    'afterPhoneThenAllTerminalCommand',
    'afterPhoneThenAllFinalTerminalCommand',
    'installReadinessSource',
    'installReadinessSummary',
    'nextActionFinalGateCommand',
    'installSessionUrl',
    'installSessionQrUrl',
    'installHandoffFetchUrl',
    'installHandoffFetchStatus',
    'installHandoffFetchSummary',
    'installSessionQrFetchUrl',
    'installSessionQrFetchTargetUrl',
    'installSessionQrFetchStatus',
    'installSessionQrFetchSummary',
    'installSessionQrFetchContentType',
    'installSessionQrTargetParamFetchUrl',
    'installSessionQrTargetParamFetchTargetUrl',
    'installSessionQrTargetParamFetchStatus',
    'installSessionQrTargetParamFetchSummary',
    'installSessionQrTargetParamFetchContentType',
    'sessionRecoveryStatus',
    'sessionRecoveryUrl',
    'sessionRecoveryTriggerField',
    'sessionRecoveryHandoffEvidenceCommand',
    'sessionRecoveryHandoffEvidenceTerminalCommand',
    'sessionRecoverySessionEvidenceCommand',
    'sessionRecoverySessionEvidenceTerminalCommand',
    'sessionRecoveryHandoffSessionEvidenceCommand',
    'sessionRecoveryHandoffSessionEvidenceTerminalCommand',
    'sessionRecoveryFinalGateCommand',
  ];
  const optionalNumberFields = [
    'phaseCount',
    'stepCount',
    'quickstartStepCount',
    'quickstartRecoveryHintCount',
    'quickstartIssueCount',
    'installSessionQrFetchHttpStatus',
    'installSessionQrTargetParamFetchHttpStatus',
    'sessionRecoverySequenceCount',
    'sessionRecoveryIssueCount',
  ];
  const optionalBooleanFields = [
    'quickstartUrlSameOrigin',
    'handoffReady',
    'installReadinessHttps',
    'installReadinessSameWifiRequired',
    'installReadinessSafariRequired',
    'launchProofOk',
    'launchProofStandalone',
    'requireInstallRunbook',
    'installHandoffFetchOk',
    'installSessionQrFetchOk',
    'installSessionQrTargetParamFetchOk',
    'sessionRecoveryOk',
    'sessionRecoveryTriggerValue',
  ];

  value.forEach((item, index) => {
    const prefix = `iosInstallEvidence[${index}]`;
    if (!isObject(item)) {
      errors.push(`${prefix}-not-object`);
      return;
    }

    if (item.id === 'iosInstallSessionCheck' && item.status !== 'present') {
      errors.push(`${prefix}-sessionRecovery-missing`);
    }
    if (item.id === 'iosInstallSessionCheck' && item.status === 'present' && item.sessionRecoveryOk !== true) {
      errors.push(`${prefix}-sessionRecovery-not-ready`);
    }
    if (item.id === 'iosInstallQuickstartCheck' && item.status === 'present' && item.quickstartUrlSameOrigin !== true) {
      errors.push(`${prefix}-quickstart-url-origin-drift`);
    }
    for (const [field, type] of Object.entries(requiredFields)) {
      if (typeof item[field] !== type) errors.push(`${prefix}-invalid-${field}`);
    }
    if (!isNullableString(item.modifiedAt)) errors.push(`${prefix}-invalid-modifiedAt`);
    for (const field of optionalStringFields) {
      if (item[field] !== undefined && typeof item[field] !== 'string') {
        errors.push(`${prefix}-invalid-${field}`);
      }
    }
    for (const field of optionalNumberFields) {
      if (item[field] !== undefined && typeof item[field] !== 'number') {
        errors.push(`${prefix}-invalid-${field}`);
      }
    }
    for (const field of optionalBooleanFields) {
      if (item[field] !== undefined && typeof item[field] !== 'boolean') {
        errors.push(`${prefix}-invalid-${field}`);
      }
    }
    if (item.id === 'iosInstallRunbookCheck') {
      if (item.phaseCount !== undefined && item.phaseCount !== 5) {
        errors.push(`${prefix}-unexpected-phaseCount`);
      }
      if (item.nextActionFinalGateCommand !== undefined && item.nextActionFinalGateCommand !== 'npm run ios:install:evidence:after-phone:final') {
        errors.push(`${prefix}-unexpected-nextActionFinalGateCommand`);
      }
    }
    if (item.id === 'iosInstallStart' && item.status === 'present') {
      if (item.stepCount !== 8) {
        errors.push(`${prefix}-unexpected-stepCount`);
      }
      if (item.beforePhoneFinalTerminalCommand !== 'test -d webapp && cd webapp; npm run ios:install:evidence:before-phone:final') {
        errors.push(`${prefix}-unexpected-beforePhoneFinalTerminalCommand`);
      }
      if (item.beforePhoneFinalThenNextTerminalCommand !== 'test -d webapp && cd webapp; npm run ios:install:evidence:before-phone:final:next') {
        errors.push(`${prefix}-unexpected-beforePhoneFinalThenNextTerminalCommand`);
      }
      if (item.afterPhoneThenAllFinalTerminalCommand !== 'test -d webapp && cd webapp; npm run ios:install:evidence:after-phone:final') {
        errors.push(`${prefix}-unexpected-afterPhoneThenAllFinalTerminalCommand`);
      }
    }
  });

  return errors;
}

function iosInstallEvidenceRepairTargets(value) {
  const errors = iosInstallEvidenceErrors(value);
  if (errors.length === 0) return [];
  if (!Array.isArray(value)) {
    return [{
      index: null,
      id: 'iosInstallEvidence',
      file: null,
      errors,
    }];
  }

  return value
    .map((item, index) => {
      const prefix = `iosInstallEvidence[${index}]`;
      const itemErrors = errors.filter((error) => error.startsWith(prefix));
      if (itemErrors.length === 0) return null;
      const sessionRecoveryRepair = isObject(item)
        && item.id === 'iosInstallSessionCheck'
        && itemErrors.some((error) => error.includes('sessionRecovery-'));
      const quickstartOriginRepair = isObject(item)
        && item.id === 'iosInstallQuickstartCheck'
        && itemErrors.some((error) => error.includes('quickstart-url-origin-drift'));
      return {
        index,
        id: isObject(item) && typeof item.id === 'string' ? item.id : prefix,
        file: isObject(item) && typeof item.file === 'string' ? item.file : null,
        errors: itemErrors,
        ...(sessionRecoveryRepair ? {
          recommendedCommand: 'test -d webapp && cd webapp; npm run ios:install:session:evidence',
          recommendedNpmScript: 'npm run ios:install:session:evidence',
        } : {}),
        ...(quickstartOriginRepair ? {
          recommendedCommand: 'test -d webapp && cd webapp; npm run ios:install:quickstart:evidence',
          recommendedNpmScript: 'npm run ios:install:quickstart:evidence',
        } : {}),
      };
    })
    .filter(Boolean);
}

function validateEvidenceSummary(errors, payload) {
  if (!isObject(payload.evidenceSummary)) {
    errors.push('missing-evidenceSummary');
    return;
  }

  const summary = payload.evidenceSummary;

  if (typeof summary.path !== 'string' || !summary.path) {
    errors.push('invalid-evidenceSummary-path');
  }

  if (typeof summary.status !== 'string' || !summary.status) {
    errors.push('invalid-evidenceSummary-status');
  }

  if (typeof summary.ok !== 'boolean') {
    errors.push('invalid-evidenceSummary-ok');
  }

  requireStringList(errors, summary, 'strictFailures');
  requireStringList(errors, summary, 'manualReviewRequired');
  requireStringList(errors, summary, 'missingArtifacts');
  requireStringList(errors, summary, 'missingManualEvidence');

  if (!isIosInstallEvidenceList(summary.iosInstallEvidence)) {
    errors.push('invalid-evidenceSummary-iosInstallEvidence');
  }
}

function isCheckFieldList(value) {
  return Array.isArray(value) && value.every((field) =>
    isObject(field) &&
    typeof field[SOURCE_CHECK_FIELD_FIELDS.label] === 'string' &&
    isNullableString(field[SOURCE_CHECK_FIELD_FIELDS.section]) &&
    isNullableString(field[SOURCE_CHECK_FIELD_FIELDS.scope]) &&
    typeof field[SOURCE_CHECK_FIELD_FIELDS.present] === 'boolean' &&
    typeof field[SOURCE_CHECK_FIELD_FIELDS.accepted] === 'boolean' &&
    typeof field[SOURCE_CHECK_FIELD_FIELDS.reason] === 'string' &&
    CHECK_FIELD_REASONS.has(field[SOURCE_CHECK_FIELD_FIELDS.reason])
  );
}

function isRejectedFieldList(value) {
  return Array.isArray(value) && value.every((field) =>
    isObject(field) &&
    typeof field[REJECTED_FIELD_FIELDS.label] === 'string' &&
    isNullableString(field[REJECTED_FIELD_FIELDS.section]) &&
    isNullableString(field[REJECTED_FIELD_FIELDS.scope]) &&
    typeof field[REJECTED_FIELD_FIELDS.reason] === 'string' &&
    REJECTED_FIELD_REASONS.has(field[REJECTED_FIELD_FIELDS.reason])
  );
}

function isRejectedFieldReasonCounts(value) {
  return isObject(value) && Object.entries(value).every(([reason, count]) =>
    REJECTED_FIELD_REASONS.has(reason) &&
    isPositiveInteger(count)
  );
}

function isRejectedFieldReasonEntries(value) {
  return Array.isArray(value) && value.every((entry) =>
    isObject(entry) &&
    REJECTED_FIELD_REASONS.has(entry[REJECTED_FIELD_REASON_ENTRY_FIELDS.reason]) &&
    isPositiveInteger(entry[REJECTED_FIELD_REASON_ENTRY_FIELDS.count])
  );
}

function checkFieldKey(field) {
  return JSON.stringify([
    field[SOURCE_CHECK_FIELD_FIELDS.label],
    field[SOURCE_CHECK_FIELD_FIELDS.section],
    field[SOURCE_CHECK_FIELD_FIELDS.scope],
    field[SOURCE_CHECK_FIELD_FIELDS.present],
    field[SOURCE_CHECK_FIELD_FIELDS.accepted],
    field[SOURCE_CHECK_FIELD_FIELDS.reason],
  ]);
}

function hasDuplicateCheckFields(fields) {
  const seen = new Set();

  for (const field of fields) {
    const key = checkFieldKey(field);

    if (seen.has(key)) {
      return true;
    }

    seen.add(key);
  }

  return false;
}

function rejectedFieldKey(field) {
  return JSON.stringify([
    field[REJECTED_FIELD_FIELDS.label],
    field[REJECTED_FIELD_FIELDS.section],
    field[REJECTED_FIELD_FIELDS.scope],
    field[REJECTED_FIELD_FIELDS.reason],
  ]);
}

function hasDuplicateRejectedFields(fields) {
  const seen = new Set();

  for (const field of fields) {
    const key = rejectedFieldKey(field);

    if (seen.has(key)) {
      return true;
    }

    seen.add(key);
  }

  return false;
}

function hasDuplicateRejectedFieldReasonEntries(entries) {
  const seen = new Set();

  for (const entry of entries) {
    const reason = entry[REJECTED_FIELD_REASON_ENTRY_FIELDS.reason];

    if (seen.has(reason)) {
      return true;
    }

    seen.add(reason);
  }

  return false;
}

function duplicateFieldDiagnosticsFromValues(values) {
  return Object.fromEntries(
    DUPLICATE_FIELD_DIAGNOSTIC_KEYS.map((key) => [key, values[key] === true]),
  );
}

function buildDuplicateFieldDiagnostics(check) {
  const fields = isObject(check) && isCheckFieldList(check[SOURCE_CHECK_PAYLOAD_FIELDS.fields])
    ? check[SOURCE_CHECK_PAYLOAD_FIELDS.fields]
    : [];
  const rejectedFields = isObject(check) &&
    isRejectedFieldList(check[SOURCE_CHECK_PAYLOAD_FIELDS.rejectedFields])
    ? check[SOURCE_CHECK_PAYLOAD_FIELDS.rejectedFields]
    : [];
  const rejectedFieldReasonEntries = isObject(check) &&
    isRejectedFieldReasonEntries(check[SOURCE_CHECK_PAYLOAD_FIELDS.rejectedFieldReasonEntries])
    ? check[SOURCE_CHECK_PAYLOAD_FIELDS.rejectedFieldReasonEntries]
    : [];

  return duplicateFieldDiagnosticsFromValues({
    fields: hasDuplicateCheckFields(fields),
    rejectedFields: hasDuplicateRejectedFields(rejectedFields),
    rejectedFieldReasonEntries: hasDuplicateRejectedFieldReasonEntries(rejectedFieldReasonEntries),
  });
}

function hasDuplicateFieldDiagnostics(diagnostics) {
  return isObject(diagnostics) &&
    DUPLICATE_FIELD_DIAGNOSTIC_KEYS.some((key) => diagnostics[key] === true);
}

function duplicateFieldDiagnosticCount(diagnostics) {
  if (!isObject(diagnostics)) {
    return 0;
  }

  return DUPLICATE_FIELD_DIAGNOSTIC_KEYS
    .filter((key) => diagnostics[key] === true)
    .length;
}

function rejectedFieldListsMatch(recordedFields, expectedFields) {
  return recordedFields.length === expectedFields.length &&
    recordedFields.every((field, index) => {
      const expectedField = expectedFields[index];

      return field[REJECTED_FIELD_FIELDS.label] === expectedField[REJECTED_FIELD_FIELDS.label] &&
        field[REJECTED_FIELD_FIELDS.section] === expectedField[REJECTED_FIELD_FIELDS.section] &&
        field[REJECTED_FIELD_FIELDS.scope] === expectedField[REJECTED_FIELD_FIELDS.scope] &&
        field[REJECTED_FIELD_FIELDS.reason] === expectedField[REJECTED_FIELD_FIELDS.reason];
    });
}

function numberRecordsMatch(recorded, expected) {
  const recordedKeys = Object.keys(recorded).sort();
  const expectedKeys = Object.keys(expected).sort();

  return recordedKeys.length === expectedKeys.length &&
    recordedKeys.every((key, index) =>
      key === expectedKeys[index] &&
      recorded[key] === expected[key]
    );
}

function rejectedFieldReasonEntriesMatch(recorded, expected) {
  return recorded.length === expected.length &&
    recorded.every((entry, index) => {
      const expectedEntry = expected[index];

      return entry[REJECTED_FIELD_REASON_ENTRY_FIELDS.reason] ===
        expectedEntry[REJECTED_FIELD_REASON_ENTRY_FIELDS.reason] &&
        entry[REJECTED_FIELD_REASON_ENTRY_FIELDS.count] ===
          expectedEntry[REJECTED_FIELD_REASON_ENTRY_FIELDS.count];
    });
}

function validateCheck(errors, payload, key) {
  if (!isObject(payload[key])) {
    errors.push(`missing-${key}`);
    return;
  }

  const check = payload[key];

  for (const field of SOURCE_CHECK_PAYLOAD_REQUIRED_FIELDS) {
    if (!Object.prototype.hasOwnProperty.call(check, field)) {
      errors.push(`missing-${key}-${field}`);
    }
  }

  const configured = check[SOURCE_CHECK_PAYLOAD_FIELDS.configured];
  const present = check[SOURCE_CHECK_PAYLOAD_FIELDS.present];
  const path = check[SOURCE_CHECK_PAYLOAD_FIELDS.path];
  const status = check[SOURCE_CHECK_PAYLOAD_FIELDS.status];
  const blocks = check[SOURCE_CHECK_PAYLOAD_FIELDS.blocksReadiness];

  if (typeof configured !== 'boolean') {
    errors.push(`invalid-${key}-configured`);
  }

  if (typeof present !== 'boolean') {
    errors.push(`invalid-${key}-present`);
  }

  if (typeof path !== 'string') {
    errors.push(`invalid-${key}-path`);
  }

  if (typeof status !== 'string' || !status) {
    errors.push(`invalid-${key}-status`);
  }

  const statusGuidance = check[SOURCE_CHECK_PAYLOAD_FIELDS.statusGuidance];
  const errorsBySection = check[SOURCE_CHECK_PAYLOAD_FIELDS.errorsBySection];
  const missingFieldsBySection = check[SOURCE_CHECK_PAYLOAD_FIELDS.missingFieldsBySection];

  if (!isNullableString(statusGuidance)) {
    errors.push(`invalid-${key}-statusGuidance`);
  }

  if (!isStringListRecord(errorsBySection)) {
    errors.push(`invalid-${key}-errorsBySection`);
  }

  if (!isStringListRecord(missingFieldsBySection)) {
    errors.push(`invalid-${key}-missingFieldsBySection`);
  }

  const sourceFields = check[SOURCE_CHECK_PAYLOAD_FIELDS.fields];
  const fieldMetadataAvailable = check[SOURCE_CHECK_PAYLOAD_FIELDS.fieldMetadataAvailable];
  const rejectedFields = check[SOURCE_CHECK_PAYLOAD_FIELDS.rejectedFields];
  const rejectedFieldCount = check[SOURCE_CHECK_PAYLOAD_FIELDS.rejectedFieldCount];
  const rejectedFieldReasons = check[SOURCE_CHECK_PAYLOAD_FIELDS.rejectedFieldReasons];
  const rejectedFieldReasonEntries = check[SOURCE_CHECK_PAYLOAD_FIELDS.rejectedFieldReasonEntries];

  if (!isCheckFieldList(sourceFields)) {
    errors.push(`invalid-${key}-fields`);
  } else if (hasDuplicateCheckFields(sourceFields)) {
    errors.push(`duplicate-${key}-fields`);
  }

  if (typeof fieldMetadataAvailable !== 'boolean') {
    errors.push(`invalid-${key}-fieldMetadataAvailable`);
  } else if (
    isCheckFieldList(sourceFields) &&
    fieldMetadataAvailable !== (sourceFields.length > 0)
  ) {
    errors.push(`inconsistent-${key}-fieldMetadataAvailable`);
  }

  if (!isRejectedFieldList(rejectedFields)) {
    errors.push(`invalid-${key}-rejectedFields`);
  } else if (hasDuplicateRejectedFields(rejectedFields)) {
    errors.push(`duplicate-${key}-rejectedFields`);
  }

  if (!isNonNegativeInteger(rejectedFieldCount)) {
    errors.push(`invalid-${key}-rejectedFieldCount`);
  } else if (
    isRejectedFieldList(rejectedFields) &&
    rejectedFieldCount !== rejectedFields.length
  ) {
    errors.push(`inconsistent-${key}-rejectedFieldCount`);
  }

  if (!isRejectedFieldReasonCounts(rejectedFieldReasons)) {
    errors.push(`invalid-${key}-rejectedFieldReasons`);
  } else if (
    isRejectedFieldList(rejectedFields) &&
    !numberRecordsMatch(
      rejectedFieldReasons,
      buildRejectedFieldReasons(rejectedFields),
    )
  ) {
    errors.push(`inconsistent-${key}-rejectedFieldReasons`);
  }

  if (!isRejectedFieldReasonEntries(rejectedFieldReasonEntries)) {
    errors.push(`invalid-${key}-rejectedFieldReasonEntries`);
  } else if (hasDuplicateRejectedFieldReasonEntries(rejectedFieldReasonEntries)) {
    errors.push(`duplicate-${key}-rejectedFieldReasonEntries`);
  } else if (
    isRejectedFieldReasonCounts(rejectedFieldReasons) &&
    !rejectedFieldReasonEntriesMatch(
      rejectedFieldReasonEntries,
      buildRejectedFieldReasonEntries(rejectedFieldReasons),
    )
  ) {
    errors.push(`inconsistent-${key}-rejectedFieldReasonEntries`);
  }

  if (
    isCheckFieldList(sourceFields) &&
    isRejectedFieldList(rejectedFields) &&
    !rejectedFieldListsMatch(rejectedFields, buildRejectedFields(sourceFields))
  ) {
    errors.push(`inconsistent-${key}-rejectedFields`);
  }

  if (!isStringList(check.errors)) {
    errors.push(`invalid-${key}-errors`);
  }

  if (!isStringList(check.metadataFailures)) {
    errors.push(`invalid-${key}-metadataFailures`);
  }

  if (!isStringListRecord(check.summaryRoleArtifactsExpected)) {
    errors.push(`invalid-${key}-summaryRoleArtifactsExpected`);
  }

  if (!isStringListRecord(check.summaryRoleArtifacts)) {
    errors.push(`invalid-${key}-summaryRoleArtifacts`);
  }

  if (!isStringList(check.summaryRoleIndexFailures)) {
    errors.push(`invalid-${key}-summaryRoleIndexFailures`);
  }

  if (!isSummaryRoleIndexFailureDetailList(check.summaryRoleIndexFailureDetails)) {
    errors.push(`invalid-${key}-summaryRoleIndexFailureDetails`);
  }

  if (!isStringList(check.operatorCheckFailures)) {
    errors.push(`invalid-${key}-operatorCheckFailures`);
  }

  if (!isOperatorCheckFailureDetailList(check.operatorCheckFailureDetails)) {
    errors.push(`invalid-${key}-operatorCheckFailureDetails`);
  }

  if (!isNumberRecord(check.failureKinds)) {
    errors.push(`invalid-${key}-failureKinds`);
  }

  if (!isStringListRecord(check.failureKindArtifacts)) {
    errors.push(`invalid-${key}-failureKindArtifacts`);
  }

  if ('failures' in check && !isStringList(check.failures)) {
    errors.push(`invalid-${key}-failures`);
  }

  if ('allowedValues' in check && !isStringList(check.allowedValues)) {
    errors.push(`invalid-${key}-allowedValues`);
  }

  if ('requireDriftAcceptance' in check && typeof check.requireDriftAcceptance !== 'boolean') {
    errors.push(`invalid-${key}-requireDriftAcceptance`);
  }

  if (typeof blocks !== 'boolean') {
    errors.push(`invalid-${key}-blocksReadiness`);
  } else {
    if (REQUIRED_PRESENT_CHECKS.has(key) && status !== 'ok' && blocks !== true) {
      errors.push(`inconsistent-${key}-required-blocksReadiness`);
    }

    if (configured === true && present === false && blocks !== true) {
      errors.push(`inconsistent-${key}-missing-blocksReadiness`);
    }

    if (!REQUIRED_PRESENT_CHECKS.has(key) && configured === false && blocks !== false) {
      errors.push(`inconsistent-${key}-disabled-blocksReadiness`);
    }
  }
}

function blocksReadiness(payload, key) {
  if (REQUIRED_PRESENT_CHECKS.has(key)) {
    return !isObject(payload[key]) ||
      payload[key][SOURCE_CHECK_PAYLOAD_FIELDS.status] !== 'ok';
  }

  return isObject(payload[key]) &&
    payload[key][SOURCE_CHECK_PAYLOAD_FIELDS.blocksReadiness] === true;
}

function validateReadinessSemantics(errors, payload) {
  if (!isObject(payload.evidenceSummary)) {
    return;
  }

  const summary = payload.evidenceSummary;
  const blockingChecks = REQUIRED_CHECKS.filter((key) => blocksReadiness(payload, key));

  if (payload.readiness !== 'not_ready' && (summary.status === 'incomplete' || blockingChecks.length > 0)) {
    errors.push('inconsistent-readiness-not-ready');
  }

  if (payload.readiness === 'ready') {
    if (summary.status !== 'ready') {
      errors.push('inconsistent-ready-summary-status');
    }

    if (summary.ok !== true) {
      errors.push('inconsistent-ready-summary-ok');
    }
  }

  if (payload.readiness === 'operator_review_required') {
    if (summary.status !== 'operator_review_required') {
      errors.push('inconsistent-operator-review-summary-status');
    }

    if (summary.ok !== true) {
      errors.push('inconsistent-operator-review-summary-ok');
    }
  }
}

function checkStatus(payload, key) {
  return isObject(payload[key])
    ? payload[key][SOURCE_CHECK_PAYLOAD_FIELDS.status] || 'unknown'
    : 'missing';
}

function buildCheckStatuses(payload) {
  return Object.fromEntries(REQUIRED_CHECKS.map((key) => [key, checkStatus(payload || {}, key)]));
}

function checkBlockingState(payload, key) {
  const source = isObject(payload) ? payload : {};
  const check = isObject(source[key]) ? source[key] : {};
  const configured = typeof check[SOURCE_CHECK_PAYLOAD_FIELDS.configured] === 'boolean'
    ? check[SOURCE_CHECK_PAYLOAD_FIELDS.configured]
    : false;
  const present = typeof check[SOURCE_CHECK_PAYLOAD_FIELDS.present] === 'boolean'
    ? check[SOURCE_CHECK_PAYLOAD_FIELDS.present]
    : false;
  const status = typeof check[SOURCE_CHECK_PAYLOAD_FIELDS.status] === 'string'
    ? check[SOURCE_CHECK_PAYLOAD_FIELDS.status]
    : 'missing';
  const blocks = typeof check[SOURCE_CHECK_PAYLOAD_FIELDS.blocksReadiness] === 'boolean'
    ? check[SOURCE_CHECK_PAYLOAD_FIELDS.blocksReadiness]
    : blocksReadiness(source, key);
  const blockingReasons = [];

  if (REQUIRED_PRESENT_CHECKS.has(key) && status !== 'ok') {
    blockingReasons.push(BLOCKING_REASONS.requiredCheckNotOk);
  }

  if (configured === true && present === false) {
    blockingReasons.push(BLOCKING_REASONS.configuredCheckMissing);
  }

  if (!REQUIRED_PRESENT_CHECKS.has(key) && configured === false && blocks === true) {
    blockingReasons.push(BLOCKING_REASONS.disabledCheckBlocking);
  }

  if (blocks === true && blockingReasons.length === 0) {
    blockingReasons.push(BLOCKING_REASONS.explicitBlocking);
  }

  return {
    [CHECK_BLOCKING_STATE_FIELDS.configured]: configured,
    [CHECK_BLOCKING_STATE_FIELDS.present]: present,
    [CHECK_BLOCKING_STATE_FIELDS.status]: status,
    [CHECK_BLOCKING_STATE_FIELDS.blocksReadiness]: blocks,
    [CHECK_BLOCKING_STATE_FIELDS.blockingReasons]: blockingReasons,
    [CHECK_BLOCKING_STATE_FIELDS.blockingReasonCount]: blockingReasons.length,
    [CHECK_BLOCKING_STATE_FIELDS.blockingReasonLabels]: buildReasonLabels(blockingReasons, BLOCKING_REASON_LABELS),
  };
}

function buildCheckBlockingStates(payload) {
  return Object.fromEntries(REQUIRED_CHECKS.map((key) => [key, checkBlockingState(payload || {}, key)]));
}

function buildBlockingTargets(payload) {
  const source = isObject(payload) ? payload : {};
  const states = buildCheckBlockingStates(source);

  return Object.entries(states)
    .filter(([, state]) => state[CHECK_BLOCKING_STATE_FIELDS.blocksReadiness])
    .map(([check, state]) => ({
      [BLOCKING_TARGET_FIELDS.check]: check,
      [BLOCKING_TARGET_FIELDS.configured]: state[CHECK_BLOCKING_STATE_FIELDS.configured],
      [BLOCKING_TARGET_FIELDS.present]: state[CHECK_BLOCKING_STATE_FIELDS.present],
      [BLOCKING_TARGET_FIELDS.status]: state[CHECK_BLOCKING_STATE_FIELDS.status],
      [BLOCKING_TARGET_FIELDS.path]: isObject(source[check]) && typeof source[check].path === 'string'
        ? source[check].path
        : null,
      [BLOCKING_TARGET_FIELDS.blockingReasons]: state[CHECK_BLOCKING_STATE_FIELDS.blockingReasons],
      [BLOCKING_TARGET_FIELDS.blockingReasonCount]: state[CHECK_BLOCKING_STATE_FIELDS.blockingReasonCount],
      [BLOCKING_TARGET_FIELDS.blockingReasonLabels]: state[CHECK_BLOCKING_STATE_FIELDS.blockingReasonLabels],
    }));
}

function buildCheckSourcePaths(payload) {
  const source = isObject(payload) ? payload : {};

  return Object.fromEntries(
    READINESS_SOURCE_PATH_CHECK_KEYS.map((key) => {
      const sourcePathField = READINESS_SOURCE_PATH_FIELDS[key];
      const check = isObject(source[key]) ? source[key] : {};
      return [
        key,
        typeof sourcePathField === 'string' && typeof check[sourcePathField] === 'string'
          ? check[sourcePathField]
          : null,
      ];
    }),
  );
}

function buildRepairDiagnostic(check) {
  const sourceFields = isObject(check) ? check[SOURCE_CHECK_PAYLOAD_FIELDS.fields] : null;
  const rejectedFields = isCheckFieldList(sourceFields)
    ? buildRejectedFields(sourceFields)
    : [];
  const rejectedFieldReasons = buildRejectedFieldReasons(rejectedFields);
  const duplicateFieldDiagnostics = buildDuplicateFieldDiagnostics(check);
  const statusGuidance = isObject(check) ? check[SOURCE_CHECK_PAYLOAD_FIELDS.statusGuidance] : null;
  const errorsBySection = isObject(check) ? check[SOURCE_CHECK_PAYLOAD_FIELDS.errorsBySection] : null;
  const missingFieldsBySection = isObject(check)
    ? check[SOURCE_CHECK_PAYLOAD_FIELDS.missingFieldsBySection]
    : null;

  return {
    [REPAIR_DIAGNOSTIC_FIELDS.statusGuidance]: typeof statusGuidance === 'string'
      ? statusGuidance
      : null,
    [REPAIR_DIAGNOSTIC_FIELDS.errorSections]: isStringListRecord(errorsBySection)
      ? Object.keys(errorsBySection)
      : [],
    [REPAIR_DIAGNOSTIC_FIELDS.missingFieldsBySection]: isStringListRecord(missingFieldsBySection)
      ? missingFieldsBySection
      : {},
    [REPAIR_DIAGNOSTIC_FIELDS.fieldMetadataAvailable]: isObject(check) &&
      typeof check[SOURCE_CHECK_PAYLOAD_FIELDS.fieldMetadataAvailable] === 'boolean'
      ? check[SOURCE_CHECK_PAYLOAD_FIELDS.fieldMetadataAvailable]
      : isCheckFieldList(sourceFields)
        ? sourceFields.length > 0
        : false,
    [REPAIR_DIAGNOSTIC_FIELDS.rejectedFields]: rejectedFields,
    [REPAIR_DIAGNOSTIC_FIELDS.rejectedFieldReasons]: rejectedFieldReasons,
    [REPAIR_DIAGNOSTIC_FIELDS.rejectedFieldReasonEntries]: buildRejectedFieldReasonEntries(rejectedFieldReasons),
    [REPAIR_DIAGNOSTIC_FIELDS.duplicateFieldDiagnostics]: duplicateFieldDiagnostics,
    [REPAIR_DIAGNOSTIC_FIELDS.duplicateFieldDiagnosticCount]: duplicateFieldDiagnosticCount(duplicateFieldDiagnostics),
  };
}

function buildCheckRepairDiagnostics(payload) {
  const source = isObject(payload) ? payload : {};

  return Object.fromEntries(
    READINESS_CHECK_REPAIR_DIAGNOSTIC_KEYS.map((key) => [
      key,
      buildRepairDiagnostic(source[key]),
    ]),
  );
}

function buildRepairReasons(status, diagnostic) {
  const reasons = [];

  if (status !== 'ok') {
    reasons.push(REPAIR_TARGET_REASONS.statusNotOk);
  }

  if (diagnostic[REPAIR_DIAGNOSTIC_FIELDS.errorSections].length > 0) {
    reasons.push(REPAIR_TARGET_REASONS.sectionErrors);
  }

  if (Object.keys(diagnostic[REPAIR_DIAGNOSTIC_FIELDS.missingFieldsBySection]).length > 0) {
    reasons.push(REPAIR_TARGET_REASONS.missingFields);
  }

  if (diagnostic[REPAIR_DIAGNOSTIC_FIELDS.rejectedFields].length > 0) {
    reasons.push(REPAIR_TARGET_REASONS.rejectedFields);
  }

  if (hasDuplicateFieldDiagnostics(diagnostic[REPAIR_DIAGNOSTIC_FIELDS.duplicateFieldDiagnostics])) {
    reasons.push(REPAIR_TARGET_REASONS.duplicateHumanEvidence);
  }

  return reasons;
}

function buildRepairReasonLabels(reasons) {
  return buildReasonLabels(reasons, REPAIR_TARGET_REASON_LABELS);
}

function buildRepairTargets(payload) {
  const source = isObject(payload) ? payload : {};

  return Object.entries(buildCheckRepairDiagnostics(payload))
    .filter(([check, diagnostic]) => {
      const checkPayload = isObject(source[check]) ? source[check] : null;
      const status = checkPayload &&
        typeof checkPayload[SOURCE_CHECK_PAYLOAD_FIELDS.status] === 'string'
        ? checkPayload[SOURCE_CHECK_PAYLOAD_FIELDS.status]
        : '';

      return Boolean(checkPayload) &&
        checkPayload[SOURCE_CHECK_PAYLOAD_FIELDS.configured] !== false &&
        (
          status !== 'ok' ||
          diagnostic[REPAIR_DIAGNOSTIC_FIELDS.errorSections].length > 0 ||
          Object.keys(diagnostic[REPAIR_DIAGNOSTIC_FIELDS.missingFieldsBySection]).length > 0 ||
          diagnostic[REPAIR_DIAGNOSTIC_FIELDS.rejectedFields].length > 0 ||
          hasDuplicateFieldDiagnostics(diagnostic[REPAIR_DIAGNOSTIC_FIELDS.duplicateFieldDiagnostics])
        );
    })
    .map(([check, diagnostic]) => {
      const checkPayload = isObject(source[check]) ? source[check] : {};
      const status = typeof checkPayload[SOURCE_CHECK_PAYLOAD_FIELDS.status] === 'string'
        ? checkPayload[SOURCE_CHECK_PAYLOAD_FIELDS.status]
        : '';
      const reasons = buildRepairReasons(status, diagnostic);

      return {
        [REPAIR_TARGET_FIELDS.check]: check,
        [REPAIR_TARGET_FIELDS.status]: status || null,
        [REPAIR_TARGET_FIELDS.path]: typeof checkPayload[SOURCE_CHECK_PAYLOAD_FIELDS.path] === 'string'
          ? checkPayload[SOURCE_CHECK_PAYLOAD_FIELDS.path]
          : null,
        [REPAIR_TARGET_FIELDS.reasons]: reasons,
        [REPAIR_TARGET_FIELDS.reasonCount]: reasons.length,
        [REPAIR_TARGET_FIELDS.reasonLabels]: buildRepairReasonLabels(reasons),
        [REPAIR_TARGET_FIELDS.statusGuidance]: diagnostic[REPAIR_DIAGNOSTIC_FIELDS.statusGuidance],
        [REPAIR_TARGET_FIELDS.errorSections]: diagnostic[REPAIR_DIAGNOSTIC_FIELDS.errorSections],
        [REPAIR_TARGET_FIELDS.errorSectionCount]: diagnostic[REPAIR_DIAGNOSTIC_FIELDS.errorSections].length,
        [REPAIR_TARGET_FIELDS.missingFieldsBySection]: diagnostic[REPAIR_DIAGNOSTIC_FIELDS.missingFieldsBySection],
        [REPAIR_TARGET_FIELDS.missingFieldCount]: Object.values(diagnostic[REPAIR_DIAGNOSTIC_FIELDS.missingFieldsBySection])
          .reduce((count, fields) => count + fields.length, 0),
        [REPAIR_TARGET_FIELDS.fieldMetadataAvailable]: diagnostic[REPAIR_DIAGNOSTIC_FIELDS.fieldMetadataAvailable],
        [REPAIR_TARGET_FIELDS.rejectedFields]: diagnostic[REPAIR_DIAGNOSTIC_FIELDS.rejectedFields],
        [REPAIR_TARGET_FIELDS.rejectedFieldCount]: diagnostic[REPAIR_DIAGNOSTIC_FIELDS.rejectedFields].length,
        [REPAIR_TARGET_FIELDS.rejectedFieldReasons]: diagnostic[REPAIR_DIAGNOSTIC_FIELDS.rejectedFieldReasons],
        [REPAIR_TARGET_FIELDS.rejectedFieldReasonEntries]: diagnostic[REPAIR_DIAGNOSTIC_FIELDS.rejectedFieldReasonEntries],
        [REPAIR_TARGET_FIELDS.duplicateFieldDiagnostics]: diagnostic[REPAIR_DIAGNOSTIC_FIELDS.duplicateFieldDiagnostics],
        [REPAIR_TARGET_FIELDS.duplicateFieldDiagnosticCount]: diagnostic[REPAIR_DIAGNOSTIC_FIELDS.duplicateFieldDiagnosticCount],
      };
    });
}

function manifestCheck(payload) {
  return isObject(payload) && isObject(payload.manifestCheck) ? payload.manifestCheck : {};
}

function hasNonZeroFailureKind(value) {
  return isNumberRecord(value) && Object.values(value).some((count) => count > 0);
}

function recommendedAction(payload) {
  if (!isObject(payload)) {
    return READINESS_ACTION_LABELS.regenerate_readiness_json;
  }

  if (typeof payload.recommendedAction === 'string' && payload.recommendedAction) {
    return payload.recommendedAction;
  }

  const manifest = manifestCheck(payload);
  const blockingChecks = REQUIRED_CHECKS.filter((key) => blocksReadiness(payload, key));

  if (isStringList(manifest.metadataFailures) && manifest.metadataFailures.length > 0) {
    return READINESS_ACTION_LABELS.review_metadata_drift;
  }

  if (isStringList(manifest.summaryRoleIndexFailures) && manifest.summaryRoleIndexFailures.length > 0) {
    return READINESS_ACTION_LABELS.review_manifest_failures;
  }

  if (isStringList(manifest.operatorCheckFailures) && manifest.operatorCheckFailures.length > 0) {
    return READINESS_ACTION_LABELS.review_manifest_failures;
  }

  if (hasNonZeroFailureKind(manifest.failureKinds)) {
    return READINESS_ACTION_LABELS.review_manifest_failures;
  }

  if (blockingChecks.length > 0) {
    return READINESS_ACTION_LABELS.resolve_blocking_checks;
  }

  if (isObject(payload.evidenceSummary) && payload.evidenceSummary.status === 'incomplete') {
    return READINESS_ACTION_LABELS.capture_missing_evidence;
  }

  if (payload.readiness === 'operator_review_required') {
    return READINESS_ACTION_LABELS.complete_operator_review;
  }

  if (payload.readiness === 'ready') {
    return READINESS_ACTION_LABELS.ready_for_automation;
  }

  return READINESS_ACTION_LABELS.review_readiness_payload;
}

function recommendedActionCode(payload) {
  if (!isObject(payload)) {
    return 'regenerate_readiness_json';
  }

  if (SOURCE_RECOMMENDED_ACTION_CODES.has(payload.recommendedActionCode)) {
    return payload.recommendedActionCode;
  }

  const manifest = manifestCheck(payload);
  const blockingChecks = REQUIRED_CHECKS.filter((key) => blocksReadiness(payload, key));

  if (isStringList(manifest.metadataFailures) && manifest.metadataFailures.length > 0) {
    return 'review_metadata_drift';
  }

  if (isStringList(manifest.summaryRoleIndexFailures) && manifest.summaryRoleIndexFailures.length > 0) {
    return 'review_manifest_failures';
  }

  if (isStringList(manifest.operatorCheckFailures) && manifest.operatorCheckFailures.length > 0) {
    return 'review_manifest_failures';
  }

  if (hasNonZeroFailureKind(manifest.failureKinds)) {
    return 'review_manifest_failures';
  }

  if (blockingChecks.length > 0) {
    return 'resolve_blocking_checks';
  }

  if (isObject(payload.evidenceSummary) && payload.evidenceSummary.status === 'incomplete') {
    return 'capture_missing_evidence';
  }

  if (payload.readiness === 'operator_review_required') {
    return 'complete_operator_review';
  }

  if (payload.readiness === 'ready') {
    return 'ready_for_automation';
  }

  return 'review_readiness_payload';
}

function buildDiagnostics(payload) {
  if (!isObject(payload)) {
    return {
      [DIAGNOSTIC_FIELDS.readiness]: null,
      [DIAGNOSTIC_FIELDS.summaryStatus]: null,
      [DIAGNOSTIC_FIELDS.summaryOk]: null,
      [DIAGNOSTIC_FIELDS.blockingChecks]: [],
      [DIAGNOSTIC_FIELDS.checkStatuses]: buildCheckStatuses(null),
      [DIAGNOSTIC_FIELDS.checkBlockingStates]: buildCheckBlockingStates(null),
      [DIAGNOSTIC_FIELDS.blockingTargets]: buildBlockingTargets(null),
      [DIAGNOSTIC_FIELDS.checkSourcePaths]: buildCheckSourcePaths(null),
      [DIAGNOSTIC_FIELDS.checkRepairDiagnostics]: buildCheckRepairDiagnostics(null),
      [DIAGNOSTIC_FIELDS.repairTargets]: buildRepairTargets(null),
      [DIAGNOSTIC_FIELDS.manifestMetadataFailures]: [],
      [DIAGNOSTIC_FIELDS.manifestSummaryRoleArtifactsExpected]: {},
      [DIAGNOSTIC_FIELDS.manifestSummaryRoleArtifacts]: {},
      [DIAGNOSTIC_FIELDS.manifestSummaryRoleIndexFailures]: [],
      [DIAGNOSTIC_FIELDS.manifestSummaryRoleIndexFailureDetails]: [],
      [DIAGNOSTIC_FIELDS.manifestOperatorCheckFailures]: [],
      [DIAGNOSTIC_FIELDS.manifestOperatorCheckFailureDetails]: [],
      [DIAGNOSTIC_FIELDS.manifestFailureKinds]: {},
      [DIAGNOSTIC_FIELDS.manifestFailureKindArtifacts]: {},
      [DIAGNOSTIC_FIELDS.iosInstallEvidenceErrors]: [],
      [DIAGNOSTIC_FIELDS.iosInstallEvidenceRepairTargets]: [],
      [DIAGNOSTIC_FIELDS.recommendedActionCode]: recommendedActionCode(payload),
      [DIAGNOSTIC_FIELDS.recommendedAction]: recommendedAction(payload),
    };
  }

  const manifest = manifestCheck(payload);

  return {
    [DIAGNOSTIC_FIELDS.readiness]: typeof payload.readiness === 'string' ? payload.readiness : null,
    [DIAGNOSTIC_FIELDS.summaryStatus]: isObject(payload.evidenceSummary) ? payload.evidenceSummary.status || null : null,
    [DIAGNOSTIC_FIELDS.summaryOk]: isObject(payload.evidenceSummary) && typeof payload.evidenceSummary.ok === 'boolean'
      ? payload.evidenceSummary.ok
      : null,
    [DIAGNOSTIC_FIELDS.blockingChecks]: REQUIRED_CHECKS.filter((key) => blocksReadiness(payload, key)),
    [DIAGNOSTIC_FIELDS.checkStatuses]: buildCheckStatuses(payload),
    [DIAGNOSTIC_FIELDS.checkBlockingStates]: buildCheckBlockingStates(payload),
    [DIAGNOSTIC_FIELDS.blockingTargets]: buildBlockingTargets(payload),
    [DIAGNOSTIC_FIELDS.checkSourcePaths]: buildCheckSourcePaths(payload),
    [DIAGNOSTIC_FIELDS.checkRepairDiagnostics]: buildCheckRepairDiagnostics(payload),
    [DIAGNOSTIC_FIELDS.repairTargets]: buildRepairTargets(payload),
    [DIAGNOSTIC_FIELDS.manifestMetadataFailures]: isStringList(manifest.metadataFailures) ? manifest.metadataFailures : [],
    [DIAGNOSTIC_FIELDS.manifestSummaryRoleArtifactsExpected]: isStringListRecord(manifest.summaryRoleArtifactsExpected)
      ? manifest.summaryRoleArtifactsExpected
      : {},
    [DIAGNOSTIC_FIELDS.manifestSummaryRoleArtifacts]: isStringListRecord(manifest.summaryRoleArtifacts) ? manifest.summaryRoleArtifacts : {},
    [DIAGNOSTIC_FIELDS.manifestSummaryRoleIndexFailures]: isStringList(manifest.summaryRoleIndexFailures) ? manifest.summaryRoleIndexFailures : [],
    [DIAGNOSTIC_FIELDS.manifestSummaryRoleIndexFailureDetails]: Array.isArray(manifest.summaryRoleIndexFailureDetails)
      ? manifest.summaryRoleIndexFailureDetails
      : [],
    [DIAGNOSTIC_FIELDS.manifestOperatorCheckFailures]: isStringList(manifest.operatorCheckFailures) ? manifest.operatorCheckFailures : [],
    [DIAGNOSTIC_FIELDS.manifestOperatorCheckFailureDetails]: Array.isArray(manifest.operatorCheckFailureDetails)
      ? manifest.operatorCheckFailureDetails
      : [],
    [DIAGNOSTIC_FIELDS.manifestFailureKinds]: isNumberRecord(manifest.failureKinds) ? manifest.failureKinds : {},
    [DIAGNOSTIC_FIELDS.manifestFailureKindArtifacts]: isStringListRecord(manifest.failureKindArtifacts)
      ? manifest.failureKindArtifacts
      : {},
    [DIAGNOSTIC_FIELDS.iosInstallEvidenceErrors]: isObject(payload.evidenceSummary)
      ? iosInstallEvidenceErrors(payload.evidenceSummary.iosInstallEvidence)
      : ['iosInstallEvidence-missing-summary'],
    [DIAGNOSTIC_FIELDS.iosInstallEvidenceRepairTargets]: isObject(payload.evidenceSummary)
      ? iosInstallEvidenceRepairTargets(payload.evidenceSummary.iosInstallEvidence)
      : [{
          index: null,
          id: 'iosInstallEvidence',
          file: null,
          errors: ['iosInstallEvidence-missing-summary'],
        }],
    [DIAGNOSTIC_FIELDS.recommendedActionCode]: recommendedActionCode(payload),
    [DIAGNOSTIC_FIELDS.recommendedAction]: recommendedAction(payload),
  };
}

function buildCheck(jsonPath, payload) {
  const errors = [];

  if (!isObject(payload)) {
    errors.push('invalid-root');
  } else {
    if (payload.schemaVersion !== READINESS_REPORT_SCHEMA_VERSION) {
      errors.push('invalid-schemaVersion');
    }

    if (typeof payload.generatedAt !== 'string' || !payload.generatedAt) {
      errors.push('invalid-generatedAt');
    }

    if (payload.target !== READINESS_REPORT_TARGET) {
      errors.push('invalid-target');
    }

    if (!READINESS_VALUE_SET.has(payload.readiness)) {
      errors.push('invalid-readiness');
    }

    if (!SOURCE_RECOMMENDED_ACTION_CODES.has(payload.recommendedActionCode)) {
      errors.push('invalid-recommendedActionCode');
    }

    if (typeof payload.recommendedAction !== 'string' || !payload.recommendedAction) {
      errors.push('invalid-recommendedAction');
    } else if (
      SOURCE_RECOMMENDED_ACTION_CODES.has(payload.recommendedActionCode) &&
      payload.recommendedAction !== READINESS_ACTION_LABELS[payload.recommendedActionCode]
    ) {
      errors.push('inconsistent-recommendedAction');
    }

    validateEvidenceSummary(errors, payload);

    for (const key of REQUIRED_CHECKS) {
      validateCheck(errors, payload, key);
    }

    validateReadinessSemantics(errors, payload);
  }

  return {
    [READINESS_CHECK_RESULT_FIELDS.schemaVersion]: READINESS_CHECK_RESULT_SCHEMA_VERSION,
    [READINESS_CHECK_RESULT_FIELDS.checkedAt]: new Date().toISOString(),
    [READINESS_CHECK_RESULT_FIELDS.status]: errors.length === 0
      ? READINESS_CHECK_RESULT_STATUSES.ok
      : READINESS_CHECK_RESULT_STATUSES.failed,
    [READINESS_CHECK_RESULT_FIELDS.target]: READINESS_REPORT_TARGET,
    [READINESS_CHECK_RESULT_FIELDS.jsonPath]: jsonPath,
    [READINESS_CHECK_RESULT_FIELDS.diagnostics]: buildDiagnostics(payload),
    [READINESS_CHECK_RESULT_FIELDS.errors]: errors,
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
  let payload;

  try {
    payload = JSON.parse(fs.readFileSync(path.resolve(process.cwd(), args.jsonPath), 'utf8'));
  } catch (error) {
    payload = null;
    const result = {
      [READINESS_CHECK_RESULT_FIELDS.schemaVersion]: READINESS_CHECK_RESULT_SCHEMA_VERSION,
      [READINESS_CHECK_RESULT_FIELDS.checkedAt]: new Date().toISOString(),
      [READINESS_CHECK_RESULT_FIELDS.status]: READINESS_CHECK_RESULT_STATUSES.failed,
      [READINESS_CHECK_RESULT_FIELDS.target]: READINESS_REPORT_TARGET,
      [READINESS_CHECK_RESULT_FIELDS.jsonPath]: args.jsonPath,
      [READINESS_CHECK_RESULT_FIELDS.diagnostics]: buildDiagnostics(null),
      [READINESS_CHECK_RESULT_FIELDS.errors]: [`json-read-failed:${error.code || error.message}`],
    };
    const output = `${JSON.stringify(result, null, 2)}\n`;

    if (args.outputPath) {
      writeOutput(args.outputPath, output);
    }

    process.stdout.write(output);
    process.exitCode = 1;
    return;
  }

  const result = buildCheck(args.jsonPath, payload);
  const output = `${JSON.stringify(result, null, 2)}\n`;

  if (args.outputPath) {
    writeOutput(args.outputPath, output);
  }

  process.stdout.write(output);

  if (args.strict && result.status !== 'ok') {
    process.exitCode = 1;
  }
}

try {
  main();
} catch (error) {
  console.error(`ops-readiness-report-json-check failed: ${error.message}`);
  process.exitCode = 1;
}
