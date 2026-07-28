#!/usr/bin/env node

import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const args = process.argv.slice(2);
const jsonOutput = args.includes("--json");
const webappDir = path.resolve(fileURLToPath(new URL("..", import.meta.url)));
const packagePath = path.join(webappDir, "package.json");
const packageJson = JSON.parse(readFileSync(packagePath, "utf8"));
const scripts = packageJson.scripts || {};

const fileScripts = Object.entries(scripts)
  .filter(([name]) => name.endsWith(":file"))
  .map(([name, command]) => ({ name, command }));

const requiredSummaryDefaults = [
  {
    name: "ops:preflight:summary",
    flag: "--summary-default-evidence=preflight.json",
  },
  {
    name: "ops:preflight:offline:summary",
    flag: "--summary-default-evidence=preflight-offline.json",
  },
];

const failures = [];

for (const script of fileScripts) {
  if (!script.command.includes("--output-default-evidence=")) {
    failures.push({
      script: script.name,
      reason: "missing --output-default-evidence",
    });
  }

  if (script.command.includes("--output-default=")) {
    failures.push({
      script: script.name,
      reason: "uses --output-default instead of --output-default-evidence",
    });
  }
}

for (const summaryDefault of requiredSummaryDefaults) {
  const command = scripts[summaryDefault.name] || "";
  if (!command.includes(summaryDefault.flag)) {
    failures.push({
      script: summaryDefault.name,
      reason: `missing ${summaryDefault.flag}`,
    });
  }
}

const result = {
  status: failures.length ? "failed" : "ok",
  target: "evidence-defaults",
  fileScriptCount: fileScripts.length,
  summaryDefaultCount: requiredSummaryDefaults.length,
  failures,
};

if (jsonOutput) {
  console.log(JSON.stringify(result, null, 2));
} else if (failures.length) {
  console.error("Evidence defaults check failed:");
  for (const failure of failures) {
    console.error(`- ${failure.script}: ${failure.reason}`);
  }
} else {
  console.log(
    `Evidence defaults check passed: ${fileScripts.length} :file scripts and ${requiredSummaryDefaults.length} summary aliases use TRAVEL_EVIDENCE_DIR defaults.`,
  );
}

if (failures.length) {
  process.exit(1);
}
