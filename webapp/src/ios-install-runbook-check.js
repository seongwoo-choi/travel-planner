#!/usr/bin/env node

import { mkdirSync, readFileSync, renameSync, rmSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const srcDir = path.dirname(fileURLToPath(import.meta.url));
const webappDir = path.resolve(srcDir, "..");
const args = process.argv.slice(2);
const evidenceDir = process.env.TRAVEL_EVIDENCE_DIR || "reports";
const jsonOutput = args.includes("--json") || args.some((arg) => arg.startsWith("--output"));
const inputArg = args.find((arg) => arg.startsWith("--input="));
const inputEnvArg = args.find((arg) => arg.startsWith("--input-env="));
const inputDefaultEvidenceArg = args.find((arg) => arg.startsWith("--input-default-evidence="));
const outputArg = args.find((arg) => arg.startsWith("--output="));
const outputEnvArg = args.find((arg) => arg.startsWith("--output-env="));
const outputDefaultEvidenceArg = args.find((arg) => arg.startsWith("--output-default-evidence="));
const inputEnvName = inputEnvArg ? inputEnvArg.slice("--input-env=".length) : "";
const outputEnvName = outputEnvArg ? outputEnvArg.slice("--output-env=".length) : "";
const inputDefaultEvidencePath = inputDefaultEvidenceArg
  ? path.join(evidenceDir, inputDefaultEvidenceArg.slice("--input-default-evidence=".length))
  : path.join(evidenceDir, "ios-install-runbook.json");
const outputDefaultEvidencePath = outputDefaultEvidenceArg
  ? path.join(evidenceDir, outputDefaultEvidenceArg.slice("--output-default-evidence=".length))
  : "";
const inputPath = inputArg
  ? inputArg.slice("--input=".length)
  : inputEnvName
    ? process.env[inputEnvName] || inputDefaultEvidencePath
    : inputDefaultEvidencePath;
const outputPath = outputArg
  ? outputArg.slice("--output=".length)
  : outputEnvName
    ? process.env[outputEnvName] || outputDefaultEvidencePath
    : outputDefaultEvidencePath;

function resolveWebappPath(value) {
  return path.isAbsolute(value) ? value : path.join(webappDir, value);
}

function writeAtomic(filePath, body) {
  const resolvedPath = resolveWebappPath(filePath);
  const tempPath = `${resolvedPath}.tmp-${process.pid}`;
  try {
    mkdirSync(path.dirname(resolvedPath), { recursive: true });
    writeFileSync(tempPath, body, "utf8");
    renameSync(tempPath, resolvedPath);
    console.error(`ios-install-runbook-check=${resolvedPath}`);
  } catch (error) {
    rmSync(tempPath, { force: true });
    console.error(`ios-install-runbook-check=failed (${error.message})`);
    process.exit(1);
  }
}

function issueIf(issues, condition, message) {
  if (condition) issues.push(message);
}

function isValidDateTime(value) {
  return typeof value === "string" && value.length > 0 && Number.isFinite(Date.parse(value));
}

function hasUrlPath(value, pathname) {
  try {
    return new URL(value).pathname === pathname;
  } catch {
    return false;
  }
}

function hasProofSaveUrl(value) {
  try {
    const url = new URL(value);
    return url.pathname === "/install.html" && url.hash === "#iosInstallProofSaveButton";
  } catch {
    return false;
  }
}

function hasAppShellRecoveryUrl(value) {
  try {
    const url = new URL(value);
    return url.pathname === "/" && url.hash === "#iosHomeDockShellRecovery";
  } catch {
    return false;
  }
}

function hasUrlPathAndHash(value, pathname, hash) {
  try {
    const url = new URL(value);
    return url.pathname === pathname && url.hash === hash;
  } catch {
    return false;
  }
}

function hasProtectedTemplate(value, pathname) {
  try {
    const url = new URL(value);
    return url.pathname === pathname && url.searchParams.get("travelAccessKey") === "YOUR_TRAVEL_ACCESS_KEY";
  } catch {
    return false;
  }
}

function textIncludes(values, needle) {
  return (values || []).some((value) => String(value || "").includes(needle));
}

function hasProtectedAccessKeyHandling(value) {
  return value?.placeholder === "YOUR_TRAVEL_ACCESS_KEY" &&
    value?.localCompositionOnly === true &&
    value?.storesEnteredKey === false &&
    value?.sendsEnteredKeyToServer === false &&
    value?.clearsTemporaryInputAfterCopy === true;
}

function phaseById(runbook, id) {
  return (runbook.phases || []).find((phase) => phase?.id === id) || {};
}

function checkRunbook(runbook) {
  const issues = [];
  const deploymentModes = new Set(["stable-https", "public-origin-not-https", "local-same-wifi-rehearsal"]);
  const readinessSources = new Set(["configured-public-https", "same-wifi-lan", "current-https-origin", "current-origin"]);
  issueIf(issues, runbook?.schemaVersion !== 1, "schemaVersion must be 1");
  issueIf(issues, !isValidDateTime(runbook?.generatedAt), "generatedAt must be an ISO date-time string");
  issueIf(issues, !Number.isInteger(runbook?.port) || runbook.port < 1, "port must be a positive integer");
  issueIf(issues, !deploymentModes.has(runbook?.deploymentMode), "deploymentMode must be stable-https, public-origin-not-https, or local-same-wifi-rehearsal");
  issueIf(issues, typeof runbook?.publicOrigin !== "string", "publicOrigin must be a string");
  issueIf(issues, typeof runbook?.publicOriginIsHttps !== "boolean", "publicOriginIsHttps must be a boolean");
  issueIf(issues, !hasUrlPath(runbook?.recommendedInstallUrl, "/install.html"), "recommendedInstallUrl must point to /install.html");
  issueIf(issues, !hasUrlPath(runbook?.recommendedShortInstallUrl, "/i"), "recommendedShortInstallUrl must point to /i");
  issueIf(issues, !hasProtectedTemplate(runbook?.protectedRecommendedInstallUrlTemplate, "/install.html"), "protectedRecommendedInstallUrlTemplate must point to /install.html with travelAccessKey=YOUR_TRAVEL_ACCESS_KEY");
  issueIf(issues, !hasProtectedTemplate(runbook?.protectedRecommendedShortInstallUrlTemplate, "/i"), "protectedRecommendedShortInstallUrlTemplate must point to /i with travelAccessKey=YOUR_TRAVEL_ACCESS_KEY");
  issueIf(issues, !hasProtectedAccessKeyHandling(runbook?.protectedInstallAccessKeyHandling), "protectedInstallAccessKeyHandling must preserve local-only temporary key handling rules");
  issueIf(issues, !readinessSources.has(runbook?.installReadinessSummary?.recommendedUrlSource), "installReadinessSummary must record a known recommendedUrlSource");
  issueIf(issues, typeof runbook?.installReadinessSummary?.recommendedUrlIsHttps !== "boolean", "installReadinessSummary must record recommendedUrlIsHttps boolean");
  issueIf(issues, typeof runbook?.installReadinessSummary?.sameWifiRequired !== "boolean", "installReadinessSummary must record sameWifiRequired boolean");
  issueIf(issues, runbook?.installReadinessSummary?.safariRequired !== true, "installReadinessSummary must mark safariRequired=true");
  issueIf(issues, typeof runbook?.installReadinessSummary?.summary !== "string" || runbook.installReadinessSummary.summary.length === 0, "installReadinessSummary must include a human summary");
  issueIf(issues, !hasUrlPath(runbook?.nextStepUrl, "/api/ios-install-next"), "nextStepUrl must point to /api/ios-install-next");
  issueIf(issues, !hasUrlPath(runbook?.nextStepTextUrl, "/api/ios-install-next.txt"), "nextStepTextUrl must point to /api/ios-install-next.txt");
  issueIf(issues, runbook?.proofSaveHash !== "#iosInstallProofSaveButton", "proofSaveHash must be #iosInstallProofSaveButton");
  issueIf(issues, runbook?.proofSaveTargetId !== "iosInstallProofSaveButton", "proofSaveTargetId must be iosInstallProofSaveButton");
  issueIf(issues, !hasProofSaveUrl(runbook?.proofSaveUrl), "proofSaveUrl must point to /install.html#iosInstallProofSaveButton");
  issueIf(issues, !hasUrlPathAndHash(runbook?.postInstallAppHomeUrl, "/", "#iosHomeDock"), "postInstallAppHomeUrl must point to /#iosHomeDock");
  issueIf(issues, !hasUrlPathAndHash(runbook?.postInstallNewPlanUrl, "/", "#planForm"), "postInstallNewPlanUrl must point to /#planForm");
  issueIf(issues, !hasAppShellRecoveryUrl(runbook?.appShellRecoveryUrl), "appShellRecoveryUrl must point to /#iosHomeDockShellRecovery");
  issueIf(issues, !hasAppShellRecoveryUrl(runbook?.appShellRecovery?.url), "appShellRecovery.url must point to /#iosHomeDockShellRecovery");
  issueIf(issues, runbook?.appShellRecovery?.triggerField !== "appShellUpdateNeeded", "appShellRecovery.triggerField must be appShellUpdateNeeded");
  issueIf(issues, runbook?.appShellRecovery?.triggerValue !== true, "appShellRecovery.triggerValue must be true");
  issueIf(issues, !Array.isArray(runbook?.appShellRecovery?.sequence), "appShellRecovery.sequence must be an array");
  issueIf(issues, !textIncludes(runbook?.appShellRecovery?.sequence, "app update check"), "appShellRecovery.sequence must include app update check");
  issueIf(issues, !textIncludes(runbook?.appShellRecovery?.sequence, "Save Home Screen proof again"), "appShellRecovery.sequence must include proof resave");
  issueIf(issues, !textIncludes(runbook?.appShellRecovery?.sequence, "final Mac gate"), "appShellRecovery.sequence must include final Mac gate");
  issueIf(issues, !hasUrlPath(runbook?.installInfoUrl, "/api/install-info.txt"), "installInfoUrl must point to /api/install-info.txt");
  issueIf(issues, !hasUrlPath(runbook?.handoffNoteUrl, "/api/ios-install-handoff.txt"), "handoffNoteUrl must point to /api/ios-install-handoff.txt");
  issueIf(issues, !hasUrlPath(runbook?.proofSummaryUrl, "/api/ios-launch-proof.txt"), "proofSummaryUrl must point to /api/ios-launch-proof.txt");
  issueIf(issues, runbook?.nextActionContract?.phoneFirstField !== "phoneFirst", "nextActionContract must record phoneFirst field");
  issueIf(issues, runbook?.nextActionContract?.nextCommandLabelField !== "nextCommandLabel", "nextActionContract must record nextCommandLabel field");
  issueIf(issues, runbook?.nextActionContract?.nextCommandPrerequisiteField !== "nextCommandPrerequisite", "nextActionContract must record nextCommandPrerequisite field");
  issueIf(issues, runbook?.nextActionContract?.finalGateCommand !== "npm run ios:install:evidence:after-phone:final", "nextActionContract must record the named final after-phone evidence command");
  issueIf(issues, runbook?.nextActionContract?.finalGateTerminalCommand !== "test -d webapp && cd webapp; npm run ios:install:evidence:after-phone:final", "nextActionContract must record the paste-ready named final after-phone evidence command");
  issueIf(issues, !Array.isArray(runbook?.lanOrigins), "lanOrigins must be an array");
  issueIf(issues, !Array.isArray(runbook?.phases), "phases must be an array");

  const expectedPhaseIds = ["prepare", "pre-install-evidence", "phone-install", "post-install-evidence", "completion-summary"];
  for (const id of expectedPhaseIds) {
    issueIf(issues, !phaseById(runbook, id).id, `missing phase ${id}`);
  }

  const prepare = phaseById(runbook, "prepare");
  const preInstall = phaseById(runbook, "pre-install-evidence");
  const phoneInstall = phaseById(runbook, "phone-install");
  const postInstall = phaseById(runbook, "post-install-evidence");
  const completionSummary = phaseById(runbook, "completion-summary");
  issueIf(issues, !textIncludes(prepare.commands, "npm run ios:install:next"), "prepare phase must include ios:install:next");
  issueIf(issues, !textIncludes(prepare.commands, "npm run ios:install:next:evidence"), "prepare phase must include ios:install:next:evidence");
  issueIf(issues, !textIncludes(prepare.commands, "npm run ios:install:urls"), "prepare phase must include ios:install:urls");
  issueIf(issues, !textIncludes(prepare.commands, "npm run ios:install:handoff:file"), "prepare phase must include ios:install:handoff:file");
  issueIf(issues, !textIncludes(prepare.commands, "npm run ios:install:handoff:evidence"), "prepare phase must include ios:install:handoff:evidence");
  issueIf(issues, !textIncludes(prepare.commands, "npm run ios:install:handoff-session:evidence"), "prepare phase must include ios:install:handoff-session:evidence");
  issueIf(issues, !textIncludes(prepare.commands, "npm start"), "prepare phase must include npm start");
  issueIf(issues, !textIncludes(preInstall.commands, "npm run ios:install:evidence:before-phone"), "pre-install phase must include ios:install:evidence:before-phone");
  issueIf(issues, !textIncludes(preInstall.commands, "npm run ios:install:evidence:preinstall"), "pre-install phase must include ios:install:evidence:preinstall");
  issueIf(issues, !textIncludes(preInstall.terminalCommands, "test -d webapp && cd webapp; npm run ios:install:evidence:before-phone"), "pre-install phase must include paste-ready before-phone terminal command");
  issueIf(issues, !textIncludes(preInstall.terminalCommands, "test -d webapp && cd webapp; npm run ios:install:evidence:preinstall"), "pre-install phase must include paste-ready preinstall terminal command");
  issueIf(issues, !textIncludes(preInstall.commands, "npm run ios:install:evidence:strict"), "pre-install phase must include ios:install:evidence:strict");
  issueIf(issues, !textIncludes(phoneInstall.phoneSteps, "Add to Home Screen"), "phone-install phase must include Add to Home Screen");
  issueIf(issues, !textIncludes(phoneInstall.phoneSteps, "Travel icon"), "phone-install phase must include Travel icon launch");
  issueIf(issues, !textIncludes(phoneInstall.phoneSteps, "설치 증거 저장"), "phone-install phase must include proof save");
  issueIf(issues, !textIncludes(postInstall.commands, "npm run ios:install:evidence:after-phone"), "post-install phase must include ios:install:evidence:after-phone");
  issueIf(issues, !textIncludes(postInstall.commands, "npm run ios:install:evidence:postinstall"), "post-install phase must include ios:install:evidence:postinstall");
  issueIf(issues, !textIncludes(postInstall.terminalCommands, "test -d webapp && cd webapp; npm run ios:install:evidence:after-phone"), "post-install phase must include paste-ready after-phone terminal command");
  issueIf(issues, !textIncludes(postInstall.terminalCommands, "test -d webapp && cd webapp; npm run ios:install:evidence:postinstall"), "post-install phase must include paste-ready postinstall terminal command");
  issueIf(issues, !textIncludes(postInstall.commands, "npm run ios:install:evidence:proof"), "post-install phase must include ios:install:evidence:proof");
  issueIf(issues, !textIncludes(postInstall.commands, "npm run ios:launch-proof:evidence"), "post-install phase must include ios:launch-proof:evidence");
  issueIf(issues, !textIncludes(completionSummary.commands, "npm run ios:install:summary"), "completion-summary phase must include ios:install:summary");
  issueIf(issues, !textIncludes(completionSummary.commands, "npm run ios:install:summary:schema:file"), "completion-summary phase must include ios:install:summary:schema:file");
  issueIf(issues, !textIncludes(completionSummary.commands, "npm run ios:install:summary:file"), "completion-summary phase must include ios:install:summary:file");
  issueIf(issues, !textIncludes(completionSummary.commands, "npm run ios:install:summary:gate"), "completion-summary phase must include ios:install:summary:gate");
  issueIf(issues, !textIncludes(completionSummary.commands, "npm run ios:install:summary:gate:file"), "completion-summary phase must include ios:install:summary:gate:file");
  issueIf(issues, !textIncludes(completionSummary.commands, "npm run ios:install:summary:evidence"), "completion-summary phase must include ios:install:summary:evidence");
  issueIf(issues, !textIncludes(completionSummary.commands, "npm run ios:install:summary:check:file"), "completion-summary phase must include ios:install:summary:check:file");
  issueIf(issues, !textIncludes(completionSummary.commands, "npm run ios:install:summary:check:schema:file"), "completion-summary phase must include ios:install:summary:check:schema:file");
  issueIf(issues, !textIncludes(completionSummary.commands, "npm run ios:install:summary:check:gate"), "completion-summary phase must include ios:install:summary:check:gate");
  issueIf(issues, !textIncludes(completionSummary.commands, "npm run ios:install:evidence:after-phone:final"), "completion-summary phase must include ios:install:evidence:after-phone:final");
  issueIf(issues, !textIncludes(completionSummary.terminalCommands, "test -d webapp && cd webapp; npm run ios:install:summary:evidence"), "completion-summary phase must include paste-ready summary evidence terminal command");
  issueIf(issues, !textIncludes(completionSummary.terminalCommands, "test -d webapp && cd webapp; npm run ios:install:evidence:after-phone:final"), "completion-summary phase must include paste-ready full evidence terminal command");
  return issues;
}

function status(issues) {
  return issues.length === 0 ? "ready" : "blocked";
}

function summary(issues) {
  return issues.length === 0
    ? "iOS install runbook check passed"
    : `iOS install runbook check blocked by ${issues.length} issue${issues.length === 1 ? "" : "s"}`;
}

function outputText(result) {
  return [
    `ok=${result.ok ? "true" : "false"}`,
    `status=${result.status}`,
    `summary=${result.summary}`,
    `inputPath=${result.inputPath}`,
    `deploymentMode=${result.deploymentMode}`,
    `recommendedInstallUrl=${result.recommendedInstallUrl}`,
    `recommendedShortInstallUrl=${result.recommendedShortInstallUrl}`,
    `protectedRecommendedInstallUrlTemplate=${result.protectedRecommendedInstallUrlTemplate}`,
    `protectedRecommendedShortInstallUrlTemplate=${result.protectedRecommendedShortInstallUrlTemplate}`,
    `protectedInstallAccessKeyPlaceholder=${result.protectedInstallAccessKeyPlaceholder}`,
    `protectedInstallAccessKeyLocalCompositionOnly=${result.protectedInstallAccessKeyLocalCompositionOnly ? "true" : "false"}`,
    `protectedInstallAccessKeyStoresEnteredKey=${result.protectedInstallAccessKeyStoresEnteredKey ? "true" : "false"}`,
    `protectedInstallAccessKeySendsEnteredKeyToServer=${result.protectedInstallAccessKeySendsEnteredKey ? "true" : "false"}`,
    `protectedInstallAccessKeyClearsTemporaryInputAfterCopy=${result.protectedInstallAccessKeyClearsTemporaryInputAfterCopy ? "true" : "false"}`,
    `installReadinessSource=${result.installReadinessSource}`,
    `installReadinessHttps=${result.installReadinessHttps ? "true" : "false"}`,
    `installReadinessSameWifiRequired=${result.installReadinessSameWifiRequired ? "true" : "false"}`,
    `installReadinessSafariRequired=${result.installReadinessSafariRequired ? "true" : "false"}`,
    `installReadinessSummary=${result.installReadinessSummary}`,
    `nextStepUrl=${result.nextStepUrl}`,
    `nextStepTextUrl=${result.nextStepTextUrl}`,
    `proofSaveHash=${result.proofSaveHash}`,
    `proofSaveTargetId=${result.proofSaveTargetId}`,
    `proofSaveUrl=${result.proofSaveUrl}`,
    `postInstallAppHomeUrl=${result.postInstallAppHomeUrl}`,
    `postInstallNewPlanUrl=${result.postInstallNewPlanUrl}`,
    `nextActionFinalGateCommand=${result.nextActionFinalGateCommand}`,
    `phaseCount=${result.phaseCount}`,
    `issues=${result.issues.length ? result.issues.join(",") : "none"}`,
  ].join("\n") + "\n";
}

try {
  const resolvedInputPath = resolveWebappPath(inputPath);
  const runbook = JSON.parse(readFileSync(resolvedInputPath, "utf8"));
  const issues = checkRunbook(runbook);
  const result = {
    schemaVersion: 1,
    ok: issues.length === 0,
    status: status(issues),
    summary: summary(issues),
    inputPath: resolvedInputPath,
    deploymentMode: runbook.deploymentMode || "",
    recommendedInstallUrl: runbook.recommendedInstallUrl || "",
    recommendedShortInstallUrl: runbook.recommendedShortInstallUrl || "",
    protectedRecommendedInstallUrlTemplate: runbook.protectedRecommendedInstallUrlTemplate || "",
    protectedRecommendedShortInstallUrlTemplate: runbook.protectedRecommendedShortInstallUrlTemplate || "",
    protectedInstallAccessKeyPlaceholder: runbook.protectedInstallAccessKeyHandling?.placeholder || "",
    protectedInstallAccessKeyLocalCompositionOnly: runbook.protectedInstallAccessKeyHandling?.localCompositionOnly === true,
    protectedInstallAccessKeyStoresEnteredKey: runbook.protectedInstallAccessKeyHandling?.storesEnteredKey === true,
    protectedInstallAccessKeySendsEnteredKeyToServer: runbook.protectedInstallAccessKeyHandling?.sendsEnteredKeyToServer === true,
    protectedInstallAccessKeyClearsTemporaryInputAfterCopy: runbook.protectedInstallAccessKeyHandling?.clearsTemporaryInputAfterCopy === true,
    installReadinessSource: runbook.installReadinessSummary?.recommendedUrlSource || "",
    installReadinessHttps: runbook.installReadinessSummary?.recommendedUrlIsHttps === true,
    installReadinessSameWifiRequired: runbook.installReadinessSummary?.sameWifiRequired === true,
    installReadinessSafariRequired: runbook.installReadinessSummary?.safariRequired === true,
    installReadinessSummary: runbook.installReadinessSummary?.summary || "",
    nextStepUrl: runbook.nextStepUrl || "",
    nextStepTextUrl: runbook.nextStepTextUrl || "",
    proofSaveHash: runbook.proofSaveHash || "",
    proofSaveTargetId: runbook.proofSaveTargetId || "",
    proofSaveUrl: runbook.proofSaveUrl || "",
    postInstallAppHomeUrl: runbook.postInstallAppHomeUrl || "",
    postInstallNewPlanUrl: runbook.postInstallNewPlanUrl || "",
    nextActionFinalGateCommand: runbook.nextActionContract?.finalGateCommand || "",
    phaseCount: Array.isArray(runbook.phases) ? runbook.phases.length : 0,
    issues,
  };
  const body = jsonOutput ? `${JSON.stringify(result, null, 2)}\n` : outputText(result);
  if (outputPath) writeAtomic(outputPath, body);
  process.stdout.write(body);
  if (issues.length > 0) process.exitCode = 1;
} catch (error) {
  const result = {
    schemaVersion: 1,
    ok: false,
    status: "error",
    summary: "iOS install runbook check could not complete",
    inputPath: resolveWebappPath(inputPath),
    deploymentMode: "",
    recommendedInstallUrl: "",
    recommendedShortInstallUrl: "",
    protectedRecommendedInstallUrlTemplate: "",
    protectedRecommendedShortInstallUrlTemplate: "",
    protectedInstallAccessKeyPlaceholder: "",
    protectedInstallAccessKeyLocalCompositionOnly: false,
    protectedInstallAccessKeyStoresEnteredKey: false,
    protectedInstallAccessKeySendsEnteredKeyToServer: false,
    protectedInstallAccessKeyClearsTemporaryInputAfterCopy: false,
    installReadinessSource: "",
    installReadinessHttps: false,
    installReadinessSameWifiRequired: false,
    installReadinessSafariRequired: false,
    installReadinessSummary: "",
    nextStepUrl: "",
    nextStepTextUrl: "",
    postInstallAppHomeUrl: "",
    postInstallNewPlanUrl: "",
    nextActionFinalGateCommand: "",
    phaseCount: 0,
    issues: [error.message],
  };
  const body = jsonOutput ? `${JSON.stringify(result, null, 2)}\n` : outputText(result);
  if (outputPath) writeAtomic(outputPath, body);
  process.stdout.write(body);
  process.exitCode = 1;
}
