#!/usr/bin/env node

import { config as loadEnv } from "dotenv";
import { mkdirSync, renameSync, rmSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const webappDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
loadEnv({ path: path.join(webappDir, ".env") });

const args = process.argv.slice(2);
const jsonOutput = args.includes("--json");
const evidenceDir = process.env.TRAVEL_EVIDENCE_DIR || "reports";
const PROTECTED_ACCESS_KEY_HANDLING = {
  placeholder: "YOUR_TRAVEL_ACCESS_KEY",
  localCompositionOnly: true,
  storesEnteredKey: false,
  sendsEnteredKeyToServer: false,
  clearsTemporaryInputAfterCopy: true,
};
const outputArg = args.find((arg) => arg.startsWith("--output="));
const outputEnvArg = args.find((arg) => arg.startsWith("--output-env="));
const outputDefaultArg = args.find((arg) => arg.startsWith("--output-default="));
const outputDefaultEvidenceArg = args.find((arg) => arg.startsWith("--output-default-evidence="));
const outputEnvName = outputEnvArg ? outputEnvArg.slice("--output-env=".length) : "";
const outputDefaultPath = outputDefaultArg ? outputDefaultArg.slice("--output-default=".length) : "";
const outputDefaultEvidencePath = outputDefaultEvidenceArg
  ? path.join(evidenceDir, outputDefaultEvidenceArg.slice("--output-default-evidence=".length))
  : "";
const outputPath = outputArg
  ? outputArg.slice("--output=".length)
  : outputEnvName
    ? process.env[outputEnvName] || outputDefaultPath || outputDefaultEvidencePath
    : outputDefaultPath || outputDefaultEvidencePath;
const port = Number(process.env.PORT || 3000);

function resolveOutputPath(value) {
  if (!value) return "";
  return path.isAbsolute(value) ? value : path.join(webappDir, value);
}

function writeAtomic(filePath, body) {
  const resolvedPath = resolveOutputPath(filePath);
  const tempPath = `${resolvedPath}.tmp-${process.pid}`;
  try {
    mkdirSync(path.dirname(resolvedPath), { recursive: true });
    writeFileSync(tempPath, body, "utf8");
    renameSync(tempPath, resolvedPath);
    console.error(`ios-install-runbook=${resolvedPath}`);
  } catch (error) {
    rmSync(tempPath, { force: true });
    console.error(`ios-install-runbook=failed (${error.message})`);
    process.exit(1);
  }
}

function localNetworkOrigins() {
  return Object.values(os.networkInterfaces())
    .flatMap((entries) => entries || [])
    .filter((entry) => entry && entry.family === "IPv4" && !entry.internal)
    .map((entry) => `http://${entry.address}:${port}`);
}

function normalizePublicOrigin(origin) {
  if (!origin) return "";
  try {
    const url = new URL(origin);
    if (!["http:", "https:"].includes(url.protocol)) return "";
    url.pathname = "";
    url.search = "";
    url.hash = "";
    return url.toString().replace(/\/$/, "");
  } catch {
    return "";
  }
}

function accessKeyTemplateUrl(url) {
  const target = new URL(url);
  target.searchParams.set("travelAccessKey", "YOUR_TRAVEL_ACCESS_KEY");
  return target.toString();
}

function buildRunbook() {
  const localOrigin = `http://localhost:${port}`;
  const lanOrigins = localNetworkOrigins();
  const publicOrigin = normalizePublicOrigin(process.env.TRAVEL_PLANNER_PUBLIC_ORIGIN);
  const publicOriginIsHttps = publicOrigin.startsWith("https://");
  const recommendedOrigin = publicOriginIsHttps ? publicOrigin : lanOrigins[0] || localOrigin;
  const recommendedInstallUrl = `${recommendedOrigin}/install.html`;
  const recommendedShortInstallUrl = `${recommendedOrigin}/i`;
  const deploymentMode = publicOriginIsHttps
    ? "stable-https"
    : publicOrigin
      ? "public-origin-not-https"
      : "local-same-wifi-rehearsal";

  return {
    schemaVersion: 1,
    generatedAt: new Date().toISOString(),
    port,
    deploymentMode,
    publicOrigin,
    publicOriginIsHttps,
    localOrigin,
    lanOrigins,
    recommendedInstallUrl,
    recommendedShortInstallUrl,
    protectedRecommendedInstallUrlTemplate: accessKeyTemplateUrl(recommendedInstallUrl),
    protectedRecommendedShortInstallUrlTemplate: accessKeyTemplateUrl(recommendedShortInstallUrl),
    protectedInstallAccessKeyHandling: PROTECTED_ACCESS_KEY_HANDLING,
    nextStepUrl: `${recommendedOrigin}/api/ios-install-next`,
    nextStepTextUrl: `${recommendedOrigin}/api/ios-install-next.txt`,
    proofSaveHash: "#iosInstallProofSaveButton",
    proofSaveTargetId: "iosInstallProofSaveButton",
    proofSaveUrl: `${recommendedOrigin}/install.html#iosInstallProofSaveButton`,
    installInfoUrl: `${recommendedOrigin}/api/install-info.txt`,
    handoffNoteUrl: `${recommendedOrigin}/api/ios-install-handoff.txt`,
    proofSummaryUrl: `${recommendedOrigin}/api/ios-launch-proof.txt`,
    nextActionContract: {
      phoneFirstField: "phoneFirst",
      nextCommandLabelField: "nextCommandLabel",
      nextCommandPrerequisiteField: "nextCommandPrerequisite",
      finalGateCommand: "npm run ios:install:evidence:after-phone:final",
      finalGateTerminalCommand: "test -d webapp && cd webapp; npm run ios:install:evidence:after-phone:final",
    },
    phases: [
      {
        id: "prepare",
        title: "Prepare install URL",
        goal: "Confirm the iPhone should open the recommended install URL in Safari.",
        commands: [
          "npm run ios:install:urls",
          "npm run ios:install:next",
          "npm run ios:install:next:evidence",
          "npm run ios:install:handoff:file",
          "npm run ios:install:handoff:evidence",
          "npm run ios:install:handoff-session:evidence",
          "npm start",
        ],
        phoneSteps: [
          `Open ${recommendedInstallUrl} on iPhone Safari, or type ${recommendedShortInstallUrl}.`,
        ],
      },
      {
        id: "pre-install-evidence",
        title: "Capture pre-install evidence",
        goal: "Prove the recommended URL is HTTPS-ready and QR handoff is reachable before installing.",
        commands: [
          "npm run ios:install:evidence:before-phone",
          "npm run ios:install:evidence:preinstall",
          "npm run ios:install:evidence:strict",
        ],
        terminalCommands: [
          "test -d webapp && cd webapp; npm run ios:install:evidence:before-phone",
          "test -d webapp && cd webapp; npm run ios:install:evidence:preinstall",
        ],
        phoneSteps: [
          "Scan the QR card from the desktop install page if typing or sharing the URL is inconvenient.",
        ],
      },
      {
        id: "phone-install",
        title: "Install on iPhone",
        goal: "Add Travel Planner to the Home Screen and launch it from the Travel icon.",
        commands: [],
        phoneSteps: [
          "Tap the Safari share button.",
          "Choose Add to Home Screen.",
          "Tap Add.",
          "Launch the Travel icon from the Home Screen.",
          `Open ${recommendedOrigin}/install.html#iosInstallProofSaveButton if the proof button is not visible.`,
          "Tap 설치 증거 저장 in the installed app.",
        ],
      },
      {
        id: "post-install-evidence",
        title: "Capture post-install evidence",
        goal: "Prove the installed Home Screen app saved launch proof from the expected origin.",
        commands: [
          "npm run ios:install:evidence:after-phone",
          "npm run ios:install:evidence:postinstall",
          "npm run ios:install:evidence:proof",
          "npm run ios:launch-proof:evidence",
        ],
        terminalCommands: [
          "test -d webapp && cd webapp; npm run ios:install:evidence:after-phone",
          "test -d webapp && cd webapp; npm run ios:install:evidence:postinstall",
        ],
        phoneSteps: [
          `Open ${recommendedOrigin}/api/ios-launch-proof.txt after saving proof if you want a readable summary.`,
        ],
      },
      {
        id: "completion-summary",
        title: "Summarize install completion",
        goal: "Read the saved evidence bundle and show whether any install step is still missing.",
        commands: [
          "npm run ios:install:summary",
          "npm run ios:install:summary:schema:file",
          "npm run ios:install:summary:file",
          "npm run ios:install:summary:gate",
          "npm run ios:install:summary:gate:file",
          "npm run ios:install:summary:evidence",
          "npm run ios:install:summary:check:file",
          "npm run ios:install:summary:check:schema:file",
          "npm run ios:install:summary:check:gate",
          "npm run ios:install:evidence:after-phone:final",
        ],
        terminalCommands: [
          "test -d webapp && cd webapp; npm run ios:install:summary:evidence",
          "test -d webapp && cd webapp; npm run ios:install:evidence:after-phone:final",
        ],
        phoneSteps: [],
      },
    ],
  };
}

function textRunbook(runbook) {
  const lines = [
    "# Travel Planner iPhone install runbook",
    "",
    `deploymentMode=${runbook.deploymentMode}`,
    `recommendedInstallUrl=${runbook.recommendedInstallUrl}`,
    `recommendedShortInstallUrl=${runbook.recommendedShortInstallUrl}`,
    `protectedRecommendedInstallUrlTemplate=${runbook.protectedRecommendedInstallUrlTemplate}`,
    `protectedRecommendedShortInstallUrlTemplate=${runbook.protectedRecommendedShortInstallUrlTemplate}`,
    `protectedInstallAccessKeyPlaceholder=${runbook.protectedInstallAccessKeyHandling.placeholder}`,
    `protectedInstallAccessKeyLocalCompositionOnly=${runbook.protectedInstallAccessKeyHandling.localCompositionOnly ? "true" : "false"}`,
    `protectedInstallAccessKeyStoresEnteredKey=${runbook.protectedInstallAccessKeyHandling.storesEnteredKey ? "true" : "false"}`,
    `protectedInstallAccessKeySendsEnteredKeyToServer=${runbook.protectedInstallAccessKeyHandling.sendsEnteredKeyToServer ? "true" : "false"}`,
    `protectedInstallAccessKeyClearsTemporaryInputAfterCopy=${runbook.protectedInstallAccessKeyHandling.clearsTemporaryInputAfterCopy ? "true" : "false"}`,
    `nextStepUrl=${runbook.nextStepUrl}`,
    `nextStepTextUrl=${runbook.nextStepTextUrl}`,
    `proofSaveHash=${runbook.proofSaveHash}`,
    `proofSaveTargetId=${runbook.proofSaveTargetId}`,
    `proofSaveUrl=${runbook.proofSaveUrl}`,
    `installInfoUrl=${runbook.installInfoUrl}`,
    `handoffNoteUrl=${runbook.handoffNoteUrl}`,
    `proofSummaryUrl=${runbook.proofSummaryUrl}`,
    `nextActionPhoneFirstField=${runbook.nextActionContract.phoneFirstField}`,
    `nextActionFinalGateCommand=${runbook.nextActionContract.finalGateCommand}`,
    `nextActionFinalGateTerminalCommand=${runbook.nextActionContract.finalGateTerminalCommand}`,
  ];

  if (!runbook.publicOriginIsHttps) {
    lines.push(
      "",
      "# Note: stable iPhone use should use TRAVEL_PLANNER_PUBLIC_ORIGIN with an HTTPS URL.",
      "# Local/LAN URLs are useful for same-Wi-Fi rehearsal only.",
    );
  }

  for (const phase of runbook.phases) {
    lines.push("", `## ${phase.title}`, phase.goal);
    for (const command of phase.commands) lines.push(`command=${command}`);
    for (const command of phase.terminalCommands || []) lines.push(`terminalCommand=${command}`);
    for (const step of phase.phoneSteps) lines.push(`phoneStep=${step}`);
  }

  lines.push("", "# Ready signal:");
  lines.push("# Treat the install as complete only after post-install evidence passes with saved iPhone Home Screen launch proof.");
  return `${lines.join("\n")}\n`;
}

const runbook = buildRunbook();
const body = jsonOutput ? `${JSON.stringify(runbook, null, 2)}\n` : textRunbook(runbook);
if (outputPath) {
  writeAtomic(outputPath, body);
} else {
  process.stdout.write(body);
}
