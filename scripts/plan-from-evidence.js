#!/usr/bin/env node

import path from "node:path";
import { fileURLToPath } from "node:url";

import { generateFromFiles, writePlanArtifacts } from "../src/harness-runner.js";

function option(name, fallback) {
  const prefix = `--${name}=`;
  return process.argv.slice(2).find((argument) => argument.startsWith(prefix))?.slice(prefix.length) || fallback;
}

const root = path.resolve(fileURLToPath(new URL("..", import.meta.url)));
const requirementsPath = path.resolve(option("requirements", path.join(root, "_workspace/00_input/requirements.json")));
const evidencePath = path.resolve(option("evidence", path.join(root, "_workspace/01_evidence/evidence.json")));
const outputDir = path.resolve(option("output-dir", path.join(root, "_workspace/02_plan")));

try {
  const result = await generateFromFiles({ requirementsPath, evidencePath });
  const outputs = await writePlanArtifacts({ result, outputDir });
  process.stdout.write(`${JSON.stringify({ status: result.status, ...outputs })}\n`);
} catch (error) {
  process.stderr.write(`travel-plan failed: ${error.message}\n`);
  process.exitCode = 1;
}
