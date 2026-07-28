#!/usr/bin/env node

import { config as loadEnv } from "dotenv";
import { copyFileSync, mkdirSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const webappDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
loadEnv({ path: path.join(webappDir, ".env") });

function parseArgs(args) {
  return args.reduce((options, arg) => {
    if (arg.startsWith("--output=")) return { ...options, output: arg.slice("--output=".length) };
    if (arg.startsWith("--output-env=")) return { ...options, outputEnv: arg.slice("--output-env=".length) };
    if (arg.startsWith("--output-default=")) return { ...options, outputDefault: arg.slice("--output-default=".length) };
    return options;
  }, {
    output: "",
    outputEnv: "",
    outputDefault: "reports/ios-install-start.schema.json",
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
const schemaPath = path.join(webappDir, "src", "ios-install-start.schema.json");

mkdirSync(path.dirname(outputPath), { recursive: true });
copyFileSync(schemaPath, outputPath);
console.log(`ios-install-start-schema=${outputPath}`);
