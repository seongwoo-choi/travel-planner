import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import path from "node:path";

import { generateGroundedPlan } from "./planner/grounded-plan-generator.js";
import { normalizeHarnessRequirements } from "./harness-input.js";

const ISO_TIMESTAMP = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:\d{2})$/;

async function readJson(filePath, label) {
  let raw;
  try {
    raw = await readFile(filePath, "utf8");
  } catch (error) {
    throw new Error(`${label} file cannot be read: ${filePath} (${error.code || error.message})`);
  }
  try {
    return JSON.parse(raw);
  } catch {
    throw new TypeError(`${label} file must contain valid JSON: ${filePath}`);
  }
}

async function atomicWrite(filePath, content) {
  await mkdir(path.dirname(filePath), { recursive: true });
  const temporary = `${filePath}.tmp-${process.pid}`;
  await writeFile(temporary, content, "utf8");
  await rename(temporary, filePath);
}

export async function generateFromFiles({ requirementsPath, evidencePath, now = () => new Date() }) {
  const requirements = normalizeHarnessRequirements(await readJson(requirementsPath, "requirements"));
  const bundle = await readJson(evidencePath, "evidence");
  const generatedAt = String(bundle.generatedAt || "").trim();
  if (!ISO_TIMESTAMP.test(generatedAt) || Number.isNaN(Date.parse(generatedAt))) {
    throw new TypeError("evidence generatedAt must be an ISO timestamp");
  }
  const evidence = bundle.evidence ?? bundle;
  const generation = await generateGroundedPlan({ input: requirements, evidence, now });
  return { schemaVersion: 1, requirements, ...generation };
}

export async function writePlanArtifacts({ result, outputDir }) {
  const jsonPath = path.join(outputDir, "plan.json");
  const markdownPath = path.join(outputDir, "travel_plan.md");
  await atomicWrite(jsonPath, `${JSON.stringify(result, null, 2)}\n`);
  await atomicWrite(markdownPath, `${result.plan}\n`);
  return { jsonPath, markdownPath };
}
