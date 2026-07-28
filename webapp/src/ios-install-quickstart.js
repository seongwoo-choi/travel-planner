#!/usr/bin/env node

import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const webappDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const args = process.argv.slice(2);
const jsonOutput = args.includes("--json");

function valueAfterEquals(name) {
  const arg = args.find((item) => item.startsWith(`${name}=`));
  return arg ? arg.slice(name.length + 1) : "";
}

function resolvedOutputPath() {
  const outputPath = valueAfterEquals("--output")
    || process.env[valueAfterEquals("--output-env")]
    || valueAfterEquals("--output-default");
  if (!outputPath) return "";
  return path.isAbsolute(outputPath) ? outputPath : path.join(webappDir, outputPath);
}

function writeOutputFile(outputPath, body) {
  if (!outputPath) return;
  mkdirSync(path.dirname(outputPath), { recursive: true });
  writeFileSync(outputPath, body, "utf8");
  console.error(`ios-install-quickstart=${outputPath}`);
}

const commands = {
  prepare: "npm run ios:install:prepare",
  status: "npm run ios:install:status",
  finish: "npm run ios:install:finish",
};

const proof = {
  hash: "#iosInstallProofSaveButton",
  targetId: "iosInstallProofSaveButton",
};

const recoveryHints = [
  "Open the install URL in iPhone Safari. If it opens inside KakaoTalk, Instagram, Mail, or another in-app browser, copy the URL into Safari.",
  "If Add to Home Screen is missing, stay in Safari and scroll the share sheet down.",
  "If the iPhone URL contains localhost, replace it with the same-Wi-Fi LAN URL or a public HTTPS origin.",
  "After adding the icon, leave Safari and launch the Home Screen Travel icon before saving proof.",
];

function configuredOrigin() {
  const fallback = `http://localhost:${process.env.PORT || "3000"}`;
  try {
    return new URL(process.env.TRAVEL_PLANNER_PUBLIC_ORIGIN || fallback).origin;
  } catch {
    return fallback;
  }
}

function urlFor(origin, pathname) {
  return new URL(pathname, `${origin}/`).toString();
}

function buildQuickstart() {
  const origin = configuredOrigin();
  const httpsReady = origin.startsWith("https://");
  return {
    schemaVersion: 1,
    title: "Travel Planner iPhone install quickstart",
    origin,
    httpsReady,
    installUrl: urlFor(origin, "/install.html"),
    shortInstallUrl: urlFor(origin, "/i"),
    proofSaveUrl: urlFor(origin, `/install.html${proof.hash}`),
    proofSaveHash: proof.hash,
    proofSaveTargetId: proof.targetId,
    postInstallAppHomeUrl: urlFor(origin, "/#iosHomeDock"),
    postInstallNewPlanUrl: urlFor(origin, "/#planForm"),
    completionStatusUrl: urlFor(origin, "/ios-install-status"),
    commands,
    steps: [
      `Run ${commands.prepare} on the Mac before touching the iPhone.`,
      "Open the printed install URL in iPhone Safari, not an in-app browser.",
      "Use Safari Share -> Add to Home Screen -> Add.",
      "Launch the Travel icon from the iPhone Home Screen.",
      `Open the proof save URL if needed and tap the ${proof.targetId} proof save button.`,
      `Run ${commands.finish} on the Mac after proof is saved.`,
      `Run ${commands.status} any time the next action is unclear.`,
    ],
    recoveryHints,
    readinessNote: httpsReady
      ? "Configured public origin is HTTPS, which is the intended final iPhone install path."
      : "Current origin is not HTTPS. Use this only for local or same-Wi-Fi rehearsal unless a public HTTPS origin is configured.",
    completionRule: "Treat the install as complete only after Home Screen proof is saved and the final Mac gate passes.",
  };
}

function textLines(quickstart) {
  return [
    quickstart.title,
    "",
    `origin=${quickstart.origin}`,
    `httpsReady=${quickstart.httpsReady ? "true" : "false"}`,
    `installUrl=${quickstart.installUrl}`,
    `shortInstallUrl=${quickstart.shortInstallUrl}`,
    `proofSaveHash=${quickstart.proofSaveHash}`,
    `proofSaveTargetId=${quickstart.proofSaveTargetId}`,
    `proofSaveUrl=${quickstart.proofSaveUrl}`,
    `postInstallAppHomeUrl=${quickstart.postInstallAppHomeUrl}`,
    `postInstallNewPlanUrl=${quickstart.postInstallNewPlanUrl}`,
    `completionStatusUrl=${quickstart.completionStatusUrl}`,
    "",
    "Commands:",
    `prepare=${quickstart.commands.prepare}`,
    `status=${quickstart.commands.status}`,
    `finish=${quickstart.commands.finish}`,
    "",
    "Steps:",
    ...quickstart.steps.map((step, index) => `${index + 1}. ${step}`),
    "",
    "Recovery hints:",
    ...quickstart.recoveryHints.map((hint, index) => `${index + 1}. ${hint}`),
    "",
    `readinessNote=${quickstart.readinessNote}`,
    `completionRule=${quickstart.completionRule}`,
  ];
}

const quickstart = buildQuickstart();
const outputPath = resolvedOutputPath();
if (jsonOutput) {
  const body = `${JSON.stringify(quickstart, null, 2)}\n`;
  writeOutputFile(outputPath, body);
  console.log(body.trimEnd());
} else {
  const body = `${textLines(quickstart).join("\n")}\n`;
  writeOutputFile(outputPath, body);
  console.log(body.trimEnd());
}
