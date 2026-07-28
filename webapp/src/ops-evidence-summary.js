#!/usr/bin/env node

import fs from 'node:fs';
import path from 'node:path';

const DEFAULT_EVIDENCE_DIR = 'reports';
const DEFAULT_OUTPUT_PATH = 'reports/ops-evidence-summary.json';

const REQUIRED_ARTIFACTS = [
  {
    id: 'evidencePaths',
    label: 'Evidence paths preview',
    file: 'ops-evidence-paths.json',
  },
  {
    id: 'workflowIndex',
    label: 'Workflow index',
    file: 'ops-workflows.json',
  },
  {
    id: 'preflight',
    label: 'Preflight summary',
    file: 'preflight.json',
    alternatives: ['preflight-offline.json'],
  },
  {
    id: 'backupFile',
    label: 'Backup file',
    file: 'travel-planner-backup.json',
  },
  {
    id: 'backupFileCheck',
    label: 'Backup file shape check',
    file: 'storage-backup-file-check.json',
  },
  {
    id: 'backupManifest',
    label: 'Backup manifest',
    file: 'storage-backup-manifest.json',
  },
  {
    id: 'backupVerification',
    label: 'Backup manifest verification',
    file: 'storage-backup-verify.json',
  },
];

const MANUAL_EVIDENCE = [
  {
    id: 'healthGate',
    label: 'Health API gate terminal output',
    command: 'TRAVEL_HEALTH_EVIDENCE=1 npm run health:api:gate',
    envPath: 'TRAVEL_HEALTH_EVIDENCE_PATH',
    defaultFile: 'health-api-gate.txt',
  },
  {
    id: 'protectedApiGate',
    label: 'Protected API gate terminal output',
    command: 'TRAVEL_API_FETCH_EVIDENCE=1 npm run api:quality-gates:gate',
    envPath: 'TRAVEL_API_GATE_EVIDENCE_PATH',
    defaultFile: 'api-quality-gates.txt',
  },
];

const IOS_INSTALL_EVIDENCE = [
  {
    id: 'iosInstallStart',
    label: 'iOS install start guide',
    file: 'ios-install-start.json',
    envPath: 'TRAVEL_IOS_INSTALL_START_PATH',
  },
  {
    id: 'iosInstallStartSchema',
    label: 'iOS install start guide schema',
    file: 'ios-install-start.schema.json',
    envPath: 'TRAVEL_IOS_INSTALL_START_SCHEMA_PATH',
  },
  {
    id: 'iosInstallNext',
    label: 'iOS install current next action',
    file: 'ios-install-next.json',
    envPath: 'TRAVEL_IOS_INSTALL_NEXT_PATH',
  },
  {
    id: 'iosInstallNextSchema',
    label: 'iOS install current next action schema',
    file: 'ios-install-next.schema.json',
    envPath: 'TRAVEL_IOS_INSTALL_NEXT_SCHEMA_PATH',
  },
  {
    id: 'iosInstallCheck',
    label: 'iOS install readiness check',
    file: 'ios-install-check.json',
    envPath: 'TRAVEL_IOS_INSTALL_CHECK_PATH',
  },
  {
    id: 'iosInstallRunbookCheck',
    label: 'iOS install runbook check',
    file: 'ios-install-runbook-check.json',
    envPath: 'TRAVEL_IOS_INSTALL_RUNBOOK_CHECK_PATH',
  },
  {
    id: 'iosInstallSessionSchema',
    label: 'iOS install session schema',
    file: 'ios-install-session.schema.json',
    envPath: 'TRAVEL_IOS_INSTALL_SESSION_SCHEMA_PATH',
  },
  {
    id: 'iosInstallSessionCheck',
    label: 'iOS install session recovery check',
    file: 'ios-install-session-check.json',
    envPath: 'TRAVEL_IOS_INSTALL_SESSION_CHECK_PATH',
  },
  {
    id: 'iosLaunchProof',
    label: 'iOS Home Screen launch proof',
    file: 'ios-launch-proof.json',
    envPath: 'TRAVEL_IOS_LAUNCH_PROOF_PATH',
  },
  {
    id: 'iosLaunchProofCheck',
    label: 'iOS Home Screen launch proof check',
    file: 'ios-launch-proof-check.json',
    envPath: 'TRAVEL_IOS_LAUNCH_PROOF_CHECK_PATH',
  },
];

function parseArgs(argv) {
  const args = {
    strict: false,
    evidenceDir: process.env.TRAVEL_EVIDENCE_DIR || DEFAULT_EVIDENCE_DIR,
    outputPath: '',
    outputEnv: '',
    outputDefault: '',
    outputDefaultEvidence: '',
  };

  for (const arg of argv) {
    if (arg === '--strict') {
      args.strict = true;
    } else if (arg.startsWith('--dir=')) {
      args.evidenceDir = arg.slice('--dir='.length);
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

  if (!args.outputPath && args.outputEnv) {
    args.outputPath = process.env[args.outputEnv] || '';
  }

  if (!args.outputPath && args.outputDefault) {
    args.outputPath = args.outputDefault;
  }

  if (!args.outputPath && args.outputDefaultEvidence) {
    args.outputPath = path.join(args.evidenceDir, args.outputDefaultEvidence);
  }

  return args;
}

function fileStatus(baseDir, relativePath) {
  const absolutePath = path.resolve(baseDir, relativePath);

  try {
    const stat = fs.statSync(absolutePath);

    return {
      file: relativePath,
      present: stat.isFile(),
      bytes: stat.isFile() ? stat.size : 0,
      modifiedAt: stat.isFile() ? stat.mtime.toISOString() : null,
    };
  } catch (error) {
    if (error && error.code === 'ENOENT') {
      return {
        file: relativePath,
        present: false,
        bytes: 0,
        modifiedAt: null,
      };
    }

    throw error;
  }
}

function artifactStatus(baseDir, artifact) {
  const primary = fileStatus(baseDir, artifact.file);
  const alternatives = (artifact.alternatives || []).map((file) =>
    fileStatus(baseDir, file),
  );
  const selected = [primary, ...alternatives].find((candidate) => candidate.present);

  return {
    id: artifact.id,
    label: artifact.label,
    status: selected ? 'present' : 'missing',
    selectedFile: selected ? selected.file : null,
    primary,
    alternatives,
  };
}

function manualEvidenceStatus(item, baseDir, evidenceDirLabel) {
  const configuredPath = process.env[item.envPath] || '';
  const defaultPath = item.defaultFile || '';
  const lookupPath = configuredPath || defaultPath;
  const lookupBaseDir = configuredPath ? process.cwd() : baseDir;
  const displayFile = configuredPath || path.join(evidenceDirLabel, defaultPath);

  if (!lookupPath) {
    return {
      id: item.id,
      label: item.label,
      status: 'manual_required',
      command: item.command,
      envPath: item.envPath,
      defaultFile: null,
      file: null,
      present: false,
    };
  }

  const status = fileStatus(lookupBaseDir, lookupPath);

  return {
    id: item.id,
    label: item.label,
    status: status.present ? 'present' : 'missing',
    command: item.command,
    envPath: item.envPath,
    defaultFile: defaultPath ? path.join(evidenceDirLabel, defaultPath) : null,
    file: displayFile,
    present: status.present,
    bytes: status.bytes,
    modifiedAt: status.modifiedAt,
  };
}

function optionalEvidenceStatus(item, baseDir, evidenceDirLabel) {
  const configuredPath = process.env[item.envPath] || '';
  const lookupPath = configuredPath || item.file;
  const lookupBaseDir = configuredPath ? process.cwd() : baseDir;
  const displayFile = configuredPath || path.join(evidenceDirLabel, item.file);
  const status = fileStatus(lookupBaseDir, lookupPath);
  const result = {
    id: item.id,
    label: item.label,
    status: status.present ? 'present' : 'missing',
    envPath: item.envPath,
    file: displayFile,
    present: status.present,
    bytes: status.bytes,
    modifiedAt: status.modifiedAt,
  };

  if (item.id === 'iosInstallNext' && status.present) {
    try {
      const payload = JSON.parse(fs.readFileSync(path.resolve(lookupBaseDir, lookupPath), 'utf8'));
      result.action = payload.action || '';
      result.title = payload.title || '';
      result.nextCommand = payload.nextCommand || '';
      result.phoneFirst = payload.phoneFirst === true;
      result.phoneStep = payload.phoneStep || '';
      result.installUrl = payload.installTarget?.installUrl || '';
      result.shortInstallUrl = payload.installTarget?.shortInstallUrl || '';
      result.proofSaveHash = payload.installTarget?.proofSaveHash || '';
      result.proofSaveTargetId = payload.installTarget?.proofSaveTargetId || '';
      result.proofSaveUrl = payload.installTarget?.proofSaveUrl || '';
    } catch (error) {
      result.status = 'invalid-json';
      result.present = false;
      result.error = error.message;
    }
  }

  if (item.id === 'iosInstallStart' && status.present) {
    try {
      const payload = JSON.parse(fs.readFileSync(path.resolve(lookupBaseDir, lookupPath), 'utf8'));
      result.installStartReadiness = payload.readiness || '';
      result.recommendedShortInstallUrl = payload.recommendedShortInstallUrl || '';
      result.recommendedInstallUrl = payload.recommendedInstallUrl || '';
      result.sessionQrUrl = payload.sessionQrUrl || '';
      result.nextActionBoardUrl = payload.nextActionBoardUrl || '';
      result.proofSaveHash = payload.proofSaveHash || '';
      result.proofSaveTargetId = payload.proofSaveTargetId || '';
      result.proofSaveUrl = payload.proofSaveUrl || '';
      result.postInstallAppHomeUrl = payload.postInstallAppHomeUrl || '';
      result.postInstallNewPlanUrl = payload.postInstallNewPlanUrl || '';
      result.appHomeFirstPlanUrl = payload.appHomeFirstPlanUrl || '';
      result.beforePhoneTerminalCommand = payload.commands?.beforePhone || '';
      result.beforePhoneFinalTerminalCommand = payload.commands?.beforePhoneFinal || '';
      result.beforePhoneFinalThenNextTerminalCommand = payload.commands?.beforePhoneFinalThenNext || '';
      result.afterPhoneThenAllTerminalCommand = payload.commands?.afterPhoneThenAll || '';
      result.afterPhoneThenAllFinalTerminalCommand = payload.commands?.afterPhoneThenAllFinal || '';
      result.stepCount = Array.isArray(payload.steps) ? payload.steps.length : 0;
    } catch (error) {
      result.status = 'invalid-json';
      result.present = false;
      result.error = error.message;
    }
  }

  if (item.id === 'iosInstallGeneratedHandoffCheck' && status.present) {
    try {
      const payload = JSON.parse(fs.readFileSync(path.resolve(lookupBaseDir, lookupPath), 'utf8'));
      result.handoffCheckStatus = payload.status || '';
      result.handoffProofSaveHash = payload.proofSaveHash || '';
      result.handoffProofSaveTargetId = payload.proofSaveTargetId || '';
      result.handoffProofSaveUrl = payload.proofSaveUrl || '';
      result.handoffPostInstallAppHomeUrl = payload.postInstallAppHomeUrl || '';
      result.handoffPostInstallNewPlanUrl = payload.postInstallNewPlanUrl || '';
      result.handoffIssueCount = Array.isArray(payload.issues) ? payload.issues.length : 0;
    } catch (error) {
      result.status = 'invalid-json';
      result.present = false;
      result.error = error.message;
    }
  }

  if (item.id === 'iosInstallQuickstartCheck' && status.present) {
    try {
      const payload = JSON.parse(fs.readFileSync(path.resolve(lookupBaseDir, lookupPath), 'utf8'));
      result.quickstartCheckStatus = payload.status || '';
      result.quickstartUrlOrigin = payload.urlOrigin || '';
      result.quickstartUrlSameOrigin = typeof payload.urlSameOrigin === 'boolean' ? payload.urlSameOrigin : false;
      result.quickstartProofSaveHash = payload.proofSaveHash || '';
      result.quickstartProofSaveTargetId = payload.proofSaveTargetId || '';
      result.quickstartProofSaveUrl = payload.proofSaveUrl || '';
      result.quickstartPostInstallAppHomeUrl = payload.postInstallAppHomeUrl || '';
      result.quickstartPostInstallNewPlanUrl = payload.postInstallNewPlanUrl || '';
      result.quickstartCompletionStatusUrl = payload.completionStatusUrl || '';
      result.quickstartPrepareCommand = payload.prepareCommand || '';
      result.quickstartStatusCommand = payload.statusCommand || '';
      result.quickstartFinishCommand = payload.finishCommand || '';
      result.quickstartStepCount = Number.isFinite(payload.stepCount) ? payload.stepCount : 0;
      result.quickstartRecoveryHintCount = Number.isFinite(payload.recoveryHintCount) ? payload.recoveryHintCount : 0;
      result.quickstartIssueCount = Array.isArray(payload.issues) ? payload.issues.length : 0;
    } catch (error) {
      result.status = 'invalid-json';
      result.present = false;
      result.error = error.message;
    }
  }

  if ((item.id === 'iosLaunchProof' || item.id === 'iosLaunchProofCheck') && status.present) {
    try {
      const payload = JSON.parse(fs.readFileSync(path.resolve(lookupBaseDir, lookupPath), 'utf8'));
      if ('ok' in payload) result.launchProofOk = payload.ok === true;
      result.launchProofStatus = payload.status || '';
      result.launchProofSummary = payload.summary || '';
      if ('standalone' in payload) result.launchProofStandalone = payload.standalone === true;
      result.launchProofDisplayMode = payload.displayMode || '';
      result.launchProofAppModeState = payload.appModeState || '';
      result.launchProofAppModeTitle = payload.appModeTitle || '';
      result.launchProofAppModeDetail = payload.appModeDetail || '';
      result.launchProofCapturedAt = payload.capturedAt || '';
      result.launchProofSavedAt = payload.savedAt || '';
    } catch (error) {
      result.status = 'invalid-json';
      result.present = false;
      result.error = error.message;
    }
  }

  if ((item.id === 'iosInstallCheck' || item.id === 'iosInstallRunbookCheck') && status.present) {
    try {
      const payload = JSON.parse(fs.readFileSync(path.resolve(lookupBaseDir, lookupPath), 'utf8'));
      if (item.id === 'iosInstallCheck') {
        result.readinessMode = payload.readinessMode || '';
        result.handoffReady = payload.handoffReady === true;
      }
      result.installReadinessSource = payload.installReadinessSource || '';
      result.installReadinessHttps = payload.installReadinessHttps === true;
      result.installReadinessSameWifiRequired = payload.installReadinessSameWifiRequired === true;
      result.installReadinessSafariRequired = payload.installReadinessSafariRequired === true;
      result.installReadinessSummary = payload.installReadinessSummary || '';
      result.proofSaveHash = payload.proofSaveHash || result.proofSaveHash || '';
      result.proofSaveTargetId = payload.proofSaveTargetId || result.proofSaveTargetId || '';
      result.proofSaveUrl = payload.proofSaveUrl || result.proofSaveUrl || '';
      if (item.id === 'iosInstallRunbookCheck') {
        result.nextActionFinalGateCommand = payload.nextActionFinalGateCommand || '';
        result.phaseCount = Number.isFinite(payload.phaseCount) ? payload.phaseCount : 0;
      }
      if (item.id === 'iosInstallCheck') {
        result.requireInstallRunbook = payload.requireInstallRunbook === true;
        result.installSessionUrl = payload.installSessionUrl || '';
        result.installSessionQrUrl = payload.installSessionQrUrl || '';
        result.installHandoffFetchUrl = payload.installHandoffFetchUrl || '';
        result.installHandoffFetchOk = payload.installHandoffFetchOk === true;
        result.installHandoffFetchStatus = payload.installHandoffFetchStatus || '';
        result.installHandoffFetchSummary = payload.installHandoffFetchSummary || '';
        result.installSessionQrFetchUrl = payload.installSessionQrFetchUrl || '';
        result.installSessionQrFetchTargetUrl = payload.installSessionQrFetchTargetUrl || '';
        result.installSessionQrFetchOk = payload.installSessionQrFetchOk === true;
        result.installSessionQrFetchStatus = payload.installSessionQrFetchStatus || '';
        result.installSessionQrFetchSummary = payload.installSessionQrFetchSummary || '';
        result.installSessionQrFetchHttpStatus = payload.installSessionQrFetchHttpStatus || 0;
        result.installSessionQrFetchContentType = payload.installSessionQrFetchContentType || '';
        result.installSessionQrTargetParamFetchUrl = payload.installSessionQrTargetParamFetchUrl || '';
        result.installSessionQrTargetParamFetchTargetUrl = payload.installSessionQrTargetParamFetchTargetUrl || '';
        result.installSessionQrTargetParamFetchOk = payload.installSessionQrTargetParamFetchOk === true;
        result.installSessionQrTargetParamFetchStatus = payload.installSessionQrTargetParamFetchStatus || '';
        result.installSessionQrTargetParamFetchSummary = payload.installSessionQrTargetParamFetchSummary || '';
        result.installSessionQrTargetParamFetchHttpStatus = payload.installSessionQrTargetParamFetchHttpStatus || 0;
        result.installSessionQrTargetParamFetchContentType = payload.installSessionQrTargetParamFetchContentType || '';
      }
    } catch (error) {
      result.status = 'invalid-json';
      result.present = false;
      result.error = error.message;
    }
  }

  if (item.id === 'iosInstallSessionCheck' && status.present) {
    try {
      const payload = JSON.parse(fs.readFileSync(path.resolve(lookupBaseDir, lookupPath), 'utf8'));
      result.sessionRecoveryOk = payload.ok === true;
      result.sessionRecoveryStatus = payload.status || '';
      result.sessionRecoveryUrl = payload.recoveryUrl || '';
      result.sessionRecoveryTriggerField = payload.recoveryTriggerField || '';
      result.sessionRecoveryTriggerValue = payload.recoveryTriggerValue === true;
      result.sessionRecoverySequenceCount = Number.isFinite(payload.recoverySequenceCount) ? payload.recoverySequenceCount : 0;
      result.sessionRecoveryHandoffEvidenceCommand = payload.handoffEvidenceCommand || '';
      result.sessionRecoveryHandoffEvidenceTerminalCommand = payload.handoffEvidenceTerminalCommand || '';
      result.sessionRecoverySessionEvidenceCommand = payload.sessionEvidenceCommand || '';
      result.sessionRecoverySessionEvidenceTerminalCommand = payload.sessionEvidenceTerminalCommand || '';
      result.sessionRecoveryHandoffSessionEvidenceCommand = payload.handoffSessionEvidenceCommand || '';
      result.sessionRecoveryHandoffSessionEvidenceTerminalCommand = payload.handoffSessionEvidenceTerminalCommand || '';
      result.sessionRecoveryFinalGateCommand = payload.finalGateCommand || '';
      result.sessionRecoveryIssueCount = Array.isArray(payload.issues) ? payload.issues.length : 0;
    } catch (error) {
      result.status = 'invalid-json';
      result.present = false;
      result.error = error.message;
    }
  }

  return result;
}

function buildSummary(args) {
  const evidenceDir = path.resolve(process.cwd(), args.evidenceDir);
  const artifacts = REQUIRED_ARTIFACTS.map((artifact) =>
    artifactStatus(evidenceDir, artifact),
  );
  const manualEvidence = MANUAL_EVIDENCE.map((item) =>
    manualEvidenceStatus(item, evidenceDir, args.evidenceDir),
  );
  const iosInstallEvidence = IOS_INSTALL_EVIDENCE.map((item) =>
    optionalEvidenceStatus(item, evidenceDir, args.evidenceDir),
  );
  const missingArtifacts = artifacts
    .filter((artifact) => artifact.status === 'missing')
    .map((artifact) => artifact.id);
  const missingConfiguredManualEvidence = manualEvidence
    .filter((item) => item.status === 'missing')
    .map((item) => item.id);
  const missingManualEvidence = missingConfiguredManualEvidence;
  const manualReviewRequired = manualEvidence
    .filter((item) => item.status === 'manual_required')
    .map((item) => item.id);
  const strictFailures = [...missingArtifacts, ...missingConfiguredManualEvidence];
  const status =
    strictFailures.length > 0
      ? 'incomplete'
      : manualReviewRequired.length > 0
        ? 'operator_review_required'
        : 'ready';

  return {
    ok: strictFailures.length === 0,
    status,
    generatedAt: new Date().toISOString(),
    evidenceDir: args.evidenceDir,
    artifacts,
    manualEvidence,
    iosInstallEvidence,
    missingArtifacts,
    missingConfiguredManualEvidence,
    missingManualEvidence,
    manualReviewRequired,
    strictFailures,
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
  const summary = buildSummary(args);
  const contents = `${JSON.stringify(summary, null, 2)}\n`;

  if (args.outputPath) {
    writeOutput(args.outputPath, contents);
  }

  process.stdout.write(contents);

  if (args.strict && summary.strictFailures.length > 0) {
    process.exitCode = 1;
  }
}

try {
  main();
} catch (error) {
  console.error(`ops-evidence-summary failed: ${error.message}`);
  process.exitCode = 1;
}
