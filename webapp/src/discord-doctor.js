import "dotenv/config";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const WEBAPP_DIR = path.resolve(fileURLToPath(new URL("..", import.meta.url)));
const LABEL = "com.travel-planner.discord-bot";
const REQUIRED_DISCORD_ENV = ["DISCORD_BOT_TOKEN", "DISCORD_CLIENT_ID"];

let warnings = 0;
let failures = 0;

function isPresent(name) {
  return Boolean(process.env[name] && String(process.env[name]).trim());
}

function listEnv(name) {
  return String(process.env[name] || "")
    .split(",")
    .map((value) => value.trim())
    .filter(Boolean);
}

function boolEnv(name) {
  return String(process.env[name] || "").trim().toLowerCase() === "true";
}

function flagEnv(name) {
  return ["1", "true", "yes", "on"].includes(String(process.env[name] || "").trim().toLowerCase());
}

function readNonNegativeInt(value, fallback) {
  if (value === undefined || value === "") return fallback;
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed >= 0 ? Math.floor(parsed) : fallback;
}

function report(level, title, detail = "") {
  if (level === "WARN") warnings += 1;
  if (level === "FAIL") failures += 1;
  const suffix = detail ? ` - ${detail}` : "";
  console.log(`[${level}] ${title}${suffix}`);
}

function resolveWebappPath(rawPath) {
  if (!rawPath) return "";
  return path.isAbsolute(rawPath) ? rawPath : path.join(WEBAPP_DIR, rawPath);
}

function hasStorageValue(value) {
  return value !== undefined && value !== null && String(value).trim() !== "";
}

function storageIntegrityErrors(db) {
  const errors = [];
  if (!db || typeof db !== "object" || Array.isArray(db)) {
    return ["db-root-must-be-object"];
  }
  if (!Array.isArray(db.plans)) {
    return ["plans-must-be-array"];
  }

  const planIds = new Set();
  for (const [index, plan] of db.plans.entries()) {
    const label = `plans[${index}]`;
    if (!plan || typeof plan !== "object" || Array.isArray(plan)) {
      errors.push(`${label}-must-be-object`);
      continue;
    }
    if (!hasStorageValue(plan.id)) {
      errors.push(`${label}-missing-id`);
    } else if (planIds.has(String(plan.id))) {
      errors.push(`${label}-duplicate-id`);
    } else {
      planIds.add(String(plan.id));
    }
    if (!hasStorageValue(plan.title)) errors.push(`${label}-missing-title`);
    if (!hasStorageValue(plan.startDate)) errors.push(`${label}-missing-startDate`);
  }

  return errors;
}

function checkEnvFile() {
  const envPath = path.join(WEBAPP_DIR, ".env");
  if (fs.existsSync(envPath)) {
    report("OK", ".env file", envPath);
    return;
  }
  report("WARN", ".env file missing", "copy .env.example to .env before running the real bot");
}

function checkDiscordEnv() {
  for (const name of REQUIRED_DISCORD_ENV) {
    report(isPresent(name) ? "OK" : "FAIL", `env ${name}`, isPresent(name) ? "set" : "missing");
  }

  if (isPresent("DISCORD_GUILD_ID")) {
    report("OK", "command registration", `guild mode (${process.env.DISCORD_GUILD_ID})`);
  } else {
    report("WARN", "command registration", "global mode can take longer to update slash commands");
  }

  const allowedGuildIds = listEnv("DISCORD_ALLOWED_GUILD_IDS");
  if (allowedGuildIds.length > 0) {
    report("OK", "guild allowlist", `${allowedGuildIds.length} server(s) allowed`);
  } else {
    report("WARN", "guild allowlist", "not set; bot can respond in any server where commands are available");
  }

  const allowedUserIds = listEnv("DISCORD_ALLOWED_USER_IDS");
  if (allowedUserIds.length > 0) {
    report("OK", "user allowlist", `${allowedUserIds.length} user(s) allowed`);
  } else {
    report("WARN", "user allowlist", "not set; any user with command access can use the bot");
  }

  if (boolEnv("DISCORD_ALLOW_DM")) {
    report(allowedUserIds.length > 0 ? "OK" : "WARN", "DM access", allowedUserIds.length > 0 ? "enabled with user allowlist" : "enabled without user allowlist");
  } else {
    report("OK", "DM access", "disabled");
  }

  const adminUserIds = listEnv("DISCORD_ADMIN_USER_IDS");
  if (adminUserIds.length > 0) {
    report("OK", "admin allowlist", `${adminUserIds.length} admin user(s)`);
  } else {
    report("WARN", "admin allowlist", "not set; /ops and /doctor are not restricted");
  }
}

function checkLlmEnv() {
  const provider = (process.env.LLM_PROVIDER || "auto").toLowerCase();
  const hasOpenAiKey = isPresent("OPENAI_API_KEY") || isPresent("LLM_API_KEY");
  const hasClaudeKey = isPresent("CLAUDE_API_KEY") || isPresent("ANTHROPIC_API_KEY") || isPresent("LLM_API_KEY");

  if (provider === "mock") {
    report("OK", "LLM provider", "mock mode");
    return;
  }

  if ((provider === "claude" || provider === "anthropic") && hasClaudeKey) {
    report("OK", "LLM provider", `${provider} key set`);
    return;
  }

  if ((provider === "codex" || provider === "openai") && hasOpenAiKey) {
    report("OK", "LLM provider", `${provider} key set`);
    return;
  }

  if (provider === "auto" && (hasOpenAiKey || hasClaudeKey)) {
    report("OK", "LLM provider", "auto with at least one API key");
    return;
  }

  report("WARN", "LLM provider", `${provider} has no matching key; use LLM_PROVIDER=mock for dry runs`);
}

function checkDatabasePath() {
  const dbPath = resolveWebappPath(process.env.TRAVEL_DB_PATH || "data/plans.json");
  if (fs.existsSync(dbPath)) {
    try {
      fs.accessSync(dbPath, fs.constants.R_OK | fs.constants.W_OK);
      const db = JSON.parse(fs.readFileSync(dbPath, "utf8"));
      const errors = storageIntegrityErrors(db);
      if (errors.length > 0) {
        report("FAIL", "travel DB integrity", `${errors.slice(0, 3).join(", ")}${errors.length > 3 ? ` (+${errors.length - 3} more)` : ""}`);
      } else {
        report("OK", "travel DB", `${dbPath} is readable/writable with ${db.plans.length} plan(s)`);
      }
    } catch (err) {
      report("FAIL", "travel DB", `${dbPath} is not readable/writable or valid JSON (${err.message})`);
    }
    return;
  }

  const parent = path.dirname(dbPath);
  try {
    fs.accessSync(parent, fs.constants.W_OK);
    report("WARN", "travel DB missing", `${dbPath} does not exist, but parent directory is writable`);
  } catch (err) {
    report("FAIL", "travel DB missing", `${dbPath} parent is not writable (${err.message})`);
  }
}

function checkPublicBaseUrl() {
  const rawUrl = (process.env.TRAVEL_PUBLIC_BASE_URL || process.env.PUBLIC_BASE_URL || "").trim();
  if (!rawUrl) {
    report("OK", "web detail URL", "not set; Discord-only mode is usable");
    return;
  }

  let url;
  try {
    url = new URL(rawUrl);
  } catch {
    report("FAIL", "web detail URL", `invalid URL (${rawUrl})`);
    return;
  }

  const host = url.hostname;
  if (host === "localhost" || host === "127.0.0.1" || host === "::1") {
    report("WARN", "web detail URL", `${rawUrl} opens on the Mac, not from another device`);
    return;
  }

  if (/^(10|192\.168|172\.(1[6-9]|2\d|3[0-1]))\./.test(host)) {
    report("WARN", "web detail URL", `${rawUrl} works on the same Wi-Fi unless VPN/tunnel is used`);
    return;
  }

  report("OK", "web detail URL", `${rawUrl} looks external`);
}

function publicBaseUrlExposure() {
  const rawUrl = (process.env.TRAVEL_PUBLIC_BASE_URL || process.env.PUBLIC_BASE_URL || "").trim();
  if (!rawUrl) return "unset";
  try {
    const url = new URL(rawUrl);
    const host = url.hostname;
    if (host === "localhost" || host === "127.0.0.1" || host === "::1") return "local";
    if (/^(10|192\.168|172\.(1[6-9]|2\d|3[0-1]))\./.test(host)) return "lan";
    return "external";
  } catch {
    return "invalid";
  }
}

function checkWebApiAccessKey() {
  if (isPresent("TRAVEL_ACCESS_KEY")) {
    report("OK", "web API access key", "set; /api routes require X-Travel-Access-Key except health/status");
    return;
  }

  const exposure = publicBaseUrlExposure();
  if (exposure === "external" || exposure === "lan") {
    report("WARN", "web API access key", `not set while web detail URL is ${exposure}; /api/backup and plan APIs are reachable to that network`);
    return;
  }

  report("WARN", "web API access key", "not set; keep the app private or set TRAVEL_ACCESS_KEY before sharing/tunneling");
}

function checkProtectedApiFetchConfig() {
  const baseUrl = process.env.TRAVEL_PUBLIC_BASE_URL || "http://localhost:3000";
  const timeoutMs = Math.max(1000, readNonNegativeInt(process.env.TRAVEL_API_FETCH_TIMEOUT_MS, 5000));
  const accessKeyMode = isPresent("TRAVEL_ACCESS_KEY") ? "access key header enabled" : "no access key header";
  const evidenceMode = flagEnv("TRAVEL_API_FETCH_EVIDENCE") ? "evidence on" : "evidence off";
  report("OK", "protected API fetch helper", `${baseUrl} (${timeoutMs}ms timeout, ${accessKeyMode}, ${evidenceMode})`);
}

function checkHealthApiConfig() {
  const rawHealthUrl = String(process.env.TRAVEL_HEALTH_URL || "").trim();
  const rawPublicBaseUrl = String(process.env.TRAVEL_PUBLIC_BASE_URL || "").trim();
  const timeoutMs = Math.max(1000, readNonNegativeInt(process.env.TRAVEL_HEALTH_TIMEOUT_MS, 5000));
  const evidenceState = flagEnv("TRAVEL_HEALTH_EVIDENCE") ? "evidence on" : "evidence off";

  if (rawHealthUrl) {
    try {
      const url = new URL(rawHealthUrl);
      report("OK", "health API check", `explicit endpoint ${url.toString()} (${timeoutMs}ms timeout, ${evidenceState})`);
    } catch {
      report("FAIL", "health API check", `TRAVEL_HEALTH_URL is invalid (${rawHealthUrl})`);
    }
    return;
  }

  if (rawPublicBaseUrl) {
    try {
      const base = rawPublicBaseUrl.endsWith("/") ? rawPublicBaseUrl : `${rawPublicBaseUrl}/`;
      const url = new URL("api/health.txt", base);
      report("OK", "health API check", `derived endpoint ${url.toString()} (${timeoutMs}ms timeout, ${evidenceState})`);
    } catch {
      report("FAIL", "health API check", `TRAVEL_PUBLIC_BASE_URL cannot derive health URL (${rawPublicBaseUrl})`);
    }
    return;
  }

  report("OK", "health API check", `local endpoint http://localhost:3000/api/health.txt (${timeoutMs}ms timeout, ${evidenceState})`);
}

function checkStorageBackupConfig() {
  const backupFilePath = process.env.TRAVEL_BACKUP_FILE_PATH || "travel-planner-backup.json";
  const backupFileCheckPath = process.env.TRAVEL_BACKUP_FILE_CHECK_PATH || "reports/storage-backup-file-check.json";
  const manifestPath = process.env.TRAVEL_BACKUP_MANIFEST_PATH || "reports/storage-backup-manifest.json";
  const verifyPath = process.env.TRAVEL_BACKUP_MANIFEST_VERIFY_PATH || manifestPath;
  const verifyOutputPath = process.env.TRAVEL_BACKUP_VERIFY_PATH || "reports/storage-backup-verify.json";
  report(
    "OK",
    "storage backup evidence",
    `backup ${resolveWebappPath(backupFilePath)}; file check ${resolveWebappPath(backupFileCheckPath)}; manifest ${resolveWebappPath(manifestPath)}; verify manifest ${resolveWebappPath(verifyPath)}; verify output ${resolveWebappPath(verifyOutputPath)}`
  );
}

function checkWebShareMode() {
  if (boolEnv("TRAVEL_REQUIRE_USER_LLM_KEY")) {
    report("OK", "web shared LLM billing", "user provider API key is required for web create/refine");
    return;
  }

  report("WARN", "web shared LLM billing", "server .env LLM key can be used by web create/refine; set TRAVEL_REQUIRE_USER_LLM_KEY=true before sharing");
}

function checkWebApiRateLimit() {
  const max = readNonNegativeInt(process.env.TRAVEL_API_RATE_LIMIT_MAX, 120);
  if (!max) {
    report("WARN", "web API rate limit", "disabled; set TRAVEL_API_RATE_LIMIT_MAX to protect shared web API");
    return;
  }
  const windowMs = Math.max(1000, readNonNegativeInt(process.env.TRAVEL_API_RATE_LIMIT_WINDOW_MS, 60000));
  report("OK", "web API rate limit", `${max} requests per ${Math.round(windowMs / 1000)}s`);
}

function checkLaunchdPlist() {
  const plistPath = path.join(os.homedir(), "Library", "LaunchAgents", `${LABEL}.plist`);
  if (fs.existsSync(plistPath)) {
    report("OK", "launchd plist", plistPath);
    return;
  }
  report("WARN", "launchd plist", `not installed at ${plistPath}; run npm run bot:launchd:commands`);
}

function printAccessRecoveryHints() {
  console.log("\nAccess recovery:");
  console.log("- In Discord, use /whoami for user/server IDs and /policy for current allowlist status.");
  console.log("- Use the settings button to receive a ready-to-copy Discord .env snippet.");
  console.log("- /start, /whoami, /policy, and /recover are setup/ID recovery commands and still answer before allowlists are ready.");
  console.log("- Blocked Discord responses include recovery buttons: 외부 사용, 설정, 내 ID, 정책.");
  console.log("- Admins can use /denied in Discord or npm run bot:denied on Mac to inspect recent access-denied logs.");
  console.log("\nStorage backup/restore:");
  console.log("- Use npm run storage:backup:workflow to print the backup evidence command sequence.");
  console.log("- Use npm run storage:restore:workflow to print the restore dry-run and post-restore verification sequence.");
  console.log("- Full backup JSON may contain travel content; keep it in an intentional private backup location.");
}

console.log("Travel Planner Discord bot doctor\n");
checkEnvFile();
checkDiscordEnv();
checkLlmEnv();
checkDatabasePath();
checkPublicBaseUrl();
checkWebApiAccessKey();
checkProtectedApiFetchConfig();
checkHealthApiConfig();
checkStorageBackupConfig();
checkWebShareMode();
checkWebApiRateLimit();
checkLaunchdPlist();
printAccessRecoveryHints();

console.log(`\nSummary: ${failures} failure(s), ${warnings} warning(s)`);
if (failures > 0) {
  process.exitCode = 1;
}
