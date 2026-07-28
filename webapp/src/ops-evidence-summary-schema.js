#!/usr/bin/env node

import fs from 'node:fs';
import path from 'node:path';

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
    $id: 'https://travel-planner.local/schemas/ops-evidence-summary.schema.json',
    title: 'Travel Planner operations evidence summary',
    metadata: {
      target: 'evidence-summary',
      artifact: 'ops-evidence-summary.json',
    },
    type: 'object',
    additionalProperties: false,
    required: [
      'ok',
      'status',
      'generatedAt',
      'evidenceDir',
      'artifacts',
      'manualEvidence',
      'missingArtifacts',
      'missingConfiguredManualEvidence',
      'missingManualEvidence',
      'manualReviewRequired',
      'strictFailures',
    ],
    properties: {
      ok: { type: 'boolean' },
      status: { type: 'string', enum: ['ready', 'operator_review_required', 'incomplete'] },
      generatedAt: { type: 'string', format: 'date-time' },
      evidenceDir: { type: 'string' },
      artifacts: {
        type: 'array',
        items: { $ref: '#/$defs/artifactStatus' },
      },
      manualEvidence: {
        type: 'array',
        items: { $ref: '#/$defs/manualEvidenceStatus' },
      },
      iosInstallEvidence: {
        type: 'array',
        items: { $ref: '#/$defs/iosInstallEvidenceStatus' },
      },
      missingArtifacts: { $ref: '#/$defs/stringList' },
      missingConfiguredManualEvidence: { $ref: '#/$defs/stringList' },
      missingManualEvidence: { $ref: '#/$defs/stringList' },
      manualReviewRequired: { $ref: '#/$defs/stringList' },
      strictFailures: { $ref: '#/$defs/stringList' },
    },
    $defs: {
      nullableString: {
        anyOf: [{ type: 'string' }, { type: 'null' }],
      },
      stringList: {
        type: 'array',
        items: { type: 'string' },
      },
      fileStatus: {
        type: 'object',
        additionalProperties: false,
        required: ['file', 'present', 'bytes', 'modifiedAt'],
        properties: {
          file: { type: 'string' },
          present: { type: 'boolean' },
          bytes: { type: 'number' },
          modifiedAt: { $ref: '#/$defs/nullableString' },
        },
      },
      artifactStatus: {
        type: 'object',
        additionalProperties: false,
        required: ['id', 'label', 'status', 'selectedFile', 'primary', 'alternatives'],
        properties: {
          id: { type: 'string' },
          label: { type: 'string' },
          status: { type: 'string', enum: ['present', 'missing'] },
          selectedFile: { $ref: '#/$defs/nullableString' },
          primary: { $ref: '#/$defs/fileStatus' },
          alternatives: {
            type: 'array',
            items: { $ref: '#/$defs/fileStatus' },
          },
        },
      },
      manualEvidenceStatus: {
        type: 'object',
        additionalProperties: false,
        required: ['id', 'label', 'status', 'command', 'envPath', 'defaultFile', 'file', 'present'],
        properties: {
          id: { type: 'string' },
          label: { type: 'string' },
          status: { type: 'string', enum: ['present', 'missing', 'manual_required'] },
          command: { type: 'string' },
          envPath: { type: 'string' },
          defaultFile: { $ref: '#/$defs/nullableString' },
          file: { $ref: '#/$defs/nullableString' },
          present: { type: 'boolean' },
          bytes: { type: 'number' },
          modifiedAt: { $ref: '#/$defs/nullableString' },
        },
      },
      iosInstallEvidenceStatus: {
        type: 'object',
        additionalProperties: false,
        required: ['id', 'label', 'status', 'envPath', 'file', 'present', 'bytes', 'modifiedAt'],
        properties: {
          id: { type: 'string' },
          label: { type: 'string' },
          status: { type: 'string', enum: ['present', 'missing', 'invalid-json'] },
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
          error: { type: 'string' },
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
  console.error(`ops-evidence-summary-schema failed: ${error.message}`);
  process.exitCode = 1;
}
