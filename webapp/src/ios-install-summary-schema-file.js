#!/usr/bin/env node

import { mkdirSync, renameSync, rmSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { buildIosInstallSummarySchema } from "./ios-install-summary-schemas.js";

const srcDir = path.dirname(fileURLToPath(import.meta.url));
const webappDir = path.resolve(srcDir, "..");
const args = process.argv.slice(2);
const outputArg = args.find((arg) => arg.startsWith("--output="));
const outputEnvArg = args.find((arg) => arg.startsWith("--output-env="));
const outputDefaultArg = args.find((arg) => arg.startsWith("--output-default="));
const syncSource = args.includes("--sync-source");
const outputEnvName = outputEnvArg ? outputEnvArg.slice("--output-env=".length) : "";
const outputDefaultPath = outputDefaultArg ? outputDefaultArg.slice("--output-default=".length) : "";
const outputPath = outputArg
  ? outputArg.slice("--output=".length)
  : outputEnvName
    ? process.env[outputEnvName] || outputDefaultPath
    : outputDefaultPath;

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
    console.error(`ios-install-summary-schema=${resolvedPath}`);
  } catch (error) {
    rmSync(tempPath, { force: true });
    console.error(`ios-install-summary-schema=failed (${error.message})`);
    process.exit(1);
  }
}

const schema = buildIosInstallSummarySchema();
const body = `${JSON.stringify(schema, null, 2)}\n`;
const sourceSnapshotPath = path.join(srcDir, "ios-install-summary.schema.json");

if (outputPath) {
  writeAtomic(outputPath, body);
} else {
  process.stdout.write(body);
}
if (syncSource) {
  writeAtomic(sourceSnapshotPath, body);
}
