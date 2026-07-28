#!/usr/bin/env node

import fs from 'node:fs';
import path from 'node:path';

import { READINESS_ACTION_LABELS } from './ops-readiness-action-code-contract.js';
import {
  buildRejectedFieldReasonEntries,
  buildRejectedFieldReasons,
  buildRejectedFields,
} from './ops-human-evidence-check.js';

const DEFAULT_EVIDENCE_DIR = 'reports';
const DEFAULT_SUMMARY_FILE = 'ops-evidence-summary.json';
const DEFAULT_SUMMARY_CHECK_FILE = 'ops-evidence-summary-check.json';
const DEFAULT_MANIFEST_CHECK_FILE = 'ops-evidence-manifest-check.json';
const DEFAULT_HANDOFF_REPORT_CHECK_FILE = 'handoff-report-check.json';
const DEFAULT_ACTION_CODES_CHECK_FILE = 'ops-readiness-action-codes-check.json';

function parseArgs(argv) {
  const args = {
    strict: false,
    summaryPath:
      process.env.TRAVEL_EVIDENCE_SUMMARY_PATH ||
      path.join(process.env.TRAVEL_EVIDENCE_DIR || DEFAULT_EVIDENCE_DIR, DEFAULT_SUMMARY_FILE),
    evidenceSummaryCheckPath:
      process.env.TRAVEL_EVIDENCE_SUMMARY_CHECK_PATH ||
      path.join(process.env.TRAVEL_EVIDENCE_DIR || DEFAULT_EVIDENCE_DIR, DEFAULT_SUMMARY_CHECK_FILE),
    manifestCheckPath:
      process.env.TRAVEL_EVIDENCE_MANIFEST_CHECK_PATH ||
      path.join(process.env.TRAVEL_EVIDENCE_DIR || DEFAULT_EVIDENCE_DIR, DEFAULT_MANIFEST_CHECK_FILE),
    handoffReportCheckPath:
      process.env.TRAVEL_HANDOFF_REPORT_CHECK_PATH ||
      path.join(process.env.TRAVEL_EVIDENCE_DIR || DEFAULT_EVIDENCE_DIR, DEFAULT_HANDOFF_REPORT_CHECK_FILE),
    actionCodesCheckPath:
      process.env.TRAVEL_READINESS_ACTION_CODES_CHECK_PATH ||
      path.join(process.env.TRAVEL_EVIDENCE_DIR || DEFAULT_EVIDENCE_DIR, DEFAULT_ACTION_CODES_CHECK_FILE),
    incidentReportCheckPath: process.env.TRAVEL_INCIDENT_REPORT_CHECK_PATH || '',
    format: 'markdown',
    outputPath: '',
    outputEnv: '',
    outputDefault: '',
    outputDefaultEvidence: '',
  };

  for (const arg of argv) {
    if (arg === '--strict') {
      args.strict = true;
    } else if (arg === '--json') {
      args.format = 'json';
    } else if (arg.startsWith('--format=')) {
      args.format = arg.slice('--format='.length);
    } else if (arg.startsWith('--summary=')) {
      args.summaryPath = arg.slice('--summary='.length);
    } else if (arg.startsWith('--summary-env=')) {
      args.summaryPath =
        process.env[arg.slice('--summary-env='.length)] || args.summaryPath;
    } else if (arg.startsWith('--evidence-summary-check=')) {
      args.evidenceSummaryCheckPath = arg.slice('--evidence-summary-check='.length);
    } else if (arg.startsWith('--evidence-summary-check-env=')) {
      args.evidenceSummaryCheckPath =
        process.env[arg.slice('--evidence-summary-check-env='.length)] || args.evidenceSummaryCheckPath;
    } else if (arg.startsWith('--manifest-check=')) {
      args.manifestCheckPath = arg.slice('--manifest-check='.length);
    } else if (arg.startsWith('--manifest-check-env=')) {
      args.manifestCheckPath =
        process.env[arg.slice('--manifest-check-env='.length)] || args.manifestCheckPath;
    } else if (arg.startsWith('--handoff-report-check=')) {
      args.handoffReportCheckPath = arg.slice('--handoff-report-check='.length);
    } else if (arg.startsWith('--handoff-report-check-env=')) {
      args.handoffReportCheckPath =
        process.env[arg.slice('--handoff-report-check-env='.length)] || args.handoffReportCheckPath;
    } else if (arg.startsWith('--action-codes-check=')) {
      args.actionCodesCheckPath = arg.slice('--action-codes-check='.length);
    } else if (arg.startsWith('--action-codes-check-env=')) {
      args.actionCodesCheckPath =
        process.env[arg.slice('--action-codes-check-env='.length)] || args.actionCodesCheckPath;
    } else if (arg.startsWith('--incident-report-check=')) {
      args.incidentReportCheckPath = arg.slice('--incident-report-check='.length);
    } else if (arg.startsWith('--incident-report-check-env=')) {
      args.incidentReportCheckPath =
        process.env[arg.slice('--incident-report-check-env='.length)] || args.incidentReportCheckPath;
    } else if (arg.startsWith('--output=')) {
      args.outputPath = arg.slice('--output='.length);
    } else if (arg.startsWith('--output-env=')) {
      args.outputEnv = arg.slice('--output-env='.length);
    } else if (arg.startsWith('--output-default=')) {
      args.outputDefault = arg.slice('--output-default='.length);
    } else if (arg.startsWith('--output-default-evidence=')) {
      args.outputDefaultEvidence = arg.slice('--output-default-evidence='.length);
    } else {
      throw new Error(`Unknown argument: ${arg}`);
    }
  }

  if (!new Set(['markdown', 'json']).has(args.format)) {
    throw new Error(`Unsupported format: ${args.format}`);
  }

  if (!args.outputPath && args.outputEnv) {
    args.outputPath = process.env[args.outputEnv] || '';
  }

  if (!args.outputPath && args.outputDefault) {
    args.outputPath = args.outputDefault;
  }

  if (!args.outputPath && args.outputDefaultEvidence) {
    args.outputPath = path.join(
      process.env.TRAVEL_EVIDENCE_DIR || DEFAULT_EVIDENCE_DIR,
      args.outputDefaultEvidence,
    );
  }

  return args;
}

function readSummary(summaryPath) {
  const absolutePath = path.resolve(process.cwd(), summaryPath);
  const contents = fs.readFileSync(absolutePath, 'utf8');

  return JSON.parse(contents);
}

function readOptionalJson(filePath) {
  if (!filePath) {
    return null;
  }

  try {
    const absolutePath = path.resolve(process.cwd(), filePath);
    const contents = fs.readFileSync(absolutePath, 'utf8');

    return JSON.parse(contents);
  } catch (error) {
    if (error && error.code === 'ENOENT') {
      return null;
    }

    throw error;
  }
}

function normalizeList(value) {
  return Array.isArray(value) ? value : [];
}

function normalizeObject(value) {
  return value && typeof value === 'object' && !Array.isArray(value) ? value : {};
}

function normalizeCheckFields(fields) {
  if (!Array.isArray(fields)) return [];

  return fields
    .filter((field) => field && typeof field === 'object')
    .map((field) => ({
      label: typeof field.label === 'string' ? field.label : '',
      section: typeof field.section === 'string' || field.section === null ? field.section : null,
      scope: typeof field.scope === 'string' || field.scope === null ? field.scope : null,
      present: typeof field.present === 'boolean' ? field.present : null,
      accepted: typeof field.accepted === 'boolean' ? field.accepted : null,
      reason: typeof field.reason === 'string' ? field.reason : null,
    }))
    .filter((field) => field.label);
}

function renderRejectedFieldSummary(check) {
  const rejectedFields = buildRejectedFields(normalizeCheckFields(check && check.fields));

  if (rejectedFields.length === 0) return 'none';

  return rejectedFields.map((field) => `${field.label}:${field.reason}`).join(', ');
}

function renderRejectedFieldReasons(check) {
  const reasonEntries = buildRejectedReasonEntriesFromCheck(check);

  if (reasonEntries.length === 0) return 'none';

  return reasonEntries.map((entry) => `${entry.reason}:${entry.count}`).join(', ');
}

function renderRejectedFieldReasonEntries(check) {
  const reasonEntries = buildRejectedReasonEntriesFromCheck(check);

  if (reasonEntries.length === 0) return 'none';

  return reasonEntries.map((entry) => `${entry.reason}:${entry.count}`).join(', ');
}

function renderFieldMetadataAvailable(check) {
  if (check && typeof check.fieldMetadataAvailable === 'boolean') {
    return check.fieldMetadataAvailable ? 'yes' : 'no';
  }

  return normalizeCheckFields(check && check.fields).length > 0 ? 'yes' : 'no';
}

function buildRejectedReasonEntriesFromCheck(check) {
  return buildRejectedFieldReasonEntries(
    buildRejectedFieldReasons(buildRejectedFields(normalizeCheckFields(check && check.fields))),
  );
}

function readinessStatus(summary, evidenceSummaryCheck, manifestCheck, handoffReportCheck, actionCodesCheck, incidentReportCheck) {
  if (!evidenceSummaryCheck || evidenceSummaryCheck.status !== 'ok') {
    return 'not_ready';
  }

  if (manifestCheck && manifestCheck.status && manifestCheck.status !== 'ok') {
    return 'not_ready';
  }

  if (handoffReportCheck && handoffReportCheck.status && handoffReportCheck.status !== 'ok') {
    return 'not_ready';
  }

  if (!actionCodesCheck || actionCodesCheck.status !== 'ok') {
    return 'not_ready';
  }

  if (incidentReportCheck && incidentReportCheck.status && incidentReportCheck.status !== 'ok') {
    return 'not_ready';
  }

  if (summary.status === 'ready') {
    return 'ready';
  }

  if (summary.ok && summary.status === 'operator_review_required') {
    return 'operator_review_required';
  }

  return 'not_ready';
}

function renderList(items, emptyText) {
  if (items.length === 0) {
    return `- ${emptyText}`;
  }

  return items.map((item) => `- ${item}`).join('\n');
}

function renderArtifactRows(summary) {
  return normalizeList(summary.artifacts)
    .map((artifact) => {
      const selectedFile = artifact.selectedFile || 'missing';

      return `- ${artifact.id}: ${artifact.status} (${selectedFile})`;
    })
    .join('\n');
}

function renderManualEvidenceRows(summary) {
  return normalizeList(summary.manualEvidence)
    .map((item) => {
      const file = item.file || item.defaultFile || 'not configured';

      return `- ${item.id}: ${item.status} (${file})`;
    })
    .join('\n');
}

function renderIosInstallEvidenceRows(summary) {
  return normalizeList(summary.iosInstallEvidence)
    .map((item) => {
      const parts = [
        `status=${item.status || 'unknown'}`,
        `file=${item.file || 'not configured'}`,
      ];
      if (item.installStartReadiness) parts.push(`installStartReadiness=${item.installStartReadiness}`);
      if (item.recommendedShortInstallUrl) parts.push(`startShortUrl=${item.recommendedShortInstallUrl}`);
      if (item.recommendedInstallUrl) parts.push(`startInstallUrl=${item.recommendedInstallUrl}`);
      if (item.sessionQrUrl) parts.push(`startSessionQr=${item.sessionQrUrl}`);
      if (item.nextActionBoardUrl) parts.push(`nextBoard=${item.nextActionBoardUrl}`);
      if (item.postInstallAppHomeUrl) parts.push(`appHome=${item.postInstallAppHomeUrl}`);
      if (item.postInstallNewPlanUrl) parts.push(`newPlan=${item.postInstallNewPlanUrl}`);
      if (item.appHomeFirstPlanUrl) parts.push(`legacyFirstPlan=${item.appHomeFirstPlanUrl}`);
      if (item.handoffCheckStatus) parts.push(`handoffCheck=${item.handoffCheckStatus}`);
      if (item.handoffProofSaveHash) parts.push(`handoffProofHash=${item.handoffProofSaveHash}`);
      if (item.handoffProofSaveTargetId) parts.push(`handoffProofTarget=${item.handoffProofSaveTargetId}`);
      if (item.handoffProofSaveUrl) parts.push(`handoffProof=${item.handoffProofSaveUrl}`);
      if (item.handoffPostInstallAppHomeUrl) parts.push(`handoffAppHome=${item.handoffPostInstallAppHomeUrl}`);
      if (item.handoffPostInstallNewPlanUrl) parts.push(`handoffNewPlan=${item.handoffPostInstallNewPlanUrl}`);
      if (typeof item.handoffIssueCount === 'number') parts.push(`handoffIssues=${item.handoffIssueCount}`);
      if (item.quickstartCheckStatus) parts.push(`quickstartCheck=${item.quickstartCheckStatus}`);
      if (item.quickstartUrlOrigin) parts.push(`quickstartOrigin=${item.quickstartUrlOrigin}`);
      if (typeof item.quickstartUrlSameOrigin === 'boolean') parts.push(`quickstartSameOrigin=${item.quickstartUrlSameOrigin ? 'true' : 'false'}`);
      if (item.id === 'iosInstallQuickstartCheck' && item.quickstartUrlSameOrigin === false) parts.push('quickstartRepair=npm run ios:install:quickstart:evidence');
      if (item.quickstartProofSaveHash) parts.push(`quickstartProofHash=${item.quickstartProofSaveHash}`);
      if (item.quickstartProofSaveTargetId) parts.push(`quickstartProofTarget=${item.quickstartProofSaveTargetId}`);
      if (item.quickstartProofSaveUrl) parts.push(`quickstartProof=${item.quickstartProofSaveUrl}`);
      if (item.quickstartPostInstallAppHomeUrl) parts.push(`quickstartAppHome=${item.quickstartPostInstallAppHomeUrl}`);
      if (item.quickstartPostInstallNewPlanUrl) parts.push(`quickstartNewPlan=${item.quickstartPostInstallNewPlanUrl}`);
      if (item.quickstartCompletionStatusUrl) parts.push(`quickstartCompletionStatus=${item.quickstartCompletionStatusUrl}`);
      if (item.quickstartPrepareCommand) parts.push(`quickstartPrepare=${item.quickstartPrepareCommand}`);
      if (item.quickstartStatusCommand) parts.push(`quickstartStatus=${item.quickstartStatusCommand}`);
      if (item.quickstartFinishCommand) parts.push(`quickstartFinish=${item.quickstartFinishCommand}`);
      if (typeof item.quickstartStepCount === 'number') parts.push(`quickstartSteps=${item.quickstartStepCount}`);
      if (typeof item.quickstartRecoveryHintCount === 'number') parts.push(`quickstartRecoveryHints=${item.quickstartRecoveryHintCount}`);
      if (typeof item.quickstartIssueCount === 'number') parts.push(`quickstartIssues=${item.quickstartIssueCount}`);
      if (item.beforePhoneTerminalCommand) parts.push(`beforePhone=${item.beforePhoneTerminalCommand}`);
      if (item.beforePhoneFinalTerminalCommand) parts.push(`beforePhoneFinal=${item.beforePhoneFinalTerminalCommand}`);
      if (item.beforePhoneFinalThenNextTerminalCommand) parts.push(`beforePhoneFinalThenNext=${item.beforePhoneFinalThenNextTerminalCommand}`);
      if (item.afterPhoneThenAllTerminalCommand) parts.push(`afterPhoneThenAll=${item.afterPhoneThenAllTerminalCommand}`);
      if (item.afterPhoneThenAllFinalTerminalCommand) parts.push(`afterPhoneThenAllFinal=${item.afterPhoneThenAllFinalTerminalCommand}`);
      if (typeof item.stepCount === 'number') parts.push(`stepCount=${item.stepCount}`);
      if (item.readinessMode) parts.push(`readinessMode=${item.readinessMode}`);
      if (typeof item.handoffReady === 'boolean') parts.push(`handoffReady=${item.handoffReady ? 'true' : 'false'}`);
      if (item.installReadinessSource) parts.push(`installReadinessSource=${item.installReadinessSource}`);
      if (typeof item.installReadinessHttps === 'boolean') parts.push(`installReadinessHttps=${item.installReadinessHttps ? 'true' : 'false'}`);
      if (typeof item.installReadinessSameWifiRequired === 'boolean') parts.push(`sameWifi=${item.installReadinessSameWifiRequired ? 'true' : 'false'}`);
      if (typeof item.installReadinessSafariRequired === 'boolean') parts.push(`safariRequired=${item.installReadinessSafariRequired ? 'true' : 'false'}`);
      if (item.installReadinessSummary) parts.push(`installReadinessSummary=${item.installReadinessSummary}`);
      if (item.nextActionFinalGateCommand) parts.push(`finalGate=${item.nextActionFinalGateCommand}`);
      if (typeof item.phaseCount === 'number') parts.push(`phaseCount=${item.phaseCount}`);
      if (typeof item.requireInstallRunbook === 'boolean') parts.push(`requireInstallRunbook=${item.requireInstallRunbook ? 'true' : 'false'}`);
      if (item.installSessionUrl) parts.push(`sessionUrl=${item.installSessionUrl}`);
      if (item.installSessionQrUrl) parts.push(`sessionQrUrl=${item.installSessionQrUrl}`);
      if (item.installHandoffFetchStatus) parts.push(`handoffFetch=${item.installHandoffFetchStatus}`);
      if (item.installHandoffFetchSummary) parts.push(`handoffSummary=${item.installHandoffFetchSummary}`);
      if (item.installSessionQrFetchStatus) parts.push(`sessionQr=${item.installSessionQrFetchStatus}`);
      if (typeof item.installSessionQrFetchHttpStatus === 'number' && item.installSessionQrFetchHttpStatus > 0) parts.push(`sessionQrHttp=${item.installSessionQrFetchHttpStatus}`);
      if (item.installSessionQrTargetParamFetchStatus) parts.push(`sessionQrTarget=${item.installSessionQrTargetParamFetchStatus}`);
      if (typeof item.installSessionQrTargetParamFetchHttpStatus === 'number' && item.installSessionQrTargetParamFetchHttpStatus > 0) parts.push(`sessionQrTargetHttp=${item.installSessionQrTargetParamFetchHttpStatus}`);
      if (typeof item.sessionRecoveryOk === 'boolean') parts.push(`sessionRecoveryOk=${item.sessionRecoveryOk ? 'true' : 'false'}`);
      if (item.sessionRecoveryStatus) parts.push(`sessionRecovery=${item.sessionRecoveryStatus}`);
      if (item.sessionRecoveryUrl) parts.push(`sessionRecoveryUrl=${item.sessionRecoveryUrl}`);
      if (item.sessionRecoveryTriggerField) parts.push(`sessionRecoveryTrigger=${item.sessionRecoveryTriggerField}=${item.sessionRecoveryTriggerValue ? 'true' : 'false'}`);
      if (typeof item.sessionRecoverySequenceCount === 'number') parts.push(`sessionRecoverySteps=${item.sessionRecoverySequenceCount}`);
      if (item.sessionRecoveryHandoffEvidenceCommand) parts.push(`sessionHandoffEvidence=${item.sessionRecoveryHandoffEvidenceCommand}`);
      if (item.sessionRecoveryHandoffEvidenceTerminalCommand) parts.push(`sessionHandoffEvidenceTerminal=${item.sessionRecoveryHandoffEvidenceTerminalCommand}`);
      if (item.sessionRecoverySessionEvidenceCommand) parts.push(`sessionEvidence=${item.sessionRecoverySessionEvidenceCommand}`);
      if (item.sessionRecoverySessionEvidenceTerminalCommand) parts.push(`sessionEvidenceTerminal=${item.sessionRecoverySessionEvidenceTerminalCommand}`);
      if (item.sessionRecoveryHandoffSessionEvidenceCommand) parts.push(`sessionHandoffBundle=${item.sessionRecoveryHandoffSessionEvidenceCommand}`);
      if (item.sessionRecoveryHandoffSessionEvidenceTerminalCommand) parts.push(`sessionHandoffBundleTerminal=${item.sessionRecoveryHandoffSessionEvidenceTerminalCommand}`);
      if (item.sessionRecoveryFinalGateCommand) parts.push(`sessionRecoveryFinalGate=${item.sessionRecoveryFinalGateCommand}`);
      if (typeof item.sessionRecoveryIssueCount === 'number') parts.push(`sessionRecoveryIssues=${item.sessionRecoveryIssueCount}`);
      if (item.action) parts.push(`action=${item.action}`);
      if (typeof item.launchProofOk === 'boolean') parts.push(`launchProofOk=${item.launchProofOk ? 'true' : 'false'}`);
      if (item.launchProofStatus) parts.push(`launchProof=${item.launchProofStatus}`);
      if (typeof item.launchProofStandalone === 'boolean') parts.push(`standalone=${item.launchProofStandalone ? 'true' : 'false'}`);
      if (item.launchProofDisplayMode) parts.push(`displayMode=${item.launchProofDisplayMode}`);
      if (item.launchProofAppModeState) parts.push(`appMode=${item.launchProofAppModeState}`);
      if (item.launchProofAppModeTitle) parts.push(`appModeTitle=${item.launchProofAppModeTitle}`);
      if (item.launchProofCapturedAt) parts.push(`capturedAt=${item.launchProofCapturedAt}`);
      if (item.launchProofSavedAt) parts.push(`savedAt=${item.launchProofSavedAt}`);
      if (item.proofSaveHash) parts.push(`proofSaveHash=${item.proofSaveHash}`);
      if (item.proofSaveTargetId) parts.push(`proofSaveTargetId=${item.proofSaveTargetId}`);
      if (item.proofSaveUrl) parts.push(`proofSaveUrl=${item.proofSaveUrl}`);

      return `- ${item.id}: ${parts.join('; ')}`;
    })
    .join('\n');
}

function renderManifestCheck(manifestCheck, manifestCheckPath) {
  if (!manifestCheck) {
    return `- Manifest check: not found
- Expected path: ${manifestCheckPath}
- Note: this is expected before a saved bundle is reviewed with \`ops:evidence:manifest:check:file\`.`;
  }

  const metadataFailures = normalizeList(manifestCheck.metadataFailures);
  const summaryRoleIndexFailures = normalizeList(manifestCheck.summaryRoleIndexFailures);
  const summaryRoleIndexFailureDetails = Array.isArray(manifestCheck.summaryRoleIndexFailureDetails)
    ? manifestCheck.summaryRoleIndexFailureDetails
    : [];
  const operatorCheckFailures = normalizeList(manifestCheck.operatorCheckFailures);
  const operatorCheckFailureDetails = Array.isArray(manifestCheck.operatorCheckFailureDetails)
    ? manifestCheck.operatorCheckFailureDetails
    : [];
  const summaryRoleArtifactsExpected = normalizeObject(manifestCheck.summaryRoleArtifactsExpected);
  const summaryRoleArtifacts = normalizeObject(manifestCheck.summaryRoleArtifacts);
  const failureKinds = manifestCheck.failureKinds && typeof manifestCheck.failureKinds === 'object'
    ? Object.entries(manifestCheck.failureKinds)
      .filter(([, count]) => Number(count) > 0)
      .map(([kind, count]) => `${kind}:${count}`)
    : [];

  return `- Manifest check: ${manifestCheck.status || 'unknown'}
- Manifest check path: ${manifestCheckPath}
- Checked at: ${manifestCheck.checkedAt || 'unknown'}
- Manifest generated at: ${manifestCheck.manifestGeneratedAt || 'unknown'}
- Metadata failures: ${metadataFailures.length === 0 ? 'none' : metadataFailures.join(', ')}
- Summary role index format: stable JSON object string; copy none when empty
- Summary role index expected: ${Object.keys(summaryRoleArtifactsExpected).length === 0 ? 'none' : JSON.stringify(summaryRoleArtifactsExpected)}
- Summary role index recorded: ${Object.keys(summaryRoleArtifacts).length === 0 ? 'none' : JSON.stringify(summaryRoleArtifacts)}
- Summary role index failures: ${summaryRoleIndexFailures.length === 0 ? 'none' : summaryRoleIndexFailures.join(', ')}
- Summary role index failure details: ${summaryRoleIndexFailureDetails.length === 0 ? 'none' : JSON.stringify(summaryRoleIndexFailureDetails)}
- Operator check failures: ${operatorCheckFailures.length === 0 ? 'none' : operatorCheckFailures.join(', ')}
- Operator check failure details: ${operatorCheckFailureDetails.length === 0 ? 'none' : JSON.stringify(operatorCheckFailureDetails)}
- Failure kinds: ${failureKinds.length === 0 ? 'none' : failureKinds.join(', ')}
- Failures: ${normalizeList(manifestCheck.failures).length === 0 ? 'none' : normalizeList(manifestCheck.failures).join(', ')}`;
}

function renderHandoffReportCheck(handoffReportCheck, handoffReportCheckPath) {
  if (!handoffReportCheck) {
    return `- Handoff report check: not found
- Expected path: ${handoffReportCheckPath}
- Note: this is expected before the handoff report is completed and checked.`;
  }

  return `- Handoff report check: ${handoffReportCheck.status || 'unknown'}
- Handoff report check path: ${handoffReportCheckPath}
- Checked at: ${handoffReportCheck.checkedAt || 'unknown'}
- Report path: ${handoffReportCheck.reportPath || 'unknown'}
- Drift acceptance required: ${handoffReportCheck.requireDriftAcceptance ? 'yes' : 'no'}
- Status guidance: ${handoffReportCheck.statusField && handoffReportCheck.statusField.guidance ? handoffReportCheck.statusField.guidance : 'none'}
- Error sections: ${normalizeObject(handoffReportCheck.errorsBySection) ? Object.keys(normalizeObject(handoffReportCheck.errorsBySection)).join(', ') || 'none' : 'none'}
- Missing field sections: ${Object.keys(normalizeObject(handoffReportCheck.missingFieldsBySection)).join(', ') || 'none'}
- Field metadata available: ${renderFieldMetadataAvailable(handoffReportCheck)}
- Rejected fields: ${renderRejectedFieldSummary(handoffReportCheck)}
- Rejected field reasons: ${renderRejectedFieldReasons(handoffReportCheck)}
- Rejected field reason entries: ${renderRejectedFieldReasonEntries(handoffReportCheck)}
- Errors: ${normalizeList(handoffReportCheck.errors).length === 0 ? 'none' : normalizeList(handoffReportCheck.errors).join(', ')}`;
}

function renderEvidenceSummaryCheck(evidenceSummaryCheck, evidenceSummaryCheckPath) {
  if (!evidenceSummaryCheck) {
    return `- Evidence summary check: not found
- Expected path: ${evidenceSummaryCheckPath}
- Note: generate \`ops-evidence-summary-check.json\` before readiness reports.`;
  }

  return `- Evidence summary check: ${evidenceSummaryCheck.status || 'unknown'}
- Evidence summary check path: ${evidenceSummaryCheckPath}
- Checked at: ${evidenceSummaryCheck.checkedAt || 'unknown'}
- Summary path: ${evidenceSummaryCheck.summaryPath || 'unknown'}
- Blocks readiness: ${evidenceSummaryCheck.blocksReadiness ? 'yes' : 'no'}
- Errors: ${normalizeList(evidenceSummaryCheck.errors).length === 0 ? 'none' : normalizeList(evidenceSummaryCheck.errors).join(', ')}`;
}

function renderActionCodesCheck(actionCodesCheck, actionCodesCheckPath) {
  if (!actionCodesCheck) {
    return `- Readiness action-code catalog check: not found
- Expected path: ${actionCodesCheckPath}
- Note: this is expected before the readiness action-code catalog is generated and checked.`;
  }

  return `- Readiness action-code catalog check: ${actionCodesCheck.status || 'unknown'}
- Readiness action-code catalog check path: ${actionCodesCheckPath}
- Checked at: ${actionCodesCheck.checkedAt || 'unknown'}
- Catalog path: ${actionCodesCheck.catalogPath || 'unknown'}
- Blocks readiness: ${actionCodesCheck.blocksReadiness ? 'yes' : 'no'}
- Errors: ${normalizeList(actionCodesCheck.errors).length === 0 ? 'none' : normalizeList(actionCodesCheck.errors).join(', ')}`;
}

function renderIncidentReportCheck(incidentReportCheck, incidentReportCheckPath) {
  if (!incidentReportCheckPath) {
    return `- Incident report check: not configured
- Note: pass \`TRAVEL_INCIDENT_REPORT_CHECK_PATH\` or \`--incident-report-check\` for incident-driven evidence reviews.`;
  }

  if (!incidentReportCheck) {
    return `- Incident report check: not found
- Expected path: ${incidentReportCheckPath}
- Note: this is expected before an incident-driven review report is completed and checked.`;
  }

  return `- Incident report check: ${incidentReportCheck.status || 'unknown'}
- Incident report check path: ${incidentReportCheckPath}
- Checked at: ${incidentReportCheck.checkedAt || 'unknown'}
- Report path: ${incidentReportCheck.reportPath || 'unknown'}
- Drift acceptance required: ${incidentReportCheck.requireDriftAcceptance ? 'yes' : 'no'}
- Status guidance: ${incidentReportCheck.statusField && incidentReportCheck.statusField.guidance ? incidentReportCheck.statusField.guidance : 'none'}
- Error sections: ${normalizeObject(incidentReportCheck.errorsBySection) ? Object.keys(normalizeObject(incidentReportCheck.errorsBySection)).join(', ') || 'none' : 'none'}
- Missing field sections: ${Object.keys(normalizeObject(incidentReportCheck.missingFieldsBySection)).join(', ') || 'none'}
- Field metadata available: ${renderFieldMetadataAvailable(incidentReportCheck)}
- Rejected fields: ${renderRejectedFieldSummary(incidentReportCheck)}
- Rejected field reasons: ${renderRejectedFieldReasons(incidentReportCheck)}
- Rejected field reason entries: ${renderRejectedFieldReasonEntries(incidentReportCheck)}
- Errors: ${normalizeList(incidentReportCheck.errors).length === 0 ? 'none' : normalizeList(incidentReportCheck.errors).join(', ')}`;
}

function buildCheckPayload(check, checkPath, options = {}) {
  if (!checkPath) {
    return {
      configured: false,
      present: false,
      path: '',
      status: 'not_configured',
      metadataFailures: [],
      summaryRoleArtifactsExpected: {},
      summaryRoleArtifacts: {},
      summaryRoleIndexFailures: [],
      summaryRoleIndexFailureDetails: [],
      operatorCheckFailures: [],
      operatorCheckFailureDetails: [],
      failureKinds: {},
      failureKindArtifacts: {},
      statusGuidance: null,
      errorsBySection: {},
      missingFieldsBySection: {},
      fields: [],
      fieldMetadataAvailable: false,
      rejectedFields: [],
      rejectedFieldCount: 0,
      rejectedFieldReasons: {},
      rejectedFieldReasonEntries: [],
      errors: options.requirePresent ? ['check-not-configured'] : [],
      blocksReadiness: Boolean(options.requirePresent),
    };
  }

  if (!check) {
    return {
      configured: true,
      present: false,
      path: checkPath,
      status: 'not_found',
      metadataFailures: [],
      summaryRoleArtifactsExpected: {},
      summaryRoleArtifacts: {},
      summaryRoleIndexFailures: [],
      summaryRoleIndexFailureDetails: [],
      operatorCheckFailures: [],
      operatorCheckFailureDetails: [],
      failureKinds: {},
      failureKindArtifacts: {},
      statusGuidance: null,
      errorsBySection: {},
      missingFieldsBySection: {},
      fields: [],
      fieldMetadataAvailable: false,
      rejectedFields: [],
      rejectedFieldCount: 0,
      rejectedFieldReasons: {},
      rejectedFieldReasonEntries: [],
      errors: ['check-not-found'],
      blocksReadiness: true,
    };
  }

  const fields = normalizeCheckFields(check.fields);
  const rejectedFields = buildRejectedFields(fields);
  const rejectedFieldReasons = buildRejectedFieldReasons(rejectedFields);
  const rejectedFieldReasonEntries = buildRejectedFieldReasonEntries(rejectedFieldReasons);

  return {
    configured: true,
    present: true,
    path: checkPath,
    status: check.status || 'unknown',
    checkedAt: check.checkedAt || null,
    reportPath: check.reportPath || null,
    summaryPath: check.summaryPath || null,
    catalogPath: check.catalogPath || null,
    manifestGeneratedAt: check.manifestGeneratedAt || null,
    requireDriftAcceptance: Boolean(check.requireDriftAcceptance),
    failures: normalizeList(check.failures),
    metadataFailures: normalizeList(check.metadataFailures),
    summaryRoleArtifactsExpected: normalizeObject(check.summaryRoleArtifactsExpected),
    summaryRoleArtifacts: normalizeObject(check.summaryRoleArtifacts),
    summaryRoleIndexFailures: normalizeList(check.summaryRoleIndexFailures),
    summaryRoleIndexFailureDetails: Array.isArray(check.summaryRoleIndexFailureDetails)
      ? check.summaryRoleIndexFailureDetails
      : [],
    operatorCheckFailures: normalizeList(check.operatorCheckFailures),
    operatorCheckFailureDetails: Array.isArray(check.operatorCheckFailureDetails)
      ? check.operatorCheckFailureDetails
      : [],
    failureKinds: normalizeObject(check.failureKinds),
    failureKindArtifacts: normalizeObject(check.failureKindArtifacts),
    statusGuidance: check.statusField && typeof check.statusField.guidance === 'string'
      ? check.statusField.guidance
      : null,
    errorsBySection: normalizeObject(check.errorsBySection),
    missingFieldsBySection: normalizeObject(check.missingFieldsBySection),
    fields,
    fieldMetadataAvailable: typeof check.fieldMetadataAvailable === 'boolean'
      ? check.fieldMetadataAvailable
      : fields.length > 0,
    rejectedFields,
    rejectedFieldCount: rejectedFields.length,
    rejectedFieldReasons,
    rejectedFieldReasonEntries,
    errors: normalizeList(check.errors),
    allowedValues: check.statusField ? normalizeList(check.statusField.allowedValues) : [],
    value: check.statusField ? check.statusField.value || null : null,
    blocksReadiness: Boolean(options.blocksReadiness && check.status !== 'ok'),
  };
}

function checkBlocksReadiness(check) {
  return Boolean(check && check.status !== 'ok');
}

function hasNonZeroFailureKind(value) {
  return Object.values(normalizeObject(value)).some((count) => Number(count) > 0);
}

function readinessRecommendedActionCode(
  readiness,
  summary,
  evidenceSummaryCheck,
  manifestCheck,
  handoffReportCheck,
  actionCodesCheck,
  incidentReportCheck,
) {
  if (normalizeList(manifestCheck && manifestCheck.metadataFailures).length > 0) {
    return 'review_metadata_drift';
  }

  if (normalizeList(manifestCheck && manifestCheck.summaryRoleIndexFailures).length > 0) {
    return 'review_manifest_failures';
  }

  if (normalizeList(manifestCheck && manifestCheck.operatorCheckFailures).length > 0) {
    return 'review_manifest_failures';
  }

  if (hasNonZeroFailureKind(manifestCheck && manifestCheck.failureKinds)) {
    return 'review_manifest_failures';
  }

  if (
    !evidenceSummaryCheck ||
    checkBlocksReadiness(evidenceSummaryCheck) ||
    checkBlocksReadiness(manifestCheck) ||
    checkBlocksReadiness(handoffReportCheck) ||
    !actionCodesCheck ||
    checkBlocksReadiness(actionCodesCheck) ||
    checkBlocksReadiness(incidentReportCheck)
  ) {
    return 'resolve_blocking_checks';
  }

  if (summary.status === 'incomplete') {
    return 'capture_missing_evidence';
  }

  if (readiness === 'operator_review_required') {
    return 'complete_operator_review';
  }

  if (readiness === 'ready') {
    return 'ready_for_automation';
  }

  return 'review_readiness_payload';
}

function readinessRecommendedAction(
  readiness,
  summary,
  evidenceSummaryCheck,
  manifestCheck,
  handoffReportCheck,
  actionCodesCheck,
  incidentReportCheck,
) {
  return READINESS_ACTION_LABELS[
    readinessRecommendedActionCode(
      readiness,
      summary,
      evidenceSummaryCheck,
      manifestCheck,
      handoffReportCheck,
      actionCodesCheck,
      incidentReportCheck,
    )
  ];
}

function buildJsonPayload(
  summary,
  summaryPath,
  evidenceSummaryCheck,
  evidenceSummaryCheckPath,
  manifestCheck,
  manifestCheckPath,
  handoffReportCheck,
  handoffReportCheckPath,
  actionCodesCheck,
  actionCodesCheckPath,
  incidentReportCheck,
  incidentReportCheckPath,
) {
  const readiness = readinessStatus(summary, evidenceSummaryCheck, manifestCheck, handoffReportCheck, actionCodesCheck, incidentReportCheck);

  return {
    schemaVersion: 1,
    generatedAt: new Date().toISOString(),
    target: 'readiness-report-json',
    readiness,
    recommendedActionCode: readinessRecommendedActionCode(
      readiness,
      summary,
      evidenceSummaryCheck,
      manifestCheck,
      handoffReportCheck,
      actionCodesCheck,
      incidentReportCheck,
    ),
    recommendedAction: readinessRecommendedAction(
      readiness,
      summary,
      evidenceSummaryCheck,
      manifestCheck,
      handoffReportCheck,
      actionCodesCheck,
      incidentReportCheck,
    ),
    evidenceSummary: {
      path: summaryPath,
      generatedAt: summary.generatedAt || null,
      status: summary.status || 'unknown',
      ok: Boolean(summary.ok),
      evidenceDir: summary.evidenceDir || null,
      strictFailures: normalizeList(summary.strictFailures),
      manualReviewRequired: normalizeList(summary.manualReviewRequired),
      missingArtifacts: normalizeList(summary.missingArtifacts),
      missingManualEvidence: normalizeList(summary.missingManualEvidence),
      iosInstallEvidence: normalizeList(summary.iosInstallEvidence),
    },
    evidenceSummaryCheck: buildCheckPayload(evidenceSummaryCheck, evidenceSummaryCheckPath, {
      blocksReadiness: true,
      requirePresent: true,
    }),
    manifestCheck: buildCheckPayload(manifestCheck, manifestCheckPath, { blocksReadiness: true }),
    handoffReportCheck: buildCheckPayload(handoffReportCheck, handoffReportCheckPath, {
      blocksReadiness: true,
    }),
    actionCodesCheck: buildCheckPayload(actionCodesCheck, actionCodesCheckPath, {
      blocksReadiness: true,
      requirePresent: true,
    }),
    incidentReportCheck: buildCheckPayload(incidentReportCheck, incidentReportCheckPath, {
      blocksReadiness: true,
    }),
  };
}

function buildReport(
  summary,
  summaryPath,
  evidenceSummaryCheck,
  evidenceSummaryCheckPath,
  manifestCheck,
  manifestCheckPath,
  handoffReportCheck,
  handoffReportCheckPath,
  actionCodesCheck,
  actionCodesCheckPath,
  incidentReportCheck,
  incidentReportCheckPath,
) {
  const generatedAt = new Date().toISOString();
  const readiness = readinessStatus(summary, evidenceSummaryCheck, manifestCheck, handoffReportCheck, actionCodesCheck, incidentReportCheck);
  const recommendedActionCode = readinessRecommendedActionCode(
    readiness,
    summary,
    evidenceSummaryCheck,
    manifestCheck,
    handoffReportCheck,
    actionCodesCheck,
    incidentReportCheck,
  );
  const recommendedAction = readinessRecommendedAction(
    readiness,
    summary,
    evidenceSummaryCheck,
    manifestCheck,
    handoffReportCheck,
    actionCodesCheck,
    incidentReportCheck,
  );
  const strictFailures = normalizeList(summary.strictFailures);
  const manualReviewRequired = normalizeList(summary.manualReviewRequired);
  const missingArtifacts = normalizeList(summary.missingArtifacts);
  const missingManualEvidence = normalizeList(summary.missingManualEvidence);

  return `# Operations Readiness Report

- Generated at: ${generatedAt}
- Evidence summary: ${summaryPath}
- Summary generated at: ${summary.generatedAt || 'unknown'}
- Summary status: ${summary.status || 'unknown'}
- Readiness: ${readiness}
- Recommended action code: ${recommendedActionCode}
- Recommended action: ${recommendedAction}
- Evidence directory: ${summary.evidenceDir || 'unknown'}

## Decision

${readiness === 'ready' ? 'Ready for operational handoff.' : ''}
${readiness === 'operator_review_required' ? 'Operator review is required before handoff.' : ''}
${readiness === 'not_ready' ? 'Not ready for handoff. Resolve missing or failed evidence first.' : ''}

## Strict failures

${renderList(strictFailures, 'None')}

## Manual review required

${renderList(manualReviewRequired, 'None')}

## Missing artifacts

${renderList(missingArtifacts, 'None')}

## Missing manual evidence

${renderList(missingManualEvidence, 'None')}

## Artifact status

${renderArtifactRows(summary) || '- No artifact status found'}

## Manual evidence status

${renderManualEvidenceRows(summary) || '- No manual evidence status found'}

## iOS install evidence status

${renderIosInstallEvidenceRows(summary) || '- No iOS install evidence status found'}

## Evidence summary check

${renderEvidenceSummaryCheck(evidenceSummaryCheck, evidenceSummaryCheckPath)}

## Evidence manifest check

${renderManifestCheck(manifestCheck, manifestCheckPath)}

## Handoff report check

${renderHandoffReportCheck(handoffReportCheck, handoffReportCheckPath)}

## Readiness action-code catalog check

${renderActionCodesCheck(actionCodesCheck, actionCodesCheckPath)}

## Incident report check

${renderIncidentReportCheck(incidentReportCheck, incidentReportCheckPath)}
`;
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
  const summary = readSummary(args.summaryPath);
  const evidenceSummaryCheck = readOptionalJson(args.evidenceSummaryCheckPath);
  const manifestCheck = readOptionalJson(args.manifestCheckPath);
  const handoffReportCheck = readOptionalJson(args.handoffReportCheckPath);
  const actionCodesCheck = readOptionalJson(args.actionCodesCheckPath);
  const incidentReportCheck = readOptionalJson(args.incidentReportCheckPath);
  const readiness = readinessStatus(summary, evidenceSummaryCheck, manifestCheck, handoffReportCheck, actionCodesCheck, incidentReportCheck);
  const contents =
    args.format === 'json'
      ? `${JSON.stringify(
          buildJsonPayload(
            summary,
            args.summaryPath,
            evidenceSummaryCheck,
            args.evidenceSummaryCheckPath,
            manifestCheck,
            args.manifestCheckPath,
            handoffReportCheck,
            args.handoffReportCheckPath,
            actionCodesCheck,
            args.actionCodesCheckPath,
            incidentReportCheck,
            args.incidentReportCheckPath,
          ),
          null,
          2,
        )}\n`
      : buildReport(
          summary,
          args.summaryPath,
          evidenceSummaryCheck,
          args.evidenceSummaryCheckPath,
          manifestCheck,
          args.manifestCheckPath,
          handoffReportCheck,
          args.handoffReportCheckPath,
          actionCodesCheck,
          args.actionCodesCheckPath,
          incidentReportCheck,
          args.incidentReportCheckPath,
        );

  if (args.outputPath) {
    writeOutput(args.outputPath, contents);
  }

  process.stdout.write(contents);

  if (args.strict && readiness !== 'ready') {
    process.exitCode = 1;
  }
}

try {
  main();
} catch (error) {
  console.error(`ops-readiness-report failed: ${error.message}`);
  process.exitCode = 1;
}
