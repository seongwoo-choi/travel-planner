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
    $id: 'https://travel-planner.local/schemas/ops-evidence-summary-check.schema.json',
    title: 'Travel Planner evidence summary check result',
    metadata: {
      target: 'evidence-summary-check-result',
      artifact: 'ops-evidence-summary-check.json',
      validatesTarget: 'evidence-summary',
    },
    type: 'object',
    additionalProperties: false,
    required: [
      'schemaVersion',
      'checkedAt',
      'status',
      'target',
      'validatesTarget',
      'summaryPath',
      'diagnostics',
      'errors',
      'blocksReadiness',
    ],
    properties: {
      schemaVersion: { const: 1 },
      checkedAt: { type: 'string', format: 'date-time' },
      status: { type: 'string', enum: ['ok', 'failed'] },
      target: { const: 'evidence-summary-check-result' },
      validatesTarget: { const: 'evidence-summary' },
      summaryPath: { type: 'string' },
      diagnostics: {
        type: 'object',
        additionalProperties: false,
        required: [
          'summaryObject',
          'summaryStatus',
          'summaryOk',
          'expectedStatus',
          'expectedOk',
          'missingArtifacts',
          'expectedMissingArtifacts',
          'missingConfiguredManualEvidence',
          'expectedMissingConfiguredManualEvidence',
          'missingManualEvidence',
          'expectedMissingManualEvidence',
          'manualReviewRequired',
          'expectedManualReviewRequired',
          'strictFailures',
          'expectedStrictFailures',
          'artifactErrors',
          'manualEvidenceErrors',
          'iosInstallEvidenceErrors',
        ],
        properties: {
          summaryObject: { type: 'boolean' },
          summaryStatus: { $ref: '#/$defs/nullableString' },
          summaryOk: { $ref: '#/$defs/nullableBoolean' },
          expectedStatus: { type: 'string', enum: ['ready', 'operator_review_required', 'incomplete'] },
          expectedOk: { type: 'boolean' },
          missingArtifacts: { $ref: '#/$defs/stringList' },
          expectedMissingArtifacts: { $ref: '#/$defs/stringList' },
          missingConfiguredManualEvidence: { $ref: '#/$defs/stringList' },
          expectedMissingConfiguredManualEvidence: { $ref: '#/$defs/stringList' },
          missingManualEvidence: { $ref: '#/$defs/stringList' },
          expectedMissingManualEvidence: { $ref: '#/$defs/stringList' },
          manualReviewRequired: { $ref: '#/$defs/stringList' },
          expectedManualReviewRequired: { $ref: '#/$defs/stringList' },
          strictFailures: { $ref: '#/$defs/stringList' },
          expectedStrictFailures: { $ref: '#/$defs/stringList' },
          artifactErrors: { $ref: '#/$defs/stringList' },
          manualEvidenceErrors: { $ref: '#/$defs/stringList' },
          iosInstallEvidenceErrors: { $ref: '#/$defs/stringList' },
        },
      },
      errors: { $ref: '#/$defs/stringList' },
      blocksReadiness: { type: 'boolean' },
    },
    $defs: {
      nullableString: {
        anyOf: [{ type: 'string' }, { type: 'null' }],
      },
      nullableBoolean: {
        anyOf: [{ type: 'boolean' }, { type: 'null' }],
      },
      stringList: {
        type: 'array',
        items: { type: 'string' },
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
  console.error(`ops-evidence-summary-check-schema failed: ${error.message}`);
  process.exitCode = 1;
}
