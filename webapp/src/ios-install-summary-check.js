#!/usr/bin/env node

import { config as loadEnv } from "dotenv";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { IOS_EVIDENCE_STALE_AFTER_ENV_VAR } from "./ios-evidence-freshness.js";

const webappDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
loadEnv({ path: path.join(webappDir, ".env") });

function parseArgs(args) {
  return args.reduce((options, arg) => {
    if (arg === "--json") return { ...options, json: true };
    if (arg === "--strict") return { ...options, strict: true };
    if (arg.startsWith("--input=")) return { ...options, input: arg.slice("--input=".length) };
    if (arg.startsWith("--input-env=")) return { ...options, inputEnv: arg.slice("--input-env=".length) };
    if (arg.startsWith("--input-default=")) return { ...options, inputDefault: arg.slice("--input-default=".length) };
    if (arg.startsWith("--output=")) return { ...options, output: arg.slice("--output=".length) };
    if (arg.startsWith("--output-env=")) return { ...options, outputEnv: arg.slice("--output-env=".length) };
    if (arg.startsWith("--output-default=")) return { ...options, outputDefault: arg.slice("--output-default=".length) };
    return options;
  }, {
    json: false,
    strict: false,
    input: "",
    inputEnv: "",
    inputDefault: "",
    output: "",
    outputEnv: "",
    outputDefault: "",
  });
}

const options = parseArgs(process.argv.slice(2));

function webappPath(value) {
  if (!value) return "";
  return path.isAbsolute(value) ? value : path.join(webappDir, value);
}

function configuredPath(value, envName, defaultValue) {
  return webappPath(value || (envName ? process.env[envName] : "") || defaultValue);
}

function isObject(value) {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function issueIf(issues, condition, message) {
  if (condition) issues.push(message);
}

function hasProofSaveUrl(value) {
  try {
    const url = new URL(value);
    return url.pathname === "/install.html" && url.hash === "#iosInstallProofSaveButton";
  } catch {
    return false;
  }
}

function validateIosEvidenceFreshness(issues, freshness) {
  issueIf(issues, !isObject(freshness), "iosEvidenceFreshness must be an object");
  if (!isObject(freshness)) return;
  issueIf(issues, !Number.isInteger(freshness.staleAfterHours) || freshness.staleAfterHours < 1, "iosEvidenceFreshness.staleAfterHours must be a positive integer");
  issueIf(issues, freshness.staleAfterEnvVar !== IOS_EVIDENCE_STALE_AFTER_ENV_VAR, `iosEvidenceFreshness.staleAfterEnvVar must be ${IOS_EVIDENCE_STALE_AFTER_ENV_VAR}`);
}

function validateReport(issues, name, report) {
  issueIf(issues, !isObject(report), `reports.${name} must be an object`);
  if (!isObject(report)) return;
  issueIf(issues, report.label !== name, `reports.${name}.label must be ${name}`);
  issueIf(issues, typeof report.path !== "string", `reports.${name}.path must be a string`);
  issueIf(issues, !["missing", "ok", "present", "invalid-json"].includes(report.state), `reports.${name}.state is invalid`);
  issueIf(issues, typeof report.ok !== "boolean", `reports.${name}.ok must be a boolean`);
  issueIf(issues, typeof report.summary !== "string" || report.summary.length === 0, `reports.${name}.summary must be a non-empty string`);
  if ("proofSaveHash" in report) issueIf(issues, typeof report.proofSaveHash !== "string", `reports.${name}.proofSaveHash must be a string when present`);
  if ("proofSaveTargetId" in report) issueIf(issues, typeof report.proofSaveTargetId !== "string", `reports.${name}.proofSaveTargetId must be a string when present`);
  if ("proofSaveUrl" in report) issueIf(issues, typeof report.proofSaveUrl !== "string", `reports.${name}.proofSaveUrl must be a string when present`);
  if ("displayMode" in report) issueIf(issues, typeof report.displayMode !== "string", `reports.${name}.displayMode must be a string when present`);
  if ("appModeState" in report) issueIf(issues, typeof report.appModeState !== "string", `reports.${name}.appModeState must be a string when present`);
  if ("appModeTitle" in report) issueIf(issues, typeof report.appModeTitle !== "string", `reports.${name}.appModeTitle must be a string when present`);
  if ("appModeDetail" in report) issueIf(issues, typeof report.appModeDetail !== "string", `reports.${name}.appModeDetail must be a string when present`);
}

function validateSummary(summary) {
  const issues = [];
  issueIf(issues, !isObject(summary), "summary must be an object");
  if (!isObject(summary)) return issues;

  issueIf(issues, summary.schemaVersion !== 1, "schemaVersion must be 1");
  issueIf(issues, typeof summary.generatedAt !== "string" || Number.isNaN(Date.parse(summary.generatedAt)), "generatedAt must be an ISO timestamp string");
  issueIf(issues, !["complete", "incomplete"].includes(summary.status), "status must be complete or incomplete");
  ["runbookReady", "strictReady", "launchProofSaved", "launchProofReady", "launchProofAppModeReady", "proofReady"].forEach((field) => {
    issueIf(issues, typeof summary[field] !== "boolean", `${field} must be a boolean`);
  });
  issueIf(issues, typeof summary.nextStep !== "string" || summary.nextStep.length === 0, "nextStep must be a non-empty string");
  issueIf(issues, summary.finalEvidenceCommand !== "npm run ios:install:evidence:after-phone:final", "finalEvidenceCommand must be npm run ios:install:evidence:after-phone:final");
  issueIf(issues, summary.proofSaveHash !== "#iosInstallProofSaveButton", "proofSaveHash must be #iosInstallProofSaveButton");
  issueIf(issues, summary.proofSaveTargetId !== "iosInstallProofSaveButton", "proofSaveTargetId must be iosInstallProofSaveButton");
  issueIf(issues, !hasProofSaveUrl(summary.proofSaveUrl), "proofSaveUrl must point to /install.html#iosInstallProofSaveButton");
  validateIosEvidenceFreshness(issues, summary.iosEvidenceFreshness);
  issueIf(issues, !isObject(summary.reports), "reports must be an object");

  const reportNames = ["runbook", "strict", "launchProof", "launchProofCheck", "proof"];
  if (isObject(summary.reports)) {
    reportNames.forEach((name) => validateReport(issues, name, summary.reports[name]));
  }

  const computedComplete = summary.runbookReady
    && summary.strictReady
    && summary.launchProofSaved
    && summary.launchProofReady
    && summary.launchProofAppModeReady
    && summary.proofReady;
  issueIf(issues, summary.status === "complete" && !computedComplete, "status=complete requires every ready flag to be true");
  issueIf(issues, summary.status === "incomplete" && computedComplete, "status=incomplete contradicts ready flags");

  return issues;
}

function writeOutput(filePath, body) {
  if (!filePath) return;
  mkdirSync(path.dirname(filePath), { recursive: true });
  writeFileSync(filePath, body, "utf8");
  console.error(`ios-install-summary-check=${filePath}`);
}

function main() {
  const inputPath = configuredPath(
    options.input,
    options.inputEnv || "TRAVEL_IOS_INSTALL_SUMMARY_PATH",
    options.inputDefault || "reports/ios-install-summary.json",
  );
  const outputPath = configuredPath(
    options.output,
    options.outputEnv,
    options.outputDefault,
  );
  let summary = null;
  let readError = "";
  let readStatus = "";
  try {
    summary = JSON.parse(readFileSync(inputPath, "utf8"));
  } catch (error) {
    readError = error.message;
    readStatus = error.code === "ENOENT" ? "missing" : "invalid-json";
  }
  const issues = readError ? [`failed to read summary: ${readError}`] : validateSummary(summary);
  const status = readStatus || (issues.length ? "invalid" : "ready");
  const result = {
    schemaVersion: 1,
    ok: issues.length === 0,
    status,
    summary: status === "ready"
      ? "Saved iPhone install summary is valid."
      : "Saved iPhone install summary is not a valid completion contract.",
    inputPath,
    summaryGeneratedAt: summary?.generatedAt || "",
    summaryStatus: summary?.status || "",
    nextStep: summary?.nextStep || "",
    launchProofAppModeReady: summary?.launchProofAppModeReady === true,
    launchProofAppModeState: summary?.reports?.launchProof?.appModeState || summary?.reports?.launchProofCheck?.appModeState || "",
    proofSaveHash: summary?.proofSaveHash || "",
    proofSaveTargetId: summary?.proofSaveTargetId || "",
    proofSaveUrl: summary?.proofSaveUrl || "",
    expectedFinalEvidenceCommand: "npm run ios:install:evidence:after-phone:final",
    finalEvidenceCommand: summary?.finalEvidenceCommand || "",
    iosEvidenceFreshness: isObject(summary?.iosEvidenceFreshness) ? summary.iosEvidenceFreshness : {
      staleAfterHours: 0,
      staleAfterEnvVar: "",
    },
    issues,
  };
  const output = `${JSON.stringify(result, null, 2)}\n`;
  writeOutput(outputPath, output);

  if (options.json) {
    console.log(output.trimEnd());
  } else {
    console.log("Travel Planner iPhone install summary check");
    console.log(`status=${result.status}`);
    console.log(`summary=${result.summary}`);
    console.log(`inputPath=${result.inputPath}`);
    console.log(`summaryGeneratedAt=${result.summaryGeneratedAt}`);
    console.log(`summaryStatus=${result.summaryStatus}`);
    console.log(`nextStep=${result.nextStep}`);
    console.log(`proofSaveHash=${result.proofSaveHash}`);
    console.log(`proofSaveTargetId=${result.proofSaveTargetId}`);
    console.log(`proofSaveUrl=${result.proofSaveUrl}`);
    console.log(`expectedFinalEvidenceCommand=${result.expectedFinalEvidenceCommand}`);
    console.log(`finalEvidenceCommand=${result.finalEvidenceCommand}`);
    console.log(`iosEvidenceFreshnessStaleAfterHours=${result.iosEvidenceFreshness.staleAfterHours}`);
    console.log(`iosEvidenceFreshnessStaleAfterEnvVar=${result.iosEvidenceFreshness.staleAfterEnvVar}`);
    if (issues.length) issues.forEach((issue) => console.log(`issue=${issue}`));
  }

  if (options.strict && issues.length) {
    console.error("ios-install-summary-check=failed");
    process.exitCode = 1;
  } else if (options.strict) {
    console.error("ios-install-summary-check=passed");
  }
}

main();
