#!/usr/bin/env node

import { mkdirSync, readFileSync, renameSync, rmSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const srcDir = path.dirname(fileURLToPath(import.meta.url));
const webappDir = path.resolve(srcDir, "..");
const args = process.argv.slice(2);
const evidenceDir = process.env.TRAVEL_EVIDENCE_DIR || "reports";
const outputArg = args.find((arg) => arg.startsWith("--output="));
const outputEnvArg = args.find((arg) => arg.startsWith("--output-env="));
const outputDefaultEvidenceArg = args.find((arg) => arg.startsWith("--output-default-evidence="));
const outputEnvName = outputEnvArg ? outputEnvArg.slice("--output-env=".length) : "";
const outputDefaultEvidencePath = outputDefaultEvidenceArg
  ? path.join(evidenceDir, outputDefaultEvidenceArg.slice("--output-default-evidence=".length))
  : "";
const outputPath = outputArg
  ? outputArg.slice("--output=".length)
  : outputEnvName
    ? process.env[outputEnvName] || outputDefaultEvidencePath
    : outputDefaultEvidencePath;

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
    console.error(`ios-install-runbook-check-schema=${resolvedPath}`);
  } catch (error) {
    rmSync(tempPath, { force: true });
    console.error(`ios-install-runbook-check-schema=failed (${error.message})`);
    process.exit(1);
  }
}

const sourcePath = path.join(srcDir, "ios-install-runbook-check.schema.json");
const body = `${readFileSync(sourcePath, "utf8").trim()}\n`;

if (outputPath) {
  writeAtomic(outputPath, body);
} else {
  process.stdout.write(body);
}
