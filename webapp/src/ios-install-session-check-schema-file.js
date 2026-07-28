#!/usr/bin/env node

import { config as loadEnv } from "dotenv";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const webappDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
loadEnv({ path: path.join(webappDir, ".env") });

function valueAfterEquals(arg, name) {
  return arg.startsWith(`${name}=`) ? arg.slice(name.length + 1) : "";
}

function parseArgs(args) {
  const options = {
    output: "",
    outputEnv: "",
    outputDefault: "reports/ios-install-session-check.schema.json",
  };
  for (const arg of args) {
    options.output = valueAfterEquals(arg, "--output") || options.output;
    options.outputEnv = valueAfterEquals(arg, "--output-env") || options.outputEnv;
    options.outputDefault = valueAfterEquals(arg, "--output-default") || options.outputDefault;
  }
  return options;
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
const schemaPath = path.join(webappDir, "src", "ios-install-session-check.schema.json");
const body = readFileSync(schemaPath, "utf8");

mkdirSync(path.dirname(outputPath), { recursive: true });
writeFileSync(outputPath, body.endsWith("\n") ? body : `${body}\n`, "utf8");
console.log(`ios-install-session-check-schema=${outputPath}`);
