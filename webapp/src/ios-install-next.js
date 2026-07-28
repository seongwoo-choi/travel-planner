#!/usr/bin/env node

import { config as loadEnv } from "dotenv";
import { mkdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { buildIosInstallNextStep, buildIosInstallNextStepText } from "./ios-install-next-core.js";

const webappDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
loadEnv({ path: path.join(webappDir, ".env") });

function parseArgs(args) {
  return args.reduce((options, arg) => {
    if (arg === "--json") return { ...options, json: true };
    if (arg === "--require-current-start") return { ...options, requireCurrentStart: true };
    if (arg.startsWith("--output=")) return { ...options, output: arg.slice("--output=".length) };
    if (arg.startsWith("--output-env=")) return { ...options, outputEnv: arg.slice("--output-env=".length) };
    if (arg.startsWith("--output-default=")) return { ...options, outputDefault: arg.slice("--output-default=".length) };
    return options;
  }, {
    json: false,
    requireCurrentStart: false,
    output: "",
    outputEnv: "",
    outputDefault: "",
  });
}

function webappPath(value) {
  return path.isAbsolute(value) ? value : path.join(webappDir, value);
}

function originFromEnv() {
  const fallback = `http://localhost:${process.env.PORT || "3000"}`;
  try {
    return new URL(process.env.TRAVEL_PLANNER_PUBLIC_ORIGIN || fallback).origin;
  } catch {
    return fallback;
  }
}

function installTarget() {
  const origin = originFromEnv();
  return {
    origin,
    installUrl: new URL("/install.html", `${origin}/`).toString(),
    shortInstallUrl: new URL("/i", `${origin}/`).toString(),
    qrUrl: new URL("/api/install-qr.svg", `${origin}/`).toString(),
    proofSaveHash: "#iosInstallProofSaveButton",
    proofSaveTargetId: "iosInstallProofSaveButton",
    proofSaveUrl: new URL("/install.html#iosInstallProofSaveButton", `${origin}/`).toString(),
  };
}

function readJsonReport(label, filePath) {
  const resolvedPath = webappPath(filePath);
  try {
    const fileStat = statSync(resolvedPath);
    return {
      label,
      path: resolvedPath,
      state: "ok",
      ok: true,
      modifiedAt: fileStat.mtime.toISOString(),
      data: JSON.parse(readFileSync(resolvedPath, "utf8")),
    };
  } catch (error) {
    return {
      label,
      path: resolvedPath,
      state: error?.code === "ENOENT" ? "missing" : "invalid-json",
      ok: false,
      modifiedAt: "",
      data: null,
    };
  }
}

function buildNextStep() {
  const reports = {
    installStart: readJsonReport("installStart", process.env.TRAVEL_IOS_INSTALL_START_PATH || "reports/ios-install-start.json"),
    runbook: readJsonReport("runbook", process.env.TRAVEL_IOS_INSTALL_RUNBOOK_CHECK_PATH || "reports/ios-install-runbook-check.json"),
    sessionCheck: readJsonReport("sessionCheck", process.env.TRAVEL_IOS_INSTALL_SESSION_CHECK_PATH || "reports/ios-install-session-check.json"),
    strict: readJsonReport("strict", process.env.TRAVEL_IOS_INSTALL_CHECK_STRICT_PATH || "reports/ios-install-check.strict.json"),
    proof: readJsonReport("proof", process.env.TRAVEL_IOS_INSTALL_CHECK_PROOF_PATH || "reports/ios-install-check.proof.json"),
    launchProofCheck: readJsonReport("launchProofCheck", process.env.TRAVEL_IOS_LAUNCH_PROOF_CHECK_PATH || "reports/ios-launch-proof-check.json"),
    summaryCheck: readJsonReport("summaryCheck", process.env.TRAVEL_IOS_INSTALL_SUMMARY_CHECK_PATH || "reports/ios-install-summary-check.json"),
  };

  return buildIosInstallNextStep({
    reports,
    installTarget: installTarget(),
  });
}

function printText(result) {
  console.log("Travel Planner iPhone install next step");
  process.stdout.write(buildIosInstallNextStepText(result));
}

function outputPath(options) {
  const value = options.output
    || (options.outputEnv ? process.env[options.outputEnv] : "")
    || options.outputDefault;
  return value ? webappPath(value) : "";
}

function writeOutput(filePath, result) {
  if (!filePath) return;
  mkdirSync(path.dirname(filePath), { recursive: true });
  writeFileSync(filePath, `${JSON.stringify(result, null, 2)}\n`, "utf8");
  console.error(`ios-install-next=${filePath}`);
}

function currentInstallStartIssue(result) {
  const installStart = result.installStart || {};
  if (!installStart.ok) {
    return "install-start evidence is missing or invalid. Run npm run ios:install:evidence:before-phone first.";
  }
  if (installStart.freshnessState !== "fresh") {
    return "install-start evidence is stale or has no modified time. Regenerate it with npm run ios:install:evidence:before-phone.";
  }
  if (installStart.readiness !== "ready-for-iphone-handoff") {
    return "install-start evidence is not HTTPS-ready. Set TRAVEL_PLANNER_PUBLIC_ORIGIN=https://... and run npm run ios:install:start:gate.";
  }
  return "";
}

const options = parseArgs(process.argv.slice(2));
const result = buildNextStep();
writeOutput(outputPath(options), result);
if (options.json) {
  console.log(JSON.stringify(result, null, 2));
} else {
  printText(result);
}

const installStartIssue = options.requireCurrentStart ? currentInstallStartIssue(result) : "";
if (installStartIssue) {
  console.error([
    "ios-install-next=install-start-not-current",
    `issue=${installStartIssue}`,
  ].join("\n"));
  process.exitCode = 1;
}
