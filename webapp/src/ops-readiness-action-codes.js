#!/usr/bin/env node

import fs from 'node:fs';
import path from 'node:path';

import {
  READINESS_ACTION_LABELS,
  READINESS_ALL_ACTION_CODES,
  READINESS_DIAGNOSTIC_ONLY_ACTION_CODES,
  READINESS_SOURCE_ACTION_CODES,
} from './ops-readiness-action-code-contract.js';

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

function buildCatalog() {
  return {
    schemaVersion: 1,
    generatedAt: new Date().toISOString(),
    target: 'readiness-action-codes',
    sourceTarget: 'readiness-report-json',
    checkResultTarget: 'readiness-report-json-check-result',
    sourceCodes: READINESS_SOURCE_ACTION_CODES,
    diagnosticOnlyCodes: READINESS_DIAGNOSTIC_ONLY_ACTION_CODES,
    allCodes: READINESS_ALL_ACTION_CODES,
    labels: READINESS_ACTION_LABELS,
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
  const output = `${JSON.stringify(buildCatalog(), null, 2)}\n`;

  if (args.outputPath) {
    writeOutput(args.outputPath, output);
  }

  process.stdout.write(output);
}

try {
  main();
} catch (error) {
  console.error(`ops-readiness-action-codes failed: ${error.message}`);
  process.exitCode = 1;
}
