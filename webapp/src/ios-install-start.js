#!/usr/bin/env node

import { config as loadEnv } from "dotenv";
import { mkdirSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const webappDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
loadEnv({ path: path.join(webappDir, ".env") });

const port = Number(process.env.PORT || 3000);

function parseArgs(args) {
  return args.reduce((options, arg) => {
    if (arg === "--json") return { ...options, json: true };
    if (arg === "--require-ready") return { ...options, requireReady: true };
    if (arg.startsWith("--output=")) return { ...options, output: arg.slice("--output=".length) };
    if (arg.startsWith("--output-env=")) return { ...options, outputEnv: arg.slice("--output-env=".length) };
    if (arg.startsWith("--output-default=")) return { ...options, outputDefault: arg.slice("--output-default=".length) };
    return options;
  }, {
    json: false,
    requireReady: false,
    output: "",
    outputEnv: "",
    outputDefault: "",
  });
}

function webappPath(value) {
  if (!value) return "";
  return path.isAbsolute(value) ? value : path.join(webappDir, value);
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

function localNetworkOrigins() {
  return Object.values(os.networkInterfaces())
    .flatMap((entries) => entries || [])
    .filter((entry) => entry && entry.family === "IPv4" && !entry.internal)
    .map((entry) => `http://${entry.address}:${port}`);
}

function buildInstallStart() {
  const localOrigin = `http://localhost:${port}`;
  const publicOrigin = normalizePublicOrigin(process.env.TRAVEL_PLANNER_PUBLIC_ORIGIN);
  const publicOriginIsHttps = publicOrigin.startsWith("https://");
  const lanOrigins = localNetworkOrigins();
  const recommendedOrigin = publicOriginIsHttps
    ? publicOrigin
    : lanOrigins[0] || localOrigin;
  const recommendedShortInstallUrl = `${recommendedOrigin}/i`;
  const recommendedInstallUrl = `${recommendedOrigin}/install.html`;
  const readiness = publicOriginIsHttps
    ? "ready-for-iphone-handoff"
    : "same-wifi-rehearsal";
  const warning = publicOriginIsHttps
    ? ""
    : "HTTPS public origin is not configured. Use this as a same-Wi-Fi rehearsal, not final install evidence.";

  return {
    readiness,
    warning,
    recommendedShortInstallUrl,
    recommendedInstallUrl,
    sessionQrUrl: `${recommendedOrigin}/api/ios-install-session-qr.svg`,
    nextActionBoardUrl: `${recommendedOrigin}/ios-next`,
    proofSaveHash: "#iosInstallProofSaveButton",
    proofSaveTargetId: "iosInstallProofSaveButton",
    proofSaveUrl: `${recommendedOrigin}/install.html#iosInstallProofSaveButton`,
    commands: {
      beforePhone: "test -d webapp && cd webapp; npm run ios:install:evidence:before-phone",
      beforePhoneFinal: "test -d webapp && cd webapp; npm run ios:install:evidence:before-phone:final",
      beforePhoneFinalThenNext: "test -d webapp && cd webapp; npm run ios:install:evidence:before-phone:final:next",
      handoffEvidence: "test -d webapp && cd webapp; npm run ios:install:handoff:evidence",
      sessionEvidence: "test -d webapp && cd webapp; npm run ios:install:session:evidence",
      handoffSessionEvidence: "test -d webapp && cd webapp; npm run ios:install:handoff-session:evidence",
      afterPhoneThenAll: "test -d webapp && cd webapp; npm run ios:install:evidence:after-phone:final",
      afterPhoneThenAllFinal: "test -d webapp && cd webapp; npm run ios:install:evidence:after-phone:final",
    },
  };
}

const start = buildInstallStart();
const postInstallAppHomeUrl = new URL("/#iosHomeDock", start.recommendedInstallUrl).toString();
const postInstallNewPlanUrl = new URL("/#planForm", start.recommendedInstallUrl).toString();

const output = {
  schemaVersion: 1,
  ...start,
  postInstallAppHomeUrl,
  postInstallNewPlanUrl,
  appHomeFirstPlanUrl: postInstallAppHomeUrl,
  steps: [
    {
      id: "before-phone",
      owner: "mac",
      action: "Run before-phone evidence before opening the iPhone URL.",
      command: start.commands.beforePhone,
    },
    {
      id: "before-phone-final",
      owner: "mac",
      action: "For final HTTPS Home Screen installation, run this stricter preflight gate before opening the iPhone URL.",
      command: start.commands.beforePhoneFinal,
    },
    {
      id: "before-phone-final-next",
      owner: "mac",
      action: "For final iPhone handoff, run the named final pre-phone sequence and refresh the next-action output before opening the iPhone URL.",
      command: start.commands.beforePhoneFinalThenNext,
    },
    {
      id: "open-iphone",
      owner: "iphone",
      action: "Open the recommended short URL in iPhone Safari.",
      url: start.recommendedShortInstallUrl,
      qrUrl: start.sessionQrUrl,
    },
    {
      id: "save-proof",
      owner: "iphone",
      action: "Use Safari share button, Add to Home Screen, launch Travel icon, then tap 설치 증거 저장.",
      url: start.proofSaveUrl,
    },
    {
      id: "after-phone",
      owner: "mac",
      action: "Run after-phone evidence and final archive/gate after proof save.",
      command: start.commands.afterPhoneThenAll,
    },
    {
      id: "after-phone-final",
      owner: "mac",
      action: "For final HTTPS completion, run the named after-phone final archive/gate sequence after proof save.",
      command: start.commands.afterPhoneThenAllFinal,
    },
    {
      id: "first-plan",
      owner: "iphone",
      action: "Continue in the installed app and create the first travel plan.",
      url: postInstallNewPlanUrl,
    },
  ],
};

const options = parseArgs(process.argv.slice(2));
const outputPath = webappPath(
  options.output
    || (options.outputEnv ? process.env[options.outputEnv] : "")
    || options.outputDefault,
);

if (outputPath) {
  mkdirSync(path.dirname(outputPath), { recursive: true });
  writeFileSync(outputPath, `${JSON.stringify(output, null, 2)}\n`);
  console.log(`ios-install-start=${outputPath}`);
} else if (options.json) {
  console.log(JSON.stringify(output, null, 2));
} else {
  console.log([
    "Travel Planner iPhone install start",
    `readiness=${output.readiness}`,
    output.warning ? `warning=${output.warning}` : "",
    "",
    "1. Mac before iPhone:",
    output.commands.beforePhone,
    "",
    "1b. Mac final HTTPS install preflight:",
    output.commands.beforePhoneFinal,
    "",
    "1c. Mac final pre-phone sequence with next-action refresh:",
    output.commands.beforePhoneFinalThenNext,
    "",
    "1d. Mac handoff and session evidence snapshots:",
    output.commands.handoffSessionEvidence,
    output.commands.handoffEvidence,
    output.commands.sessionEvidence,
    "",
    "2. Open on iPhone Safari:",
    output.recommendedShortInstallUrl,
    `installPage=${output.recommendedInstallUrl}`,
    `sessionQr=${output.sessionQrUrl}`,
    "",
    "3. iPhone steps:",
    "Safari share button > Add to Home Screen > Launch Travel icon > tap 설치 증거 저장",
    `proofSaveHash=${output.proofSaveHash}`,
    `proofSaveTargetId=${output.proofSaveTargetId}`,
    `proofSaveUrl=${output.proofSaveUrl}`,
    "",
    "4. Mac after proof save:",
    output.commands.afterPhoneThenAll,
    "",
    "4b. Mac final HTTPS after proof save:",
    output.commands.afterPhoneThenAllFinal,
    "",
    "5. Continue in app:",
    `postInstallAppHomeUrl=${output.postInstallAppHomeUrl}`,
    `postInstallNewPlanUrl=${output.postInstallNewPlanUrl}`,
    output.appHomeFirstPlanUrl,
    "",
    "Live next action board:",
    output.nextActionBoardUrl,
  ].filter(Boolean).join("\n"));
}

if (options.requireReady && output.readiness !== "ready-for-iphone-handoff") {
  console.error([
    "ios-install-start=not-ready",
    "issue=TRAVEL_PLANNER_PUBLIC_ORIGIN must be HTTPS before final iPhone Home Screen install evidence.",
  ].join("\n"));
  process.exitCode = 1;
}
