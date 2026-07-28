#!/usr/bin/env node

import { createHash } from "node:crypto";
import { mkdirSync } from "node:fs";
import { readFile, rename, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const webappDir = path.resolve(fileURLToPath(new URL("..", import.meta.url)));
const args = process.argv.slice(2);
const manifestArg = args.find((arg) => arg.startsWith("--manifest="));
const outputArg = args.find((arg) => arg.startsWith("--output="));
const outputDefaultEvidenceArg = args.find((arg) => arg.startsWith("--output-default-evidence="));
const evidenceDir = process.env.TRAVEL_EVIDENCE_DIR || "reports";
const manifestPath = resolvePath(
  manifestArg
    ? manifestArg.slice("--manifest=".length)
    : process.env.TRAVEL_BACKUP_MANIFEST_VERIFY_PATH || path.join(evidenceDir, "storage-backup-manifest.json")
);
const outputDefaultEvidencePath = outputDefaultEvidenceArg
  ? path.join(evidenceDir, outputDefaultEvidenceArg.slice("--output-default-evidence=".length))
  : "";
const outputPath = outputArg
  ? outputArg.slice("--output=".length)
  : process.env.TRAVEL_BACKUP_VERIFY_PATH || outputDefaultEvidencePath;

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
    console.error(`storage backup verify wrote ${resolvedOutputPath}`);
  } catch (error) {
    await rm(tempOutputPath, { force: true }).catch(() => {});
    console.error(`storage backup verify failed: ${resolvedOutputPath} (${error.message})`);
    process.exit(1);
  }
}

function resolveDbPath(manifest) {
  const configured = process.env.TRAVEL_DB_PATH || manifest.dbPath || "data/plans.json";
  return path.isAbsolute(configured) ? configured : path.join(webappDir, configured);
}

function latestUpdatedAt(plans = []) {
  return plans
    .map((plan) => plan?.updatedAt)
    .filter(Boolean)
    .sort()
    .at(-1) || null;
}

function compareField(errors, field, expected, actual) {
  if (expected === undefined) return;
  if (expected !== actual) errors.push(`${field}-mismatch`);
}

let manifest;
try {
  manifest = JSON.parse(await readFile(manifestPath, "utf8"));
} catch (error) {
  console.error(`storage backup verify failed: cannot read manifest ${manifestPath} (${error.message})`);
  process.exit(1);
}

const dbPath = resolveDbPath(manifest);
let raw;
let db;
try {
  raw = await readFile(dbPath);
  db = JSON.parse(raw.toString("utf8"));
} catch (error) {
  const payload = {
    schemaVersion: 1,
    verifiedAt: new Date().toISOString(),
    status: "failed",
    manifestPath,
    dbPath,
    errors: [`db-read-or-parse-failed:${error.code || error.message}`],
  };
  await writePayload(payload);
  process.exit(1);
}

const plans = Array.isArray(db?.plans) ? db.plans : [];
const actual = {
  bytes: raw.length,
  sha256: createHash("sha256").update(raw).digest("hex"),
  planCount: plans.length,
  latestUpdatedAt: latestUpdatedAt(plans),
};

const expected = {
  bytes: manifest.bytes,
  sha256: manifest.sha256,
  planCount: manifest.planCount,
  latestUpdatedAt: manifest.latestUpdatedAt,
};

const errors = [];
if (manifest.schemaVersion !== 1) errors.push("manifest-schema-version-mismatch");
if (manifest.status && manifest.status !== "ok") errors.push("manifest-status-not-ok");
compareField(errors, "bytes", expected.bytes, actual.bytes);
compareField(errors, "sha256", expected.sha256, actual.sha256);
compareField(errors, "planCount", expected.planCount, actual.planCount);
compareField(errors, "latestUpdatedAt", expected.latestUpdatedAt, actual.latestUpdatedAt);

const payload = {
  schemaVersion: 1,
  verifiedAt: new Date().toISOString(),
  status: errors.length === 0 ? "ok" : "failed",
  manifestPath,
  dbPath,
  expected,
  actual,
  errors,
};

await writePayload(payload);
if (errors.length > 0) process.exit(1);
