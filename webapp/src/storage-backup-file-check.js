#!/usr/bin/env node

import { createHash } from "node:crypto";
import { mkdirSync } from "node:fs";
import { readFile, rename, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const webappDir = path.resolve(fileURLToPath(new URL("..", import.meta.url)));
const args = process.argv.slice(2);
const fileArg = args.find((arg) => arg.startsWith("--file="));
const outputArg = args.find((arg) => arg.startsWith("--output="));
const outputDefaultEvidenceArg = args.find((arg) => arg.startsWith("--output-default-evidence="));
const evidenceDir = process.env.TRAVEL_EVIDENCE_DIR || "reports";
const backupPath = resolvePath(
  fileArg
    ? fileArg.slice("--file=".length)
    : process.env.TRAVEL_BACKUP_FILE_PATH || path.join(evidenceDir, "travel-planner-backup.json")
);
const outputDefaultEvidencePath = outputDefaultEvidenceArg
  ? path.join(evidenceDir, outputDefaultEvidenceArg.slice("--output-default-evidence=".length))
  : "";
const outputPath = outputArg
  ? outputArg.slice("--output=".length)
  : process.env.TRAVEL_BACKUP_FILE_CHECK_PATH || outputDefaultEvidencePath;

function resolvePath(value) {
  return path.isAbsolute(value) ? value : path.join(webappDir, value);
}

function resolveOptionalPath(value) {
  if (!value) return "";
  return resolvePath(value);
}

async function writePayload(payload) {
  const output = `${JSON.stringify(payload, null, 2)}\n`;
  const resolvedOutputPath = resolveOptionalPath(outputPath);
  if (!resolvedOutputPath) {
    process.stdout.write(output);
    return;
  }
  const tempOutputPath = `${resolvedOutputPath}.tmp-${process.pid}`;
  try {
    mkdirSync(path.dirname(resolvedOutputPath), { recursive: true });
    await writeFile(tempOutputPath, output, "utf8");
    await rename(tempOutputPath, resolvedOutputPath);
    console.error(`storage backup file check wrote ${resolvedOutputPath}`);
  } catch (error) {
    await rm(tempOutputPath, { force: true }).catch(() => {});
    console.error(`storage backup file check failed: ${resolvedOutputPath} (${error.message})`);
    process.exit(1);
  }
}

function hasValue(value) {
  return value !== undefined && value !== null && String(value).trim() !== "";
}

function validatePlans(plans) {
  const errors = [];
  if (!Array.isArray(plans)) return ["plans-must-be-array"];

  const planIds = new Set();
  for (const [index, plan] of plans.entries()) {
    const label = `plans[${index}]`;
    if (!plan || typeof plan !== "object" || Array.isArray(plan)) {
      errors.push(`${label}-must-be-object`);
      continue;
    }
    if (!hasValue(plan.id)) {
      errors.push(`${label}-missing-id`);
    } else if (planIds.has(String(plan.id))) {
      errors.push(`${label}-duplicate-id`);
    } else {
      planIds.add(String(plan.id));
    }
    if (!hasValue(plan.title)) errors.push(`${label}-missing-title`);
    if (!hasValue(plan.startDate)) errors.push(`${label}-missing-startDate`);
    if (plan.revisions !== undefined && !Array.isArray(plan.revisions)) {
      errors.push(`${label}-revisions-must-be-array`);
    }

    const revisions = Array.isArray(plan.revisions) ? plan.revisions : [];
    const revisionVersions = new Set();
    for (const [revisionIndex, revision] of revisions.entries()) {
      const revisionLabel = `${label}.revisions[${revisionIndex}]`;
      if (!revision || typeof revision !== "object" || Array.isArray(revision)) {
        errors.push(`${revisionLabel}-must-be-object`);
        continue;
      }
      if (!hasValue(revision.version)) {
        errors.push(`${revisionLabel}-missing-version`);
      } else if (revisionVersions.has(String(revision.version))) {
        errors.push(`${revisionLabel}-duplicate-version`);
      } else {
        revisionVersions.add(String(revision.version));
      }
    }
    if (hasValue(plan.latestVersion) && revisions.length > 0 && !revisionVersions.has(String(plan.latestVersion))) {
      errors.push(`${label}-latestVersion-missing-revision`);
    }
  }
  return errors;
}

let raw;
let backup;
try {
  raw = await readFile(backupPath);
  backup = JSON.parse(raw.toString("utf8"));
} catch (error) {
  const payload = {
    schemaVersion: 1,
    checkedAt: new Date().toISOString(),
    status: "failed",
    backupPath,
    errors: [`backup-read-or-parse-failed:${error.code || error.message}`],
  };
  await writePayload(payload);
  process.exit(1);
}

const errors = [];
if (!backup || typeof backup !== "object" || Array.isArray(backup)) {
  errors.push("backup-root-must-be-object");
}
if (backup?.version !== 1) errors.push("backup-version-mismatch");
if (!hasValue(backup?.exportedAt)) errors.push("backup-missing-exportedAt");
errors.push(...validatePlans(backup?.plans));

const payload = {
  schemaVersion: 1,
  checkedAt: new Date().toISOString(),
  status: errors.length === 0 ? "ok" : "failed",
  backupPath,
  bytes: raw.length,
  sha256: createHash("sha256").update(raw).digest("hex"),
  backupVersion: backup?.version ?? null,
  exportedAt: backup?.exportedAt ?? null,
  scope: backup?.scope ?? null,
  planCount: Array.isArray(backup?.plans) ? backup.plans.length : null,
  errors,
};

await writePayload(payload);
if (errors.length > 0) process.exit(1);
