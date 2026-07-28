#!/usr/bin/env node

import { spawnSync } from "node:child_process";
import { mkdirSync, renameSync, rmSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const webappDir = path.resolve(fileURLToPath(new URL("..", import.meta.url)));
const args = process.argv.slice(2);
const offline = args.includes("--offline");
const summaryArg = args.find((arg) => arg.startsWith("--summary="));
const summaryDefaultEvidenceArg = args.find((arg) => arg.startsWith("--summary-default-evidence="));
const summaryDefaultEvidencePath = summaryDefaultEvidenceArg
  ? path.join(
      process.env.TRAVEL_EVIDENCE_DIR || "reports",
      summaryDefaultEvidenceArg.slice("--summary-default-evidence=".length),
    )
  : "";
const summaryPath = summaryArg
  ? summaryArg.slice("--summary=".length)
  : process.env.TRAVEL_PREFLIGHT_SUMMARY_PATH || summaryDefaultEvidencePath;

function runCheck(label, command) {
  console.log(`\n== ${label} ==`);
  console.log(`$ ${command.join(" ")}`);
  const startedAt = Date.now();
  const result = spawnSync(command[0], command.slice(1), {
    cwd: webappDir,
    env: process.env,
    stdio: "inherit",
  });
  const elapsedMs = Date.now() - startedAt;

  if (result.error) {
    console.error(`${label} failed to start: ${result.error.message}`);
    return {
      label,
      command: command.join(" "),
      status: "error",
      exitCode: null,
      elapsedMs,
      error: result.error.message,
    };
  }

  if (result.status !== 0) {
    console.error(`${label} failed with exit code ${result.status}`);
    return {
      label,
      command: command.join(" "),
      status: "failed",
      exitCode: result.status,
      elapsedMs,
    };
  }

  return {
    label,
    command: command.join(" "),
    status: "passed",
    exitCode: result.status,
    elapsedMs,
  };
}

const checks = [
  ["Static health metadata", ["node", "src/health-metadata-check.js"]],
  ["Storage integrity", ["node", "src/storage-integrity-check.js"]],
  ["Environment doctor", ["node", "src/discord-doctor.js"]],
];

if (!offline) {
  checks.push(["Health API gate", ["node", "src/health-api-check.js", "--gate"]]);
}

const startedAt = new Date();
console.log(`Travel Planner ops preflight (${offline ? "offline" : "full"})`);

const results = [];
for (const [label, command] of checks) {
  results.push(runCheck(label, command));
}

const checkFailures = results.filter((result) => result.status !== "passed").length;
let failures = checkFailures;

if (offline) {
  console.log("\nSkipped Health API gate because --offline was set.");
}

if (summaryPath) {
  const resolvedSummaryPath = path.isAbsolute(summaryPath) ? summaryPath : path.join(webappDir, summaryPath);
  const tempSummaryPath = `${resolvedSummaryPath}.tmp-${process.pid}`;
  try {
    mkdirSync(path.dirname(resolvedSummaryPath), { recursive: true });
    writeFileSync(
      tempSummaryPath,
      JSON.stringify(
        {
          schemaVersion: 1,
          mode: offline ? "offline" : "full",
          startedAt: startedAt.toISOString(),
          finishedAt: new Date().toISOString(),
          failures,
          passed: checks.length - checkFailures,
          skipped: offline ? ["Health API gate"] : [],
          checks: results,
        },
        null,
        2
      ) + "\n"
    );
    renameSync(tempSummaryPath, resolvedSummaryPath);
    console.log(`Preflight summary JSON: ${resolvedSummaryPath}`);
  } catch (error) {
    rmSync(tempSummaryPath, { force: true });
    failures += 1;
    console.error(`Preflight summary JSON failed: ${resolvedSummaryPath} (${error.message})`);
  }
}

console.log(`\nPreflight summary: ${failures} failure(s), ${checks.length - checkFailures} check(s) passed`);
if (failures > 0) process.exitCode = 1;
