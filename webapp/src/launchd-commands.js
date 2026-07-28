import { fileURLToPath } from "node:url";
import path from "node:path";

const LABEL = "com.travel-planner.discord-bot";
const WEBAPP_DIR = path.resolve(fileURLToPath(new URL("..", import.meta.url)));
const PLIST_PATH = `~/Library/LaunchAgents/${LABEL}.plist`;
const OUT_LOG = "/tmp/travel-planner-discord-bot.log";
const ERR_LOG = "/tmp/travel-planner-discord-bot.err";

function shellQuote(value) {
  return `'${String(value).replaceAll("'", "'\\''")}'`;
}

const lines = [
  "# Travel Planner Discord bot launchd commands",
  "",
  "# Install or refresh the LaunchAgent",
  "mkdir -p ~/Library/LaunchAgents",
  `cd ${shellQuote(WEBAPP_DIR)}`,
  `npm run bot:launchd:plist > ${PLIST_PATH}`,
  `launchctl unload ${PLIST_PATH} 2>/dev/null || true`,
  `launchctl load ${PLIST_PATH}`,
  `launchctl start ${LABEL}`,
  "",
  "# After restarting, check from Discord",
  "# /status confirms the bot/runtime status",
  "# /iphone checks iPhone LTE/5G usage conditions",
  "# /iphoneenv sends the access .env file if allowlists need fixing",
  "# /denied shows recent access-denied logs to admins",
  "",
  "# Inspect status and logs",
  `launchctl print gui/$(id -u)/${LABEL}`,
  `tail -f ${OUT_LOG}`,
  `tail -f ${ERR_LOG}`,
  `grep discord-access-denied ${ERR_LOG}`,
  "",
  "# npm aliases from the webapp directory",
  "# Operations runbook: ../docs/OPERATIONS-RUNBOOK.md",
  "npm run ops:workflows",
  "npm run ops:evidence:workflow",
  "npm run ops:preflight:offline",
  "npm run storage:backup:workflow",
  "npm run storage:restore:workflow",
  "npm run bot:install",
  "npm run ops:preflight",
  "npm run bot:uninstall",
  "npm run bot:start",
  "npm run bot:stop",
  "npm run bot:restart",
  "npm run bot:status",
  "npm run bot:logs",
  "npm run bot:denied",
  "",
  "# Stop and unload",
  `launchctl stop ${LABEL}`,
  `launchctl unload ${PLIST_PATH}`,
];

process.stdout.write(`${lines.join("\n")}\n`);
