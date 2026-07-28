#!/usr/bin/env node

import fs from 'node:fs';
import path from 'node:path';

import {
  READINESS_ACTION_LABELS,
  READINESS_SOURCE_ACTION_CODES,
} from './ops-readiness-action-code-contract.js';
import {
  SUMMARY_ROLE_EVIDENCE_FIELDS,
  buildRejectedFieldReasonEntries,
  buildRejectedFieldReasons,
  buildRejectedFields,
  summaryRoleEvidenceValueAccepted,
} from './ops-human-evidence-check.js';

const ALLOWED_STATUS_VALUES = new Set(['monitoring', 'mitigated', 'resolved', 'closed']);
const SOURCE_ACTION_CODE_SET = new Set(READINESS_SOURCE_ACTION_CODES);
const REQUIRED_FIELDS = [
  { label: 'Severity', scope: 'header', disallowed: new Set(['unknown']) },
  { label: 'Owner', scope: 'header', disallowed: new Set(['unassigned']) },
  { label: 'Owner', section: 'Follow-up' },
];
const DRIFT_ACCEPTANCE_FIELDS = [
  { label: 'Manifest check report', section: 'Evidence drift acceptance' },
  { label: 'Drift artifact ids', section: 'Evidence drift acceptance' },
  { label: 'Accepted by', section: 'Evidence drift acceptance' },
  { label: 'Time', section: 'Evidence drift acceptance' },
  { label: 'Reason', section: 'Evidence drift acceptance' },
  { label: 'Follow-up owner', section: 'Evidence drift acceptance' },
];
const REVIEW_EVIDENCE_FIELDS = [
  { label: 'Readiness action-code catalog', section: 'Current evidence' },
  { label: 'Readiness action-code catalog schema', section: 'Current evidence' },
  { label: 'Readiness action-code catalog check', section: 'Current evidence' },
  { label: 'Readiness action-code catalog check-result schema', section: 'Current evidence' },
  { label: 'Readiness recommended action code', section: 'Current evidence' },
  { label: 'Readiness recommended action', section: 'Current evidence' },
  { label: 'Readiness blocking targets', section: 'Current evidence' },
  { label: 'Readiness blocking reasons', section: 'Current evidence' },
  { label: 'Readiness repair targets', section: 'Current evidence' },
  { label: 'Readiness repair reasons', section: 'Current evidence' },
  { label: 'Readiness repair source check paths', section: 'Current evidence' },
  { label: 'Manifest summary role index expected', section: 'Current evidence' },
  { label: 'Manifest summary role index recorded', section: 'Current evidence' },
  { label: 'Manifest summary role index failures', section: 'Current evidence' },
  { label: 'Manifest summary role index failure details', section: 'Current evidence' },
];

function parseArgs(argv) {
  const args = {
    strict: false,
    reportPath:
      process.env.TRAVEL_INCIDENT_REPORT_PATH ||
      path.join(process.env.TRAVEL_EVIDENCE_DIR || 'reports', 'incident-report.md'),
    requireDriftAcceptance: process.env.TRAVEL_REQUIRE_DRIFT_ACCEPTANCE === '1',
    outputPath: '',
    outputEnv: '',
    outputDefaultEvidence: '',
  };

  for (const arg of argv) {
    if (arg === '--strict') {
      args.strict = true;
    } else if (arg === '--require-drift-acceptance') {
      args.requireDriftAcceptance = true;
    } else if (arg.startsWith('--report=')) {
      args.reportPath = arg.slice('--report='.length);
    } else if (arg.startsWith('--report-env=')) {
      args.reportPath = process.env[arg.slice('--report-env='.length)] || args.reportPath;
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
    args.outputPath = path.join(
      process.env.TRAVEL_EVIDENCE_DIR || 'reports',
      args.outputDefaultEvidence,
    );
  }

  return args;
}

function slug(value) {
  return value.toLowerCase().replaceAll(' ', '-');
}

function readField(contents, label) {
  const escaped = label.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const matches = [...contents.matchAll(new RegExp(`^- ${escaped}:\\s*(.*)$`, 'gm'))];

  return matches.length > 0 ? matches[matches.length - 1][1].trim() : '';
}

function readHeader(contents) {
  const firstSection = contents.indexOf('\n## ');

  return firstSection === -1 ? contents : contents.slice(0, firstSection);
}

function readSection(contents, heading) {
  const marker = `## ${heading}`;
  const start = contents.indexOf(marker);

  if (start === -1) return '';

  const bodyStart = contents.indexOf('\n', start);

  if (bodyStart === -1) return '';

  const nextSection = contents.indexOf('\n## ', bodyStart + 1);

  return nextSection === -1
    ? contents.slice(bodyStart + 1)
    : contents.slice(bodyStart + 1, nextSection);
}

function validateRecommendedAction(errors, contents, section) {
  const source = readSection(contents, section);
  const code = readField(source, 'Readiness recommended action code');
  const text = readField(source, 'Readiness recommended action');

  if (!code || !text) return;

  if (!SOURCE_ACTION_CODE_SET.has(code)) {
    errors.push(`invalid-${slug(section)}-readiness-recommended-action-code`);
  } else if (text !== READINESS_ACTION_LABELS[code]) {
    errors.push(`inconsistent-${slug(section)}-readiness-recommended-action`);
  }
}

function incidentStatusGuidance(statusValue) {
  const normalizedValue = statusValue.toLowerCase();

  if (!statusValue) {
    return 'Set Status to monitoring, mitigated, resolved, or closed before final incident review.';
  }

  if (normalizedValue === 'investigating') {
    return 'Replace investigating with monitoring, mitigated, resolved, or closed before final incident review.';
  }

  if (!ALLOWED_STATUS_VALUES.has(normalizedValue)) {
    return 'Use monitoring, mitigated, resolved, or closed as the incident Status before final review.';
  }

  return 'Incident Status is accepted for review readiness.';
}

function addSectionError(errors, errorsBySection, section, code) {
  const sectionKey = section || 'Header';

  errors.push(code);

  if (!errorsBySection[sectionKey]) {
    errorsBySection[sectionKey] = [];
  }

  errorsBySection[sectionKey].push(code);
}

function validateRecommendedActionBySection(errors, errorsBySection, contents, section) {
  const before = errors.length;

  validateRecommendedAction(errors, contents, section);

  for (const code of errors.slice(before)) {
    if (!errorsBySection[section]) {
      errorsBySection[section] = [];
    }

    errorsBySection[section].push(code);
  }
}

function summaryRoleEvidenceKind(label) {
  const evidenceField = SUMMARY_ROLE_EVIDENCE_FIELDS.find((field) => field.label === label);

  return evidenceField ? evidenceField.kind : '';
}

function fieldReason(present, accepted, evidenceKind, disallowed) {
  if (!present) return 'missing';

  if (disallowed) return 'disallowed-placeholder';

  if (evidenceKind && !accepted) return 'invalid-summary-role-evidence-shape';

  return 'accepted';
}

function validateSummaryRoleEvidenceBySection(errors, errorsBySection, contents, section) {
  const source = readSection(contents, section);

  for (const field of SUMMARY_ROLE_EVIDENCE_FIELDS) {
    const value = readField(source, field.label);

    if (!value) continue;

    if (!summaryRoleEvidenceValueAccepted(value, field.kind)) {
      addSectionError(
        errors,
        errorsBySection,
        section,
        `invalid-${slug(section)}-${slug(field.label)}`,
      );
    }
  }
}

function buildMissingFieldsBySection(fields) {
  const missingFieldsBySection = {};

  for (const field of fields) {
    if (field.present) continue;

    const sectionKey = field.section || 'Header';

    if (!missingFieldsBySection[sectionKey]) {
      missingFieldsBySection[sectionKey] = [];
    }

    missingFieldsBySection[sectionKey].push(field.label);
  }

  return missingFieldsBySection;
}

function buildCheck(reportPath, contents, options) {
  const header = readHeader(contents);
  const statusValue = readField(header, 'Status');
  const errors = [];
  const errorsBySection = {};
  const requiredFields = options.requireDriftAcceptance
    ? [...REQUIRED_FIELDS, ...DRIFT_ACCEPTANCE_FIELDS, ...REVIEW_EVIDENCE_FIELDS]
    : REQUIRED_FIELDS;
  const fields = requiredFields.map((field) => {
    const source = field.section ? readSection(contents, field.section) : header;
    const value = readField(source, field.label);
    const normalizedValue = value.toLowerCase();
    const present = value.length > 0;
    const disallowed = field.disallowed ? field.disallowed.has(normalizedValue) : false;
    const evidenceKind =
      field.section === 'Current evidence' ? summaryRoleEvidenceKind(field.label) : '';
    const accepted =
      present &&
      !disallowed &&
      (!evidenceKind || summaryRoleEvidenceValueAccepted(value, evidenceKind));

    if (!present) {
      addSectionError(
        errors,
        errorsBySection,
        field.section || 'Header',
        `missing-${field.section ? `${slug(field.section)}-` : ''}${slug(field.label)}`,
      );
    } else if (disallowed) {
      addSectionError(
        errors,
        errorsBySection,
        field.section || 'Header',
        `invalid-${field.section ? `${slug(field.section)}-` : ''}${slug(field.label)}`,
      );
    }

    return {
      label: field.label,
      section: field.section || null,
      scope: field.scope || null,
      present,
      accepted,
      reason: fieldReason(present, accepted, evidenceKind, disallowed),
    };
  });
  const rejectedFields = buildRejectedFields(fields);
  const rejectedFieldReasons = buildRejectedFieldReasons(rejectedFields);
  const rejectedFieldReasonEntries = buildRejectedFieldReasonEntries(rejectedFieldReasons);

  if (!statusValue) {
    addSectionError(errors, errorsBySection, 'Header', 'missing-status');
  } else if (statusValue.toLowerCase() === 'investigating') {
    addSectionError(errors, errorsBySection, 'Header', 'status-investigating');
  } else if (!ALLOWED_STATUS_VALUES.has(statusValue.toLowerCase())) {
    addSectionError(errors, errorsBySection, 'Header', 'invalid-status');
  }

  if (options.requireDriftAcceptance) {
    validateRecommendedActionBySection(errors, errorsBySection, contents, 'Current evidence');
    validateSummaryRoleEvidenceBySection(errors, errorsBySection, contents, 'Current evidence');
  }

  return {
    schemaVersion: 1,
    checkedAt: new Date().toISOString(),
    status: errors.length === 0 ? 'ok' : 'failed',
    reportPath,
    requireDriftAcceptance: options.requireDriftAcceptance,
    statusField: {
      present: statusValue.length > 0,
      value: statusValue || null,
      investigating: statusValue.toLowerCase() === 'investigating',
      accepted: ALLOWED_STATUS_VALUES.has(statusValue.toLowerCase()),
      allowedValues: [...ALLOWED_STATUS_VALUES],
      guidance: incidentStatusGuidance(statusValue),
    },
    fields,
    fieldMetadataAvailable: true,
    errorsBySection,
    missingFieldsBySection: buildMissingFieldsBySection(fields),
    rejectedFields,
    rejectedFieldCount: rejectedFields.length,
    rejectedFieldReasons,
    rejectedFieldReasonEntries,
    errors,
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
  let contents = '';

  try {
    contents = fs.readFileSync(path.resolve(process.cwd(), args.reportPath), 'utf8');
  } catch (error) {
    const errorCode = `report-read-failed:${error.code || error.message}`;
    const payload = {
      schemaVersion: 1,
      checkedAt: new Date().toISOString(),
      status: 'failed',
      reportPath: args.reportPath,
      requireDriftAcceptance: args.requireDriftAcceptance,
      errorsBySection: {
        Document: [errorCode],
      },
      missingFieldsBySection: {},
      fields: [],
      fieldMetadataAvailable: false,
      rejectedFields: [],
      rejectedFieldCount: 0,
      rejectedFieldReasons: {},
      rejectedFieldReasonEntries: [],
      errors: [errorCode],
    };
    const output = `${JSON.stringify(payload, null, 2)}\n`;

    if (args.outputPath) {
      writeOutput(args.outputPath, output);
    }

    process.stdout.write(output);
    process.exitCode = 1;
    return;
  }

  const payload = buildCheck(args.reportPath, contents, args);
  const output = `${JSON.stringify(payload, null, 2)}\n`;

  if (args.outputPath) {
    writeOutput(args.outputPath, output);
  }

  process.stdout.write(output);

  if (args.strict && payload.status !== 'ok') {
    process.exitCode = 1;
  }
}

try {
  main();
} catch (error) {
  console.error(`ops-incident-report-check failed: ${error.message}`);
  process.exitCode = 1;
}
