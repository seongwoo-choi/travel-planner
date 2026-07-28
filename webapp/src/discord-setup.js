import "dotenv/config";

const BOT_PERMISSIONS = "34816";
const REQUIRED = ["DISCORD_BOT_TOKEN", "DISCORD_CLIENT_ID"];

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

function llmConfigured() {
  const provider = (process.env.LLM_PROVIDER || "auto").toLowerCase();
  if (provider === "mock") return true;
  if (provider === "claude") {
    return isPresent("CLAUDE_API_KEY") || isPresent("ANTHROPIC_API_KEY") || isPresent("LLM_API_KEY");
  }
  return isPresent("OPENAI_API_KEY") || isPresent("LLM_API_KEY");
}

function inviteUrl(clientId) {
  const params = new URLSearchParams({
    client_id: clientId,
    permissions: BOT_PERMISSIONS,
    scope: "bot applications.commands",
  });
  return `https://discord.com/oauth2/authorize?${params.toString()}`;
}

function publicBaseUrlStatus() {
  const rawUrl = (process.env.TRAVEL_PUBLIC_BASE_URL || "").trim();
  if (!rawUrl) {
    return [
      "Web detail links: off",
      "  Discord commands still work from iPhone/LTE while the bot process is running.",
      "  Set TRAVEL_PUBLIC_BASE_URL only when you want Discord buttons to open the web UI.",
    ];
  }

  let url;
  try {
    url = new URL(rawUrl);
  } catch {
    return [
      `Web detail links: configured, but URL looks invalid (${rawUrl})`,
      "  Use a full URL such as http://192.168.0.10:3000 or https://example.com.",
    ];
  }

  const host = url.hostname;
  if (host === "localhost" || host === "127.0.0.1" || host === "::1") {
    return [
      `Web detail links: local-only (${rawUrl})`,
      "  This opens on the Mac itself, not from iPhone. Use the Mac LAN IP, a tunnel/VPN URL, or a deployed URL.",
    ];
  }

  if (/^(10|192\.168|172\.(1[6-9]|2\d|3[0-1]))\./.test(host)) {
    return [
      `Web detail links: same-Wi-Fi LAN URL (${rawUrl})`,
      "  This works from iPhone only on the same network, unless you add VPN or tunneling.",
    ];
  }

  return [
    `Web detail links: external-looking URL (${rawUrl})`,
    "  If the URL is reachable from iPhone, Discord web buttons should open outside the home Wi-Fi too.",
  ];
}

function healthTargetStatus() {
  const explicitHealthUrl = (process.env.TRAVEL_HEALTH_URL || "").trim();
  if (explicitHealthUrl) {
    try {
      const url = new URL(explicitHealthUrl);
      return `Health API target: explicit endpoint (${url.toString()})`;
    } catch {
      return `Health API target: invalid TRAVEL_HEALTH_URL (${explicitHealthUrl})`;
    }
  }

  const publicBaseUrl = (process.env.TRAVEL_PUBLIC_BASE_URL || "").trim();
  if (publicBaseUrl) {
    try {
      const base = publicBaseUrl.endsWith("/") ? publicBaseUrl : `${publicBaseUrl}/`;
      return `Health API target: derived from TRAVEL_PUBLIC_BASE_URL (${new URL("api/health.txt", base).toString()})`;
    } catch {
      return `Health API target: cannot derive from TRAVEL_PUBLIC_BASE_URL (${publicBaseUrl})`;
    }
  }

  return "Health API target: local default (http://localhost:3000/api/health.txt)";
}

function main() {
  const missing = REQUIRED.filter((name) => !isPresent(name));
  const clientId = process.env.DISCORD_CLIENT_ID;

  console.log("Discord travel planner setup\n");

  if (clientId) {
    console.log("Invite URL:");
    console.log(inviteUrl(clientId));
    console.log("");
  } else {
    console.log("Invite URL: DISCORD_CLIENT_ID를 먼저 채우면 자동으로 출력됩니다.\n");
  }

  if (missing.length > 0) {
    console.log(`Missing Discord env: ${missing.join(", ")}`);
  } else {
    console.log("Discord env: OK");
  }

  if (isPresent("DISCORD_GUILD_ID")) {
    console.log("Command registration: guild mode (fast)");
  } else {
    console.log("Command registration: global mode (can take longer)");
  }

  if (llmConfigured()) {
    console.log("LLM env: OK");
  } else {
    console.log("LLM env: missing key. For dry run, set LLM_PROVIDER=mock.");
  }

  const allowedGuildIds = listEnv("DISCORD_ALLOWED_GUILD_IDS");
  const allowedUserIds = listEnv("DISCORD_ALLOWED_USER_IDS");
  const adminUserIds = listEnv("DISCORD_ADMIN_USER_IDS");

  console.log("\nAccess policy:");
  console.log(`- Server allowlist: ${allowedGuildIds.length > 0 ? `${allowedGuildIds.length} server(s)` : "off"}`);
  console.log(`- DM access: ${boolEnv("DISCORD_ALLOW_DM") ? allowedUserIds.length > 0 ? "on with user allowlist" : "on without user allowlist" : "off"}`);
  console.log(`- User allowlist: ${allowedUserIds.length > 0 ? `${allowedUserIds.length} user(s)` : "off"}`);
  console.log(`- Admin-only ops: ${adminUserIds.length > 0 ? `${adminUserIds.length} admin user(s)` : "off"}`);
  console.log("- Use /whoami in Discord to find user ID and server ID.");
  console.log("- Use /iphoneenv to get a ready-to-copy iPhone/Discord .env file.");
  console.log("- /start, /iphone, /whoami, /policy, /iphoneenv, and /recover still answer as setup/ID/env recovery commands when access settings are not ready.");
  console.log("- Use /iphone or the External Use button in /start to check iPhone LTE/5G conditions before allowlists are ready.");
  console.log("- Blocked Discord responses include recovery buttons: 외부 사용, 설정, 내 ID, 정책.");

  console.log("\nMobile mode:");
  console.log("- iPhone Discord commands do not require the Mac and phone to share Wi-Fi.");
  console.log("- The bot must keep running on the Mac or another always-on host.");
  console.log("- If the Mac sleeps or this process stops, Discord commands stop responding.");
  for (const line of publicBaseUrlStatus()) {
    console.log(line);
  }

  console.log("\nHealth/preflight:");
  console.log(healthTargetStatus());
  console.log("- Run npm run ops:preflight before release or handoff when the server is running.");
  console.log("- Run npm run ops:preflight:offline before server startup to check file/env readiness.");
  console.log("- Set TRAVEL_HEALTH_EVIDENCE=1 when you need target/status/timing evidence for handoff notes.");

  console.log("\nBackup/handoff:");
  console.log("- Operations runbook: ../docs/OPERATIONS-RUNBOOK.md");
  console.log("- Run npm run ops:evidence:workflow to print the release/handoff evidence command sequence.");
  console.log("- Run npm run storage:backup:workflow to print the storage integrity, manifest, backup download, and restore verify commands.");
  console.log("- Run npm run storage:restore:workflow to print the restore dry-run and post-restore verification commands.");
  console.log("- Full backup JSON can contain travel content; keep it in an intentional private backup location.");

  console.log("\nUseful mobile commands:");
  console.log("/start, /home, /mobile, /iphone, /iphoneenv, /recover, /whoami, /policy, /doctor, /ops, /denied, /status, /dashboard, /now, /nextaction, /help, /guide");

  console.log("\nRun:");
  console.log("npm run ops:workflows # 운영 워크플로 명령 전체 보기");
  console.log("npm run ops:evidence:workflow # release/handoff evidence 명령 순서 출력");
  console.log("npm run bot:doctor # 로컬 env/DB/launchd 설정 점검");
  console.log("npm run ops:preflight # release/handoff 전 health/env/API gate 점검");
  console.log("npm run ops:preflight:offline # 서버 없이 file/env readiness 점검");
  console.log("npm run storage:backup:workflow # 백업/복구 evidence 명령 순서 출력");
  console.log("npm run storage:restore:workflow # 복구 전 dry-run 및 복구 후 verify 명령 순서 출력");
  console.log("npm run bot:install # .env 준비 후 launchd 설치/갱신/시작");
  console.log("npm run bot:status # launchd 상태 확인");
  console.log("npm run bot:logs   # launchd 로그 확인");
  console.log("npm run bot:denied # 접근 차단 로그 확인");
  console.log("npm run bot:mock  # Discord 연결 먼저 테스트");
  console.log("npm run bot");
}

main();
