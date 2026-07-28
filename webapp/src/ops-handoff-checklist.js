#!/usr/bin/env node

import fs from 'node:fs';
import path from 'node:path';
import { EVIDENCE_DEFAULTS_OPERATOR_CHECK } from './ops-operator-checks.js';

function quote(value) {
  return `'${String(value).replaceAll("'", "'\\''")}'`;
}

function evidencePath(evidenceDir, fileName) {
  return path.join(evidenceDir, fileName);
}

function buildChecklist(evidenceDir) {
  return [
  {
    id: 'evidence-paths',
    title: 'Evidence paths preview',
    command: `TRAVEL_EVIDENCE_DIR=${quote(evidenceDir)} TRAVEL_EVIDENCE_PATHS_PATH=${quote(evidencePath(evidenceDir, 'ops-evidence-paths.json'))} npm run ops:evidence:paths:json:file`,
    evidence: evidencePath(evidenceDir, 'ops-evidence-paths.json'),
    acceptance: 'Artifact paths point at the intended evidence directory or named overrides before other evidence is generated.',
  },
  {
    id: 'evidence-defaults-check',
    title: EVIDENCE_DEFAULTS_OPERATOR_CHECK.label,
    command: EVIDENCE_DEFAULTS_OPERATOR_CHECK.command,
    evidence: 'Command output confirms evidence :file scripts and preflight summary aliases keep TRAVEL_EVIDENCE_DIR defaults.',
    acceptance: EVIDENCE_DEFAULTS_OPERATOR_CHECK.acceptance,
  },
  {
    id: 'workflow-index',
    title: 'Workflow index',
    command: `TRAVEL_OPS_WORKFLOWS_PATH=${quote(evidencePath(evidenceDir, 'ops-workflows.json'))} npm run ops:workflows:json:file`,
    evidence: `${evidencePath(evidenceDir, 'ops-workflows.json')} when machine-readable handoff is needed`,
    acceptance: 'Operator can identify setup, health, backup, restore, and evidence workflows.',
  },
  {
    id: 'preflight',
    title: 'Preflight',
    command: `TRAVEL_PREFLIGHT_SUMMARY_PATH=${quote(evidencePath(evidenceDir, 'preflight.json'))} npm run ops:preflight:summary`,
    evidence: `${evidencePath(evidenceDir, 'preflight.json')} or ${evidencePath(evidenceDir, 'preflight-offline.json')}`,
    acceptance: 'Correct online or offline mode is recorded with any skipped gate reason.',
  },
  {
    id: 'health-gate',
    title: 'Health gate evidence',
    command: `TRAVEL_EVIDENCE_DIR=${quote(evidenceDir)} npm run ops:evidence:health:file`,
    evidence: evidencePath(evidenceDir, 'health-api-gate.txt'),
    acceptance: 'Evidence shows target URL, timeout, exit code, stdout, and stderr.',
  },
  {
    id: 'protected-api-gate',
    title: 'Protected API gate evidence',
    command: `TRAVEL_EVIDENCE_DIR=${quote(evidenceDir)} npm run ops:evidence:api:file`,
    evidence: evidencePath(evidenceDir, 'api-quality-gates.txt'),
    acceptance: 'Evidence shows base URL, access-key presence only, exit code, stdout, and stderr.',
  },
  {
    id: 'backup',
    title: 'Backup evidence',
    command: 'npm run storage:backup:workflow',
    evidence: `${evidencePath(evidenceDir, 'travel-planner-backup.json')} and ${evidencePath(evidenceDir, 'storage-backup-file-check.json')}`,
    acceptance: 'Backup exists and backup file shape check succeeded for the handoff file.',
  },
  {
    id: 'backup-verification',
    title: 'Backup manifest verification',
    command: `TRAVEL_BACKUP_MANIFEST_VERIFY_PATH=${quote(evidencePath(evidenceDir, 'storage-backup-manifest.json'))} TRAVEL_BACKUP_VERIFY_PATH=${quote(evidencePath(evidenceDir, 'storage-backup-verify.json'))} npm run storage:backup:verify`,
    evidence: `${evidencePath(evidenceDir, 'storage-backup-manifest.json')} and ${evidencePath(evidenceDir, 'storage-backup-verify.json')}`,
    acceptance: 'Backup was compared against its manifest before handoff.',
  },
  {
    id: 'evidence-summary',
    title: 'Evidence summary',
    command: `TRAVEL_EVIDENCE_DIR=${quote(evidenceDir)} TRAVEL_EVIDENCE_SUMMARY_PATH=${quote(evidencePath(evidenceDir, 'ops-evidence-summary.json'))} npm run ops:evidence:summary:file`,
    evidence: evidencePath(evidenceDir, 'ops-evidence-summary.json'),
    acceptance: 'Summary is ready or names the missing evidence that needs operator review.',
  },
  {
    id: 'evidence-summary-schema',
    title: 'Evidence summary schema',
    command: `TRAVEL_EVIDENCE_DIR=${quote(evidenceDir)} TRAVEL_EVIDENCE_SUMMARY_SCHEMA_PATH=${quote(evidencePath(evidenceDir, 'ops-evidence-summary.schema.json'))} npm run ops:evidence:summary:schema:file`,
    evidence: evidencePath(evidenceDir, 'ops-evidence-summary.schema.json'),
    acceptance: 'Schema describes the evidence summary contract consumed by readiness automation.',
  },
  {
    id: 'evidence-summary-check',
    title: 'Evidence summary check',
    command: `TRAVEL_EVIDENCE_DIR=${quote(evidenceDir)} TRAVEL_EVIDENCE_SUMMARY_PATH=${quote(evidencePath(evidenceDir, 'ops-evidence-summary.json'))} TRAVEL_EVIDENCE_SUMMARY_CHECK_PATH=${quote(evidencePath(evidenceDir, 'ops-evidence-summary-check.json'))} npm run ops:evidence:summary:check:file`,
    evidence: evidencePath(evidenceDir, 'ops-evidence-summary-check.json'),
    acceptance: 'Check result confirms the evidence summary lists and status match captured evidence.',
  },
  {
    id: 'evidence-summary-check-schema',
    title: 'Evidence summary check-result schema',
    command: `TRAVEL_EVIDENCE_DIR=${quote(evidenceDir)} TRAVEL_EVIDENCE_SUMMARY_CHECK_SCHEMA_PATH=${quote(evidencePath(evidenceDir, 'ops-evidence-summary-check.schema.json'))} npm run ops:evidence:summary:check:schema:file`,
    evidence: evidencePath(evidenceDir, 'ops-evidence-summary-check.schema.json'),
    acceptance: 'Schema describes the evidence summary check-result contract.',
  },
  {
    id: 'readiness-report',
    title: 'Readiness report',
    command: `TRAVEL_EVIDENCE_DIR=${quote(evidenceDir)} TRAVEL_READINESS_REPORT_PATH=${quote(evidencePath(evidenceDir, 'ops-readiness-report.md'))} npm run ops:readiness:report:file`,
    evidence: evidencePath(evidenceDir, 'ops-readiness-report.md'),
    acceptance: 'Report gives a ready, operator_review_required, or not_ready decision for handoff.',
  },
  {
    id: 'readiness-report-json',
    title: 'Readiness report JSON contract',
    command: `TRAVEL_EVIDENCE_DIR=${quote(evidenceDir)} TRAVEL_READINESS_REPORT_JSON_PATH=${quote(evidencePath(evidenceDir, 'ops-readiness-report.json'))} npm run ops:readiness:report:json:file`,
    evidence: evidencePath(evidenceDir, 'ops-readiness-report.json'),
    acceptance: 'Structured readiness payload includes target metadata and is available for automation without parsing Markdown.',
  },
  {
    id: 'readiness-report-json-schema',
    title: 'Readiness report JSON contract schema',
    command: `TRAVEL_EVIDENCE_DIR=${quote(evidenceDir)} TRAVEL_READINESS_REPORT_JSON_SCHEMA_PATH=${quote(evidencePath(evidenceDir, 'ops-readiness-report.schema.json'))} npm run ops:readiness:report:json:schema:file`,
    evidence: evidencePath(evidenceDir, 'ops-readiness-report.schema.json'),
    acceptance: 'Schema describes the readiness JSON contract consumed by external automation.',
  },
  {
    id: 'readiness-report-json-check',
    title: 'Readiness report JSON check-result contract',
    command: `TRAVEL_EVIDENCE_DIR=${quote(evidenceDir)} TRAVEL_READINESS_REPORT_JSON_PATH=${quote(evidencePath(evidenceDir, 'ops-readiness-report.json'))} TRAVEL_READINESS_REPORT_JSON_CHECK_PATH=${quote(evidencePath(evidenceDir, 'ops-readiness-report-check.json'))} npm run ops:readiness:report:json:check:file`,
    evidence: evidencePath(evidenceDir, 'ops-readiness-report-check.json'),
    acceptance: 'Check-result payload includes target metadata, confirms the readiness JSON contract is safe for automation to consume, is indexed as the readiness JSON check, blocking summary, and repair summary in evidence path previews/final manifests with matching summaryRoles metadata, repeats manifestSummaryRoleArtifactsExpected, manifestSummaryRoleArtifacts, manifestSummaryRoleIndexFailures, manifestSummaryRoleIndexFailureDetails, manifestOperatorCheckFailures, and manifestOperatorCheckFailureDetails for manifest role-index and operator-check drift triage, exposes blockingTargets with status/path/blockingReasons/blockingReasonCount/blockingReasonLabels when readiness is blocked, and exposes repairTargets with source check status/path, reasons, reasonCount, and reasonLabels including duplicate-human-evidence when duplicateFieldDiagnosticCount is positive and no duplicate reason when that count is zero, errorSectionCount, missingFieldCount, missingFieldsBySection, fieldMetadataAvailable, rejectedFieldCount, rejectedFields, rejectedFieldReasons, rejectedFieldReasonEntries, duplicateFieldDiagnostics, duplicateFieldDiagnosticCount, and duplicate human-evidence diagnostics when human-report repair is needed; duplicate diagnostic flag additions must update the shared readiness contract key list, count consistency, and workflow guidance together; blocking and repair target reason additions must update the shared readiness contract exports, label maps, enum/bound consumers, and workflow guidance together; readiness check key additions must update the shared readiness check key contract, required-present set, source path metadata, schema consumers, and workflow guidance together.',
  },
  {
    id: 'readiness-report-json-check-schema',
    title: 'Readiness report JSON check-result schema',
    command: `TRAVEL_EVIDENCE_DIR=${quote(evidenceDir)} TRAVEL_READINESS_REPORT_JSON_CHECK_SCHEMA_PATH=${quote(evidencePath(evidenceDir, 'ops-readiness-report-check.schema.json'))} npm run ops:readiness:report:json:check:schema:file`,
    evidence: evidencePath(evidenceDir, 'ops-readiness-report-check.schema.json'),
    acceptance: 'Schema describes the readiness JSON check-result contract consumed by downstream automation.',
  },
  {
    id: 'readiness-action-codes',
    title: 'Readiness action-code catalog',
    command: `TRAVEL_EVIDENCE_DIR=${quote(evidenceDir)} TRAVEL_READINESS_ACTION_CODES_PATH=${quote(evidencePath(evidenceDir, 'ops-readiness-action-codes.json'))} npm run ops:readiness:action-codes:file`,
    evidence: evidencePath(evidenceDir, 'ops-readiness-action-codes.json'),
    acceptance: 'Catalog lists source and diagnostic-only readiness action codes with operator-facing labels.',
  },
  {
    id: 'readiness-action-codes-schema',
    title: 'Readiness action-code catalog schema',
    command: `TRAVEL_EVIDENCE_DIR=${quote(evidenceDir)} TRAVEL_READINESS_ACTION_CODES_SCHEMA_PATH=${quote(evidencePath(evidenceDir, 'ops-readiness-action-codes.schema.json'))} npm run ops:readiness:action-codes:schema:file`,
    evidence: evidencePath(evidenceDir, 'ops-readiness-action-codes.schema.json'),
    acceptance: 'Schema fixes the standalone readiness action-code catalog contract.',
  },
  {
    id: 'readiness-action-codes-check',
    title: 'Readiness action-code catalog check',
    command: `TRAVEL_EVIDENCE_DIR=${quote(evidenceDir)} TRAVEL_READINESS_ACTION_CODES_PATH=${quote(evidencePath(evidenceDir, 'ops-readiness-action-codes.json'))} TRAVEL_READINESS_ACTION_CODES_CHECK_PATH=${quote(evidencePath(evidenceDir, 'ops-readiness-action-codes-check.json'))} npm run ops:readiness:action-codes:check:file`,
    evidence: evidencePath(evidenceDir, 'ops-readiness-action-codes-check.json'),
    acceptance: 'Check result confirms the standalone action-code catalog still matches the readiness action contract.',
  },
  {
    id: 'readiness-action-codes-check-schema',
    title: 'Readiness action-code catalog check-result schema',
    command: `TRAVEL_EVIDENCE_DIR=${quote(evidenceDir)} TRAVEL_READINESS_ACTION_CODES_CHECK_SCHEMA_PATH=${quote(evidencePath(evidenceDir, 'ops-readiness-action-codes-check.schema.json'))} npm run ops:readiness:action-codes:check:schema:file`,
    evidence: evidencePath(evidenceDir, 'ops-readiness-action-codes-check.schema.json'),
    acceptance: 'Schema describes the standalone action-code catalog check-result contract.',
  },
  {
    id: 'handoff-report',
    title: 'Handoff report',
    command: `TRAVEL_EVIDENCE_DIR=${quote(evidenceDir)} TRAVEL_HANDOFF_REPORT_PATH=${quote(evidencePath(evidenceDir, 'handoff-report.md'))} npm run ops:handoff:report:file`,
    evidence: evidencePath(evidenceDir, 'handoff-report.md'),
    acceptance: 'Report records readiness decision, accepted risks, follow-ups, and sign-off.',
  },
  {
    id: 'handoff-report-check',
    title: 'Handoff report check',
    command: `TRAVEL_EVIDENCE_DIR=${quote(evidenceDir)} TRAVEL_HANDOFF_REPORT_PATH=${quote(evidencePath(evidenceDir, 'handoff-report.md'))} TRAVEL_HANDOFF_REPORT_CHECK_PATH=${quote(evidencePath(evidenceDir, 'handoff-report-check.json'))} npm run ops:handoff:report:check:file`,
    evidence: evidencePath(evidenceDir, 'handoff-report-check.json'),
    acceptance: 'Check confirms the handoff report is no longer draft, required sign-off plus readiness blocking, repair, and expected/recorded/failure/detail manifest summary-role index evidence fields are present and accepted, and any repairs are visible in statusField.guidance, errorsBySection, missingFieldsBySection, fields[].accepted, or fields[].reason.',
  },
  {
    id: 'handoff-report-check-schema',
    title: 'Handoff report check-result schema',
    command: `TRAVEL_EVIDENCE_DIR=${quote(evidenceDir)} TRAVEL_HANDOFF_REPORT_CHECK_SCHEMA_PATH=${quote(evidencePath(evidenceDir, 'handoff-report-check.schema.json'))} npm run ops:handoff:report:check:schema:file`,
    evidence: evidencePath(evidenceDir, 'handoff-report-check.schema.json'),
    acceptance: 'Schema describes the handoff report check-result contract consumed by readiness automation.',
  },
  {
    id: 'evidence-manifest',
    title: 'Evidence manifest',
    command: `TRAVEL_EVIDENCE_DIR=${quote(evidenceDir)} TRAVEL_EVIDENCE_MANIFEST_PATH=${quote(evidencePath(evidenceDir, 'ops-evidence-manifest.json'))} npm run ops:evidence:manifest:file`,
    evidence: evidencePath(evidenceDir, 'ops-evidence-manifest.json'),
    acceptance: 'Manifest records bytes and sha256 values for generated evidence files without including file contents.',
  },
  {
    id: 'mutation-guard',
    title: 'Mutation guard',
    command: `TRAVEL_INCIDENT_REPORT_PATH=${quote(evidencePath(evidenceDir, 'incident-report.md'))} npm run ops:incident:template:file when mutation is being considered`,
    evidence: `${evidencePath(evidenceDir, 'incident-report.md')} for incidents or restore decisions`,
    acceptance: 'No restore, Discord mutation, launchd unload, or external data mutation happened without explicit operator decision; incident records include accepted expected/recorded/failure/detail manifest summary-role index evidence when mutation or restore decisions are considered.',
  },
  ];
}

function parseArgs(argv) {
  const args = {
    json: false,
    outputPath: '',
    outputEnv: '',
    outputDefault: '',
    outputDefaultEvidence: '',
  };

  for (const arg of argv) {
    if (arg === '--json') {
      args.json = true;
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
    args.outputPath = path.join(
      process.env.TRAVEL_EVIDENCE_DIR || 'reports',
      args.outputDefaultEvidence,
    );
  }

  return args;
}

function renderMarkdown(generatedAt, checklist) {
  const lines = [
    '# Handoff Checklist',
    '',
    `- Generated at: ${generatedAt}`,
    '- Purpose: confirm operational handoff evidence before release, incident response, or owner change.',
    '',
  ];

  checklist.forEach((item, index) => {
    lines.push(`## ${index + 1}. ${item.title}`);
    lines.push('');
    lines.push('- [ ] Complete');
    lines.push(`- Command: \`${item.command}\``);
    lines.push(`- Evidence: ${item.evidence}`);
    lines.push(`- Acceptance: ${item.acceptance}`);
    lines.push('');
  });

  return `${lines.join('\n')}\n`;
}

function renderJson(generatedAt, checklist) {
  return `${JSON.stringify(
    {
      generatedAt,
      purpose: 'Confirm operational handoff evidence before release, incident response, or owner change.',
      checklist,
    },
    null,
    2,
  )}\n`;
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
  const generatedAt = new Date().toISOString();
  const evidenceDir = process.env.TRAVEL_EVIDENCE_DIR || 'reports';
  const checklist = buildChecklist(evidenceDir);
  const contents = args.json
    ? renderJson(generatedAt, checklist)
    : renderMarkdown(generatedAt, checklist);

  if (args.outputPath) {
    writeOutput(args.outputPath, contents);
  }

  process.stdout.write(contents);
}

try {
  main();
} catch (error) {
  console.error(`ops-handoff-checklist failed: ${error.message}`);
  process.exitCode = 1;
}
