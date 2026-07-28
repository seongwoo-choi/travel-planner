import { fileURLToPath } from "node:url";
import path from "node:path";

const LABEL = "com.travel-planner.discord-bot";
const WEBAPP_DIR = path.resolve(fileURLToPath(new URL("..", import.meta.url)));
const COMMAND = `cd ${shellQuote(WEBAPP_DIR)} && npm run bot`;

function xmlEscape(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&apos;");
}

function shellQuote(value) {
  return `'${String(value).replaceAll("'", "'\\''")}'`;
}

const plist = `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>Label</key>
  <string>${xmlEscape(LABEL)}</string>

  <key>ProgramArguments</key>
  <array>
    <string>/bin/zsh</string>
    <string>-lc</string>
    <string>${xmlEscape(COMMAND)}</string>
  </array>

  <key>WorkingDirectory</key>
  <string>${xmlEscape(WEBAPP_DIR)}</string>

  <key>RunAtLoad</key>
  <true/>

  <key>KeepAlive</key>
  <true/>

  <key>StandardOutPath</key>
  <string>/tmp/travel-planner-discord-bot.log</string>

  <key>StandardErrorPath</key>
  <string>/tmp/travel-planner-discord-bot.err</string>
</dict>
</plist>
`;

process.stdout.write(plist);
