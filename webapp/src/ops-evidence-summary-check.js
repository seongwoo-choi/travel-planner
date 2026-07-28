#!/usr/bin/env node

import fs from 'node:fs';
import path from 'node:path';

const STATUS_VALUES = new Set(['ready', 'operator_review_required', 'incomplete']);
const ARTIFACT_STATUS_VALUES = new Set(['present', 'missing']);
const MANUAL_STATUS_VALUES = new Set(['present', 'missing', 'manual_required']);
const IOS_INSTALL_STATUS_VALUES = new Set(['present', 'missing', 'invalid-json']);

function evidencePath(fileName) {
  return path.join(process.env.TRAVEL_EVIDENCE_DIR || 'reports', fileName);
}

function parseArgs(argv) {
  const args = {
    strict: false,
    inputPath: process.env.TRAVEL_EVIDENCE_SUMMARY_PATH || evidencePath('ops-evidence-summary.json'),
    outputPath: '',
    outputEnv: '',
    outputDefaultEvidence: '',
  };

  for (const arg of argv) {
    if (arg === '--strict') {
      args.strict = true;
    } else if (arg.startsWith('--input=')) {
      args.inputPath = arg.slice('--input='.length);
    } else if (arg.startsWith('--input-env=')) {
      args.inputPath = process.env[arg.slice('--input-env='.length)] || args.inputPath;
    } else if (arg.startsWith('--input-default-evidence=')) {
      if (!args.inputPath) {
        args.inputPath = evidencePath(arg.slice('--input-default-evidence='.length));
      }
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
    args.outputPath = evidencePath(args.outputDefaultEvidence);
  }

  return args;
}

function isObject(value) {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function isStringList(value) {
  return Array.isArray(value) && value.every((item) => typeof item === 'string');
}

function sameList(actual, expected) {
  return isStringList(actual) &&
    actual.length === expected.length &&
    actual.every((item, index) => item === expected[index]);
}

function hasField(value, field) {
  return Object.prototype.hasOwnProperty.call(value, field);
}

function readSummary(inputPath) {
  const absolutePath = path.resolve(process.cwd(), inputPath);
  const text = fs.readFileSync(absolutePath, 'utf8');

  return {
    absolutePath,
    summary: JSON.parse(text),
  };
}

function checkSummary(summary) {
  const errors = [];

  if (!isObject(summary)) {
    return {
      diagnostics: {
        summaryObject: false,
        summaryStatus: null,
        summaryOk: null,
        expectedStatus: 'incomplete',
        expectedOk: false,
        missingArtifacts: [],
        expectedMissingArtifacts: [],
        missingConfiguredManualEvidence: [],
        expectedMissingConfiguredManualEvidence: [],
        missingManualEvidence: [],
        expectedMissingManualEvidence: [],
        manualReviewRequired: [],
        expectedManualReviewRequired: [],
        strictFailures: [],
        expectedStrictFailures: [],
        iosInstallEvidenceErrors: [],
      },
      errors: ['summary-not-object'],
    };
  }

  if (typeof summary.ok !== 'boolean') errors.push('invalid-ok');
  if (!STATUS_VALUES.has(summary.status)) errors.push('invalid-status');
  if (Number.isNaN(Date.parse(summary.generatedAt))) errors.push('invalid-generatedAt');
  if (typeof summary.evidenceDir !== 'string' || !summary.evidenceDir) errors.push('invalid-evidenceDir');
  if (!Array.isArray(summary.artifacts)) errors.push('invalid-artifacts');
  if (!Array.isArray(summary.manualEvidence)) errors.push('invalid-manualEvidence');
  if (summary.iosInstallEvidence !== undefined && !Array.isArray(summary.iosInstallEvidence)) {
    errors.push('invalid-iosInstallEvidence');
  }
  if (!isStringList(summary.missingArtifacts)) errors.push('invalid-missingArtifacts');
  if (!isStringList(summary.missingConfiguredManualEvidence)) {
    errors.push('invalid-missingConfiguredManualEvidence');
  }
  if (!isStringList(summary.missingManualEvidence)) errors.push('invalid-missingManualEvidence');
  if (!isStringList(summary.manualReviewRequired)) errors.push('invalid-manualReviewRequired');
  if (!isStringList(summary.strictFailures)) errors.push('invalid-strictFailures');

  const artifactErrors = [];
  const manualEvidenceErrors = [];
  const iosInstallEvidenceErrors = [];
  const artifacts = Array.isArray(summary.artifacts) ? summary.artifacts : [];
  const manualEvidence = Array.isArray(summary.manualEvidence) ? summary.manualEvidence : [];
  const iosInstallEvidence = Array.isArray(summary.iosInstallEvidence) ? summary.iosInstallEvidence : [];

  for (const artifact of artifacts) {
    if (!isObject(artifact)) {
      artifactErrors.push('artifact-not-object');
      continue;
    }

    if (typeof artifact.id !== 'string' || !artifact.id) artifactErrors.push('artifact-invalid-id');
    if (typeof artifact.label !== 'string' || !artifact.label) artifactErrors.push('artifact-invalid-label');
    if (!ARTIFACT_STATUS_VALUES.has(artifact.status)) artifactErrors.push(`${artifact.id || 'unknown'}-invalid-status`);
    if (!isObject(artifact.primary)) artifactErrors.push(`${artifact.id || 'unknown'}-invalid-primary`);
    if (!Array.isArray(artifact.alternatives)) artifactErrors.push(`${artifact.id || 'unknown'}-invalid-alternatives`);
  }

  for (const item of manualEvidence) {
    if (!isObject(item)) {
      manualEvidenceErrors.push('manual-not-object');
      continue;
    }

    if (typeof item.id !== 'string' || !item.id) manualEvidenceErrors.push('manual-invalid-id');
    if (typeof item.label !== 'string' || !item.label) manualEvidenceErrors.push('manual-invalid-label');
    if (!MANUAL_STATUS_VALUES.has(item.status)) manualEvidenceErrors.push(`${item.id || 'unknown'}-invalid-status`);
    if (typeof item.present !== 'boolean') manualEvidenceErrors.push(`${item.id || 'unknown'}-invalid-present`);
  }

  for (const item of iosInstallEvidence) {
    if (!isObject(item)) {
      iosInstallEvidenceErrors.push('ios-install-not-object');
      continue;
    }

    const itemId = item.id || 'unknown';
    if (typeof item.id !== 'string' || !item.id) iosInstallEvidenceErrors.push('ios-install-invalid-id');
    if (typeof item.label !== 'string' || !item.label) iosInstallEvidenceErrors.push('ios-install-invalid-label');
    if (!IOS_INSTALL_STATUS_VALUES.has(item.status)) iosInstallEvidenceErrors.push(`${itemId}-invalid-status`);
    if (typeof item.envPath !== 'string' || !item.envPath) iosInstallEvidenceErrors.push(`${itemId}-invalid-envPath`);
    if (typeof item.file !== 'string' || !item.file) iosInstallEvidenceErrors.push(`${itemId}-invalid-file`);
    if (typeof item.present !== 'boolean') iosInstallEvidenceErrors.push(`${itemId}-invalid-present`);
    if (typeof item.bytes !== 'number') iosInstallEvidenceErrors.push(`${itemId}-invalid-bytes`);
    if (!(typeof item.modifiedAt === 'string' || item.modifiedAt === null)) {
      iosInstallEvidenceErrors.push(`${itemId}-invalid-modifiedAt`);
    }

    for (const field of ['action', 'title', 'nextCommand', 'phoneStep', 'installUrl', 'shortInstallUrl', 'proofSaveHash', 'proofSaveTargetId', 'proofSaveUrl', 'readinessMode', 'installStartReadiness', 'recommendedShortInstallUrl', 'recommendedInstallUrl', 'sessionQrUrl', 'nextActionBoardUrl', 'postInstallAppHomeUrl', 'postInstallNewPlanUrl', 'appHomeFirstPlanUrl', 'handoffCheckStatus', 'handoffProofSaveHash', 'handoffProofSaveTargetId', 'handoffProofSaveUrl', 'handoffPostInstallAppHomeUrl', 'handoffPostInstallNewPlanUrl', 'quickstartCheckStatus', 'quickstartUrlOrigin', 'quickstartProofSaveHash', 'quickstartProofSaveTargetId', 'quickstartProofSaveUrl', 'quickstartPostInstallAppHomeUrl', 'quickstartPostInstallNewPlanUrl', 'quickstartCompletionStatusUrl', 'quickstartPrepareCommand', 'quickstartStatusCommand', 'quickstartFinishCommand', 'beforePhoneTerminalCommand', 'beforePhoneFinalTerminalCommand', 'beforePhoneFinalThenNextTerminalCommand', 'afterPhoneThenAllTerminalCommand', 'afterPhoneThenAllFinalTerminalCommand', 'installReadinessSource', 'installReadinessSummary', 'nextActionFinalGateCommand', 'launchProofStatus', 'launchProofSummary', 'launchProofDisplayMode', 'launchProofAppModeState', 'launchProofAppModeTitle', 'launchProofAppModeDetail', 'launchProofCapturedAt', 'launchProofSavedAt', 'installSessionUrl', 'installSessionQrUrl', 'installHandoffFetchUrl', 'installHandoffFetchStatus', 'installHandoffFetchSummary', 'installSessionQrFetchUrl', 'installSessionQrFetchTargetUrl', 'installSessionQrFetchStatus', 'installSessionQrFetchSummary', 'installSessionQrFetchContentType', 'installSessionQrTargetParamFetchUrl', 'installSessionQrTargetParamFetchTargetUrl', 'installSessionQrTargetParamFetchStatus', 'installSessionQrTargetParamFetchSummary', 'installSessionQrTargetParamFetchContentType', 'sessionRecoveryStatus', 'sessionRecoveryUrl', 'sessionRecoveryTriggerField', 'sessionRecoveryHandoffEvidenceCommand', 'sessionRecoveryHandoffEvidenceTerminalCommand', 'sessionRecoverySessionEvidenceCommand', 'sessionRecoverySessionEvidenceTerminalCommand', 'sessionRecoveryHandoffSessionEvidenceCommand', 'sessionRecoveryHandoffSessionEvidenceTerminalCommand', 'sessionRecoveryFinalGateCommand', 'error']) {
      if (hasField(item, field) && typeof item[field] !== 'string') {
        iosInstallEvidenceErrors.push(`${itemId}-invalid-${field}`);
      }
    }
    for (const field of ['phaseCount', 'stepCount', 'handoffIssueCount', 'quickstartStepCount', 'quickstartRecoveryHintCount', 'quickstartIssueCount', 'installSessionQrFetchHttpStatus', 'installSessionQrTargetParamFetchHttpStatus', 'sessionRecoverySequenceCount', 'sessionRecoveryIssueCount']) {
      if (hasField(item, field) && typeof item[field] !== 'number') {
        iosInstallEvidenceErrors.push(`${itemId}-invalid-${field}`);
      }
    }

    if (hasField(item, 'quickstartUrlSameOrigin') && typeof item.quickstartUrlSameOrigin !== 'boolean') {
      iosInstallEvidenceErrors.push(`${itemId}-invalid-quickstartUrlSameOrigin`);
    }

    if (hasField(item, 'phoneFirst') && typeof item.phoneFirst !== 'boolean') {
      iosInstallEvidenceErrors.push(`${itemId}-invalid-phoneFirst`);
    }
    for (const field of ['handoffReady', 'installReadinessHttps', 'installReadinessSameWifiRequired', 'installReadinessSafariRequired', 'requireInstallRunbook', 'launchProofOk', 'launchProofStandalone', 'installHandoffFetchOk', 'installSessionQrFetchOk', 'installSessionQrTargetParamFetchOk', 'sessionRecoveryOk', 'sessionRecoveryTriggerValue']) {
      if (hasField(item, field) && typeof item[field] !== 'boolean') {
        iosInstallEvidenceErrors.push(`${itemId}-invalid-${field}`);
      }
    }
  }

  if (artifactErrors.length) errors.push('invalid-artifact-items');
  if (manualEvidenceErrors.length) errors.push('invalid-manualEvidence-items');
  if (iosInstallEvidenceErrors.length) errors.push('invalid-iosInstallEvidence-items');

  const expectedMissingArtifacts = artifacts
    .filter((artifact) => isObject(artifact) && artifact.status === 'missing')
    .map((artifact) => artifact.id);
  const expectedMissingConfiguredManualEvidence = manualEvidence
    .filter((item) => isObject(item) && item.status === 'missing')
    .map((item) => item.id);
  const expectedMissingManualEvidence = expectedMissingConfiguredManualEvidence;
  const expectedManualReviewRequired = manualEvidence
    .filter((item) => isObject(item) && item.status === 'manual_required')
    .map((item) => item.id);
  const expectedStrictFailures = [
    ...expectedMissingArtifacts,
    ...expectedMissingConfiguredManualEvidence,
  ];
  const expectedOk = expectedStrictFailures.length === 0;
  const expectedStatus =
    expectedStrictFailures.length > 0
      ? 'incomplete'
      : expectedManualReviewRequired.length > 0
        ? 'operator_review_required'
        : 'ready';

  if (!sameList(summary.missingArtifacts, expectedMissingArtifacts)) errors.push('inconsistent-missingArtifacts');
  if (!sameList(summary.missingConfiguredManualEvidence, expectedMissingConfiguredManualEvidence)) {
    errors.push('inconsistent-missingConfiguredManualEvidence');
  }
  if (!sameList(summary.missingManualEvidence, expectedMissingManualEvidence)) {
    errors.push('inconsistent-missingManualEvidence');
  }
  if (!sameList(summary.manualReviewRequired, expectedManualReviewRequired)) {
    errors.push('inconsistent-manualReviewRequired');
  }
  if (!sameList(summary.strictFailures, expectedStrictFailures)) errors.push('inconsistent-strictFailures');
  if (summary.ok !== expectedOk) errors.push('inconsistent-ok');
  if (summary.status !== expectedStatus) errors.push('inconsistent-status');

  return {
    diagnostics: {
      summaryObject: true,
      summaryStatus: typeof summary.status === 'string' ? summary.status : null,
      summaryOk: typeof summary.ok === 'boolean' ? summary.ok : null,
      expectedStatus,
      expectedOk,
      missingArtifacts: isStringList(summary.missingArtifacts) ? summary.missingArtifacts : [],
      expectedMissingArtifacts,
      missingConfiguredManualEvidence: isStringList(summary.missingConfiguredManualEvidence)
        ? summary.missingConfiguredManualEvidence
        : [],
      expectedMissingConfiguredManualEvidence,
      missingManualEvidence: isStringList(summary.missingManualEvidence) ? summary.missingManualEvidence : [],
      expectedMissingManualEvidence,
      manualReviewRequired: isStringList(summary.manualReviewRequired) ? summary.manualReviewRequired : [],
      expectedManualReviewRequired,
      strictFailures: isStringList(summary.strictFailures) ? summary.strictFailures : [],
      expectedStrictFailures,
      artifactErrors,
      manualEvidenceErrors,
      iosInstallEvidenceErrors,
    },
    errors,
  };
}

function buildResult(summaryPath, summary, readError) {
  const summaryCheck = readError
    ? {
        diagnostics: {
          summaryObject: false,
          summaryStatus: null,
          summaryOk: null,
          expectedStatus: 'incomplete',
          expectedOk: false,
          missingArtifacts: [],
          expectedMissingArtifacts: [],
          missingConfiguredManualEvidence: [],
          expectedMissingConfiguredManualEvidence: [],
          missingManualEvidence: [],
          expectedMissingManualEvidence: [],
          manualReviewRequired: [],
          expectedManualReviewRequired: [],
          strictFailures: [],
          expectedStrictFailures: [],
          artifactErrors: [],
          manualEvidenceErrors: [],
          iosInstallEvidenceErrors: [],
        },
        errors: [readError],
      }
    : checkSummary(summary);
  const status = summaryCheck.errors.length ? 'failed' : 'ok';

  return {
    schemaVersion: 1,
    checkedAt: new Date().toISOString(),
    status,
    target: 'evidence-summary-check-result',
    validatesTarget: 'evidence-summary',
    summaryPath,
    diagnostics: summaryCheck.diagnostics,
    errors: summaryCheck.errors,
    blocksReadiness: status !== 'ok',
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
  let summary = null;
  let summaryPath = args.inputPath;
  let readError = '';

  try {
    const readResult = readSummary(args.inputPath);
    summary = readResult.summary;
    summaryPath = readResult.absolutePath;
  } catch (error) {
    readError = error instanceof SyntaxError ? 'summary-json-parse-failed' : 'summary-read-failed';
  }

  const result = buildResult(summaryPath, summary, readError);
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
  console.error(`ops-evidence-summary-check failed: ${error.message}`);
  process.exitCode = 1;
}
