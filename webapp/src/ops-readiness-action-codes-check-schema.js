#!/usr/bin/env node

import fs from 'node:fs';
import path from 'node:path';

import {
  READINESS_ALL_ACTION_CODES,
  READINESS_DIAGNOSTIC_ONLY_ACTION_CODES,
  READINESS_SOURCE_ACTION_CODES,
} from './ops-readiness-action-code-contract.js';

const ERROR_CODES = [
  'catalog-read-failed',
  'catalog-json-parse-failed',
  'catalog-not-object',
  'invalid-schemaVersion',
  'invalid-generatedAt',
  'invalid-target',
  'invalid-sourceTarget',
  'invalid-checkResultTarget',
  'source-codes-mismatch',
  'diagnostic-only-codes-mismatch',
  'all-codes-mismatch',
  'labels-not-object',
  'missing-labels',
  'unknown-labels',
  'mismatched-labels',
];

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

function nullableArray(items) {
  return {
    anyOf: [
      { type: 'array', items },
      { type: 'null' },
    ],
  };
}

function buildSchema() {
  return {
    $schema: 'https://json-schema.org/draft/2020-12/schema',
    $id: 'https://travel-planner.local/schemas/ops-readiness-action-codes-check.schema.json',
    title: 'Travel Planner readiness action-code catalog check result',
    metadata: {
      target: 'readiness-action-codes-check-result',
      artifact: 'ops-readiness-action-codes-check.json',
      validatesTarget: 'readiness-action-codes',
    },
    type: 'object',
    additionalProperties: false,
    required: [
      'schemaVersion',
      'checkedAt',
      'status',
      'target',
      'validatesTarget',
      'catalogPath',
      'diagnostics',
      'errors',
      'blocksReadiness',
    ],
    properties: {
      schemaVersion: { const: 1 },
      checkedAt: { type: 'string', format: 'date-time' },
      status: { type: 'string', enum: ['ok', 'fail'] },
      target: { const: 'readiness-action-codes-check-result' },
      validatesTarget: { const: 'readiness-action-codes' },
      catalogPath: { type: 'string' },
      diagnostics: {
        type: 'object',
        additionalProperties: false,
        required: [
          'catalogObject',
          'sourceCodes',
          'diagnosticOnlyCodes',
          'allCodes',
          'labelKeys',
          'expectedSourceCodes',
          'expectedDiagnosticOnlyCodes',
          'expectedAllCodes',
          'expectedLabelKeys',
          'missingLabels',
          'unknownLabels',
          'mismatchedLabels',
        ],
        properties: {
          catalogObject: { type: 'boolean' },
          sourceCodes: nullableArray({}),
          diagnosticOnlyCodes: nullableArray({}),
          allCodes: nullableArray({}),
          labelKeys: { type: 'array', items: { type: 'string' } },
          expectedSourceCodes: { type: 'array', items: { $ref: '#/$defs/sourceCode' } },
          expectedDiagnosticOnlyCodes: { type: 'array', items: { $ref: '#/$defs/diagnosticOnlyCode' } },
          expectedAllCodes: { type: 'array', items: { $ref: '#/$defs/actionCode' } },
          expectedLabelKeys: { type: 'array', items: { $ref: '#/$defs/actionCode' } },
          missingLabels: { type: 'array', items: { $ref: '#/$defs/actionCode' } },
          unknownLabels: { type: 'array', items: { type: 'string' } },
          mismatchedLabels: { type: 'array', items: { $ref: '#/$defs/actionCode' } },
        },
      },
      errors: { type: 'array', items: { $ref: '#/$defs/errorCode' } },
      blocksReadiness: { type: 'boolean' },
    },
    $defs: {
      sourceCode: {
        type: 'string',
        enum: READINESS_SOURCE_ACTION_CODES,
      },
      diagnosticOnlyCode: {
        type: 'string',
        enum: READINESS_DIAGNOSTIC_ONLY_ACTION_CODES,
      },
      actionCode: {
        type: 'string',
        enum: READINESS_ALL_ACTION_CODES,
      },
      errorCode: {
        type: 'string',
        enum: ERROR_CODES,
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
  console.error(`ops-readiness-action-codes-check-schema failed: ${error.message}`);
  process.exitCode = 1;
}
