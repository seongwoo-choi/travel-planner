#!/usr/bin/env node

import { config as loadEnv } from "dotenv";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const webappDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
loadEnv({ path: path.join(webappDir, ".env") });

const args = process.argv.slice(2);
const jsonOutput = args.includes("--json");
const port = Number(process.env.PORT || 3000);
const INSTALL_PATH = "/install.html";
const SHORT_INSTALL_PATH = "/i";
const PROOF_SAVE_HASH = "#iosInstallProofSaveButton";
const PROTECTED_ACCESS_KEY_HANDLING = {
  placeholder: "YOUR_TRAVEL_ACCESS_KEY",
  localCompositionOnly: true,
  storesEnteredKey: false,
  sendsEnteredKeyToServer: false,
  clearsTemporaryInputAfterCopy: true,
};

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
  try {
    const target = new URL(url);
    target.searchParams.set("travelAccessKey", "YOUR_TRAVEL_ACCESS_KEY");
    return target.toString();
  } catch {
    return "";
  }
}

function buildUrls() {
  const localOrigin = `http://localhost:${port}`;
  const lanOrigins = localNetworkOrigins();
  const publicOrigin = normalizePublicOrigin(process.env.TRAVEL_PLANNER_PUBLIC_ORIGIN);
  const publicOriginIsHttps = publicOrigin.startsWith("https://");
  const publicShortInstallUrl = publicOrigin ? `${publicOrigin}${SHORT_INSTALL_PATH}` : "";
  const publicInstallUrl = publicOrigin ? `${publicOrigin}${INSTALL_PATH}` : "";
  const lanShortInstallUrls = lanOrigins.map((origin) => `${origin}${SHORT_INSTALL_PATH}`);
  const lanInstallUrls = lanOrigins.map((origin) => `${origin}${INSTALL_PATH}`);
  const localShortInstallUrl = `${localOrigin}${SHORT_INSTALL_PATH}`;
  const localInstallUrl = `${localOrigin}${INSTALL_PATH}`;
  const recommendedShortInstallUrl = publicOriginIsHttps
    ? publicShortInstallUrl
    : lanShortInstallUrls[0] || localShortInstallUrl;
  const recommendedInstallUrl = publicOriginIsHttps
    ? publicInstallUrl
    : lanInstallUrls[0] || localInstallUrl;
  const recommendedOrigin = publicOriginIsHttps
    ? publicOrigin
    : lanOrigins[0] || localOrigin;
  const deploymentMode = publicOriginIsHttps
    ? "stable-https"
    : publicOrigin
      ? "public-origin-not-https"
      : lanOrigins[0]
        ? "local-same-wifi-rehearsal"
        : "localhost-only-rehearsal";
  const installReadiness = publicOriginIsHttps
    ? "ready-for-iphone-handoff"
    : "rehearsal-only";
  const setupHint = publicOriginIsHttps
    ? "HTTPS public origin is configured. Run before-phone evidence before opening the iPhone URL."
    : "Use this URL only for local rehearsal. Set TRAVEL_PLANNER_PUBLIC_ORIGIN=https://your-domain.example for final iPhone install evidence.";
  const nextStep = publicOriginIsHttps
    ? "npm run ios:install:evidence:before-phone"
    : "Deploy HTTPS, set TRAVEL_PLANNER_PUBLIC_ORIGIN, then rerun npm run ios:install:urls.";

  return {
    schemaVersion: 1,
    port,
    localOrigin,
    localInstallUrl,
    localShortInstallUrl,
    lanOrigins,
    lanInstallUrls,
    lanShortInstallUrls,
    publicOrigin,
    publicOriginIsHttps,
    publicInstallUrl,
    publicShortInstallUrl,
    recommendedOrigin,
    recommendedInstallUrl,
    recommendedShortInstallUrl,
    protectedRecommendedInstallUrlTemplate: accessKeyTemplateUrl(recommendedInstallUrl),
    protectedRecommendedShortInstallUrlTemplate: accessKeyTemplateUrl(recommendedShortInstallUrl),
    protectedInstallAccessKeyHandling: PROTECTED_ACCESS_KEY_HANDLING,
    deploymentMode,
    installReadiness,
    setupHint,
    nextStep,
    installQrSvgUrl: `${recommendedOrigin}/api/install-qr.svg`,
    installRunbookUrl: `${recommendedOrigin}/api/ios-install-runbook.txt`,
    installRunbookJsonUrl: `${recommendedOrigin}/api/ios-install-runbook`,
    handoffNoteUrl: `${recommendedOrigin}/api/ios-install-handoff.txt`,
    installInfoUrl: `${recommendedOrigin}/api/install-info.txt`,
    nextStepUrl: `${recommendedOrigin}/api/ios-install-next`,
    nextStepTextUrl: `${recommendedOrigin}/api/ios-install-next.txt`,
    proofSaveUrl: `${recommendedOrigin}${INSTALL_PATH}${PROOF_SAVE_HASH}`,
    evidenceCommands: {
      beforePhone: "npm run ios:install:evidence:before-phone",
      afterPhone: "npm run ios:install:evidence:after-phone",
      all: "npm run ios:install:evidence:after-phone:final",
      preinstall: "npm run ios:install:evidence:preinstall",
      postinstall: "npm run ios:install:evidence:postinstall",
    },
    terminalCommands: {
      beforePhone: "test -d webapp && cd webapp; npm run ios:install:evidence:before-phone",
      afterPhone: "test -d webapp && cd webapp; npm run ios:install:evidence:after-phone",
      all: "test -d webapp && cd webapp; npm run ios:install:evidence:after-phone:final",
    },
    nextActionContract: {
      phoneFirstField: "phoneFirst",
      nextCommandLabelField: "nextCommandLabel",
      nextCommandPrerequisiteField: "nextCommandPrerequisite",
      finalGateCommand: "npm run ios:install:evidence:after-phone:final",
      finalGateTerminalCommand: "test -d webapp && cd webapp; npm run ios:install:evidence:after-phone:final",
      finalGatePrerequisite: "Run only after Add to Home Screen, Travel icon launch, and install proof save.",
    },
  };
}

const urls = buildUrls();

if (jsonOutput) {
  console.log(JSON.stringify(urls, null, 2));
} else {
  console.log("Travel Planner iPhone install URLs");
  console.log(`recommendedShortInstallUrl=${urls.recommendedShortInstallUrl}`);
  console.log(`recommendedInstallUrl=${urls.recommendedInstallUrl}`);
  console.log(`protectedRecommendedShortInstallUrlTemplate=${urls.protectedRecommendedShortInstallUrlTemplate}`);
  console.log(`protectedRecommendedInstallUrlTemplate=${urls.protectedRecommendedInstallUrlTemplate}`);
  console.log(`protectedInstallAccessKeyPlaceholder=${urls.protectedInstallAccessKeyHandling.placeholder}`);
  console.log(`protectedInstallAccessKeyLocalCompositionOnly=${urls.protectedInstallAccessKeyHandling.localCompositionOnly ? "true" : "false"}`);
  console.log(`protectedInstallAccessKeyStoresEnteredKey=${urls.protectedInstallAccessKeyHandling.storesEnteredKey ? "true" : "false"}`);
  console.log(`protectedInstallAccessKeySendsEnteredKeyToServer=${urls.protectedInstallAccessKeyHandling.sendsEnteredKeyToServer ? "true" : "false"}`);
  console.log(`protectedInstallAccessKeyClearsTemporaryInputAfterCopy=${urls.protectedInstallAccessKeyHandling.clearsTemporaryInputAfterCopy ? "true" : "false"}`);
  console.log(`localShortInstallUrl=${urls.localShortInstallUrl}`);
  console.log(`lanShortInstallUrls=${urls.lanShortInstallUrls.length ? urls.lanShortInstallUrls.join(", ") : "(none)"}`);
  console.log(`publicOrigin=${urls.publicOrigin || "(not set)"}`);
  console.log(`publicShortInstallUrl=${urls.publicShortInstallUrl || "(not set)"}`);
  console.log(`publicOriginIsHttps=${urls.publicOriginIsHttps ? "true" : "false"}`);
  console.log(`recommendedOrigin=${urls.recommendedOrigin}`);
  console.log(`deploymentMode=${urls.deploymentMode}`);
  console.log(`installReadiness=${urls.installReadiness}`);
  console.log(`setupHint=${urls.setupHint}`);
  console.log(`nextStep=${urls.nextStep}`);
  console.log(`installQrSvgUrl=${urls.installQrSvgUrl}`);
  console.log(`installRunbookUrl=${urls.installRunbookUrl}`);
  console.log(`installRunbookJsonUrl=${urls.installRunbookJsonUrl}`);
  console.log(`handoffNoteUrl=${urls.handoffNoteUrl}`);
  console.log(`installInfoUrl=${urls.installInfoUrl}`);
  console.log(`nextStepUrl=${urls.nextStepUrl}`);
  console.log(`nextStepTextUrl=${urls.nextStepTextUrl}`);
  console.log(`proofSaveUrl=${urls.proofSaveUrl}`);
  console.log(`beforePhoneEvidenceCommand=${urls.evidenceCommands.beforePhone}`);
  console.log(`afterPhoneEvidenceCommand=${urls.evidenceCommands.afterPhone}`);
  console.log(`fullEvidenceCommand=${urls.evidenceCommands.all}`);
  console.log(`beforePhoneTerminalCommand=${urls.terminalCommands.beforePhone}`);
  console.log(`afterPhoneTerminalCommand=${urls.terminalCommands.afterPhone}`);
  console.log(`fullEvidenceTerminalCommand=${urls.terminalCommands.all}`);
  console.log(`nextActionPhoneFirstField=${urls.nextActionContract.phoneFirstField}`);
  console.log(`nextActionFinalGateCommand=${urls.nextActionContract.finalGateCommand}`);
  console.log(`nextActionFinalGatePrerequisite=${urls.nextActionContract.finalGatePrerequisite}`);
}
