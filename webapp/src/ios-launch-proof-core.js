export const VALID_SERVICE_WORKER_STATES = new Set(["controlled", "supported-uncontrolled", "unsupported"]);

export function issueIf(issues, condition, message) {
  if (condition) issues.push(message);
}

export function isValidDateTime(value) {
  return typeof value === "string" && value.length > 0 && Number.isFinite(Date.parse(value));
}

export function isValidUrl(value) {
  try {
    return Boolean(new URL(value));
  } catch {
    return false;
  }
}

export function hasLaunchProofSchemaPath(value) {
  try {
    return new URL(value).pathname === "/ios-launch-proof.schema.json";
  } catch {
    return false;
  }
}

export function hasManifestPath(value) {
  try {
    return new URL(value).pathname === "/manifest.webmanifest";
  } catch {
    return false;
  }
}

export function checkLaunchProof(proof) {
  const issues = [];
  issueIf(issues, proof?.schemaVersion !== 1, "schemaVersion must be 1");
  issueIf(issues, !hasLaunchProofSchemaPath(proof?.schemaUrl), "schemaUrl must point to /ios-launch-proof.schema.json");
  issueIf(issues, proof?.type !== "ios-home-screen-launch-proof", "type must be ios-home-screen-launch-proof");
  issueIf(issues, proof?.app !== "travel-planner-web", "app must be travel-planner-web");
  issueIf(issues, proof?.standalone !== true, "standalone must be true");
  issueIf(issues, proof?.displayMode !== "standalone", "displayMode must be standalone");
  issueIf(issues, "appModeState" in (proof || {}) && !["standalone", "safari", "browser"].includes(proof.appModeState), "appModeState must be standalone, safari, or browser when present");
  issueIf(issues, proof?.standalone === true && "appModeState" in (proof || {}) && proof.appModeState !== "standalone", "appModeState must be standalone when standalone is true");
  issueIf(issues, "appModeTitle" in (proof || {}) && typeof proof.appModeTitle !== "string", "appModeTitle must be a string when present");
  issueIf(issues, "appModeDetail" in (proof || {}) && typeof proof.appModeDetail !== "string", "appModeDetail must be a string when present");
  issueIf(issues, !VALID_SERVICE_WORKER_STATES.has(proof?.serviceWorker), "serviceWorker must be controlled, supported-uncontrolled, or unsupported");
  issueIf(issues, "appShell" in (proof || {}) && typeof proof.appShell !== "string", "appShell must be a string when present");
  issueIf(issues, "serverShell" in (proof || {}) && typeof proof.serverShell !== "string", "serverShell must be a string when present");
  issueIf(issues, "appShellUpdateNeeded" in (proof || {}) && typeof proof.appShellUpdateNeeded !== "boolean", "appShellUpdateNeeded must be a boolean when present");
  issueIf(issues, typeof proof?.path !== "string" || !proof.path.startsWith("/"), "path must start with /");
  issueIf(issues, !isValidUrl(proof?.url), "url must be an absolute URL");
  issueIf(issues, "iosDevice" in (proof || {}) && proof.iosDevice !== true, "iosDevice must be true when present");
  issueIf(issues, "iosSafari" in (proof || {}) && typeof proof.iosSafari !== "boolean", "iosSafari must be a boolean when present");
  issueIf(issues, "appleWebAppTitle" in (proof || {}) && typeof proof.appleWebAppTitle !== "string", "appleWebAppTitle must be a string when present");
  issueIf(issues, "manifestUrl" in (proof || {}) && !hasManifestPath(proof.manifestUrl), "manifestUrl must point to /manifest.webmanifest when present");
  issueIf(issues, "themeColor" in (proof || {}) && typeof proof.themeColor !== "string", "themeColor must be a string when present");
  issueIf(issues, "screenWidth" in (proof || {}) && (!Number.isInteger(proof.screenWidth) || proof.screenWidth < 1), "screenWidth must be a positive integer when present");
  issueIf(issues, "screenHeight" in (proof || {}) && (!Number.isInteger(proof.screenHeight) || proof.screenHeight < 1), "screenHeight must be a positive integer when present");
  issueIf(issues, "devicePixelRatio" in (proof || {}) && (!Number.isFinite(proof.devicePixelRatio) || proof.devicePixelRatio <= 0), "devicePixelRatio must be a positive number when present");
  issueIf(issues, !isValidDateTime(proof?.capturedAt), "capturedAt must be an ISO date-time string");
  return issues;
}

export function launchProofStatus(issues) {
  return issues.length === 0 ? "ready" : "blocked";
}

export function launchProofSummary(issues) {
  return issues.length === 0
    ? "iOS Home Screen launch proof passed"
    : `iOS Home Screen launch proof blocked by ${issues.length} issue${issues.length === 1 ? "" : "s"}`;
}
