#!/usr/bin/env node

import { config as loadEnv } from "dotenv";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { checkLaunchProof, launchProofStatus, launchProofSummary } from "./ios-launch-proof-core.js";

const srcDir = path.dirname(fileURLToPath(import.meta.url));
const webappDir = path.resolve(srcDir, "..");
const defaultEnvPath = path.join(webappDir, ".env");
const DEFAULT_INPUT = "reports/ios-launch-proof.json";

function resolveEnvPath(filePath) {
  return path.isAbsolute(filePath) ? filePath : path.resolve(process.cwd(), filePath);
}

function loadConfiguredEnv(argv) {
  const envArg = argv.find((arg) => arg.startsWith("--env="));
  const envPath = envArg ? resolveEnvPath(envArg.slice("--env=".length)) : defaultEnvPath;
  const result = loadEnv({ path: envPath });
  return {
    envPath,
    envSource: envArg ? "arg" : "default",
    envLoaded: !result.error,
    envError: result.error?.code || "",
  };
}

const envLoad = loadConfiguredEnv(process.argv.slice(2));

function parseArgs(argv) {
  return argv.reduce((options, arg) => {
    if (arg.startsWith("--input=")) {
      return { ...options, input: arg.slice("--input=".length), inputSource: "arg" };
    }
    if (arg.startsWith("--input-default=")) {
      return { ...options, inputDefault: arg.slice("--input-default=".length) };
    }
    if (arg === "--json") {
      return { ...options, json: true };
    }
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
    input: process.env.TRAVEL_IOS_LAUNCH_PROOF_PATH || "",
    inputSource: process.env.TRAVEL_IOS_LAUNCH_PROOF_PATH ? "env" : "default",
    inputDefault: DEFAULT_INPUT,
    json: false,
    output: "",
    outputDefault: "",
    ...envLoad,
  });
}

function resolveWebappPath(filePath) {
  return path.isAbsolute(filePath) ? filePath : path.join(webappDir, filePath);
}

function inputPath(options) {
  return options.input || options.inputDefault;
}

function outputPath(options) {
  return options.output
    || process.env.TRAVEL_IOS_LAUNCH_PROOF_CHECK_PATH
    || options.outputDefault
    || "";
}

async function writeOutput(filePath, body) {
  if (!filePath) return;
  const resolvedPath = resolveWebappPath(filePath);
  await mkdir(path.dirname(resolvedPath), { recursive: true });
  await writeFile(resolvedPath, body.endsWith("\n") ? body : `${body}\n`);
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  const resolvedInputPath = resolveWebappPath(inputPath(options));
  const proof = JSON.parse(await readFile(resolvedInputPath, "utf8"));
  const issues = checkLaunchProof(proof);

  if (options.json) {
    const output = JSON.stringify({
      schemaVersion: 1,
      ok: issues.length === 0,
      status: launchProofStatus(issues),
      summary: launchProofSummary(issues),
      envPath: options.envPath,
      envSource: options.envSource,
      envLoaded: options.envLoaded,
      envError: options.envError,
      inputPath: resolvedInputPath,
      inputSource: options.inputSource,
      schemaUrl: proof.schemaUrl || "",
      proofType: proof.type || "",
      standalone: Boolean(proof.standalone),
      displayMode: proof.displayMode || "",
      appModeState: proof.appModeState || "",
      appModeTitle: proof.appModeTitle || "",
      appModeDetail: proof.appModeDetail || "",
      serviceWorker: proof.serviceWorker || "",
      path: proof.path || "",
      url: proof.url || "",
      iosDevice: proof.iosDevice,
      iosSafari: proof.iosSafari,
      appleWebAppTitle: proof.appleWebAppTitle || "",
      manifestUrl: proof.manifestUrl || "",
      themeColor: proof.themeColor || "",
      screenWidth: proof.screenWidth || 0,
      screenHeight: proof.screenHeight || 0,
      devicePixelRatio: proof.devicePixelRatio || 0,
      capturedAt: proof.capturedAt || "",
      issues,
    }, null, 2);
    await writeOutput(outputPath(options), output);
    console.log(output);
    if (issues.length > 0) process.exitCode = 1;
    return;
  }

  const output = [
    `status=${launchProofStatus(issues)}`,
    `summary=${launchProofSummary(issues)}`,
    `inputPath=${resolvedInputPath}`,
    `inputSource=${options.inputSource}`,
    `standalone=${proof.standalone === true ? "true" : "false"}`,
    `displayMode=${proof.displayMode || ""}`,
    `appModeState=${proof.appModeState || ""}`,
    `appModeTitle=${proof.appModeTitle || ""}`,
    `appModeDetail=${proof.appModeDetail || ""}`,
    `serviceWorker=${proof.serviceWorker || ""}`,
    `path=${proof.path || ""}`,
    `url=${proof.url || ""}`,
    `iosDevice=${proof.iosDevice === true ? "true" : proof.iosDevice === false ? "false" : ""}`,
    `iosSafari=${proof.iosSafari === true ? "true" : proof.iosSafari === false ? "false" : ""}`,
    `appleWebAppTitle=${proof.appleWebAppTitle || ""}`,
    `manifestUrl=${proof.manifestUrl || ""}`,
    `themeColor=${proof.themeColor || ""}`,
    `screenWidth=${proof.screenWidth || ""}`,
    `screenHeight=${proof.screenHeight || ""}`,
    `devicePixelRatio=${proof.devicePixelRatio || ""}`,
    `capturedAt=${proof.capturedAt || ""}`,
  ].join("\n");
  await writeOutput(outputPath(options), output);
  console.log(output);

  if (issues.length > 0) {
    console.error("ios-launch-proof-check=failed");
    for (const issue of issues) console.error(`issue=${issue}`);
    process.exitCode = 1;
    return;
  }

  console.log("ios-launch-proof-check=passed");
}

main().catch(async (error) => {
  const options = parseArgs(process.argv.slice(2));
  if (options.json) {
    const output = JSON.stringify({
      schemaVersion: 1,
      ok: false,
      status: "error",
      summary: "iOS Home Screen launch proof check could not complete",
      envPath: options.envPath,
      envSource: options.envSource,
      envLoaded: options.envLoaded,
      envError: options.envError,
      inputPath: resolveWebappPath(inputPath(options)),
      inputSource: options.inputSource,
      error: error.message,
      issues: [error.message],
    }, null, 2);
    await writeOutput(outputPath(options), output);
    console.log(output);
  } else {
    console.error("ios-launch-proof-check=failed");
    console.error(`error=${error.message}`);
  }
  process.exitCode = 1;
});
