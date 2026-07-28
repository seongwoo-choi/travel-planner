#!/usr/bin/env node

import { mkdirSync, renameSync, rmSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const webappDir = path.resolve(fileURLToPath(new URL("..", import.meta.url)));
const args = process.argv.slice(2);
const jsonOutput = args.includes("--json");
const outputArg = args.find((arg) => arg.startsWith("--output="));
const outputEnvArg = args.find((arg) => arg.startsWith("--output-env="));
const outputDefaultArg = args.find((arg) => arg.startsWith("--output-default="));
const outputDefaultEvidenceArg = args.find((arg) => arg.startsWith("--output-default-evidence="));
const outputEnvName = outputEnvArg ? outputEnvArg.slice("--output-env=".length) : "";
const outputDefaultPath = outputDefaultArg ? outputDefaultArg.slice("--output-default=".length) : "";
const outputDefaultEvidencePath = outputDefaultEvidenceArg
  ? path.join(
      process.env.TRAVEL_EVIDENCE_DIR || "reports",
      outputDefaultEvidenceArg.slice("--output-default-evidence=".length),
    )
  : "";
const outputPath = outputArg
  ? outputArg.slice("--output=".length)
  : outputEnvName
    ? process.env[outputEnvName] || outputDefaultPath || outputDefaultEvidencePath
    : outputDefaultPath || outputDefaultEvidencePath;

function resolveOutputPath(value) {
  if (!value) return "";
  return path.isAbsolute(value) ? value : path.join(webappDir, value);
}

function writeAtomic(filePath, body) {
  const resolvedPath = resolveOutputPath(filePath);
  const tempPath = `${resolvedPath}.tmp-${process.pid}`;
  try {
    mkdirSync(path.dirname(resolvedPath), { recursive: true });
    writeFileSync(tempPath, body, "utf8");
    renameSync(tempPath, resolvedPath);
    console.error(`ops workflows wrote ${resolvedPath}`);
  } catch (error) {
    rmSync(tempPath, { force: true });
    console.error(`ops workflows failed: ${resolvedPath} (${error.message})`);
    process.exit(1);
  }
}

const workflows = [
  {
    title: "First setup",
    commands: [
      "npm run bot:setup",
      "npm run bot:doctor",
      "npm run ops:preflight:offline",
    ],
  },
  {
    title: "Release or handoff",
    commands: [
      "npm run ops:evidence:workflow",
      "npm run ops:evidence:defaults:check",
      "npm run ops:evidence:paths",
      "npm run ops:evidence:paths:json:file",
      "npm run ops:handoff:checklist:file",
      "npm run ops:handoff:checklist:json:file",
      "npm run ops:workflows:json:file",
      "npm run ops:preflight:summary",
      "npm run ops:evidence:summary:file",
      "npm run ops:evidence:summary:schema:file",
      "npm run ops:evidence:summary:check:file",
      "npm run ops:evidence:summary:check:schema:file",
      "npm run ops:evidence:summary:check:gate",
      "npm run ops:readiness:action-codes:file",
      "npm run ops:readiness:action-codes:schema:file",
      "npm run ops:readiness:action-codes:check:file",
      "npm run ops:readiness:action-codes:check:schema:file",
      "npm run ops:readiness:action-codes:check:gate",
      "npm run ops:readiness:report:file",
      "npm run ops:readiness:report:json:file",
      "npm run ops:readiness:report:json:schema:file",
      "npm run ops:readiness:report:json:check:file",
      "npm run ops:readiness:report:json:check:schema:file",
      "npm run ops:readiness:report:json:check:gate",
      "npm run ops:handoff:report:file",
      "npm run ops:handoff:report:check:file",
      "npm run ops:handoff:report:check:schema:file",
      "npm run ops:handoff:report:check:gate",
      "npm run ops:readiness:report:gate",
      "npm run ops:evidence:manifest:file",
    ],
  },
  {
    title: "Health checks",
    commands: [
      "npm run health:metadata",
      "npm run health:api",
      "npm run health:api:gate",
    ],
  },
  {
    title: "iOS Home Screen install",
    commands: [
      "npm run ios:install:quickstart",
      "npm run ios:install:quickstart:file",
      "npm run ios:install:quickstart:evidence",
      "npm run ios:install:prepare",
      "npm run ios:install:status",
      "npm run ios:install:finish",
      "npm run ios:install:urls",
      "npm run ios:install:urls:json",
      "npm run ios:install:handoff",
      "npm run ios:install:handoff:file",
      "npm run ios:install:runbook",
      "npm run ios:install:runbook:json",
      "npm run ios:install:runbook:file",
      "npm run ios:install:runbook:json:file",
      "npm run ios:install:runbook:schema:file",
      "npm run ios:install:runbook:check:file",
      "npm run ios:install:runbook:check:schema:file",
      "npm run ios:install:runbook:evidence",
      "npm run ios:install:evidence:before-phone",
      "npm run ios:install:evidence:after-phone",
      "npm run ios:install:evidence:after-phone:final",
      "npm run ios:install:next",
      "npm run ios:install:next:json",
      "npm run ios:install:next:file",
      "npm run ios:install:next:schema:file",
      "npm run ios:install:next:evidence",
      "npm run ios:install:summary",
      "npm run ios:install:summary:json",
      "npm run ios:install:summary:schema:file",
      "npm run ios:install:summary:file",
      "npm run ios:install:summary:gate",
      "npm run ios:install:summary:gate:file",
      "npm run ios:install:summary:evidence",
      "npm run ios:install:summary:check:file",
      "npm run ios:install:summary:check:schema:file",
      "npm run ios:install:summary:check:gate",
      "npm run ios:install:evidence:preinstall",
      "npm run ios:install:evidence:postinstall",
      "npm run ios:install:check",
      "npm run ios:install:check:json",
      "npm run ios:install:check:file",
      "npm run ios:install:check:schema:file",
      "npm run ios:install:evidence",
      "npm run ios:install:check:strict",
      "npm run ios:install:evidence:strict",
      "npm run ios:install:evidence:proof",
      "npm run ios:launch-proof:check:file",
      "npm run ios:launch-proof:schema:file",
      "npm run ios:launch-proof:evidence",
    ],
    examples: [
      "npm run ios:install:check -- --require-install-qr --install-qr-target=<selected /i URL>",
    ],
  },
  {
    title: "Evidence review",
    commands: [
      "npm run ops:evidence:review:workflow",
      "npm run ops:evidence:paths",
      "npm run ops:evidence:manifest:check:file",
      "npm run ops:evidence:manifest:check:schema:file",
      "npm run ops:evidence:manifest:check:gate",
      "npm run ops:handoff:report:check:file",
      "npm run ops:handoff:report:check:schema:file",
      "npm run ops:handoff:report:check:gate",
      "npm run ops:incident:report:check:file",
      "npm run ops:incident:report:check:schema:file",
      "npm run ops:incident:report:check:gate",
      "npm run ops:readiness:report:file",
      "npm run ops:readiness:report:json:file",
      "npm run ops:readiness:report:json:check:file",
      "npm run ops:readiness:report:json:check:schema:file",
      "npm run ops:readiness:report:json:check:gate",
      "npm run ops:readiness:report:gate",
    ],
  },
  {
    title: "Protected API checks",
    commands: [
      "npm run api:get -- /api/status",
      "npm run api:quality-gates:health",
      "npm run api:quality-gates:gate",
      "npm run api:backup:file",
    ],
  },
  {
    title: "Storage backup",
    commands: [
      "npm run storage:integrity",
      "npm run storage:backup:workflow",
      "npm run storage:backup:manifest:file",
      "npm run storage:backup:file-check:file",
    ],
  },
  {
    title: "Storage restore",
    commands: [
      "npm run storage:restore:workflow",
      "npm run storage:backup:file-check:file",
      "npm run storage:backup:verify:file",
      "npm run ops:preflight:offline",
    ],
  },
  {
    title: "Always-on bot operations",
    commands: [
      "npm run bot:launchd:commands",
      "npm run bot:install",
      "npm run bot:status",
      "npm run bot:logs",
      "npm run bot:denied",
    ],
  },
];

const notes = [
  "Use ops:evidence:workflow as the canonical ordered release/handoff command list; the Release or handoff group keeps the same main sequence discoverable.",
  "Use ops:evidence:review:workflow as the canonical ordered archived evidence review command list; the Evidence review group mirrors its major phases.",
  "Use ios:install:quickstart for the human iPhone install path, then ios:install:prepare before touching the iPhone, install from Safari, launch the Home Screen Travel icon, save proof, and run ios:install:finish; use ios:install:status whenever the next action is unclear.",
  "Use ios:install:quickstart:evidence to regenerate quickstart evidence when readiness reports show quickstart-url-origin-drift or quickstartRepair=npm run ios:install:quickstart:evidence.",
  "Use ios:install:check:file after setting TRAVEL_PLANNER_PUBLIC_ORIGIN to capture iPhone Home Screen install readiness evidence.",
  "Use the install card's selected QR evidence command, or ios:install:check -- --require-install-qr --install-qr-target=<selected /i URL>, to archive the exact iPhone LAN QR candidate.",
  "Workflow examples are templates; replace any <...> placeholder with a real value before running.",
  "Use ios:install:env, ios:install:urls, or /api/install-info.txt to get secret-free protected iPhone URL templates with travelAccessKey=YOUR_TRAVEL_ACCESS_KEY plus the local-only key handling rule: compose locally, do not store or send the entered key, and clear temporary input after copy.",
  "Use ios:launch-proof:check:file after saving copied Home Screen launch proof to reports/ios-launch-proof.json.",
  "Workflow helpers print guidance and checks; they do not restore or overwrite the active DB.",
  "Generated evidence files are ignored by git by default.",
  "Full backup JSON may contain travel content and should stay in a private backup location.",
];

if (jsonOutput) {
  const body = `${JSON.stringify(
    {
      schemaVersion: 1,
      generatedAt: new Date().toISOString(),
      workflows,
      notes,
    },
    null,
    2
  )}\n`;
  if (outputPath) {
    writeAtomic(outputPath, body);
  } else {
    process.stdout.write(body);
  }
  process.exit(0);
}

const lines = ["# Travel Planner operations workflows"];
for (const workflow of workflows) {
  lines.push("", `## ${workflow.title}`);
  for (const command of workflow.commands) lines.push(command);
  if (workflow.examples?.length) {
    lines.push("", "# Examples (replace placeholders before running):");
    for (const example of workflow.examples) lines.push(`# ${example}`);
  }
}

lines.push("", "# Notes:", ...notes.map((note) => `# - ${note}`));

process.stdout.write(`${lines.join("\n")}\n`);
