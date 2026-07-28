import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { config as loadEnv } from "dotenv";
import { getPlanQualitySummary, listPlans } from "./storage.js";
import { buildQualityTodoPayload, qualityTodoFilterCount, qualityTodoFilterLabel } from "./quality-todo-core.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DB_PATH = path.join(__dirname, "..", "data", "plans.json");
const DEFAULT_ENV_PATH = path.join(__dirname, "..", ".env");

function parseArgs(argv = process.argv.slice(2)) {
  const options = { limit: 10, offset: 0, minPriority: 0, maxActions: null, all: false, urgent: false, next: false, json: false, quiet: false, failOnEmpty: false, failOnAction: false, help: false, baseUrl: "", envPath: "", output: "" };
  argv.forEach((arg) => {
    if (arg === "--all") options.all = true;
    if (arg === "--urgent") options.urgent = true;
    if (arg === "--next") options.next = true;
    if (arg === "--json") options.json = true;
    if (arg === "--quiet") options.quiet = true;
    if (arg === "--fail-on-empty") options.failOnEmpty = true;
    if (arg === "--fail-on-action") options.failOnAction = true;
    if (arg === "--help" || arg === "-h") options.help = true;
    if (arg.startsWith("--limit=")) options.limit = safeLimit(arg.slice("--limit=".length));
    if (arg.startsWith("--offset=")) options.offset = safeOffset(arg.slice("--offset=".length));
    if (arg.startsWith("--min-priority=")) options.minPriority = safeMinPriority(arg.slice("--min-priority=".length));
    if (arg.startsWith("--max-actions=")) {
      options.maxActions = safeMaxActions(arg.slice("--max-actions=".length));
      options.failOnAction = true;
    }
    if (arg.startsWith("--base-url=")) options.baseUrl = arg.slice("--base-url=".length).trim();
    if (arg.startsWith("--env=")) options.envPath = arg.slice("--env=".length).trim();
    if (arg.startsWith("--output=")) options.output = arg.slice("--output=".length).trim();
  });
  if (options.urgent && options.minPriority <= 0) options.minPriority = 80;
  return options;
}

function safeLimit(value) {
  const requested = Number(value || 10);
  return Number.isFinite(requested) ? Math.max(1, Math.min(50, Math.floor(requested))) : 10;
}

function safeOffset(value) {
  const requested = Number(value || 0);
  return Number.isFinite(requested) ? Math.max(0, Math.min(5000, Math.floor(requested))) : 0;
}

function safeMinPriority(value) {
  const requested = Number(value || 0);
  return Number.isFinite(requested) ? Math.max(0, Math.min(100, Math.floor(requested))) : 0;
}

function safeMaxActions(value) {
  const requested = Number(value || 0);
  return Number.isFinite(requested) ? Math.max(0, Math.min(5000, Math.floor(requested))) : 0;
}

function printHelp() {
  console.log([
    "Usage: npm run quality:todo -- [--limit=10] [--offset=0] [--min-priority=80|--urgent|--next] [--all] [--json] [--quiet] [--fail-on-empty|--fail-on-action|--max-actions=5]",
    "       npm run quality:todo -- --base-url=http://localhost:3000",
    "       npm run quality:todo -- --urgent --json",
    "       npm run quality:todo -- --next --json",
    "       npm run quality:todo -- --min-priority=80 --json",
    "       npm run quality:todo -- --env=../prod.env --json",
    "       npm run quality:todo -- --limit=10 --offset=10 --json",
    "       npm run quality:todo -- --all --output=quality-todo.txt",
    "       npm run quality:todo -- --all",
    "",
    "Prints prioritized Travel Planner quality TODOs from the local JSON store.",
    "Use --json for automation metadata, --urgent or --min-priority to focus on urgent candidates, --next for the current recommended quality filter, --base-url for absolute refine links, --env for a custom env file, --output to write a file, --quiet to suppress file-write confirmation, --fail-on-empty to exit 2 when no batch is actionable, --fail-on-action to exit 3 when matching quality candidates remain, and --max-actions=N to exit 3 only when candidates exceed N.",
  ].join("\n"));
}

function baseUrlInfo(options = {}) {
  if (options.baseUrl) return { value: options.baseUrl, source: "arg" };
  if (process.env.TRAVEL_PUBLIC_BASE_URL) return { value: process.env.TRAVEL_PUBLIC_BASE_URL, source: "env-travel" };
  if (process.env.PUBLIC_BASE_URL) return { value: process.env.PUBLIC_BASE_URL, source: "env-public" };
  return { value: "", source: "none" };
}

async function main() {
  const options = parseArgs();
  if (options.help) {
    printHelp();
    return;
  }
  const envPath = options.envPath ? path.resolve(process.cwd(), options.envPath) : DEFAULT_ENV_PATH;
  const envSource = options.envPath ? "arg" : "default";
  const envResult = loadEnv({ path: envPath });
  const summary = await getPlanQualitySummary(DB_PATH);
  const selectedFilter = options.next ? String(summary.qualityNextFilter || "quality-action").trim() || "quality-action" : "quality-action";
  const listFilter = selectedFilter === "quality-urgent" ? "quality-action" : selectedFilter;
  const minPriority = options.minPriority > 0 ? options.minPriority : options.urgent || selectedFilter === "quality-urgent" ? 80 : 0;
  const scanActionCount = qualityTodoFilterCount(summary, listFilter);
  const scanLimit = options.all || minPriority > 0 ? Math.max(1, Math.min(5000, scanActionCount)) : options.offset + options.limit;
  const plans = await listPlans(scanLimit, DB_PATH, listFilter);
  const eligiblePlans = minPriority > 0 ? plans.filter((plan) => Number(plan.qualityActionPriority || 0) >= minPriority) : plans;
  const eligibleActionCount = minPriority > 0 ? eligiblePlans.length : qualityTodoFilterCount(summary, selectedFilter);
  const requestedLimit = options.all ? Math.max(1, Math.min(5000, eligibleActionCount - options.offset)) : options.limit;
  const filterLabel = options.next ? `다음 품질 필터: ${qualityTodoFilterLabel(summary, selectedFilter)}` : "";
  const baseUrl = baseUrlInfo(options);
  const batch = eligiblePlans.slice(options.offset, options.offset + requestedLimit);
  const result = buildQualityTodoPayload(summary, batch, { baseUrl: baseUrl.value, baseUrlSource: baseUrl.source, limit: requestedLimit, offset: options.offset, source: "cli", all: options.all, urgent: options.urgent || selectedFilter === "quality-urgent", next: options.next, filter: options.next ? selectedFilter : "", filterLabel, minPriority, totalActionCount: eligibleActionCount, failOnEmpty: options.failOnEmpty, failOnAction: options.failOnAction, maxActions: options.maxActions });
  const outputPath = options.output ? path.resolve(process.cwd(), options.output) : "";
  result.meta.outputFormat = options.json ? "json" : "text";
  result.meta.outputPath = outputPath;
  result.meta.quiet = options.quiet;
  result.meta.failOnEmpty = options.failOnEmpty;
  result.meta.failOnAction = options.failOnAction;
  result.meta.maxActions = options.maxActions;
  result.meta.actionGateLimit = Number.isFinite(Number(options.maxActions)) ? options.maxActions : 0;
  result.meta.envPath = envPath;
  result.meta.envSource = envSource;
  result.meta.envLoaded = !envResult.error;
  result.meta.envError = envResult.error?.code || "";
  const actionGateCount = Number(result.meta.totalActionCount || 0);
  const shouldFailOnEmpty = options.failOnEmpty && result.meta.isEmpty;
  const shouldFailOnAction = options.failOnAction && actionGateCount > result.meta.actionGateLimit;
  const exitCode = shouldFailOnAction ? 3 : shouldFailOnEmpty ? 2 : 0;
  result.meta.actionGateCount = actionGateCount;
  result.meta.actionGateStatus = options.failOnAction ? shouldFailOnAction ? "failed" : "passed" : "off";
  result.meta.failedOnEmpty = shouldFailOnEmpty;
  result.meta.failedOnAction = shouldFailOnAction;
  result.meta.failed = shouldFailOnEmpty || shouldFailOnAction;
  result.meta.exitCode = exitCode;
  const output = options.json ? JSON.stringify(result, null, 2) : result.todoText;
  if (outputPath) {
    await fs.mkdir(path.dirname(outputPath), { recursive: true });
    await fs.writeFile(outputPath, `${output}\n`, "utf-8");
    if (!options.quiet) {
      console.log(`quality:todo wrote ${outputPath} (${result.meta.outputFormat}, ${result.meta.batchSummary || result.meta.batchLabel}, ${result.meta.status})`);
    }
    if (result.meta.failed) process.exitCode = exitCode;
    return;
  }
  console.log(output);
  if (result.meta.failed) process.exitCode = exitCode;
}

main().catch((err) => {
  console.error(`quality:todo failed: ${err.message}`);
  process.exitCode = 1;
});
