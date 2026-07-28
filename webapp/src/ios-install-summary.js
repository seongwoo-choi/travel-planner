#!/usr/bin/env node

import { config as loadEnv } from "dotenv";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { buildIosEvidenceFreshnessPolicy } from "./ios-evidence-freshness.js";

const webappDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
loadEnv({ path: path.join(webappDir, ".env") });

function parseArgs(args) {
  return args.reduce((options, arg) => {
    if (arg === "--json") return { ...options, json: true };
    if (arg === "--require-complete") return { ...options, requireComplete: true };
    if (arg.startsWith("--output=")) return { ...options, output: arg.slice("--output=".length) };
    if (arg.startsWith("--output-env=")) return { ...options, outputEnv: arg.slice("--output-env=".length) };
    if (arg.startsWith("--output-default=")) return { ...options, outputDefault: arg.slice("--output-default=".length) };
    return options;
  }, {
    json: false,
    requireComplete: false,
    output: "",
    outputEnv: "",
    outputDefault: "",
  });
}

const options = parseArgs(process.argv.slice(2));
const IOS_EVIDENCE_FRESHNESS_POLICY = buildIosEvidenceFreshnessPolicy(process.env);

function reportPath(value) {
  if (!value) return "";
  return path.isAbsolute(value) ? value : path.join(webappDir, value);
}

function resolveOutputPath() {
  const configured = options.output
    || (options.outputEnv ? process.env[options.outputEnv] : "")
    || options.outputDefault;
  return reportPath(configured);
}

function writeOutputFile(outputPath, body) {
  if (!outputPath) return;
  mkdirSync(path.dirname(outputPath), { recursive: true });
  writeFileSync(outputPath, body, "utf8");
  console.error(`ios-install-summary=${outputPath}`);
}

function readJsonReport(label, value) {
  const resolvedPath = reportPath(value);
  if (!resolvedPath || !existsSync(resolvedPath)) {
    return {
      label,
      path: resolvedPath,
      state: "missing",
      ok: false,
      summary: "missing",
    };
  }
  try {
    const data = JSON.parse(readFileSync(resolvedPath, "utf8"));
    const ok = data.ok === true
      || data.saved === true
      || data.status === "ready"
      || data.status === "ok"
      || data.valid === true;
    return {
      label,
      path: resolvedPath,
      state: ok ? "ok" : "present",
      ok,
      status: data.status || "",
      readinessMode: data.readinessMode || "",
      handoffReady: data.handoffReady === true,
      launchProofOk: data.launchProofCheckOk === true || data.launchProofOk === true,
      proofSaveHash: data.proofSaveHash || "",
      proofSaveTargetId: data.proofSaveTargetId || "",
      proofSaveUrl: data.proofSaveUrl || "",
      saved: data.saved === true,
      standalone: data.standalone === true,
      displayMode: data.displayMode || "",
      appModeState: data.appModeState || "",
      appModeTitle: data.appModeTitle || "",
      appModeDetail: data.appModeDetail || "",
      capturedAt: data.capturedAt || "",
      savedAt: data.savedAt || "",
      summary: data.summary || data.status || (ok ? "ok" : "present"),
    };
  } catch (error) {
    return {
      label,
      path: resolvedPath,
      state: "invalid-json",
      ok: false,
      summary: error.message,
    };
  }
}

function buildSummary() {
  const reports = {
    runbook: readJsonReport("runbook", process.env.TRAVEL_IOS_INSTALL_RUNBOOK_CHECK_PATH || "reports/ios-install-runbook-check.json"),
    strict: readJsonReport("strict", process.env.TRAVEL_IOS_INSTALL_CHECK_STRICT_PATH || "reports/ios-install-check.strict.json"),
    launchProof: readJsonReport("launchProof", process.env.TRAVEL_IOS_LAUNCH_PROOF_PATH || "reports/ios-launch-proof.json"),
    launchProofCheck: readJsonReport("launchProofCheck", process.env.TRAVEL_IOS_LAUNCH_PROOF_CHECK_PATH || "reports/ios-launch-proof-check.json"),
    proof: readJsonReport("proof", process.env.TRAVEL_IOS_INSTALL_CHECK_PROOF_PATH || "reports/ios-install-check.proof.json"),
  };
  const finalEvidenceCommand = "npm run ios:install:evidence:after-phone:final";

  const runbookReady = reports.runbook.ok;
  const strictReady = reports.strict.ok && reports.strict.handoffReady;
  const launchProofSaved = reports.launchProof.ok || reports.launchProof.saved || reports.launchProof.standalone;
  const launchProofReady = reports.launchProofCheck.ok || reports.launchProofCheck.standalone;
  const launchProofAppModeReady = reports.launchProof.appModeState === "standalone" || reports.launchProofCheck.appModeState === "standalone";
  const proofReady = reports.proof.ok && reports.proof.handoffReady && reports.proof.launchProofOk;
  const complete = runbookReady && strictReady && launchProofSaved && launchProofReady && launchProofAppModeReady && proofReady;
  const proofSaveHash = reports.proof.proofSaveHash || reports.strict.proofSaveHash || reports.runbook.proofSaveHash || "";
  const proofSaveTargetId = reports.proof.proofSaveTargetId || reports.strict.proofSaveTargetId || reports.runbook.proofSaveTargetId || "";
  const proofSaveUrl = reports.proof.proofSaveUrl || reports.strict.proofSaveUrl || reports.runbook.proofSaveUrl || "";
  const nextStep = !runbookReady
    ? "Run npm run ios:install:runbook:evidence."
    : !strictReady
      ? "Run npm run ios:install:evidence:before-phone."
    : !launchProofSaved
        ? "Install on iPhone, launch the Travel icon, and tap 설치 증거 저장."
        : !launchProofReady
          ? `Run ${finalEvidenceCommand}.`
        : !proofReady
          ? `Run ${finalEvidenceCommand}.`
          : "iPhone install evidence is complete.";

  return {
    schemaVersion: 1,
    generatedAt: new Date().toISOString(),
    status: complete ? "complete" : "incomplete",
    runbookReady,
    strictReady,
    launchProofSaved,
    launchProofReady,
    launchProofAppModeReady,
    proofReady,
    proofSaveHash,
    proofSaveTargetId,
    proofSaveUrl,
    nextStep,
    finalEvidenceCommand,
    iosEvidenceFreshness: {
      ...IOS_EVIDENCE_FRESHNESS_POLICY,
    },
    reports,
  };
}

const summary = buildSummary();

if (options.json) {
  const output = `${JSON.stringify(summary, null, 2)}\n`;
  writeOutputFile(resolveOutputPath(), output);
  console.log(output.trimEnd());
} else {
  console.log("Travel Planner iPhone install completion summary");
  console.log(`status=${summary.status}`);
  console.log(`runbookReady=${summary.runbookReady ? "true" : "false"}`);
  console.log(`strictReady=${summary.strictReady ? "true" : "false"}`);
  console.log(`launchProofSaved=${summary.launchProofSaved ? "true" : "false"}`);
  console.log(`launchProofReady=${summary.launchProofReady ? "true" : "false"}`);
  console.log(`launchProofAppModeReady=${summary.launchProofAppModeReady ? "true" : "false"}`);
  console.log(`launchProofAppModeState=${summary.reports.launchProof.appModeState || summary.reports.launchProofCheck.appModeState || ""}`);
  console.log(`proofReady=${summary.proofReady ? "true" : "false"}`);
  console.log(`proofSaveHash=${summary.proofSaveHash}`);
  console.log(`proofSaveTargetId=${summary.proofSaveTargetId}`);
  console.log(`proofSaveUrl=${summary.proofSaveUrl}`);
  console.log(`iosEvidenceFreshnessStaleAfterHours=${summary.iosEvidenceFreshness.staleAfterHours}`);
  console.log(`iosEvidenceFreshnessStaleAfterEnvVar=${summary.iosEvidenceFreshness.staleAfterEnvVar}`);
  console.log(`nextStep=${summary.nextStep}`);
  console.log(`finalEvidenceCommand=${summary.finalEvidenceCommand}`);
  for (const report of Object.values(summary.reports)) {
    console.log(`${report.label}Report=${report.state} ${report.path || "(not configured)"}`);
  }
}

if (options.requireComplete) {
  if (summary.status !== "complete") {
    console.error("ios-install-summary=failed");
    console.error(`nextStep=${summary.nextStep}`);
    process.exitCode = 1;
  } else {
    console.error("ios-install-summary=passed");
  }
}
