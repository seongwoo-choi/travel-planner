#!/usr/bin/env node

import path from "node:path";
import { fileURLToPath } from "node:url";

import { generateFromFiles } from "../src/harness-runner.js";

function option(name, fallback) {
  const prefix = `--${name}=`;
  return process.argv.slice(2).find((argument) => argument.startsWith(prefix))?.slice(prefix.length) || fallback;
}

const root = path.resolve(fileURLToPath(new URL("..", import.meta.url)));
const requirementsPath = path.resolve(option("requirements", path.join(root, "_workspace/00_input/requirements.json")));
const evidencePath = path.resolve(option("evidence", path.join(root, "_workspace/01_evidence/evidence.json")));

try {
  const result = await generateFromFiles({ requirementsPath, evidencePath });
  process.stdout.write(`${JSON.stringify({
    valid: result.groundedPlan.validation.ok,
    status: result.status,
    hardConstraintViolations: result.groundedPlan.quality.hardConstraintViolations,
    confirmationCount: result.groundedPlan.quality.confirmationCount,
  })}\n`);
  if (!result.groundedPlan.validation.ok) process.exitCode = 1;
} catch (error) {
  process.stderr.write(`travel-plan validation failed: ${error.message}\n`);
  process.exitCode = 1;
}
