#!/usr/bin/env node

import { config as loadEnv } from "dotenv";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const webappDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
loadEnv({ path: path.join(webappDir, ".env") });

function parseArgs(args) {
  return args.reduce((options, arg) => {
    if (arg === "--json") return { ...options, json: true };
    if (arg.startsWith("--input=")) return { ...options, input: arg.slice("--input=".length) };
    if (arg.startsWith("--input-env=")) return { ...options, inputEnv: arg.slice("--input-env=".length) };
    if (arg.startsWith("--input-default=")) return { ...options, inputDefault: arg.slice("--input-default=".length) };
    if (arg.startsWith("--output=")) return { ...options, output: arg.slice("--output=".length) };
    if (arg.startsWith("--output-env=")) return { ...options, outputEnv: arg.slice("--output-env=".length) };
    if (arg.startsWith("--output-default=")) return { ...options, outputDefault: arg.slice("--output-default=".length) };
    return options;
  }, {
    json: false,
    input: "",
    inputEnv: "",
    inputDefault: "reports/ios-install-handoff.md",
    output: "",
    outputEnv: "",
    outputDefault: "",
  });
}

function webappPath(value) {
  if (!value) return "";
  return path.isAbsolute(value) ? value : path.join(webappDir, value);
}

function escapeRegex(value) {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function labeledUrl(text, label) {
  const match = text.match(new RegExp(`^${escapeRegex(label)}:\\s*(\\S+)\\s*$`, "m"));
  return match ? match[1] : "";
}

function hasUrlPathAndHash(value, pathname, hash) {
  try {
    const url = new URL(value);
    return url.pathname === pathname && url.hash === hash;
  } catch {
    return false;
  }
}

function checkHandoff(inputPath) {
  const result = {
    schemaVersion: 1,
    ok: false,
    status: "error",
    inputPath,
    proofSaveHash: "",
    proofSaveTargetId: "",
    proofSaveUrl: "",
    postInstallAppHomeUrl: "",
    postInstallNewPlanUrl: "",
    handoffSessionEvidenceCommand: "",
    handoffSessionEvidenceTerminalCommand: "",
    issues: [],
  };

  if (!existsSync(inputPath)) {
    result.issues.push(`missing input: ${inputPath}`);
    return result;
  }

  const text = readFileSync(inputPath, "utf8");
  result.proofSaveHash = labeledUrl(text, "Proof save hash");
  result.proofSaveTargetId = labeledUrl(text, "Proof save target id");
  result.proofSaveUrl = labeledUrl(text, "Proof save URL");
  result.postInstallAppHomeUrl = labeledUrl(text, "Post-install app home URL");
  result.postInstallNewPlanUrl = labeledUrl(text, "Post-install new-plan URL");
  result.handoffSessionEvidenceCommand = labeledUrl(text, "Handoff/session evidence command");
  result.handoffSessionEvidenceTerminalCommand = labeledUrl(text, "Handoff/session evidence terminal command");

  if (result.proofSaveHash !== "#iosInstallProofSaveButton") {
    result.issues.push("Proof save hash must be #iosInstallProofSaveButton");
  }
  if (result.proofSaveTargetId !== "iosInstallProofSaveButton") {
    result.issues.push("Proof save target id must be iosInstallProofSaveButton");
  }
  if (!hasUrlPathAndHash(result.proofSaveUrl, "/install.html", "#iosInstallProofSaveButton")) {
    result.issues.push("Proof save URL must point to /install.html#iosInstallProofSaveButton");
  }
  if (!hasUrlPathAndHash(result.postInstallAppHomeUrl, "/", "#iosHomeDock")) {
    result.issues.push("Post-install app home URL must point to /#iosHomeDock");
  }
  if (!hasUrlPathAndHash(result.postInstallNewPlanUrl, "/", "#planForm")) {
    result.issues.push("Post-install new-plan URL must point to /#planForm");
  }
  if (result.handoffSessionEvidenceCommand !== "npm run ios:install:handoff-session:evidence") {
    result.issues.push("Handoff/session evidence command must run ios:install:handoff-session:evidence");
  }
  if (result.handoffSessionEvidenceTerminalCommand !== "test -d webapp && cd webapp; npm run ios:install:handoff-session:evidence") {
    result.issues.push("Handoff/session evidence terminal command must be paste-ready from repo root or webapp");
  }

  result.ok = result.issues.length === 0;
  result.status = result.ok ? "ready" : "blocked";
  return result;
}

function renderText(result) {
  return [
    `ok=${result.ok ? "true" : "false"}`,
    `status=${result.status}`,
    `inputPath=${result.inputPath}`,
    `proofSaveHash=${result.proofSaveHash}`,
    `proofSaveTargetId=${result.proofSaveTargetId}`,
    `proofSaveUrl=${result.proofSaveUrl}`,
    `postInstallAppHomeUrl=${result.postInstallAppHomeUrl}`,
    `postInstallNewPlanUrl=${result.postInstallNewPlanUrl}`,
    `handoffSessionEvidenceCommand=${result.handoffSessionEvidenceCommand}`,
    `handoffSessionEvidenceTerminalCommand=${result.handoffSessionEvidenceTerminalCommand}`,
    `issueCount=${result.issues.length}`,
    ...result.issues.map((issue) => `issue=${issue}`),
  ].join("\n");
}

const options = parseArgs(process.argv.slice(2));
const inputPath = webappPath(
  options.input
    || (options.inputEnv ? process.env[options.inputEnv] : "")
    || options.inputDefault,
);
const outputPath = webappPath(
  options.output
    || (options.outputEnv ? process.env[options.outputEnv] : "")
    || options.outputDefault,
);
const result = checkHandoff(inputPath);

if (outputPath) {
  mkdirSync(path.dirname(outputPath), { recursive: true });
  writeFileSync(outputPath, `${JSON.stringify(result, null, 2)}\n`);
}

console.log(options.json ? JSON.stringify(result, null, 2) : renderText(result));

if (!result.ok) process.exitCode = 1;
