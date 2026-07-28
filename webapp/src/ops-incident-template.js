#!/usr/bin/env node

import fs from 'node:fs';
import path from 'node:path';

function parseArgs(argv) {
  const args = {
    outputPath: '',
    outputEnv: '',
    outputDefault: '',
    outputDefaultEvidence: '',
    force: process.env.TRAVEL_INCIDENT_REPORT_FORCE === '1',
    title: process.env.TRAVEL_INCIDENT_TITLE || 'Untitled incident',
    severity: process.env.TRAVEL_INCIDENT_SEVERITY || 'unknown',
    owner: process.env.TRAVEL_INCIDENT_OWNER || 'unassigned',
  };

  for (const arg of argv) {
    if (arg === '--force') {
      args.force = true;
    } else if (arg.startsWith('--output=')) {
      args.outputPath = arg.slice('--output='.length);
    } else if (arg.startsWith('--output-env=')) {
      args.outputEnv = arg.slice('--output-env='.length);
    } else if (arg.startsWith('--output-default=')) {
      args.outputDefault = arg.slice('--output-default='.length);
    } else if (arg.startsWith('--output-default-evidence=')) {
      args.outputDefaultEvidence = arg.slice('--output-default-evidence='.length);
    } else if (arg.startsWith('--title=')) {
      args.title = arg.slice('--title='.length);
    } else if (arg.startsWith('--severity=')) {
      args.severity = arg.slice('--severity='.length);
    } else if (arg.startsWith('--owner=')) {
      args.owner = arg.slice('--owner='.length);
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

function buildTemplate(args) {
  const generatedAt = new Date().toISOString();

  return `# Incident Report

- Title: ${args.title}
- Severity: ${args.severity}
- Owner: ${args.owner}
- Generated at: ${generatedAt}
- Status: investigating

## Summary

Describe what is wrong, who is affected, and when the issue was first noticed.

## Impact

- Affected users:
- Affected features:
- Data risk:
- External systems:

## Timeline

- ${generatedAt} - Report created.

## Current evidence

List read-only evidence first.
For readiness repair targets, reasons, and source check paths, copy
\`repairTargets\`, their \`reasons\`, and their \`path\` values from
\`ops-readiness-report-check.json\`.
\`repairTargets\` contains configured non-\`ok\` human-report checks or checks
with section-level errors or missing field summaries. Write \`none\` when the
array is empty.
For readiness blocking targets and reasons, copy \`blockingTargets\` and their
\`blockingReasons\` from the same check result. Write \`none\` when the array is
empty.

- Preflight:
- Health gate:
- Protected API gate:
- Backup evidence:
- Evidence summary:
- Evidence summary schema:
- Evidence summary check:
- Evidence summary check-result schema:
- Readiness report:
- Readiness report JSON contract:
- Readiness report JSON contract schema:
- Readiness report JSON check-result contract:
- Readiness report JSON check-result schema:
- Readiness blocking targets:
- Readiness blocking reasons:
- Readiness repair targets:
- Readiness repair reasons:
- Readiness repair source check paths:
- Manifest summary role index expected: <copy diagnostics.manifestSummaryRoleArtifactsExpected from ops-readiness-report-check.json or none>
- Manifest summary role index recorded: <copy diagnostics.manifestSummaryRoleArtifacts from ops-readiness-report-check.json or none>
- Manifest summary role index failures: <copy diagnostics.manifestSummaryRoleIndexFailures from ops-readiness-report-check.json or none>
- Manifest summary role index failure details: <copy diagnostics.manifestSummaryRoleIndexFailureDetails from ops-readiness-report-check.json or none>
Record expected, recorded, failure, and detail manifest summary role index evidence before approving mutation or restore decisions so role-index drift evidence stays attached to the incident record.
If expected and recorded role indexes differ or failures are not \`none\`, route through \`review_manifest_failures\` before mutation or restore approval.
- Readiness action-code catalog:
- Readiness action-code catalog schema:
- Readiness action-code catalog check:
- Readiness action-code catalog check-result schema:
- Readiness recommended action code:
- Readiness recommended action:
- Evidence manifest check:
- Incident report check:
- Incident report check-result schema:
- Logs or screenshots:

## Working theory

State the current hypothesis and what would falsify it.

## Actions taken

Record each action with timestamp, command or UI path, operator, and result.

## Mutation approvals

No restore, Discord mutation, launchd unload, external data mutation, or
destructive command should appear here without an explicit operator decision.

- Approved mutation:
- Approver:
- Time:
- Reason:

## Evidence drift acceptance

Use this only when \`ops:evidence:manifest:check:gate\` fails and an operator
explicitly accepts the drift after review.

- Manifest check report:
- Drift artifact ids:
- Accepted by:
- Time:
- Reason:
- Follow-up owner:

## Mitigation

Document temporary mitigations and rollback criteria.

## Restore considerations

Link the backup file, manifest, verification summary, and restore rehearsal
before any real restore.

## Follow-up

- Owner:
- Due date:
- Permanent fix:
- Runbook update:
`;
}

function writeOutput(outputPath, contents, force) {
  const absolutePath = path.resolve(process.cwd(), outputPath);
  const outputDir = path.dirname(absolutePath);
  const tempPath = `${absolutePath}.tmp-${process.pid}`;

  if (!force && fs.existsSync(absolutePath)) {
    throw new Error(`Refusing to overwrite existing file: ${outputPath}`);
  }

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
  const contents = buildTemplate(args);

  if (args.outputPath) {
    writeOutput(args.outputPath, contents, args.force);
  }

  process.stdout.write(contents);
}

try {
  main();
} catch (error) {
  console.error(`ops-incident-template failed: ${error.message}`);
  process.exitCode = 1;
}
