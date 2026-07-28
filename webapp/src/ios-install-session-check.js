import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";

function valueAfterEquals(arg, name) {
  return arg.startsWith(`${name}=`) ? arg.slice(name.length + 1) : "";
}

function parseArgs(args) {
  const options = {
    json: false,
    strict: false,
    url: process.env.TRAVEL_IOS_INSTALL_SESSION_URL || `http://localhost:${process.env.PORT || "3000"}/api/ios-install-session`,
    timeoutMs: Number(process.env.TRAVEL_IOS_INSTALL_SESSION_TIMEOUT_MS || 5000),
    outputEnv: "",
    outputDefault: "",
  };
  for (const arg of args) {
    if (arg === "--json") options.json = true;
    if (arg === "--strict") options.strict = true;
    options.url = valueAfterEquals(arg, "--url") || options.url;
    options.url = process.env[valueAfterEquals(arg, "--url-env")] || options.url;
    options.url = valueAfterEquals(arg, "--url-default") || options.url;
    options.outputEnv = valueAfterEquals(arg, "--output-env") || options.outputEnv;
    options.outputDefault = valueAfterEquals(arg, "--output-default") || options.outputDefault;
    const timeout = Number(valueAfterEquals(arg, "--timeout-ms"));
    if (Number.isFinite(timeout) && timeout > 0) options.timeoutMs = timeout;
  }
  return options;
}

function issueIf(issues, condition, message) {
  if (condition) issues.push(message);
}

function hasUrlPath(value, pathname) {
  try {
    return new URL(value).pathname === pathname;
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

function textIncludes(values, text) {
  return Array.isArray(values) && values.some((value) => typeof value === "string" && value.includes(text));
}

async function fetchSession(url, timeoutMs) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(url, {
      signal: controller.signal,
      headers: { accept: "application/json" },
    });
    const body = await response.text();
    if (!response.ok) {
      return { httpStatus: response.status, error: `HTTP ${response.status}`, body };
    }
    try {
      return { httpStatus: response.status, session: JSON.parse(body) };
    } catch (error) {
      return { httpStatus: response.status, error: `invalid JSON: ${error.message}`, body };
    }
  } catch (error) {
    return { httpStatus: 0, error: error.name === "AbortError" ? `timeout after ${timeoutMs}ms` : error.message };
  } finally {
    clearTimeout(timer);
  }
}

function validateSession(session) {
  const issues = [];
  issueIf(issues, session?.schemaVersion !== 1, "schemaVersion must be 1");
  issueIf(issues, !["in-progress", "complete"].includes(session?.status), "status must be in-progress or complete");
  issueIf(issues, !hasUrlPath(session?.install?.url, "/install.html"), "install.url must point to /install.html");
  issueIf(issues, !hasUrlPath(session?.install?.shortUrl, "/i"), "install.shortUrl must point to /i");
  issueIf(issues, !hasUrlPath(session?.install?.sessionUrl, "/api/ios-install-session.txt"), "install.sessionUrl must point to /api/ios-install-session.txt");
  issueIf(issues, !hasUrlPath(session?.install?.sessionQrUrl, "/api/ios-install-session-qr.svg"), "install.sessionQrUrl must point to /api/ios-install-session-qr.svg");
  issueIf(issues, session?.install?.proofSaveHash !== "#iosInstallProofSaveButton", "install.proofSaveHash must be #iosInstallProofSaveButton");
  issueIf(issues, session?.install?.proofSaveTargetId !== "iosInstallProofSaveButton", "install.proofSaveTargetId must be iosInstallProofSaveButton");
  issueIf(issues, !hasUrlPathAndHash(session?.install?.proofSaveUrl, "/install.html", "#iosInstallProofSaveButton"), "install.proofSaveUrl must point to /install.html#iosInstallProofSaveButton");
  issueIf(issues, !hasUrlPathAndHash(session?.install?.postInstallAppHomeUrl, "/", "#iosHomeDock"), "install.postInstallAppHomeUrl must point to /#iosHomeDock");
  issueIf(issues, !hasUrlPathAndHash(session?.install?.postInstallNewPlanUrl, "/", "#planForm"), "install.postInstallNewPlanUrl must point to /#planForm");
  issueIf(issues, !hasUrlPathAndHash(session?.install?.appShellRecoveryUrl, "/", "#iosHomeDockShellRecovery"), "install.appShellRecoveryUrl must point to /#iosHomeDockShellRecovery");
  issueIf(issues, !hasUrlPathAndHash(session?.install?.appShellRecovery?.url, "/", "#iosHomeDockShellRecovery"), "install.appShellRecovery.url must point to /#iosHomeDockShellRecovery");
  issueIf(issues, session?.install?.appShellRecovery?.triggerField !== "appShellUpdateNeeded", "install.appShellRecovery.triggerField must be appShellUpdateNeeded");
  issueIf(issues, session?.install?.appShellRecovery?.triggerValue !== true, "install.appShellRecovery.triggerValue must be true");
  issueIf(issues, !Array.isArray(session?.install?.appShellRecovery?.sequence), "install.appShellRecovery.sequence must be an array");
  issueIf(issues, !textIncludes(session?.install?.appShellRecovery?.sequence, "app update check"), "install.appShellRecovery.sequence must include app update check");
  issueIf(issues, !textIncludes(session?.install?.appShellRecovery?.sequence, "Save Home Screen proof again"), "install.appShellRecovery.sequence must include proof resave");
  issueIf(issues, !textIncludes(session?.install?.appShellRecovery?.sequence, "final Mac gate"), "install.appShellRecovery.sequence must include final Mac gate");
  issueIf(issues, session?.commands?.handoffEvidence !== "npm run ios:install:handoff:evidence", "commands.handoffEvidence must generate and check the install handoff");
  issueIf(issues, session?.commands?.handoffEvidenceTerminal !== "test -d webapp && cd webapp; npm run ios:install:handoff:evidence", "commands.handoffEvidenceTerminal must be the paste-ready handoff evidence command");
  issueIf(issues, session?.commands?.sessionEvidence !== "npm run ios:install:session:evidence", "commands.sessionEvidence must generate session evidence");
  issueIf(issues, session?.commands?.sessionEvidenceTerminal !== "test -d webapp && cd webapp; npm run ios:install:session:evidence", "commands.sessionEvidenceTerminal must be the paste-ready session evidence command");
  issueIf(issues, session?.commands?.handoffSessionEvidence !== "npm run ios:install:handoff-session:evidence", "commands.handoffSessionEvidence must generate handoff and session evidence");
  issueIf(issues, session?.commands?.handoffSessionEvidenceTerminal !== "test -d webapp && cd webapp; npm run ios:install:handoff-session:evidence", "commands.handoffSessionEvidenceTerminal must be the paste-ready handoff/session evidence command");
  issueIf(issues, session?.commands?.afterPhoneThenAllFinal !== "npm run ios:install:evidence:after-phone:final", "commands.afterPhoneThenAllFinal must be the final gate command");
  issueIf(issues, typeof session?.evidence?.launchProofAppShellUpdateNeeded !== "boolean", "evidence.launchProofAppShellUpdateNeeded must be a boolean");
  issueIf(issues, typeof session?.evidence?.finalGateReady !== "boolean", "evidence.finalGateReady must be a boolean");
  issueIf(issues, typeof session?.completionRule !== "string" || !session.completionRule.includes("Home Screen launch proof") || !session.completionRule.includes("Mac final gate"), "completionRule must mention Home Screen launch proof and Mac final gate");
  return issues;
}

function resultText(result) {
  return [
    `ok=${result.ok ? "true" : "false"}`,
    `status=${result.status}`,
    `sourceUrl=${result.sourceUrl}`,
    `httpStatus=${result.httpStatus}`,
    `recoveryUrl=${result.recoveryUrl}`,
    `recoveryTrigger=${result.recoveryTriggerField}=true`,
    `recoverySequenceCount=${result.recoverySequenceCount}`,
    `postInstallAppHomeUrl=${result.postInstallAppHomeUrl}`,
    `postInstallNewPlanUrl=${result.postInstallNewPlanUrl}`,
    `handoffEvidenceCommand=${result.handoffEvidenceCommand}`,
    `handoffEvidenceTerminalCommand=${result.handoffEvidenceTerminalCommand}`,
    `sessionEvidenceCommand=${result.sessionEvidenceCommand}`,
    `sessionEvidenceTerminalCommand=${result.sessionEvidenceTerminalCommand}`,
    `handoffSessionEvidenceCommand=${result.handoffSessionEvidenceCommand}`,
    `handoffSessionEvidenceTerminalCommand=${result.handoffSessionEvidenceTerminalCommand}`,
    `finalGateCommand=${result.finalGateCommand}`,
    ...result.issues.map((issue) => `issue=${issue}`),
  ].join("\n") + "\n";
}

function writeOutput(options, result) {
  const outputPath = process.env[options.outputEnv] || options.outputDefault;
  if (!outputPath) return;
  const resolvedPath = path.resolve(process.cwd(), outputPath);
  mkdirSync(path.dirname(resolvedPath), { recursive: true });
  writeFileSync(resolvedPath, `${JSON.stringify(result, null, 2)}\n`);
}

const options = parseArgs(process.argv.slice(2));
const fetched = await fetchSession(options.url, options.timeoutMs);
const issues = fetched.session ? validateSession(fetched.session) : [fetched.error || "session fetch failed"];
const result = {
  schemaVersion: 1,
  checkedAt: new Date().toISOString(),
  ok: issues.length === 0,
  status: issues.length === 0 ? "ready" : "blocked",
  sourceUrl: options.url,
  httpStatus: fetched.httpStatus,
  recoveryUrl: fetched.session?.install?.appShellRecovery?.url || "",
  recoveryTriggerField: fetched.session?.install?.appShellRecovery?.triggerField || "",
  recoveryTriggerValue: fetched.session?.install?.appShellRecovery?.triggerValue === true,
  recoverySequenceCount: fetched.session?.install?.appShellRecovery?.sequence?.length || 0,
  postInstallAppHomeUrl: fetched.session?.install?.postInstallAppHomeUrl || "",
  postInstallNewPlanUrl: fetched.session?.install?.postInstallNewPlanUrl || "",
  handoffEvidenceCommand: fetched.session?.commands?.handoffEvidence || "",
  handoffEvidenceTerminalCommand: fetched.session?.commands?.handoffEvidenceTerminal || "",
  sessionEvidenceCommand: fetched.session?.commands?.sessionEvidence || "",
  sessionEvidenceTerminalCommand: fetched.session?.commands?.sessionEvidenceTerminal || "",
  handoffSessionEvidenceCommand: fetched.session?.commands?.handoffSessionEvidence || "",
  handoffSessionEvidenceTerminalCommand: fetched.session?.commands?.handoffSessionEvidenceTerminal || "",
  finalGateCommand: fetched.session?.commands?.afterPhoneThenAllFinal || "",
  issues,
};

writeOutput(options, result);
process.stdout.write(options.json ? `${JSON.stringify(result, null, 2)}\n` : resultText(result));

if (options.strict && !result.ok) {
  process.exitCode = 1;
}
