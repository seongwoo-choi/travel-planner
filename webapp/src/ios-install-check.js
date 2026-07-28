#!/usr/bin/env node

import { config as loadEnv } from "dotenv";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const DEFAULT_ORIGIN = "http://localhost:3000";
const DEFAULT_TIMEOUT_MS = 10000;
const webappDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const defaultEnvPath = path.join(webappDir, ".env");

function resolveEnvPath(filePath) {
  return path.isAbsolute(filePath) ? filePath : path.resolve(process.cwd(), filePath);
}

function loadConfiguredEnv(argv) {
  const envArg = argv.find((arg) => arg.startsWith("--env="));
  const envPath = envArg ? resolveEnvPath(envArg.slice("--env=".length)) : defaultEnvPath;
  const result = loadEnv({ path: envPath });
  return {
    envPath,
    envSource: envArg ? "arg" : "default",
    envLoaded: !result.error,
    envError: result.error?.code || "",
  };
}

const envLoad = loadConfiguredEnv(process.argv.slice(2));

function parseArgs(argv) {
  return argv.reduce((options, arg) => {
    if (arg.startsWith("--origin=")) {
      return { ...options, origin: arg.slice("--origin=".length) };
    }
    if (arg === "--allow-http") {
      return { ...options, allowHttp: true };
    }
    if (arg === "--follow-recommended") {
      return { ...options, followRecommended: true };
    }
    if (arg === "--require-handoff-ready") {
      return { ...options, requireHandoffReady: true };
    }
    if (arg === "--require-launch-proof") {
      return { ...options, requireLaunchProof: true };
    }
    if (arg === "--require-install-qr") {
      return { ...options, requireInstallQr: true };
    }
    if (arg.startsWith("--install-qr-target=")) {
      return { ...options, installQrTarget: arg.slice("--install-qr-target=".length) };
    }
    if (arg === "--require-install-runbook") {
      return { ...options, requireInstallRunbook: true };
    }
    if (arg === "--json") {
      return { ...options, json: true };
    }
    if (arg.startsWith("--output=")) {
      return { ...options, output: arg.slice("--output=".length) };
    }
    if (arg.startsWith("--output-env=")) {
      return { ...options, outputEnv: arg.slice("--output-env=".length) };
    }
    if (arg.startsWith("--output-default=")) {
      return { ...options, outputDefault: arg.slice("--output-default=".length) };
    }
    if (arg.startsWith("--timeout-ms=")) {
      return { ...options, timeoutMs: Number(arg.slice("--timeout-ms=".length)) };
    }
    if (arg.startsWith("--env=")) {
      return options;
    }
    return options;
  }, {
    origin: process.env.TRAVEL_PLANNER_PUBLIC_ORIGIN || DEFAULT_ORIGIN,
    allowHttp: false,
    followRecommended: false,
    requireHandoffReady: false,
    requireLaunchProof: false,
    requireInstallQr: false,
    installQrTarget: process.env.TRAVEL_IOS_INSTALL_QR_TARGET_URL || "",
    requireInstallRunbook: false,
    json: false,
    output: "",
    outputEnv: "",
    outputDefault: "",
    timeoutMs: Number(process.env.TRAVEL_IOS_INSTALL_CHECK_TIMEOUT_MS || DEFAULT_TIMEOUT_MS),
    ...envLoad,
  });
}

function joinUrl(origin, path) {
  const url = new URL(origin);
  url.pathname = path;
  url.search = "";
  url.hash = "";
  return url.toString();
}

function checkInstallInfo(info, { allowHttp }) {
  const issues = [];
  const recommended = info.recommendedInstallUrl ? new URL(info.recommendedInstallUrl) : null;
  const readinessSources = new Set(["configured-public-https", "same-wifi-lan", "current-https-origin", "current-origin"]);

  function checkProtectedTemplate(value, pathname, label) {
    if (!value) {
      issues.push(`missing ${label}`);
      return;
    }
    try {
      const url = new URL(value);
      if (url.pathname !== pathname) {
        issues.push(`${label} must point to ${pathname}, got ${url.pathname}`);
      }
      if (url.searchParams.get("travelAccessKey") !== "YOUR_TRAVEL_ACCESS_KEY") {
        issues.push(`${label} must include travelAccessKey=YOUR_TRAVEL_ACCESS_KEY`);
      }
    } catch {
      issues.push(`${label} must be a valid URL`);
    }
  }

  if (!recommended) {
    issues.push("missing recommendedInstallUrl");
  } else {
    if (recommended.pathname !== "/install.html") {
      issues.push(`recommendedInstallUrl must point to /install.html, got ${recommended.pathname}`);
    }
    if (!allowHttp && recommended.protocol !== "https:") {
      issues.push(`recommendedInstallUrl must be HTTPS for iPhone Home Screen use, got ${recommended.protocol}`);
    }
  }

  if (!info.installQrSvgUrl) {
    issues.push("missing installQrSvgUrl");
  } else {
    try {
      const qrUrl = new URL(info.installQrSvgUrl);
      if (qrUrl.pathname !== "/api/install-qr.svg") {
        issues.push(`installQrSvgUrl must point to /api/install-qr.svg, got ${qrUrl.pathname}`);
      }
    } catch {
      issues.push("installQrSvgUrl must be a valid URL");
    }
  }
  if (!info.installQrTargetUrl) {
    issues.push("missing installQrTargetUrl");
  } else if (info.recommendedInstallUrl && info.installQrTargetUrl !== info.recommendedInstallUrl) {
    issues.push("installQrTargetUrl must match recommendedInstallUrl");
  }

  if (!info.proofSaveHash) {
    issues.push("missing proofSaveHash");
  } else if (info.proofSaveHash !== "#iosInstallProofSaveButton") {
    issues.push("proofSaveHash must be #iosInstallProofSaveButton");
  }
  if (!info.proofSaveTargetId) {
    issues.push("missing proofSaveTargetId");
  } else if (info.proofSaveTargetId !== "iosInstallProofSaveButton") {
    issues.push("proofSaveTargetId must be iosInstallProofSaveButton");
  }

  if (!info.proofSaveUrl) {
    issues.push("missing proofSaveUrl");
  } else {
    try {
      const proofUrl = new URL(info.proofSaveUrl);
      if (proofUrl.pathname !== "/install.html") {
        issues.push(`proofSaveUrl must point to /install.html, got ${proofUrl.pathname}`);
      }
      if (proofUrl.hash !== "#iosInstallProofSaveButton") {
        issues.push("proofSaveUrl must include #iosInstallProofSaveButton");
      }
      if (recommended && proofUrl.origin !== recommended.origin) {
        issues.push("proofSaveUrl origin must match recommendedInstallUrl origin");
      }
    } catch {
      issues.push("proofSaveUrl must be a valid URL");
    }
  }

  if (!info.installRunbookUrl) {
    issues.push("missing installRunbookUrl");
  } else {
    try {
      const runbookUrl = new URL(info.installRunbookUrl);
      if (runbookUrl.pathname !== "/api/ios-install-runbook.txt") {
        issues.push(`installRunbookUrl must point to /api/ios-install-runbook.txt, got ${runbookUrl.pathname}`);
      }
    } catch {
      issues.push("installRunbookUrl must be a valid URL");
    }
  }

  if (!info.installRunbookJsonUrl) {
    issues.push("missing installRunbookJsonUrl");
  } else {
    try {
      const runbookJsonUrl = new URL(info.installRunbookJsonUrl);
      if (runbookJsonUrl.pathname !== "/api/ios-install-runbook") {
        issues.push(`installRunbookJsonUrl must point to /api/ios-install-runbook, got ${runbookJsonUrl.pathname}`);
      }
    } catch {
      issues.push("installRunbookJsonUrl must be a valid URL");
    }
  }

  if (!info.installSessionUrl) {
    issues.push("missing installSessionUrl");
  } else {
    try {
      const sessionUrl = new URL(info.installSessionUrl);
      if (sessionUrl.pathname !== "/api/ios-install-session.txt") {
        issues.push(`installSessionUrl must point to /api/ios-install-session.txt, got ${sessionUrl.pathname}`);
      }
      if (recommended && sessionUrl.origin !== recommended.origin) {
        issues.push("installSessionUrl origin must match recommendedInstallUrl origin");
      }
    } catch {
      issues.push("installSessionUrl must be a valid URL");
    }
  }

  if (!info.installSessionQrUrl) {
    issues.push("missing installSessionQrUrl");
  } else {
    try {
      const sessionQrUrl = new URL(info.installSessionQrUrl);
      if (sessionQrUrl.pathname !== "/api/ios-install-session-qr.svg") {
        issues.push(`installSessionQrUrl must point to /api/ios-install-session-qr.svg, got ${sessionQrUrl.pathname}`);
      }
    } catch {
      issues.push("installSessionQrUrl must be a valid URL");
    }
  }

  checkProtectedTemplate(info.protectedRecommendedInstallUrlTemplate, "/install.html", "protectedRecommendedInstallUrlTemplate");
  checkProtectedTemplate(info.protectedRecommendedShortInstallUrlTemplate, "/i", "protectedRecommendedShortInstallUrlTemplate");

  if (!info.installReadinessSummary || typeof info.installReadinessSummary !== "object") {
    issues.push("missing installReadinessSummary");
  } else {
    if (!readinessSources.has(info.installReadinessSummary.recommendedUrlSource)) {
      issues.push("installReadinessSummary must record a known recommendedUrlSource");
    }
    if (typeof info.installReadinessSummary.recommendedUrlIsHttps !== "boolean") {
      issues.push("installReadinessSummary must record recommendedUrlIsHttps boolean");
    } else if (recommended && info.installReadinessSummary.recommendedUrlIsHttps !== (recommended.protocol === "https:")) {
      issues.push("installReadinessSummary recommendedUrlIsHttps must match recommendedInstallUrl protocol");
    }
    if (typeof info.installReadinessSummary.sameWifiRequired !== "boolean") {
      issues.push("installReadinessSummary must record sameWifiRequired boolean");
    } else if (info.installReadinessSummary.sameWifiRequired !== (info.installReadinessSummary.recommendedUrlSource === "same-wifi-lan")) {
      issues.push("installReadinessSummary sameWifiRequired must match same-wifi-lan source");
    }
    if (info.installReadinessSummary.safariRequired !== true) {
      issues.push("installReadinessSummary must mark safariRequired=true");
    }
    if (typeof info.installReadinessSummary.summary !== "string" || info.installReadinessSummary.summary.length === 0) {
      issues.push("installReadinessSummary must include a human summary");
    }
  }

  if (info.protectedInstallAccessKeyHandling?.placeholder !== "YOUR_TRAVEL_ACCESS_KEY") {
    issues.push("protectedInstallAccessKeyHandling must record YOUR_TRAVEL_ACCESS_KEY placeholder");
  }
  if (info.protectedInstallAccessKeyHandling?.localCompositionOnly !== true) {
    issues.push("protectedInstallAccessKeyHandling must mark localCompositionOnly=true");
  }
  if (info.protectedInstallAccessKeyHandling?.storesEnteredKey !== false) {
    issues.push("protectedInstallAccessKeyHandling must mark storesEnteredKey=false");
  }
  if (info.protectedInstallAccessKeyHandling?.sendsEnteredKeyToServer !== false) {
    issues.push("protectedInstallAccessKeyHandling must mark sendsEnteredKeyToServer=false");
  }
  if (info.protectedInstallAccessKeyHandling?.clearsTemporaryInputAfterCopy !== true) {
    issues.push("protectedInstallAccessKeyHandling must mark clearsTemporaryInputAfterCopy=true");
  }

  if (info.nextActionContract?.phoneFirstField !== "phoneFirst") {
    issues.push("nextActionContract must record phoneFirst field");
  }
  if (info.nextActionContract?.nextCommandLabelField !== "nextCommandLabel") {
    issues.push("nextActionContract must record nextCommandLabel field");
  }
  if (info.nextActionContract?.nextCommandPrerequisiteField !== "nextCommandPrerequisite") {
    issues.push("nextActionContract must record nextCommandPrerequisite field");
  }
  if (info.nextActionContract?.finalGateCommand !== "npm run ios:install:evidence:after-phone:final") {
    issues.push("nextActionContract must record the final all-in evidence command");
  }
  if (info.nextActionContract?.finalGateTerminalCommand !== "test -d webapp && cd webapp; npm run ios:install:evidence:after-phone:final") {
    issues.push("nextActionContract must record the paste-ready final all-in evidence command");
  }
  if (info.nextActionContract?.finalGatePrerequisite !== "Run only after Add to Home Screen, Travel icon launch, and install proof save.") {
    issues.push("nextActionContract must record the final gate prerequisite");
  }

  if (info.configuredPublicOrigin && !info.configuredPublicOriginIsHttps && !allowHttp) {
    issues.push("configuredPublicOrigin is set but is not HTTPS");
  }

  return issues;
}

function resultStatus(issues) {
  return issues.length === 0 ? "ready" : "blocked";
}

function resultSummary(issues) {
  return issues.length === 0
    ? "iPhone Home Screen install readiness passed"
    : `iPhone Home Screen install readiness blocked by ${issues.length} issue${issues.length === 1 ? "" : "s"}`;
}

function readinessMode(info, options, issues) {
  if (issues.length > 0) return "not-ready";
  const recommended = info.recommendedInstallUrl ? new URL(info.recommendedInstallUrl) : null;
  if (recommended?.protocol === "https:") return "stable-https";
  if (options.allowHttp) return "local-http-check";
  return "not-ready";
}

function handoffReady(info, options, issues) {
  return issues.length === 0 && readinessMode(info, options, issues) === "stable-https";
}

function normalizedTimeoutMs(value) {
  const timeoutMs = Number(value);
  return Number.isFinite(timeoutMs) && timeoutMs > 0 ? timeoutMs : DEFAULT_TIMEOUT_MS;
}

async function fetchInstallInfo(origin, timeoutMs) {
  const endpoint = joinUrl(origin, "/api/install-info");
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), normalizedTimeoutMs(timeoutMs));
  let response;
  try {
    response = await fetch(endpoint, {
      headers: { Accept: "application/json" },
      signal: controller.signal,
    });
  } catch (error) {
    if (error?.name === "AbortError") {
      throw new Error(`GET ${endpoint} timed out after ${normalizedTimeoutMs(timeoutMs)}ms`);
    }
    throw error;
  } finally {
    clearTimeout(timeout);
  }

  if (!response.ok) {
    throw new Error(`GET ${endpoint} failed with HTTP ${response.status}`);
  }

  return response.json();
}

async function fetchLaunchProofCheck(origin, timeoutMs) {
  const endpoint = joinUrl(origin, "/api/ios-launch-proof/check");
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), normalizedTimeoutMs(timeoutMs));
  let response;
  try {
    response = await fetch(endpoint, {
      headers: { Accept: "application/json" },
      signal: controller.signal,
    });
  } catch (error) {
    if (error?.name === "AbortError") {
      throw new Error(`GET ${endpoint} timed out after ${normalizedTimeoutMs(timeoutMs)}ms`);
    }
    throw error;
  } finally {
    clearTimeout(timeout);
  }

  if (response.status === 404) {
    return {
      ok: false,
      status: "missing",
      summary: "iOS Home Screen launch proof check not found",
      issues: ["launch proof check not found"],
    };
  }

  if (!response.ok) {
    throw new Error(`GET ${endpoint} failed with HTTP ${response.status}`);
  }

  return response.json();
}

async function fetchInstallQrSvg(url, timeoutMs) {
  if (!url) {
    return {
      ok: false,
      status: "missing",
      summary: "install QR SVG URL missing",
      httpStatus: 0,
      contentType: "",
    };
  }
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), normalizedTimeoutMs(timeoutMs));
  let response;
  try {
    response = await fetch(url, {
      headers: { Accept: "image/svg+xml" },
      signal: controller.signal,
    });
  } catch (error) {
    if (error?.name === "AbortError") {
      return {
        ok: false,
        status: "timeout",
        summary: `install QR SVG timed out after ${normalizedTimeoutMs(timeoutMs)}ms`,
        httpStatus: 0,
        contentType: "",
      };
    }
    throw error;
  } finally {
    clearTimeout(timeout);
  }
  const contentType = response.headers.get("content-type") || "";
  const body = await response.text();
  if (!response.ok) {
    return {
      ok: false,
      status: `http-${response.status}`,
      summary: `install QR SVG returned HTTP ${response.status}`,
      httpStatus: response.status,
      contentType,
    };
  }
  const ok = contentType.includes("image/svg+xml") && body.includes("<svg");
  return {
    ok,
    status: ok ? "ready" : "invalid",
    summary: ok ? "install QR SVG is reachable" : "install QR SVG response is not an SVG",
    httpStatus: response.status,
    contentType,
  };
}

function qrTargetParamFetchUrl(svgUrl, targetUrl) {
  if (!svgUrl || !targetUrl) return "";
  const url = new URL(svgUrl);
  url.searchParams.set("target", targetUrl);
  return url.toString();
}

function installSessionSummaryUrlFromTarget(value) {
  if (!value) return "";
  try {
    const url = new URL(value);
    url.pathname = "/api/ios-install-session.txt";
    url.search = "";
    url.hash = "";
    return url.toString();
  } catch {
    return "";
  }
}

async function fetchInstallHandoffText(url, timeoutMs) {
  if (!url) {
    return {
      ok: false,
      status: "missing",
      summary: "install handoff URL missing",
      httpStatus: 0,
      contentType: "",
    };
  }
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), normalizedTimeoutMs(timeoutMs));
  let response;
  try {
    response = await fetch(url, {
      headers: { Accept: "text/plain" },
      signal: controller.signal,
    });
  } catch (error) {
    if (error?.name === "AbortError") {
      return {
        ok: false,
        status: "timeout",
        summary: `install handoff timed out after ${normalizedTimeoutMs(timeoutMs)}ms`,
        httpStatus: 0,
        contentType: "",
      };
    }
    throw error;
  } finally {
    clearTimeout(timeout);
  }
  const contentType = response.headers.get("content-type") || "";
  const body = await response.text();
  if (!response.ok) {
    return {
      ok: false,
      status: `http-${response.status}`,
      summary: `install handoff returned HTTP ${response.status}`,
      httpStatus: response.status,
      contentType,
    };
  }
  const ok = contentType.includes("text/plain")
    && body.includes("Travel Planner iPhone Home Screen install handoff")
    && body.includes("copy this URL into Safari first")
    && body.includes("Use this proof save URL only after launching the Travel icon")
    && body.includes("proofSaveHash=#iosInstallProofSaveButton")
    && body.includes("proofSaveTargetId=iosInstallProofSaveButton")
    && body.includes("After first Home Screen launch:")
    && body.includes("Create the first travel plan")
    && body.includes("offline snapshots")
    && body.includes("ios:install:evidence:after-phone:final")
    && body.includes("phoneFirst=true");
  return {
    ok,
    status: ok ? "ready" : "invalid",
    summary: ok ? "install handoff is reachable" : "install handoff response is missing Safari recovery or first-run checklist guidance",
    httpStatus: response.status,
    contentType,
  };
}

async function fetchInstallRunbookText(url, timeoutMs) {
  if (!url) {
    return {
      ok: false,
      status: "missing",
      summary: "install runbook URL missing",
      httpStatus: 0,
      contentType: "",
    };
  }
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), normalizedTimeoutMs(timeoutMs));
  let response;
  try {
    response = await fetch(url, {
      headers: { Accept: "text/plain" },
      signal: controller.signal,
    });
  } catch (error) {
    if (error?.name === "AbortError") {
      return {
        ok: false,
        status: "timeout",
        summary: `install runbook timed out after ${normalizedTimeoutMs(timeoutMs)}ms`,
        httpStatus: 0,
        contentType: "",
      };
    }
    throw error;
  } finally {
    clearTimeout(timeout);
  }
  const contentType = response.headers.get("content-type") || "";
  const body = await response.text();
  if (!response.ok) {
    return {
      ok: false,
      status: `http-${response.status}`,
      summary: `install runbook returned HTTP ${response.status}`,
      httpStatus: response.status,
      contentType,
    };
  }
  const ok = contentType.includes("text/plain")
    && body.includes("Travel Planner iPhone install runbook")
    && body.includes("ios:install:evidence:before-phone")
    && body.includes("ios:install:evidence:after-phone")
    && body.includes("ios:install:evidence:after-phone:final")
    && body.includes("ios:install:evidence:preinstall")
    && body.includes("ios:install:evidence:postinstall")
    && body.includes("protectedRecommendedInstallUrlTemplate=")
    && body.includes("protectedRecommendedShortInstallUrlTemplate=")
    && body.includes("travelAccessKey=YOUR_TRAVEL_ACCESS_KEY")
    && body.includes("installReadinessSource=")
    && body.includes("installReadinessSummary=")
    && body.includes("proofSaveHash=#iosInstallProofSaveButton")
    && body.includes("proofSaveTargetId=iosInstallProofSaveButton")
    && body.includes("proofSaveUrl=")
    && body.includes("#iosInstallProofSaveButton")
    && body.includes("nextActionPhoneFirstField=phoneFirst")
    && body.includes("nextActionFinalGateCommand=npm run ios:install:evidence:after-phone:final");
  return {
    ok,
    status: ok ? "ready" : "invalid",
    summary: ok ? "install runbook is reachable" : "install runbook response is missing required install commands",
    httpStatus: response.status,
    contentType,
  };
}

function runbookHasPhase(runbook, id) {
  return (runbook?.phases || []).some((phase) => phase?.id === id);
}

function runbookIncludesCommand(runbook, id, command) {
  const phase = (runbook?.phases || []).find((item) => item?.id === id) || {};
  return [...(phase.commands || []), ...(phase.terminalCommands || [])].some((value) => String(value || "").includes(command));
}

function runbookHasProtectedTemplate(value, pathname) {
  try {
    const url = new URL(value);
    return url.pathname === pathname && url.searchParams.get("travelAccessKey") === "YOUR_TRAVEL_ACCESS_KEY";
  } catch {
    return false;
  }
}

function runbookHasProofSaveUrl(value) {
  try {
    const url = new URL(value);
    return url.pathname === "/install.html" && url.hash === "#iosInstallProofSaveButton";
  } catch {
    return false;
  }
}

async function fetchInstallRunbookJson(url, timeoutMs) {
  if (!url) {
    return {
      ok: false,
      status: "missing",
      summary: "install runbook JSON URL missing",
      httpStatus: 0,
      contentType: "",
    };
  }
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), normalizedTimeoutMs(timeoutMs));
  let response;
  try {
    response = await fetch(url, {
      headers: { Accept: "application/json" },
      signal: controller.signal,
    });
  } catch (error) {
    if (error?.name === "AbortError") {
      return {
        ok: false,
        status: "timeout",
        summary: `install runbook JSON timed out after ${normalizedTimeoutMs(timeoutMs)}ms`,
        httpStatus: 0,
        contentType: "",
      };
    }
    throw error;
  } finally {
    clearTimeout(timeout);
  }
  const contentType = response.headers.get("content-type") || "";
  if (!response.ok) {
    return {
      ok: false,
      status: `http-${response.status}`,
      summary: `install runbook JSON returned HTTP ${response.status}`,
      httpStatus: response.status,
      contentType,
    };
  }
  const runbook = await response.json();
  const ok = runbook?.schemaVersion === 1
    && runbookHasPhase(runbook, "pre-install-evidence")
    && runbookHasPhase(runbook, "phone-install")
    && runbookHasPhase(runbook, "post-install-evidence")
    && runbookHasPhase(runbook, "completion-summary")
    && runbookIncludesCommand(runbook, "pre-install-evidence", "ios:install:evidence:before-phone")
    && runbookIncludesCommand(runbook, "post-install-evidence", "ios:install:evidence:after-phone")
    && runbookIncludesCommand(runbook, "completion-summary", "ios:install:evidence:after-phone:final")
    && runbookIncludesCommand(runbook, "pre-install-evidence", "ios:install:evidence:preinstall")
    && runbookIncludesCommand(runbook, "post-install-evidence", "ios:install:evidence:postinstall")
    && runbookHasProtectedTemplate(runbook.protectedRecommendedInstallUrlTemplate, "/install.html")
    && runbookHasProtectedTemplate(runbook.protectedRecommendedShortInstallUrlTemplate, "/i")
    && runbook?.installReadinessSummary?.safariRequired === true
    && typeof runbook?.installReadinessSummary?.summary === "string"
    && runbook?.proofSaveHash === "#iosInstallProofSaveButton"
    && runbook?.proofSaveTargetId === "iosInstallProofSaveButton"
    && runbookHasProofSaveUrl(runbook.proofSaveUrl)
    && runbook?.nextActionContract?.phoneFirstField === "phoneFirst"
    && runbook?.nextActionContract?.finalGateCommand === "npm run ios:install:evidence:after-phone:final"
    && runbook?.nextActionContract?.finalGateTerminalCommand === "test -d webapp && cd webapp; npm run ios:install:evidence:after-phone:final";
  return {
    ok,
    status: ok ? "ready" : "invalid",
    summary: ok ? "install runbook JSON is reachable" : "install runbook JSON is missing required phases or commands",
    httpStatus: response.status,
    contentType,
  };
}

async function writeOutput(outputPath, content) {
  if (!outputPath) return;
  const resolvedPath = path.isAbsolute(outputPath) ? outputPath : path.join(webappDir, outputPath);
  await mkdir(path.dirname(resolvedPath), { recursive: true });
  await writeFile(resolvedPath, content.endsWith("\n") ? content : `${content}\n`);
}

function outputPath(options) {
  return options.output
    || (options.outputEnv ? process.env[options.outputEnv] : "")
    || process.env.TRAVEL_IOS_INSTALL_CHECK_PATH
    || options.outputDefault
    || "";
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  const info = await fetchInstallInfo(options.origin, options.timeoutMs);
  const issues = checkInstallInfo(info, options);
  let followRecommendedOrigin = "";
  let recommendedInfo = null;
  let launchProofOrigin = "";
  let launchProofCheck = null;
  let installQrOrigin = "";
  let installQrFetchUrl = "";
  let installQrFetchTargetUrl = "";
  let installQrCheck = null;
  let installQrTargetParamFetchUrl = "";
  let installQrTargetParamFetchTargetUrl = "";
  let installQrTargetParamCheck = null;
  let installSessionQrFetchUrl = "";
  let installSessionQrFetchTargetUrl = "";
  let installSessionQrCheck = null;
  let installSessionQrTargetParamFetchUrl = "";
  let installSessionQrTargetParamFetchTargetUrl = "";
  let installSessionQrTargetParamCheck = null;
  let installRunbookOrigin = "";
  let installRunbookFetchUrl = "";
  let installRunbookCheck = null;
  let installRunbookJsonFetchUrl = "";
  let installRunbookJsonCheck = null;
  let installHandoffFetchUrl = "";
  let installHandoffCheck = null;

  if (options.followRecommended && info.recommendedInstallUrl) {
    followRecommendedOrigin = new URL(info.recommendedInstallUrl).origin;
    recommendedInfo = await fetchInstallInfo(followRecommendedOrigin, options.timeoutMs);
    issues.push(...checkInstallInfo(recommendedInfo, options).map((issue) => `recommended origin: ${issue}`));
  }

  const actualReadinessMode = readinessMode(info, options, issues);
  if (options.requireHandoffReady && !handoffReady(info, options, issues)) {
    issues.push(`handoffReady is required but readinessMode=${actualReadinessMode}`);
  }

  if (options.requireLaunchProof) {
    launchProofOrigin = followRecommendedOrigin || options.origin;
    launchProofCheck = await fetchLaunchProofCheck(launchProofOrigin, options.timeoutMs);
    if (!launchProofCheck.ok) {
      issues.push(`launchProof is required from ${launchProofOrigin} but status=${launchProofCheck.status || "unknown"}`);
    }
  }

  if (options.requireInstallQr) {
    const qrInfo = recommendedInfo || info;
    installQrOrigin = followRecommendedOrigin || options.origin;
    installQrFetchUrl = qrInfo.installQrSvgUrl || "";
    installQrFetchTargetUrl = qrInfo.installQrTargetUrl || "";
    installQrCheck = await fetchInstallQrSvg(installQrFetchUrl, options.timeoutMs);
    if (!installQrCheck.ok) {
      issues.push(`installQr is required from ${installQrOrigin} but status=${installQrCheck.status || "unknown"}`);
    }
    installQrTargetParamFetchTargetUrl = options.installQrTarget || qrInfo.recommendedShortInstallUrl || qrInfo.recommendedInstallUrl || "";
    installQrTargetParamFetchUrl = qrTargetParamFetchUrl(installQrFetchUrl, installQrTargetParamFetchTargetUrl);
    installQrTargetParamCheck = await fetchInstallQrSvg(installQrTargetParamFetchUrl, options.timeoutMs);
    if (!installQrTargetParamCheck.ok) {
      issues.push(`installQr target parameter is required from ${installQrOrigin} but status=${installQrTargetParamCheck.status || "unknown"}`);
    }
    installSessionQrFetchUrl = joinUrl(installQrOrigin, "/api/ios-install-session-qr.svg");
    installSessionQrFetchTargetUrl = installSessionSummaryUrlFromTarget(qrInfo.recommendedInstallUrl || "");
    installSessionQrCheck = await fetchInstallQrSvg(installSessionQrFetchUrl, options.timeoutMs);
    if (!installSessionQrCheck.ok) {
      issues.push(`installSessionQr is required from ${installQrOrigin} but status=${installSessionQrCheck.status || "unknown"}`);
    }
    installSessionQrTargetParamFetchTargetUrl = installSessionSummaryUrlFromTarget(installQrTargetParamFetchTargetUrl);
    installSessionQrTargetParamFetchUrl = qrTargetParamFetchUrl(installSessionQrFetchUrl, installSessionQrTargetParamFetchTargetUrl);
    installSessionQrTargetParamCheck = await fetchInstallQrSvg(installSessionQrTargetParamFetchUrl, options.timeoutMs);
    if (!installSessionQrTargetParamCheck.ok) {
      issues.push(`installSessionQr target parameter is required from ${installQrOrigin} but status=${installSessionQrTargetParamCheck.status || "unknown"}`);
    }
  }

  if (options.requireInstallRunbook) {
    const runbookInfo = recommendedInfo || info;
    installRunbookOrigin = followRecommendedOrigin || options.origin;
    installRunbookFetchUrl = runbookInfo.installRunbookUrl || "";
    installRunbookCheck = await fetchInstallRunbookText(installRunbookFetchUrl, options.timeoutMs);
    installRunbookJsonFetchUrl = runbookInfo.installRunbookJsonUrl || "";
    installRunbookJsonCheck = await fetchInstallRunbookJson(installRunbookJsonFetchUrl, options.timeoutMs);
    installHandoffFetchUrl = new URL("/api/ios-install-handoff.txt", installRunbookOrigin).toString();
    installHandoffCheck = await fetchInstallHandoffText(installHandoffFetchUrl, options.timeoutMs);
    if (!installRunbookCheck.ok) {
      issues.push(`installRunbook is required from ${installRunbookOrigin} but status=${installRunbookCheck.status || "unknown"}`);
    }
    if (!installRunbookJsonCheck.ok) {
      issues.push(`installRunbookJson is required from ${installRunbookOrigin} but status=${installRunbookJsonCheck.status || "unknown"}`);
    }
    if (!installHandoffCheck.ok) {
      issues.push(`installHandoff is required from ${installRunbookOrigin} but status=${installHandoffCheck.status || "unknown"}`);
    }
  }

  if (options.json) {
    const output = JSON.stringify({
      schemaVersion: 1,
      ok: issues.length === 0,
      status: resultStatus(issues),
      summary: resultSummary(issues),
      readinessMode: readinessMode(info, options, issues),
      handoffReady: handoffReady(info, options, issues),
      envPath: options.envPath,
      envSource: options.envSource,
      envLoaded: options.envLoaded,
      envError: options.envError,
      origin: options.origin,
      allowHttp: options.allowHttp,
      followRecommended: options.followRecommended,
      requireHandoffReady: options.requireHandoffReady,
      requireLaunchProof: options.requireLaunchProof,
      requireInstallQr: options.requireInstallQr,
      installQrTarget: options.installQrTarget,
      requireInstallRunbook: options.requireInstallRunbook,
      followRecommendedOrigin,
      launchProofOrigin,
      timeoutMs: options.timeoutMs,
      launchProofOk: Boolean(launchProofCheck?.ok),
      launchProofStatus: launchProofCheck?.status || "",
      launchProofSummary: launchProofCheck?.summary || "",
      launchProofCapturedAt: launchProofCheck?.capturedAt || "",
      launchProofSavedAt: launchProofCheck?.savedAt || "",
      installQrSvgUrl: info.installQrSvgUrl || "",
      installQrTargetUrl: info.installQrTargetUrl || "",
      installRunbookUrl: info.installRunbookUrl || "",
      installRunbookJsonUrl: info.installRunbookJsonUrl || "",
      installSessionUrl: info.installSessionUrl || "",
      installSessionQrUrl: info.installSessionQrUrl || "",
      protectedRecommendedInstallUrlTemplate: info.protectedRecommendedInstallUrlTemplate || "",
      protectedRecommendedShortInstallUrlTemplate: info.protectedRecommendedShortInstallUrlTemplate || "",
      installReadinessSource: info.installReadinessSummary?.recommendedUrlSource || "",
      installReadinessHttps: info.installReadinessSummary?.recommendedUrlIsHttps === true,
      installReadinessSameWifiRequired: info.installReadinessSummary?.sameWifiRequired === true,
      installReadinessSafariRequired: info.installReadinessSummary?.safariRequired === true,
      installReadinessSummary: info.installReadinessSummary?.summary || "",
      protectedInstallAccessKeyPlaceholder: info.protectedInstallAccessKeyHandling?.placeholder || "",
      protectedInstallAccessKeyLocalCompositionOnly: info.protectedInstallAccessKeyHandling?.localCompositionOnly === true,
      protectedInstallAccessKeyStoresEnteredKey: info.protectedInstallAccessKeyHandling?.storesEnteredKey === true,
      protectedInstallAccessKeySendsEnteredKeyToServer: info.protectedInstallAccessKeyHandling?.sendsEnteredKeyToServer === true,
      protectedInstallAccessKeyClearsTemporaryInputAfterCopy: info.protectedInstallAccessKeyHandling?.clearsTemporaryInputAfterCopy === true,
      nextActionPhoneFirstField: info.nextActionContract?.phoneFirstField || "",
      nextActionFinalGateCommand: info.nextActionContract?.finalGateCommand || "",
      nextActionFinalGateTerminalCommand: info.nextActionContract?.finalGateTerminalCommand || "",
      nextActionFinalGatePrerequisite: info.nextActionContract?.finalGatePrerequisite || "",
      installRunbookFetchOrigin: installRunbookOrigin,
      installRunbookFetchUrl,
      installRunbookFetchOk: Boolean(installRunbookCheck?.ok),
      installRunbookFetchStatus: installRunbookCheck?.status || "",
      installRunbookFetchSummary: installRunbookCheck?.summary || "",
      installRunbookFetchHttpStatus: installRunbookCheck?.httpStatus || 0,
      installRunbookFetchContentType: installRunbookCheck?.contentType || "",
      installRunbookJsonFetchUrl,
      installRunbookJsonFetchOk: Boolean(installRunbookJsonCheck?.ok),
      installRunbookJsonFetchStatus: installRunbookJsonCheck?.status || "",
      installRunbookJsonFetchSummary: installRunbookJsonCheck?.summary || "",
      installRunbookJsonFetchHttpStatus: installRunbookJsonCheck?.httpStatus || 0,
      installRunbookJsonFetchContentType: installRunbookJsonCheck?.contentType || "",
      installHandoffFetchUrl,
      installHandoffFetchOk: Boolean(installHandoffCheck?.ok),
      installHandoffFetchStatus: installHandoffCheck?.status || "",
      installHandoffFetchSummary: installHandoffCheck?.summary || "",
      installHandoffFetchHttpStatus: installHandoffCheck?.httpStatus || 0,
      installHandoffFetchContentType: installHandoffCheck?.contentType || "",
      installQrFetchOrigin: installQrOrigin,
      installQrFetchUrl,
      installQrFetchTargetUrl,
      installQrFetchOk: Boolean(installQrCheck?.ok),
      installQrFetchStatus: installQrCheck?.status || "",
      installQrFetchSummary: installQrCheck?.summary || "",
      installQrFetchHttpStatus: installQrCheck?.httpStatus || 0,
      installQrFetchContentType: installQrCheck?.contentType || "",
      installQrTargetParamFetchUrl,
      installQrTargetParamFetchTargetUrl,
      installQrTargetParamFetchOk: Boolean(installQrTargetParamCheck?.ok),
      installQrTargetParamFetchStatus: installQrTargetParamCheck?.status || "",
      installQrTargetParamFetchSummary: installQrTargetParamCheck?.summary || "",
      installQrTargetParamFetchHttpStatus: installQrTargetParamCheck?.httpStatus || 0,
      installQrTargetParamFetchContentType: installQrTargetParamCheck?.contentType || "",
      installSessionQrFetchUrl,
      installSessionQrFetchTargetUrl,
      installSessionQrFetchOk: Boolean(installSessionQrCheck?.ok),
      installSessionQrFetchStatus: installSessionQrCheck?.status || "",
      installSessionQrFetchSummary: installSessionQrCheck?.summary || "",
      installSessionQrFetchHttpStatus: installSessionQrCheck?.httpStatus || 0,
      installSessionQrFetchContentType: installSessionQrCheck?.contentType || "",
      installSessionQrTargetParamFetchUrl,
      installSessionQrTargetParamFetchTargetUrl,
      installSessionQrTargetParamFetchOk: Boolean(installSessionQrTargetParamCheck?.ok),
      installSessionQrTargetParamFetchStatus: installSessionQrTargetParamCheck?.status || "",
      installSessionQrTargetParamFetchSummary: installSessionQrTargetParamCheck?.summary || "",
      installSessionQrTargetParamFetchHttpStatus: installSessionQrTargetParamCheck?.httpStatus || 0,
      installSessionQrTargetParamFetchContentType: installSessionQrTargetParamCheck?.contentType || "",
      proofSaveHash: info.proofSaveHash || "",
      proofSaveTargetId: info.proofSaveTargetId || "",
      proofSaveUrl: info.proofSaveUrl || "",
      recommendedInstallUrl: info.recommendedInstallUrl || "",
      configuredPublicOrigin: info.configuredPublicOrigin || "",
      configuredPublicOriginIsHttps: Boolean(info.configuredPublicOriginIsHttps),
      deploymentRecommendation: info.deploymentRecommendation || "",
      issues,
    }, null, 2);
    await writeOutput(outputPath(options), output);
    console.log(output);
    if (issues.length > 0) process.exitCode = 1;
    return;
  }

  const output = [
    `status=${resultStatus(issues)}`,
    `summary=${resultSummary(issues)}`,
    `readinessMode=${readinessMode(info, options, issues)}`,
    `handoffReady=${handoffReady(info, options, issues) ? "true" : "false"}`,
    `envPath=${options.envPath}`,
    `envSource=${options.envSource}`,
    `envLoaded=${options.envLoaded ? "true" : "false"}`,
    options.envError ? `envError=${options.envError}` : "",
    `origin=${options.origin}`,
    `requireHandoffReady=${options.requireHandoffReady ? "true" : "false"}`,
    `requireLaunchProof=${options.requireLaunchProof ? "true" : "false"}`,
    `requireInstallQr=${options.requireInstallQr ? "true" : "false"}`,
    options.installQrTarget ? `installQrTarget=${options.installQrTarget}` : "",
    `requireInstallRunbook=${options.requireInstallRunbook ? "true" : "false"}`,
    launchProofOrigin ? `launchProofOrigin=${launchProofOrigin}` : "",
    launchProofCheck ? `launchProofOk=${launchProofCheck.ok ? "true" : "false"}` : "",
    launchProofCheck ? `launchProofStatus=${launchProofCheck.status || ""}` : "",
    launchProofCheck?.capturedAt ? `launchProofCapturedAt=${launchProofCheck.capturedAt}` : "",
    launchProofCheck?.savedAt ? `launchProofSavedAt=${launchProofCheck.savedAt}` : "",
    `installQrSvgUrl=${info.installQrSvgUrl || ""}`,
    `installQrTargetUrl=${info.installQrTargetUrl || ""}`,
    `proofSaveHash=${info.proofSaveHash || ""}`,
    `proofSaveTargetId=${info.proofSaveTargetId || ""}`,
    `proofSaveUrl=${info.proofSaveUrl || ""}`,
    `installRunbookUrl=${info.installRunbookUrl || ""}`,
    `installRunbookJsonUrl=${info.installRunbookJsonUrl || ""}`,
    `installSessionUrl=${info.installSessionUrl || ""}`,
    `installSessionQrUrl=${info.installSessionQrUrl || ""}`,
    `protectedRecommendedInstallUrlTemplate=${info.protectedRecommendedInstallUrlTemplate || ""}`,
    `protectedRecommendedShortInstallUrlTemplate=${info.protectedRecommendedShortInstallUrlTemplate || ""}`,
    `installReadinessSource=${info.installReadinessSummary?.recommendedUrlSource || ""}`,
    `installReadinessHttps=${info.installReadinessSummary?.recommendedUrlIsHttps === true ? "true" : "false"}`,
    `installReadinessSameWifiRequired=${info.installReadinessSummary?.sameWifiRequired === true ? "true" : "false"}`,
    `installReadinessSafariRequired=${info.installReadinessSummary?.safariRequired === true ? "true" : "false"}`,
    `installReadinessSummary=${info.installReadinessSummary?.summary || ""}`,
    `protectedInstallAccessKeyPlaceholder=${info.protectedInstallAccessKeyHandling?.placeholder || ""}`,
    `protectedInstallAccessKeyLocalCompositionOnly=${info.protectedInstallAccessKeyHandling?.localCompositionOnly === true ? "true" : "false"}`,
    `protectedInstallAccessKeyStoresEnteredKey=${info.protectedInstallAccessKeyHandling?.storesEnteredKey === true ? "true" : "false"}`,
    `protectedInstallAccessKeySendsEnteredKeyToServer=${info.protectedInstallAccessKeyHandling?.sendsEnteredKeyToServer === true ? "true" : "false"}`,
    `protectedInstallAccessKeyClearsTemporaryInputAfterCopy=${info.protectedInstallAccessKeyHandling?.clearsTemporaryInputAfterCopy === true ? "true" : "false"}`,
    `nextActionPhoneFirstField=${info.nextActionContract?.phoneFirstField || ""}`,
    `nextActionFinalGateCommand=${info.nextActionContract?.finalGateCommand || ""}`,
    `nextActionFinalGateTerminalCommand=${info.nextActionContract?.finalGateTerminalCommand || ""}`,
    `nextActionFinalGatePrerequisite=${info.nextActionContract?.finalGatePrerequisite || ""}`,
    installRunbookOrigin ? `installRunbookFetchOrigin=${installRunbookOrigin}` : "",
    installRunbookFetchUrl ? `installRunbookFetchUrl=${installRunbookFetchUrl}` : "",
    installRunbookCheck ? `installRunbookFetchOk=${installRunbookCheck.ok ? "true" : "false"}` : "",
    installRunbookCheck ? `installRunbookFetchStatus=${installRunbookCheck.status || ""}` : "",
    installRunbookCheck ? `installRunbookFetchHttpStatus=${installRunbookCheck.httpStatus || 0}` : "",
    installRunbookCheck ? `installRunbookFetchContentType=${installRunbookCheck.contentType || ""}` : "",
    installRunbookJsonFetchUrl ? `installRunbookJsonFetchUrl=${installRunbookJsonFetchUrl}` : "",
    installRunbookJsonCheck ? `installRunbookJsonFetchOk=${installRunbookJsonCheck.ok ? "true" : "false"}` : "",
    installRunbookJsonCheck ? `installRunbookJsonFetchStatus=${installRunbookJsonCheck.status || ""}` : "",
    installRunbookJsonCheck ? `installRunbookJsonFetchHttpStatus=${installRunbookJsonCheck.httpStatus || 0}` : "",
    installRunbookJsonCheck ? `installRunbookJsonFetchContentType=${installRunbookJsonCheck.contentType || ""}` : "",
    installHandoffFetchUrl ? `installHandoffFetchUrl=${installHandoffFetchUrl}` : "",
    installHandoffCheck ? `installHandoffFetchOk=${installHandoffCheck.ok ? "true" : "false"}` : "",
    installHandoffCheck ? `installHandoffFetchStatus=${installHandoffCheck.status || ""}` : "",
    installHandoffCheck ? `installHandoffFetchSummary=${installHandoffCheck.summary || ""}` : "",
    installHandoffCheck ? `installHandoffFetchHttpStatus=${installHandoffCheck.httpStatus || 0}` : "",
    installHandoffCheck ? `installHandoffFetchContentType=${installHandoffCheck.contentType || ""}` : "",
    installQrOrigin ? `installQrFetchOrigin=${installQrOrigin}` : "",
    installQrFetchUrl ? `installQrFetchUrl=${installQrFetchUrl}` : "",
    installQrFetchTargetUrl ? `installQrFetchTargetUrl=${installQrFetchTargetUrl}` : "",
    installQrCheck ? `installQrFetchOk=${installQrCheck.ok ? "true" : "false"}` : "",
    installQrCheck ? `installQrFetchStatus=${installQrCheck.status || ""}` : "",
    installQrCheck ? `installQrFetchHttpStatus=${installQrCheck.httpStatus || 0}` : "",
    installQrCheck ? `installQrFetchContentType=${installQrCheck.contentType || ""}` : "",
    installQrTargetParamFetchUrl ? `installQrTargetParamFetchUrl=${installQrTargetParamFetchUrl}` : "",
    installQrTargetParamFetchTargetUrl ? `installQrTargetParamFetchTargetUrl=${installQrTargetParamFetchTargetUrl}` : "",
    installQrTargetParamCheck ? `installQrTargetParamFetchOk=${installQrTargetParamCheck.ok ? "true" : "false"}` : "",
    installQrTargetParamCheck ? `installQrTargetParamFetchStatus=${installQrTargetParamCheck.status || ""}` : "",
    installQrTargetParamCheck ? `installQrTargetParamFetchHttpStatus=${installQrTargetParamCheck.httpStatus || 0}` : "",
    installQrTargetParamCheck ? `installQrTargetParamFetchContentType=${installQrTargetParamCheck.contentType || ""}` : "",
    installSessionQrFetchUrl ? `installSessionQrFetchUrl=${installSessionQrFetchUrl}` : "",
    installSessionQrFetchTargetUrl ? `installSessionQrFetchTargetUrl=${installSessionQrFetchTargetUrl}` : "",
    installSessionQrCheck ? `installSessionQrFetchOk=${installSessionQrCheck.ok ? "true" : "false"}` : "",
    installSessionQrCheck ? `installSessionQrFetchStatus=${installSessionQrCheck.status || ""}` : "",
    installSessionQrCheck ? `installSessionQrFetchHttpStatus=${installSessionQrCheck.httpStatus || 0}` : "",
    installSessionQrCheck ? `installSessionQrFetchContentType=${installSessionQrCheck.contentType || ""}` : "",
    installSessionQrTargetParamFetchUrl ? `installSessionQrTargetParamFetchUrl=${installSessionQrTargetParamFetchUrl}` : "",
    installSessionQrTargetParamFetchTargetUrl ? `installSessionQrTargetParamFetchTargetUrl=${installSessionQrTargetParamFetchTargetUrl}` : "",
    installSessionQrTargetParamCheck ? `installSessionQrTargetParamFetchOk=${installSessionQrTargetParamCheck.ok ? "true" : "false"}` : "",
    installSessionQrTargetParamCheck ? `installSessionQrTargetParamFetchStatus=${installSessionQrTargetParamCheck.status || ""}` : "",
    installSessionQrTargetParamCheck ? `installSessionQrTargetParamFetchHttpStatus=${installSessionQrTargetParamCheck.httpStatus || 0}` : "",
    installSessionQrTargetParamCheck ? `installSessionQrTargetParamFetchContentType=${installSessionQrTargetParamCheck.contentType || ""}` : "",
    `recommendedInstallUrl=${info.recommendedInstallUrl || ""}`,
    `configuredPublicOrigin=${info.configuredPublicOrigin || ""}`,
    `configuredPublicOriginIsHttps=${info.configuredPublicOriginIsHttps ? "true" : "false"}`,
    `deploymentRecommendation=${info.deploymentRecommendation || ""}`,
    followRecommendedOrigin ? `followRecommendedOrigin=${followRecommendedOrigin}` : "",
  ].filter(Boolean).join("\n");
  await writeOutput(outputPath(options), output);
  console.log(output);

  if (issues.length > 0) {
    console.error(`ios-install-check=failed`);
    for (const issue of issues) console.error(`issue=${issue}`);
    process.exitCode = 1;
    return;
  }

  console.log("ios-install-check=passed");
}

main().catch(async (error) => {
  const options = parseArgs(process.argv.slice(2));
  if (options.json) {
    const output = JSON.stringify({
      schemaVersion: 1,
      ok: false,
      status: "error",
      summary: "iPhone Home Screen install readiness check could not complete",
      readinessMode: "error",
      handoffReady: false,
      envPath: options.envPath,
      envSource: options.envSource,
      envLoaded: options.envLoaded,
      envError: options.envError,
      origin: options.origin,
      allowHttp: options.allowHttp,
      followRecommended: options.followRecommended,
      requireHandoffReady: options.requireHandoffReady,
      requireLaunchProof: options.requireLaunchProof,
      requireInstallQr: options.requireInstallQr,
      requireInstallRunbook: options.requireInstallRunbook,
      timeoutMs: options.timeoutMs,
      error: error.message,
      issues: [error.message],
    }, null, 2);
    await writeOutput(outputPath(options), output);
    console.log(output);
  } else {
    console.error(`ios-install-check=failed`);
    console.error(`error=${error.message}`);
  }
  process.exitCode = 1;
});
