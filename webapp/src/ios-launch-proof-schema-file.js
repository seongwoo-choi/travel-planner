#!/usr/bin/env node

import { config as loadEnv } from "dotenv";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const srcDir = path.dirname(fileURLToPath(import.meta.url));
const webappDir = path.resolve(srcDir, "..");
const defaultEnvPath = path.join(webappDir, ".env");

function resolveEnvPath(filePath) {
  return path.isAbsolute(filePath) ? filePath : path.resolve(process.cwd(), filePath);
}

function loadConfiguredEnv(argv) {
  const envArg = argv.find((arg) => arg.startsWith("--env="));
  const envPath = envArg ? resolveEnvPath(envArg.slice("--env=".length)) : defaultEnvPath;
  return loadEnv({ path: envPath });
}

loadConfiguredEnv(process.argv.slice(2));

function parseArgs(argv) {
  return argv.reduce((options, arg) => {
    if (arg.startsWith("--output=")) {
      return { ...options, output: arg.slice("--output=".length) };
    }
    if (arg.startsWith("--output-default=")) {
      return { ...options, outputDefault: arg.slice("--output-default=".length) };
    }
    if (arg.startsWith("--env=")) {
      return options;
    }
    return options;
  }, {
    output: "",
    outputDefault: "",
  });
}

function outputPath(options) {
  return options.output
    || process.env.TRAVEL_IOS_LAUNCH_PROOF_SCHEMA_PATH
    || options.outputDefault
    || "";
}

function resolveWebappPath(filePath) {
  return path.isAbsolute(filePath) ? filePath : path.join(webappDir, filePath);
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  const targetPath = outputPath(options);
  if (!targetPath) {
    throw new Error("missing --output, TRAVEL_IOS_LAUNCH_PROOF_SCHEMA_PATH, or --output-default");
  }

  const sourcePath = path.join(webappDir, "public", "ios-launch-proof.schema.json");
  const resolvedTargetPath = resolveWebappPath(targetPath);
  const schema = await readFile(sourcePath, "utf8");
  await mkdir(path.dirname(resolvedTargetPath), { recursive: true });
  await writeFile(resolvedTargetPath, schema.endsWith("\n") ? schema : `${schema}\n`);
  console.log(`ios-launch-proof-schema=${resolvedTargetPath}`);
}

main().catch((error) => {
  console.error("ios-launch-proof-schema=failed");
  console.error(`error=${error.message}`);
  process.exitCode = 1;
});
