#!/usr/bin/env node

import fs from 'node:fs';
import path from 'node:path';

import {
  READINESS_ALL_ACTION_CODES,
  READINESS_DIAGNOSTIC_ONLY_ACTION_CODES,
  READINESS_SOURCE_ACTION_CODES,
} from './ops-readiness-action-code-contract.js';

function labelProperties() {
  return Object.fromEntries(READINESS_ALL_ACTION_CODES.map((code) => [code, { type: 'string' }]));
}

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
    $id: 'https://travel-planner.local/schemas/ops-readiness-action-codes.schema.json',
    title: 'Travel Planner readiness action-code catalog',
    metadata: {
      target: 'readiness-action-codes',
      artifact: 'ops-readiness-action-codes.json',
      sourceTarget: 'readiness-report-json',
      checkResultTarget: 'readiness-report-json-check-result',
    },
    type: 'object',
    additionalProperties: false,
    required: [
      'schemaVersion',
      'generatedAt',
      'target',
      'sourceTarget',
      'checkResultTarget',
      'sourceCodes',
      'diagnosticOnlyCodes',
      'allCodes',
      'labels',
    ],
    properties: {
      schemaVersion: { const: 1 },
      generatedAt: { type: 'string', format: 'date-time' },
      target: { const: 'readiness-action-codes' },
      sourceTarget: { const: 'readiness-report-json' },
      checkResultTarget: { const: 'readiness-report-json-check-result' },
      sourceCodes: {
        type: 'array',
        items: { $ref: '#/$defs/sourceCode' },
      },
      diagnosticOnlyCodes: {
        type: 'array',
        items: {
          type: 'string',
          enum: READINESS_DIAGNOSTIC_ONLY_ACTION_CODES,
        },
      },
      allCodes: {
        type: 'array',
        items: { $ref: '#/$defs/actionCode' },
      },
      labels: {
        type: 'object',
        additionalProperties: false,
        required: READINESS_ALL_ACTION_CODES,
        properties: labelProperties(),
      },
    },
    $defs: {
      sourceCode: {
        type: 'string',
        enum: READINESS_SOURCE_ACTION_CODES,
      },
      actionCode: {
        type: 'string',
        enum: READINESS_ALL_ACTION_CODES,
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
  console.error(`ops-readiness-action-codes-schema failed: ${error.message}`);
  process.exitCode = 1;
}
