#!/usr/bin/env node

import { config as loadEnv } from "dotenv";
import path from "node:path";
import { fileURLToPath } from "node:url";

const webappDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
loadEnv({ path: path.join(webappDir, ".env") });

function parseArgs(args) {
  return args.reduce((options, arg) => {
    if (arg === "--json") return { ...options, json: true };
    if (arg === "--help" || arg === "-h") return { ...options, help: true };
    if (arg.startsWith("--origin=")) return { ...options, origin: arg.slice("--origin=".length) };
    if (!arg.startsWith("-") && !options.origin) return { ...options, origin: arg };
    return options;
  }, { json: false, help: false, origin: "" });
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

function envBlock(env) {
  return Object.entries(env)
    .map(([key, value]) => `${key}=${value}`)
    .join("\n");
}

function accessKeyTemplateUrl(origin, pathname) {
  if (!origin) return "";
  const url = new URL(pathname, `${origin}/`);
  url.searchParams.set("travelAccessKey", "YOUR_TRAVEL_ACCESS_KEY");
  return url.toString();
}

const PROTECTED_ACCESS_KEY_HANDLING = {
  placeholder: "YOUR_TRAVEL_ACCESS_KEY",
  localCompositionOnly: true,
  storesEnteredKey: false,
  sendsEnteredKeyToServer: false,
  clearsTemporaryInputAfterCopy: true,
};

function buildSetup(options) {
  const rawOrigin = options.origin || process.env.TRAVEL_PLANNER_PUBLIC_ORIGIN || "";
  const origin = normalizePublicOrigin(rawOrigin);
  const issues = [];
  if (!origin) issues.push("Provide an HTTPS origin with --origin=https://example.com or set TRAVEL_PLANNER_PUBLIC_ORIGIN.");
  if (origin && !origin.startsWith("https://")) issues.push("TRAVEL_PLANNER_PUBLIC_ORIGIN must be HTTPS for final iPhone Home Screen install evidence.");

  const env = origin
    ? {
        TRAVEL_PLANNER_PUBLIC_ORIGIN: origin,
        TRAVEL_PUBLIC_BASE_URL: origin,
        TRAVEL_IOS_INSTALL_CHECK_PATH: "reports/ios-install-check.json",
        TRAVEL_IOS_INSTALL_CHECK_STRICT_PATH: "reports/ios-install-check.strict.json",
        TRAVEL_IOS_INSTALL_CHECK_PROOF_PATH: "reports/ios-install-check.proof.json",
        TRAVEL_IOS_INSTALL_RUNBOOK_PATH: "reports/ios-install-runbook.txt",
        TRAVEL_IOS_INSTALL_RUNBOOK_JSON_PATH: "reports/ios-install-runbook.json",
        TRAVEL_IOS_INSTALL_RUNBOOK_SCHEMA_PATH: "reports/ios-install-runbook.schema.json",
        TRAVEL_IOS_INSTALL_RUNBOOK_CHECK_PATH: "reports/ios-install-runbook-check.json",
        TRAVEL_IOS_INSTALL_RUNBOOK_CHECK_SCHEMA_PATH: "reports/ios-install-runbook-check.schema.json",
        TRAVEL_IOS_INSTALL_SUMMARY_PATH: "reports/ios-install-summary.json",
        TRAVEL_IOS_INSTALL_SUMMARY_SCHEMA_PATH: "reports/ios-install-summary.schema.json",
        TRAVEL_IOS_INSTALL_SUMMARY_CHECK_PATH: "reports/ios-install-summary-check.json",
        TRAVEL_IOS_INSTALL_SUMMARY_CHECK_SCHEMA_PATH: "reports/ios-install-summary-check.schema.json",
        TRAVEL_IOS_INSTALL_HANDOFF_PATH: "reports/ios-install-handoff.md",
        TRAVEL_IOS_INSTALL_NEXT_PATH: "reports/ios-install-next.json",
        TRAVEL_IOS_INSTALL_NEXT_SCHEMA_PATH: "reports/ios-install-next.schema.json",
        TRAVEL_IOS_INSTALL_CHECK_TIMEOUT_MS: process.env.TRAVEL_IOS_INSTALL_CHECK_TIMEOUT_MS || "15000",
      }
    : {};

  return {
    schemaVersion: 1,
    status: issues.length ? "needs-setup" : "ready",
    origin,
    publicOriginIsHttps: origin.startsWith("https://"),
    protectedInstallUrlTemplate: accessKeyTemplateUrl(origin, "/install.html"),
    protectedShortInstallUrlTemplate: accessKeyTemplateUrl(origin, "/i"),
    protectedInstallAccessKeyHandling: PROTECTED_ACCESS_KEY_HANDLING,
    issues,
    env,
    commands: {
      previewUrls: "npm run ios:install:urls",
      beforePhone: "npm run ios:install:evidence:before-phone",
      afterPhone: "npm run ios:install:evidence:after-phone",
      finalEvidence: "npm run ios:install:evidence:after-phone:final",
      protectedInstallUrlTemplate: accessKeyTemplateUrl(origin || "https://example.com", "/install.html"),
      protectedShortInstallUrlTemplate: accessKeyTemplateUrl(origin || "https://example.com", "/i"),
      startServer: origin ? `TRAVEL_PLANNER_PUBLIC_ORIGIN=${origin} npm start` : "TRAVEL_PLANNER_PUBLIC_ORIGIN=https://example.com npm start",
    },
  };
}

function printHelp() {
  console.log([
    "Travel Planner iPhone install env bootstrap",
    "",
    "Usage:",
    "  npm run ios:install:env -- --origin=https://travel.example.com",
    "  npm run ios:install:env -- --json --origin=https://travel.example.com",
    "",
    "The command prints .env lines for HTTPS iPhone Home Screen install evidence.",
  ].join("\n"));
}

const options = parseArgs(process.argv.slice(2));

if (options.help) {
  printHelp();
  process.exit(0);
}

const setup = buildSetup(options);

if (options.json) {
  console.log(JSON.stringify(setup, null, 2));
} else {
  console.log("Travel Planner iPhone install env");
  console.log(`status=${setup.status}`);
  console.log(`origin=${setup.origin || "(missing)"}`);
  console.log(`publicOriginIsHttps=${setup.publicOriginIsHttps ? "true" : "false"}`);
  console.log(`protectedInstallUrlTemplate=${setup.protectedInstallUrlTemplate || setup.commands.protectedInstallUrlTemplate}`);
  console.log(`protectedShortInstallUrlTemplate=${setup.protectedShortInstallUrlTemplate || setup.commands.protectedShortInstallUrlTemplate}`);
  console.log(`protectedInstallAccessKeyPlaceholder=${setup.protectedInstallAccessKeyHandling.placeholder}`);
  console.log(`protectedInstallAccessKeyLocalCompositionOnly=${setup.protectedInstallAccessKeyHandling.localCompositionOnly ? "true" : "false"}`);
  console.log(`protectedInstallAccessKeyStoresEnteredKey=${setup.protectedInstallAccessKeyHandling.storesEnteredKey ? "true" : "false"}`);
  console.log(`protectedInstallAccessKeySendsEnteredKeyToServer=${setup.protectedInstallAccessKeyHandling.sendsEnteredKeyToServer ? "true" : "false"}`);
  console.log(`protectedInstallAccessKeyClearsTemporaryInputAfterCopy=${setup.protectedInstallAccessKeyHandling.clearsTemporaryInputAfterCopy ? "true" : "false"}`);
  for (const issue of setup.issues) console.log(`issue=${issue}`);
  if (Object.keys(setup.env).length > 0) {
    console.log("");
    console.log("# Add or update these lines in webapp/.env:");
    console.log(envBlock(setup.env));
  }
  console.log("");
  console.log(`startServer=${setup.commands.startServer}`);
  console.log(`previewUrls=${setup.commands.previewUrls}`);
  console.log(`beforePhone=${setup.commands.beforePhone}`);
  console.log(`afterPhone=${setup.commands.afterPhone}`);
  console.log(`finalEvidence=${setup.commands.finalEvidence}`);
}
