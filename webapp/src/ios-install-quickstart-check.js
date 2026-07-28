#!/usr/bin/env node

import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const webappDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const args = process.argv.slice(2);
const jsonOutput = args.includes("--json");
const strict = args.includes("--strict");

function valueAfterEquals(name) {
  const arg = args.find((item) => item.startsWith(`${name}=`));
  return arg ? arg.slice(name.length + 1) : "";
}

function webappPath(value) {
  if (!value) return "";
  return path.isAbsolute(value) ? value : path.join(webappDir, value);
}

function configuredPath(value, envName, defaultValue) {
  return webappPath(value || (envName ? process.env[envName] : "") || defaultValue);
}

function issueIf(issues, condition, message) {
  if (condition) issues.push(message);
}

function hasUrlPathAndHash(value, pathname, hash) {
  try {
    const url = new URL(value);
    return url.pathname === pathname && url.hash === hash;
  } catch {
    return false;
  }
}

function hasUrlPath(value, pathname) {
  try {
    return new URL(value).pathname === pathname;
  } catch {
    return false;
  }
}

function urlOrigin(value) {
  try {
    return new URL(value).origin;
  } catch {
    return "";
  }
}

function validateQuickstart(quickstart) {
  const issues = [];
  const recoveryHints = Array.isArray(quickstart?.recoveryHints) ? quickstart.recoveryHints : [];
  const recoveryText = recoveryHints.join(" ");
  const expectedOrigin = typeof quickstart?.origin === "string" ? quickstart.origin : "";
  const installOrigin = urlOrigin(quickstart?.installUrl);
  const sameOriginUrls = [
    ["installUrl", quickstart?.installUrl],
    ["shortInstallUrl", quickstart?.shortInstallUrl],
    ["proofSaveUrl", quickstart?.proofSaveUrl],
    ["postInstallAppHomeUrl", quickstart?.postInstallAppHomeUrl],
    ["postInstallNewPlanUrl", quickstart?.postInstallNewPlanUrl],
    ["completionStatusUrl", quickstart?.completionStatusUrl],
  ];
  issueIf(issues, quickstart?.schemaVersion !== 1, "schemaVersion must be 1");
  issueIf(issues, quickstart?.title !== "Travel Planner iPhone install quickstart", "title must identify the iPhone install quickstart");
  issueIf(issues, !expectedOrigin, "origin must be present");
  issueIf(issues, expectedOrigin && installOrigin && installOrigin !== expectedOrigin, "installUrl origin must match origin");
  for (const [field, value] of sameOriginUrls) {
    const origin = urlOrigin(value);
    issueIf(issues, !origin, `${field} must be an absolute URL`);
    issueIf(issues, expectedOrigin && origin && origin !== expectedOrigin, `${field} origin must match origin`);
  }
  issueIf(issues, !hasUrlPath(quickstart?.installUrl, "/install.html"), "installUrl must point to /install.html");
  issueIf(issues, !hasUrlPath(quickstart?.shortInstallUrl, "/i"), "shortInstallUrl must point to /i");
  issueIf(issues, quickstart?.proofSaveHash !== "#iosInstallProofSaveButton", "proofSaveHash must be #iosInstallProofSaveButton");
  issueIf(issues, quickstart?.proofSaveTargetId !== "iosInstallProofSaveButton", "proofSaveTargetId must be iosInstallProofSaveButton");
  issueIf(issues, !hasUrlPathAndHash(quickstart?.proofSaveUrl, "/install.html", "#iosInstallProofSaveButton"), "proofSaveUrl must point to /install.html#iosInstallProofSaveButton");
  issueIf(issues, !hasUrlPathAndHash(quickstart?.postInstallAppHomeUrl, "/", "#iosHomeDock"), "postInstallAppHomeUrl must point to /#iosHomeDock");
  issueIf(issues, !hasUrlPathAndHash(quickstart?.postInstallNewPlanUrl, "/", "#planForm"), "postInstallNewPlanUrl must point to /#planForm");
  issueIf(issues, !hasUrlPath(quickstart?.completionStatusUrl, "/ios-install-status"), "completionStatusUrl must point to /ios-install-status");
  issueIf(issues, quickstart?.commands?.prepare !== "npm run ios:install:prepare", "commands.prepare must be npm run ios:install:prepare");
  issueIf(issues, quickstart?.commands?.status !== "npm run ios:install:status", "commands.status must be npm run ios:install:status");
  issueIf(issues, quickstart?.commands?.finish !== "npm run ios:install:finish", "commands.finish must be npm run ios:install:finish");
  issueIf(issues, !Array.isArray(quickstart?.steps) || quickstart.steps.length < 7, "steps must include the full iPhone install path");
  issueIf(issues, recoveryHints.length < 4, "recoveryHints must include the common iPhone install blockers");
  issueIf(issues, !recoveryText.includes("Safari"), "recoveryHints must mention Safari recovery");
  issueIf(issues, !recoveryText.includes("Add to Home Screen"), "recoveryHints must mention Add to Home Screen recovery");
  issueIf(issues, !recoveryText.includes("localhost"), "recoveryHints must mention localhost recovery");
  issueIf(issues, !recoveryText.includes("Travel icon"), "recoveryHints must mention launching the Travel icon");
  issueIf(issues, typeof quickstart?.readinessNote !== "string" || quickstart.readinessNote.length === 0, "readinessNote must be present");
  issueIf(issues, typeof quickstart?.completionRule !== "string" || !quickstart.completionRule.includes("Home Screen proof"), "completionRule must mention Home Screen proof");
  return issues;
}

function writeOutput(outputPath, body) {
  if (!outputPath) return;
  mkdirSync(path.dirname(outputPath), { recursive: true });
  writeFileSync(outputPath, body, "utf8");
  console.error(`ios-install-quickstart-check=${outputPath}`);
}

const inputPath = configuredPath(
  valueAfterEquals("--input"),
  valueAfterEquals("--input-env") || "TRAVEL_IOS_INSTALL_QUICKSTART_JSON_PATH",
  valueAfterEquals("--input-default") || "reports/ios-install-quickstart.json",
);
const outputPath = configuredPath(
  valueAfterEquals("--output"),
  valueAfterEquals("--output-env"),
  valueAfterEquals("--output-default"),
);

let quickstart = null;
let readError = "";
let status = "ready";
if (!existsSync(inputPath)) {
  readError = `missing input: ${inputPath}`;
  status = "missing";
} else {
  try {
    quickstart = JSON.parse(readFileSync(inputPath, "utf8"));
  } catch (error) {
    readError = error.message;
    status = "invalid-json";
  }
}

const issues = readError ? [readError] : validateQuickstart(quickstart);
if (!readError && issues.length) status = "invalid";

const result = {
  schemaVersion: 1,
  ok: issues.length === 0,
  status,
  summary: issues.length ? "iOS install quickstart is not a valid operator handoff." : "iOS install quickstart is valid.",
  inputPath,
  urlOrigin: quickstart?.origin || urlOrigin(quickstart?.installUrl),
  urlSameOrigin: !issues.some((issue) => issue.includes("origin must")),
  proofSaveHash: quickstart?.proofSaveHash || "",
  proofSaveTargetId: quickstart?.proofSaveTargetId || "",
  proofSaveUrl: quickstart?.proofSaveUrl || "",
  postInstallAppHomeUrl: quickstart?.postInstallAppHomeUrl || "",
  postInstallNewPlanUrl: quickstart?.postInstallNewPlanUrl || "",
  completionStatusUrl: quickstart?.completionStatusUrl || "",
  prepareCommand: quickstart?.commands?.prepare || "",
  statusCommand: quickstart?.commands?.status || "",
  finishCommand: quickstart?.commands?.finish || "",
  stepCount: Array.isArray(quickstart?.steps) ? quickstart.steps.length : 0,
  recoveryHintCount: Array.isArray(quickstart?.recoveryHints) ? quickstart.recoveryHints.length : 0,
  issues,
};

const body = jsonOutput ? `${JSON.stringify(result, null, 2)}\n` : [
  `ok=${result.ok ? "true" : "false"}`,
  `status=${result.status}`,
  `summary=${result.summary}`,
  `inputPath=${result.inputPath}`,
  `urlOrigin=${result.urlOrigin}`,
  `urlSameOrigin=${result.urlSameOrigin ? "true" : "false"}`,
  `proofSaveHash=${result.proofSaveHash}`,
  `proofSaveTargetId=${result.proofSaveTargetId}`,
  `proofSaveUrl=${result.proofSaveUrl}`,
  `postInstallAppHomeUrl=${result.postInstallAppHomeUrl}`,
  `postInstallNewPlanUrl=${result.postInstallNewPlanUrl}`,
  `completionStatusUrl=${result.completionStatusUrl}`,
  `prepareCommand=${result.prepareCommand}`,
  `statusCommand=${result.statusCommand}`,
  `finishCommand=${result.finishCommand}`,
  `stepCount=${result.stepCount}`,
  `recoveryHintCount=${result.recoveryHintCount}`,
  ...result.issues.map((issue) => `issue=${issue}`),
].join("\n") + "\n";

writeOutput(outputPath, body);
process.stdout.write(body);
if (strict && issues.length) process.exitCode = 1;
