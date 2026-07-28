#!/usr/bin/env node

import fs from 'node:fs';
import path from 'node:path';

function parseArgs(argv) {
  const args = {
    outputPath: '',
    outputEnv: '',
    outputDefaultEvidence: '',
    force: process.env.TRAVEL_HANDOFF_REPORT_FORCE === '1',
    title: process.env.TRAVEL_HANDOFF_TITLE || 'Operational handoff',
    owner: process.env.TRAVEL_HANDOFF_OWNER || 'unassigned',
    evidenceDir: process.env.TRAVEL_EVIDENCE_DIR || 'reports',
  };

  for (const arg of argv) {
    if (arg === '--force') {
      args.force = true;
    } else if (arg.startsWith('--output=')) {
      args.outputPath = arg.slice('--output='.length);
    } else if (arg.startsWith('--output-env=')) {
      args.outputEnv = arg.slice('--output-env='.length);
    } else if (arg.startsWith('--output-default-evidence=')) {
      args.outputDefaultEvidence = arg.slice('--output-default-evidence='.length);
    } else if (arg.startsWith('--title=')) {
      args.title = arg.slice('--title='.length);
    } else if (arg.startsWith('--owner=')) {
      args.owner = arg.slice('--owner='.length);
    } else {
      throw new Error(`Unknown argument: ${arg}`);
    }
  }

  if (!args.outputPath && args.outputEnv) {
    args.outputPath = process.env[args.outputEnv] || '';
  }

  if (!args.outputPath && args.outputDefaultEvidence) {
    args.outputPath = path.join(args.evidenceDir, args.outputDefaultEvidence);
  }

  return args;
}

function buildTemplate(args) {
  const generatedAt = new Date().toISOString();

  return `# Operational Handoff Report

- Title: ${args.title}
- Owner: ${args.owner}
- Generated at: ${generatedAt}
- Evidence directory: ${args.evidenceDir}
- Status: draft

Change \`Status\` from \`draft\` to \`ready\` or \`signed-off\` before running
\`npm run ops:handoff:report:check:gate\`.

## Summary

Describe what is being handed off, who is receiving it, and the handoff scope.

## Evidence bundle

- Evidence paths: ${args.evidenceDir}/ops-evidence-paths.json
- Workflow index: ${args.evidenceDir}/ops-workflows.json
- Handoff checklist: ${args.evidenceDir}/handoff-checklist.md
- Preflight summary: ${args.evidenceDir}/preflight.json
- Health gate evidence: ${args.evidenceDir}/health-api-gate.txt
- Protected API gate evidence: ${args.evidenceDir}/api-quality-gates.txt
- Backup file: ${args.evidenceDir}/travel-planner-backup.json
- Backup file check: ${args.evidenceDir}/storage-backup-file-check.json
- Backup manifest: ${args.evidenceDir}/storage-backup-manifest.json
- Backup verification: ${args.evidenceDir}/storage-backup-verify.json
- Evidence summary: ${args.evidenceDir}/ops-evidence-summary.json
- Evidence summary schema: ${args.evidenceDir}/ops-evidence-summary.schema.json
- Evidence summary check: ${args.evidenceDir}/ops-evidence-summary-check.json
- Evidence summary check-result schema: ${args.evidenceDir}/ops-evidence-summary-check.schema.json
- Readiness report: ${args.evidenceDir}/ops-readiness-report.md
- Readiness report JSON contract: ${args.evidenceDir}/ops-readiness-report.json
- Readiness report JSON contract schema: ${args.evidenceDir}/ops-readiness-report.schema.json
- Readiness report JSON check-result contract: ${args.evidenceDir}/ops-readiness-report-check.json
- Readiness report JSON check-result schema: ${args.evidenceDir}/ops-readiness-report-check.schema.json
- Readiness action-code catalog: ${args.evidenceDir}/ops-readiness-action-codes.json
- Readiness action-code catalog schema: ${args.evidenceDir}/ops-readiness-action-codes.schema.json
- Readiness action-code catalog check: ${args.evidenceDir}/ops-readiness-action-codes-check.json
- Readiness action-code catalog check-result schema: ${args.evidenceDir}/ops-readiness-action-codes-check.schema.json
- Handoff report check: ${args.evidenceDir}/handoff-report-check.json
- Handoff report check-result schema: ${args.evidenceDir}/handoff-report-check.schema.json
- Evidence manifest: ${args.evidenceDir}/ops-evidence-manifest.json

## Readiness decision

Copy \`repairTargets\`, their \`reasons\`, and their \`path\` values from
\`ops-readiness-report-check.json\`. \`repairTargets\` contains configured
non-\`ok\` human-report checks, checks with section-level errors, or checks with
missing field summaries. Write \`none\` when the array is empty.
Copy \`blockingTargets\` and their \`blockingReasons\` from the same check
result. Write \`none\` when the array is empty.
Copy \`manifestSummaryRoleArtifactsExpected\`,
\`manifestSummaryRoleArtifacts\`, \`manifestSummaryRoleIndexFailures\`, and
\`manifestSummaryRoleIndexFailureDetails\` from the same check result. Write
\`none\` when the corresponding object or array is empty. Confirm expected,
recorded, failure, and detail manifest summary role index evidence before final
sign-off so role-index drift evidence stays attached to the handoff record.
If expected and recorded role indexes differ or failures are not \`none\`, route
through \`review_manifest_failures\` before final sign-off.

- Readiness report decision:
- Recommended action code:
- Recommended action:
- Readiness blocking targets:
- Readiness blocking reasons:
- Readiness repair targets:
- Readiness repair reasons:
- Readiness repair source check paths:
- Manifest summary role index expected: <copy diagnostics.manifestSummaryRoleArtifactsExpected from ops-readiness-report-check.json or none>
- Manifest summary role index recorded: <copy diagnostics.manifestSummaryRoleArtifacts from ops-readiness-report-check.json or none>
- Manifest summary role index failures: <copy diagnostics.manifestSummaryRoleIndexFailures from ops-readiness-report-check.json or none>
- Manifest summary role index failure details: <copy diagnostics.manifestSummaryRoleIndexFailureDetails from ops-readiness-report-check.json or none>
- Manual review required:
- Strict failures:
- Accepted risks:

## Mutation guard

No restore, Discord mutation, launchd unload, external data mutation, or
destructive command should appear here without an explicit operator decision.

- Mutation performed:
- Approved by:
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

## Open follow-ups

- Owner:
- Due date:
- Next action:

## Sign-off

- Sender:
- Receiver:
- Time:
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
  console.error(`ops-handoff-report-template failed: ${error.message}`);
  process.exitCode = 1;
}
