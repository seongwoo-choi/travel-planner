#!/usr/bin/env node

import fs from 'node:fs';
import path from 'node:path';

import {
  CHECK_FIELD_REASON_VALUES,
  REJECTED_FIELD_REASON_VALUES,
} from './ops-human-evidence-check.js';

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
    $id: 'https://travel-planner.local/schemas/incident-report-check.schema.json',
    title: 'Travel Planner incident report check result',
    metadata: {
      target: 'incident-report-check-result',
      artifact: 'incident-report-check.json',
      validatesTarget: 'incident-report',
    },
    type: 'object',
    additionalProperties: false,
    allOf: [
      {
        if: {
          properties: { fieldMetadataAvailable: { const: true } },
          required: ['fieldMetadataAvailable'],
        },
        then: {
          properties: { fields: { minItems: 1 } },
        },
      },
      {
        if: {
          properties: { fieldMetadataAvailable: { const: false } },
          required: ['fieldMetadataAvailable'],
        },
        then: {
          properties: { fields: { maxItems: 0 } },
        },
      },
    ],
    required: [
      'schemaVersion',
      'checkedAt',
      'status',
      'reportPath',
      'requireDriftAcceptance',
      'errorsBySection',
      'missingFieldsBySection',
      'fields',
      'fieldMetadataAvailable',
      'rejectedFields',
      'rejectedFieldCount',
      'rejectedFieldReasons',
      'rejectedFieldReasonEntries',
      'errors',
    ],
    properties: {
      schemaVersion: { const: 1 },
      checkedAt: { type: 'string', format: 'date-time' },
      status: { type: 'string', enum: ['ok', 'failed'] },
      reportPath: { type: 'string' },
      requireDriftAcceptance: { type: 'boolean' },
      statusField: {
        type: 'object',
        additionalProperties: false,
        required: ['present', 'value', 'investigating', 'accepted', 'allowedValues', 'guidance'],
        properties: {
          present: { type: 'boolean' },
          value: { anyOf: [{ type: 'string' }, { type: 'null' }] },
          investigating: { type: 'boolean' },
          accepted: { type: 'boolean' },
          allowedValues: {
            type: 'array',
            items: { type: 'string', enum: ['monitoring', 'mitigated', 'resolved', 'closed'] },
          },
          guidance: { type: 'string' },
        },
      },
      fields: {
        description: 'Canonical repair metadata source used to derive rejectedFields and rejected-field reason summaries; exact duplicate field records are rejected, and an empty array means no field-level repair metadata is available.',
        default: [],
        type: 'array',
        uniqueItems: true,
        items: {
          type: 'object',
          additionalProperties: false,
          required: ['label', 'section', 'scope', 'present', 'accepted', 'reason'],
          properties: {
            label: { type: 'string' },
            section: { anyOf: [{ type: 'string' }, { type: 'null' }] },
            scope: { anyOf: [{ type: 'string' }, { type: 'null' }] },
            present: { type: 'boolean' },
            accepted: { type: 'boolean' },
            reason: {
              type: 'string',
              enum: CHECK_FIELD_REASON_VALUES,
            },
          },
        },
      },
      fieldMetadataAvailable: {
        description: 'True when fields contains generated field-level repair metadata and must match whether fields is non-empty; false when field-level repair metadata is unavailable.',
        type: 'boolean',
        default: false,
      },
      errorsBySection: {
        type: 'object',
        additionalProperties: {
          type: 'array',
          items: { type: 'string' },
        },
      },
      missingFieldsBySection: {
        type: 'object',
        additionalProperties: {
          type: 'array',
          items: { type: 'string' },
        },
      },
      rejectedFields: {
        description: 'Derived from fields entries where accepted is false; exact duplicate rejected-field objects are rejected.',
        default: [],
        type: 'array',
        uniqueItems: true,
        items: {
          type: 'object',
          additionalProperties: false,
          required: ['label', 'section', 'scope', 'reason'],
          properties: {
            label: { type: 'string' },
            section: { anyOf: [{ type: 'string' }, { type: 'null' }] },
            scope: { anyOf: [{ type: 'string' }, { type: 'null' }] },
            reason: {
              type: 'string',
              enum: REJECTED_FIELD_REASON_VALUES,
            },
          },
        },
      },
      rejectedFieldCount: {
        description: 'Derived from rejectedFields.length.',
        type: 'integer',
        minimum: 0,
        default: 0,
      },
      rejectedFieldReasons: {
        description: 'Reason-count projection derived from rejectedFields; present reason keys use positive integer counts.',
        default: {},
        type: 'object',
        maxProperties: REJECTED_FIELD_REASON_VALUES.length,
        propertyNames: {
          enum: REJECTED_FIELD_REASON_VALUES,
        },
        additionalProperties: { type: 'integer', minimum: 1 },
      },
      rejectedFieldReasonEntries: {
        description: 'Reason-count entries derived from rejectedFieldReasons, ordered by the canonical rejected-field reason enum, bounded to that reason vocabulary, rejecting exact duplicate entries, and including only positive integer counts.',
        default: [],
        type: 'array',
        maxItems: REJECTED_FIELD_REASON_VALUES.length,
        uniqueItems: true,
        items: {
          type: 'object',
          additionalProperties: false,
          required: ['reason', 'count'],
          properties: {
            reason: {
              type: 'string',
              enum: REJECTED_FIELD_REASON_VALUES,
            },
            count: { type: 'integer', minimum: 1 },
          },
        },
      },
      errors: {
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
  console.error(`ops-incident-report-check-schema failed: ${error.message}`);
  process.exitCode = 1;
}
