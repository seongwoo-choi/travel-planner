#!/usr/bin/env node

import { createHash } from "node:crypto";
import { readFile, rename, rm, writeFile } from "node:fs/promises";
import { mkdirSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const webappDir = path.resolve(fileURLToPath(new URL("..", import.meta.url)));
const args = process.argv.slice(2);
const outputArg = args.find((arg) => arg.startsWith("--output="));
const outputDefaultEvidenceArg = args.find((arg) => arg.startsWith("--output-default-evidence="));
const outputDefaultEvidencePath = outputDefaultEvidenceArg
  ? path.join(
      process.env.TRAVEL_EVIDENCE_DIR || "reports",
      outputDefaultEvidenceArg.slice("--output-default-evidence=".length),
    )
  : "";
const outputPath = outputArg
  ? outputArg.slice("--output=".length)
  : process.env.TRAVEL_BACKUP_MANIFEST_PATH || outputDefaultEvidencePath;
const dbPath = resolveDbPath(process.env.TRAVEL_DB_PATH || "data/plans.json");

function resolveDbPath(value) {
  return path.isAbsolute(value) ? value : path.join(webappDir, value);
}

function resolveOutputPath(value) {
  if (!value) return "";
  return path.isAbsolute(value) ? value : path.join(webappDir, value);
}

let raw;
try {
  raw = await readFile(dbPath);
} catch (error) {
  const payload = {
    schemaVersion: 1,
    generatedAt: new Date().toISOString(),
    status: "failed",
    dbPath,
    dbState: "missing",
    errors: [`db-read-failed:${error.code || "unknown"}`],
  };
  console.log(JSON.stringify(payload, null, 2));
  process.exit(1);
}

let db;
try {
  db = JSON.parse(raw.toString("utf8"));
} catch (error) {
  const payload = {
    schemaVersion: 1,
    generatedAt: new Date().toISOString(),
    status: "failed",
    dbPath,
    dbState: "invalid-json",
    bytes: raw.length,
    sha256: createHash("sha256").update(raw).digest("hex"),
    errors: [`db-json-parse-failed:${error.message}`],
  };
  console.log(JSON.stringify(payload, null, 2));
  process.exit(1);
}

const plans = Array.isArray(db?.plans) ? db.plans : [];
const payload = {
  schemaVersion: 1,
  generatedAt: new Date().toISOString(),
  status: "ok",
  dbPath,
  dbState: "available",
  bytes: raw.length,
  sha256: createHash("sha256").update(raw).digest("hex"),
  planCount: plans.length,
  latestUpdatedAt: plans
    .map((plan) => plan?.updatedAt)
    .filter(Boolean)
    .sort()
    .at(-1) || null,
};

const output = `${JSON.stringify(payload, null, 2)}\n`;
const resolvedOutputPath = resolveOutputPath(outputPath);
if (resolvedOutputPath) {
  const tempOutputPath = `${resolvedOutputPath}.tmp-${process.pid}`;
  try {
    mkdirSync(path.dirname(resolvedOutputPath), { recursive: true });
    await writeFile(tempOutputPath, output, "utf8");
    await rename(tempOutputPath, resolvedOutputPath);
    console.error(`storage backup manifest wrote ${resolvedOutputPath}`);
  } catch (error) {
    await rm(tempOutputPath, { force: true }).catch(() => {});
    console.error(`storage backup manifest failed: ${resolvedOutputPath} (${error.message})`);
    process.exit(1);
  }
} else {
  process.stdout.write(output);
}
