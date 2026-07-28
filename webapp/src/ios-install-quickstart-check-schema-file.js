#!/usr/bin/env node

import { copyFileSync, mkdirSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const webappDir = path.resolve(__dirname, "..");

function valueAfterEquals(arg, name) {
  return arg.startsWith(`${name}=`) ? arg.slice(name.length + 1) : "";
}

const options = process.argv.slice(2).reduce((result, arg) => ({
  outputEnv: valueAfterEquals(arg, "--output-env") || result.outputEnv,
  outputDefault: valueAfterEquals(arg, "--output-default") || result.outputDefault,
}), {
  outputEnv: "",
  outputDefault: "reports/ios-install-quickstart-check.schema.json",
});

const outputPath = path.resolve(webappDir, process.env[options.outputEnv] || options.outputDefault);
const sourcePath = path.join(__dirname, "ios-install-quickstart-check.schema.json");

mkdirSync(path.dirname(outputPath), { recursive: true });
copyFileSync(sourcePath, outputPath);
console.log(`ios-install-quickstart-check-schema=${outputPath}`);
