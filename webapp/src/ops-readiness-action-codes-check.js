#!/usr/bin/env node

import fs from 'node:fs';
import path from 'node:path';

import {
  READINESS_ACTION_LABELS,
  READINESS_ALL_ACTION_CODES,
  READINESS_DIAGNOSTIC_ONLY_ACTION_CODES,
  READINESS_SOURCE_ACTION_CODES,
} from './ops-readiness-action-code-contract.js';

const EXPECTED_LABEL_KEYS = Object.keys(READINESS_ACTION_LABELS);

function evidencePath(fileName) {
  return path.join(process.env.TRAVEL_EVIDENCE_DIR || 'reports', fileName);
}

function parseArgs(argv) {
  const args = {
    inputPath: process.env.TRAVEL_READINESS_ACTION_CODES_PATH || evidencePath('ops-readiness-action-codes.json'),
    outputPath: '',
    strict: false,
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
      args.outputPath = process.env[arg.slice('--output-env='.length)] || '';
    } else if (arg.startsWith('--output-default-evidence=')) {
      if (!args.outputPath) {
        args.outputPath = evidencePath(arg.slice('--output-default-evidence='.length));
      }
    } else {
      throw new Error(`Unknown argument: ${arg}`);
    }
  }

  return args;
}

function isObject(value) {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function arraysMatch(actual, expected) {
  return Array.isArray(actual) &&
    actual.length === expected.length &&
    actual.every((value, index) => value === expected[index]);
}

function readCatalog(inputPath) {
  const absolutePath = path.resolve(process.cwd(), inputPath);
  const text = fs.readFileSync(absolutePath, 'utf8');
  return {
    absolutePath,
    catalog: JSON.parse(text),
  };
}

function checkCatalog(catalog) {
  const errors = [];

  if (!isObject(catalog)) {
    return {
      diagnostics: {
        catalogObject: false,
        sourceCodes: null,
        diagnosticOnlyCodes: null,
        allCodes: null,
        labelKeys: [],
        expectedSourceCodes: READINESS_SOURCE_ACTION_CODES,
        expectedDiagnosticOnlyCodes: READINESS_DIAGNOSTIC_ONLY_ACTION_CODES,
        expectedAllCodes: READINESS_ALL_ACTION_CODES,
        expectedLabelKeys: EXPECTED_LABEL_KEYS,
        missingLabels: EXPECTED_LABEL_KEYS,
        unknownLabels: [],
        mismatchedLabels: [],
      },
      errors: ['catalog-not-object'],
    };
  }

  if (catalog.schemaVersion !== 1) errors.push('invalid-schemaVersion');
  if (Number.isNaN(Date.parse(catalog.generatedAt))) errors.push('invalid-generatedAt');
  if (catalog.target !== 'readiness-action-codes') errors.push('invalid-target');
  if (catalog.sourceTarget !== 'readiness-report-json') errors.push('invalid-sourceTarget');
  if (catalog.checkResultTarget !== 'readiness-report-json-check-result') errors.push('invalid-checkResultTarget');
  if (!arraysMatch(catalog.sourceCodes, READINESS_SOURCE_ACTION_CODES)) errors.push('source-codes-mismatch');
  if (!arraysMatch(catalog.diagnosticOnlyCodes, READINESS_DIAGNOSTIC_ONLY_ACTION_CODES)) {
    errors.push('diagnostic-only-codes-mismatch');
  }
  if (!arraysMatch(catalog.allCodes, READINESS_ALL_ACTION_CODES)) errors.push('all-codes-mismatch');

  const labelKeys = isObject(catalog.labels) ? Object.keys(catalog.labels) : [];
  const expectedLabelKeys = EXPECTED_LABEL_KEYS;
  const missingLabels = expectedLabelKeys.filter((key) => !Object.hasOwn(catalog.labels || {}, key));
  const unknownLabels = labelKeys.filter((key) => !Object.hasOwn(READINESS_ACTION_LABELS, key));
  const mismatchedLabels = expectedLabelKeys.filter(
    (key) => Object.hasOwn(catalog.labels || {}, key) && catalog.labels[key] !== READINESS_ACTION_LABELS[key],
  );

  if (!isObject(catalog.labels)) errors.push('labels-not-object');
  if (missingLabels.length) errors.push('missing-labels');
  if (unknownLabels.length) errors.push('unknown-labels');
  if (mismatchedLabels.length) errors.push('mismatched-labels');

  return {
    diagnostics: {
      catalogObject: true,
      sourceCodes: Array.isArray(catalog.sourceCodes) ? catalog.sourceCodes : null,
      diagnosticOnlyCodes: Array.isArray(catalog.diagnosticOnlyCodes) ? catalog.diagnosticOnlyCodes : null,
      allCodes: Array.isArray(catalog.allCodes) ? catalog.allCodes : null,
      labelKeys,
      expectedSourceCodes: READINESS_SOURCE_ACTION_CODES,
      expectedDiagnosticOnlyCodes: READINESS_DIAGNOSTIC_ONLY_ACTION_CODES,
      expectedAllCodes: READINESS_ALL_ACTION_CODES,
      expectedLabelKeys,
      missingLabels,
      unknownLabels,
      mismatchedLabels,
    },
    errors,
  };
}

function buildResult(inputPath, catalog, readError) {
  const catalogCheck = readError
    ? {
        diagnostics: {
          catalogObject: false,
          sourceCodes: null,
          diagnosticOnlyCodes: null,
          allCodes: null,
          labelKeys: [],
          expectedSourceCodes: READINESS_SOURCE_ACTION_CODES,
          expectedDiagnosticOnlyCodes: READINESS_DIAGNOSTIC_ONLY_ACTION_CODES,
          expectedAllCodes: READINESS_ALL_ACTION_CODES,
          expectedLabelKeys: EXPECTED_LABEL_KEYS,
          missingLabels: EXPECTED_LABEL_KEYS,
          unknownLabels: [],
          mismatchedLabels: [],
        },
        errors: [readError],
      }
    : checkCatalog(catalog);
  const status = catalogCheck.errors.length ? 'fail' : 'ok';

  return {
    schemaVersion: 1,
    checkedAt: new Date().toISOString(),
    status,
    target: 'readiness-action-codes-check-result',
    validatesTarget: 'readiness-action-codes',
    catalogPath: inputPath,
    diagnostics: catalogCheck.diagnostics,
    errors: catalogCheck.errors,
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
  let catalog = null;
  let catalogPath = args.inputPath;
  let readError = '';

  try {
    const readResult = readCatalog(args.inputPath);
    catalog = readResult.catalog;
    catalogPath = readResult.absolutePath;
  } catch (error) {
    readError = error instanceof SyntaxError ? 'catalog-json-parse-failed' : 'catalog-read-failed';
  }

  const result = buildResult(catalogPath, catalog, readError);
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
  console.error(`ops-readiness-action-codes-check failed: ${error.message}`);
  process.exitCode = 1;
}
