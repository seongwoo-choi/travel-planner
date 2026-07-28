#!/usr/bin/env node

import { config as loadEnv } from "dotenv";
import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { buildIosInstallSummaryCheckSchema } from "./ios-install-summary-schemas.js";

const webappDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
loadEnv({ path: path.join(webappDir, ".env") });

function parseArgs(args) {
  return args.reduce((options, arg) => {
    if (arg === "--sync-source") return { ...options, syncSource: true };
    if (arg.startsWith("--output=")) return { ...options, output: arg.slice("--output=".length) };
    if (arg.startsWith("--output-env=")) return { ...options, outputEnv: arg.slice("--output-env=".length) };
    if (arg.startsWith("--output-default=")) return { ...options, outputDefault: arg.slice("--output-default=".length) };
    return options;
  }, {
    syncSource: false,
    output: "",
    outputEnv: "",
    outputDefault: "reports/ios-install-summary-check.schema.json",
  });
}

function webappPath(value) {
  if (!value) return "";
  return path.isAbsolute(value) ? value : path.join(webappDir, value);
}

const options = parseArgs(process.argv.slice(2));
const outputPath = webappPath(
  options.output
    || (options.outputEnv ? process.env[options.outputEnv] : "")
    || options.outputDefault,
);
const schema = buildIosInstallSummaryCheckSchema();
const body = `${JSON.stringify(schema, null, 2)}\n`;

mkdirSync(path.dirname(outputPath), { recursive: true });
writeFileSync(outputPath, body, "utf8");
console.log(`ios-install-summary-check-schema=${outputPath}`);
if (options.syncSource) {
  const sourceSnapshotPath = path.join(webappDir, "src", "ios-install-summary-check.schema.json");
  writeFileSync(sourceSnapshotPath, body, "utf8");
  console.log(`ios-install-summary-check-schema-source=${sourceSnapshotPath}`);
}
