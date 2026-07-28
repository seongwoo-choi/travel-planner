import "dotenv/config";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  ActionRowBuilder,
  AttachmentBuilder,
  ButtonBuilder,
  ButtonStyle,
  Client,
  GatewayIntentBits,
  ModalBuilder,
  REST,
  Routes,
  SlashCommandBuilder,
  StringSelectMenuBuilder,
  TextInputBuilder,
  TextInputStyle,
} from "discord.js";
import { answerPlanQuestion, generatePlan } from "./llm.js";
import { configuredIdentityAllowed } from "./discord-access-policy.js";
import { assertGoogleGroundedPlanReady, createGoogleGroundedPlanGenerator } from "./planner/grounded-plan-generator.js";
import { renderGroundedTripPlan } from "./planner/grounded-plan-output.js";
import {
  diagnoseStoredGroundedPlan,
  moveStoredGroundedPlace,
  refreshStoredGroundedPlan,
  replaceStoredGroundedPlace,
  replanStoredGroundedPlan,
} from "./planner/grounded-plan-actions.js";
import { buildDailyBriefing, buildDayShareText, buildNightChecklist, buildTodayChecklist, buildTomorrowBriefing } from "./brief.js";
import { buildBudgetBriefing, buildCategoryBudgetStatus, buildDailyBudgetStatus, buildSpendingStatus } from "./budget.js";
import { buildChecklistText } from "./checklist.js";
import { buildDateViewText, buildDayViewText, buildTodayViewText, getCurrentTripDay } from "./day-view.js";
import { buildDepartureBriefing } from "./departure.js";
import { buildEmergencyCard } from "./emergency.js";
import { buildPlanCalendar, buildPlanMarkdown, buildShareText } from "./export.js";
import { buildMapLinks } from "./maps.js";
import { buildNextAction } from "./next-action.js";
import { buildTripNow } from "./now.js";
import { buildPackingList } from "./packing.js";
import { buildReadinessActionPlan, buildReadinessReport, buildReadinessShareText } from "./readiness.js";
import { buildTripRecap } from "./recap.js";
import { buildExpenseCsv, buildExpenseLedger, buildSettlementBriefing, buildSettlementMatrix, buildSettlementMessage, buildSettlementTransfers } from "./settlement.js";
import { buildQualityGateMatrix } from "./quality-todo-core.js";
import { buildDeparturePackMarkdown, buildFileGuideMarkdown, buildFullPackMarkdown, buildMemoPackMarkdown, buildMoneyPackMarkdown, buildOfflinePackMarkdown as buildSharedOfflinePackMarkdown, buildSettlementPackMarkdown, buildSharePackMarkdown, buildTodayPackMarkdown } from "./markdown-packs.js";
import {
  addPlanExpense,
  createPlan,
  deletePlanExpense,
  duplicatePlan,
  exportPlansBackup,
  findLatestPlanByDiscordUser,
  getPlan,
  getPlanForDiscordUser,
  getPlanQualitySummary,
  listPinnedPlansByDiscordUser,
  listPlans,
  listPlansByDiscordUser,
  refinePlan,
  searchPlans,
  setPlanPinned,
  updatePlanExpense,
  updatePlanPartyBudget,
  updatePlanPersonalNote,
  updatePlanSchedule,
} from "./storage.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const DEFAULT_DB_PATH = fs.existsSync(resolveDbPath("data/plans.sqlite"))
  ? "data/plans.sqlite"
  : "data/plans.json";
const DB_PATH = resolveDbPath(process.env.TRAVEL_DB_PATH || DEFAULT_DB_PATH);
const DISCORD_LIMIT = 1900;
const CURRENT_YEAR = Number(process.env.TRAVEL_DEFAULT_YEAR || new Date().getFullYear());
const PUBLIC_BASE_URL = normalizePublicBaseUrl(process.env.TRAVEL_PUBLIC_BASE_URL || process.env.PUBLIC_BASE_URL || "");

function resolveDbPath(value) {
  return path.isAbsolute(value) ? value : path.resolve(__dirname, "..", value);
}

function requiredEnv(name) {
  const value = process.env[name];
  if (!value) {
    throw new Error(`${name} is required`);
  }
  return value;
}

function normalizePublicBaseUrl(value) {
  const raw = String(value || "").trim();
  if (!raw) return "";
  try {
    const url = new URL(raw);
    if (!["http:", "https:"].includes(url.protocol)) return "";
    return raw.replace(/\/+$/, "");
  } catch {
    return "";
  }
}

function planWebUrl(plan) {
  if (!PUBLIC_BASE_URL || !plan?.id) return "";
  return `${PUBLIC_BASE_URL}/plans/${encodeURIComponent(plan.id)}`;
}

function truncateText(text, limit = DISCORD_LIMIT) {
  const value = String(text || "");
  if (value.length <= limit) return value;
  return `${value.slice(0, limit - 40)}\n\n...전체 내용은 첨부 파일을 확인해주세요.`;
}

function latestRevision(plan) {
  const revisions = Array.isArray(plan.revisions) ? plan.revisions : [];
  return revisions.find((item) => item.version === plan.latestVersion) || revisions.at(-1);
}

function revisionByVersion(plan, version) {
  const revisions = Array.isArray(plan.revisions) ? plan.revisions : [];
  return revisions.find((item) => item.version === Number(version)) || null;
}

function planAttachment(plan) {
  const latest = latestRevision(plan);
  const content = latest?.planText || "플랜 본문이 없습니다.";
  return new AttachmentBuilder(Buffer.from(content, "utf-8"), {
    name: `travel-plan-${plan.id}-v${plan.latestVersion}.md`,
  });
}

function revisionAttachment(plan, revision) {
  const content = revision?.planText || "플랜 본문이 없습니다.";
  return new AttachmentBuilder(Buffer.from(content, "utf-8"), {
    name: `travel-plan-${plan.id}-v${revision?.version || "unknown"}.md`,
  });
}

function markdownAttachment(content, name) {
  return new AttachmentBuilder(Buffer.from(content, "utf-8"), { name });
}

function planMarkdownFileName(plan, suffix = "") {
  return `travel-plan-${plan.id}${suffix}.md`;
}

function offlinePackFileName(plan, exportedAt = new Date().toISOString()) {
  const version = String(plan.latestVersion || "unknown").replace(/[^a-zA-Z0-9_-]/g, "");
  const stamp = exportedAt.replace(/\.\d{3}Z$/, "Z").replace(/[-:]/g, "").replace("T", "-");
  return `travel-plan-${plan.id}-v${version}-offline-pack-${stamp}.md`;
}

function offlinePackAttachment(plan) {
  const exportedAt = new Date().toISOString();
  const fileName = offlinePackFileName(plan, exportedAt);
  return {
    attachment: markdownAttachment(buildSharedOfflinePackMarkdown(plan, { exportedAt, webUrl: planWebUrl(plan) }), fileName),
    fileName,
  };
}

function offlinePackMessage(plan, fileName) {
  return `${planMarkdownMessage(plan, "오프라인팩")}\n파일명: ${fileName}`;
}

function planMarkdownMessage(plan, label = "") {
  const labelText = label ? `${label} ` : "";
  return `플랜 #${plan.id} ${plan.destination || "여행"} ${labelText}Markdown 파일입니다.`;
}

async function replyWithMarkdownAttachment(interaction, content, name, message) {
  const attachment = markdownAttachment(content, name);
  await interaction.editReply({
    content: message,
    files: [attachment],
    components: mobileComponents(),
  });
}

function planSummary(plan) {
  const latest = latestRevision(plan);
  const text = latest?.planText || "";
  const error = plan.latestError ? `\n\nLLM 오류: ${plan.latestError}` : "";
  const pinned = plan.pinned ? "[고정] " : "";
  const note = plan.personalNote ? `\n\n개인 메모:\n${plan.personalNote}` : "";
  const quality = planQualityAuditText(plan);
  const qualityLine = quality ? `\n품질: ${quality}` : "";
  const webUrl = planWebUrl(plan);
  const webLine = webUrl ? `\n웹 상세: ${webUrl}` : "";
  return truncateText(
    `${pinned}플랜 #${plan.id} v${plan.latestVersion}\n${plan.departure || "서울"} -> ${plan.destination} / ${plan.nights}박 / ${plan.companions} / ${plan.travelers}명${qualityLine}${webLine}\n\n${text}${note}${error}`,
    1700
  );
}

function revisionSummary(plan, revision) {
  const feedback = revision?.feedback ? `\n피드백: ${revision.feedback}` : "";
  return truncateText(
    `플랜 #${plan.id} v${revision?.version || "?"}\n${plan.departure || "서울"} -> ${plan.destination} / ${plan.nights}박 / ${plan.companions} / ${plan.travelers}명${feedback}\n\n${revision?.planText || "플랜 본문이 없습니다."}`,
    1700
  );
}

function qualityChecksFromPlanText(planText) {
  const section = String(planText || "").split("## 자동 품질 점검")[1] || "";
  if (!section) return [];
  const checks = [];
  for (const line of section.split("\n")) {
    if (line.startsWith("## ")) break;
    const match = line.match(/^-\s*(OK|확인)\s+([^:]+)(?::\s*(.*))?$/);
    if (!match) continue;
    checks.push({
      ok: match[1] === "OK",
      label: match[2].trim(),
      detail: (match[3] || "").trim(),
    });
  }
  return checks;
}

function planQualityAuditText(plan) {
  const latest = latestRevision(plan);
  const parsedChecks = qualityChecksFromPlanText(latest?.planText);
  const checkCount = Number.isFinite(plan?.qualityCheckCount) ? plan.qualityCheckCount : parsedChecks.length;
  if (!checkCount) return "";
  const warningCount = Number.isFinite(plan?.qualityWarningCount)
    ? plan.qualityWarningCount
    : parsedChecks.filter((item) => !item.ok).length;
  const delta = planQualityWarningDelta(plan, latest, warningCount);
  const trend = qualityTrendText(delta);
  if (!warningCount) return `품질 OK${trend}`;
  const labels = Array.isArray(plan?.qualityWarnings) && plan.qualityWarnings.length
    ? plan.qualityWarnings
    : parsedChecks.filter((item) => !item.ok).map((item) => item.label);
  const labelText = labels.slice(0, 2).join(", ");
  const extra = labels.length > 2 ? ` 외 ${labels.length - 2}` : "";
  return `품질 확인 ${warningCount}${labelText ? `: ${labelText}${extra}` : ""}${trend}`;
}

function planQualityWarningDelta(plan, latest, warningCount) {
  if (Number.isFinite(plan?.qualityWarningDelta)) return Number(plan.qualityWarningDelta);
  const revisions = Array.isArray(plan?.revisions) ? plan.revisions : [];
  const latestVersion = Number(latest?.version);
  const previous = revisions
    .filter((item) => item !== latest && Number(item.version) < latestVersion)
    .sort((a, b) => Number(a.version || 0) - Number(b.version || 0))
    .at(-1);
  const previousChecks = qualityChecksFromPlanText(previous?.planText);
  if (previousChecks.length === 0) return null;
  const previousWarningCount = previousChecks.filter((item) => !item.ok).length;
  return warningCount - previousWarningCount;
}

function qualityTrendText(delta) {
  if (!Number.isFinite(delta) || delta === 0) return "";
  return delta < 0 ? ` · 개선 ${Math.abs(delta)}` : ` · 추가 ${delta}`;
}

function buildQualityRefineFeedback(plan) {
  const latest = latestRevision(plan);
  const checks = qualityChecksFromPlanText(latest?.planText).filter((item) => !item.ok);
  const labels = checks.length
    ? checks.map((item) => `${item.label}${item.detail ? `: ${item.detail}` : ""}`)
    : (Array.isArray(plan?.qualityWarnings) ? plan.qualityWarnings : []);
  if (!labels.length) return "";
  const priority = labels.slice(0, 3).map((label) => String(label).split(":")[0].trim()).join(", ");
  return [
    "자동 품질 점검에서 확인이 필요한 항목을 보강해줘.",
    `우선순위: ${priority}`,
    ...labels.slice(0, 5).map((label) => `- ${label}`),
    "우선순위에 적힌 항목부터 일정 본문에 구체적으로 반영해줘.",
  ].join("\n").slice(0, 1000);
}

function buildQualityAuditFeedback(plan) {
  const qualityFeedback = buildQualityRefineFeedback(plan);
  if (qualityFeedback) return qualityFeedback;
  return [
    "이 플랜을 최신 품질 가드 기준으로 다시 점검해줘.",
    "- 응답 끝에 `자동 품질 점검` 섹션을 반드시 추가해줘.",
    "- 체류 일수, 실시간 확인 문구, 우천/휴무 대안, 이동/식사/휴식 버퍼, 예약 준비 항목을 OK/확인으로 표시해줘.",
    "- 기존 목적지, 동행, 예산, 교통 선호는 유지하고 부족한 근거와 실행 체크리스트만 보강해줘.",
  ].join("\n").slice(0, 1000);
}

function planSelectDescription(plan) {
  return [
    `${plan.departure || "서울"} 출발`,
    `v${plan.latestVersion}`,
    plan.startDate || "날짜 미정",
    revisionLlmAuditText(plan),
    planQualityAuditText(plan),
  ].filter(Boolean).join(" / ").slice(0, 100);
}

function planComponents(plan) {
  const webUrl = planWebUrl(plan);
  const qualityRefineFeedback = buildQualityRefineFeedback(plan);
  const firstRow = [
    new ButtonBuilder()
      .setCustomId(`plan-refine:${plan.id}${qualityRefineFeedback ? ":quality" : ""}`)
      .setLabel(qualityRefineFeedback ? "품질 보강" : "고도화")
      .setStyle(ButtonStyle.Primary),
    new ButtonBuilder()
      .setCustomId(`plan-ask:${plan.id}`)
      .setLabel("질문")
      .setStyle(ButtonStyle.Secondary),
    new ButtonBuilder()
      .setCustomId(`plan-history:${plan.id}`)
      .setLabel("히스토리")
      .setStyle(ButtonStyle.Secondary),
    new ButtonBuilder()
      .setCustomId(`plan-category-budget:${plan.id}`)
      .setLabel("카테고리 예산")
      .setStyle(ButtonStyle.Secondary),
  ];
  if (webUrl) {
    firstRow.push(
      new ButtonBuilder()
        .setLabel("웹 상세")
        .setStyle(ButtonStyle.Link)
        .setURL(webUrl)
    );
  }
  return [
    new ActionRowBuilder().addComponents(...firstRow),
    new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId(`plan-budget:${plan.id}`)
        .setLabel("예산")
        .setStyle(ButtonStyle.Secondary),
      new ButtonBuilder()
        .setCustomId(`plan-maps:${plan.id}`)
        .setLabel("지도")
        .setStyle(ButtonStyle.Secondary),
      new ButtonBuilder()
        .setCustomId(`plan-today:${plan.id}`)
        .setLabel("오늘")
        .setStyle(ButtonStyle.Secondary),
      new ButtonBuilder()
        .setCustomId(`plan-pin:${plan.id}`)
        .setLabel(plan.pinned ? "고정 해제" : "고정")
        .setStyle(ButtonStyle.Secondary),
      new ButtonBuilder()
        .setCustomId(`plan-checklist:${plan.id}`)
        .setLabel("체크리스트")
        .setStyle(ButtonStyle.Secondary)
    ),
    new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId(`plan-packing:${plan.id}`)
        .setLabel("짐싸기")
        .setStyle(ButtonStyle.Secondary),
      new ButtonBuilder()
        .setCustomId(`plan-departure:${plan.id}`)
        .setLabel("출발")
        .setStyle(ButtonStyle.Secondary),
      new ButtonBuilder()
        .setCustomId(`plan-spending:${plan.id}`)
        .setLabel("소진")
        .setStyle(ButtonStyle.Secondary),
      new ButtonBuilder()
        .setCustomId(`plan-recap:${plan.id}`)
        .setLabel("회고")
        .setStyle(ButtonStyle.Secondary),
      new ButtonBuilder()
        .setCustomId(`plan-recap-export:${plan.id}`)
        .setLabel("회고 파일")
        .setStyle(ButtonStyle.Secondary)
    ),
    new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId(`plan-share:${plan.id}`)
        .setLabel("공유")
        .setStyle(ButtonStyle.Secondary),
      new ButtonBuilder()
        .setCustomId(`plan-duplicate:${plan.id}`)
        .setLabel("복제")
        .setStyle(ButtonStyle.Secondary),
      new ButtonBuilder()
        .setCustomId(`plan-emergency:${plan.id}`)
        .setLabel("비상")
        .setStyle(ButtonStyle.Secondary),
      new ButtonBuilder()
        .setCustomId(`plan-export:${plan.id}`)
        .setLabel("Markdown")
        .setStyle(ButtonStyle.Secondary),
      new ButtonBuilder()
        .setCustomId(`plan-offline:${plan.id}`)
        .setLabel("오프라인")
        .setStyle(ButtonStyle.Secondary)
    ),
    new ActionRowBuilder().addComponents(
      new StringSelectMenuBuilder()
        .setCustomId(`plan-routine-select:${plan.id}`)
        .setPlaceholder("여행 중 루틴을 선택하세요")
        .addOptions(
          { label: "현황판", description: "오늘 상태, 예산, 지출/정산을 한 번에 봅니다.", value: "now" },
          { label: "준비도", description: "출발 전 보강할 빈칸과 점수를 봅니다.", value: "readiness" },
          { label: "보강 플랜", description: "준비도 기준 우선순위 보강 액션을 봅니다.", value: "prep-plan" },
          { label: "준비 공유", description: "동행에게 보낼 준비 요약문을 봅니다.", value: "readiness-share" },
          { label: "오늘 브리핑", description: "오늘 일정과 하루 예산을 함께 봅니다.", value: "brief" },
          { label: "오늘 점검", description: "나가기 전 준비와 일정/지출 체크리스트를 봅니다.", value: "today-check" },
          { label: "내일 브리핑", description: "내일 일정/예산과 오늘 밤 준비를 봅니다.", value: "tomorrow" },
          { label: "오늘 공유", description: "동행에게 보낼 짧은 공유 요약을 봅니다.", value: "day-share" },
          { label: "밤 점검", description: "지출 누락과 내일 준비를 점검합니다.", value: "night-check" },
          { label: "오늘 예산", description: "오늘 하루 예산과 지출을 확인합니다.", value: "daily-budget" },
          { label: "메모 보기", description: "이 플랜에 남긴 개인 메모를 봅니다.", value: "memo" },
          { label: "다음 액션", description: "지금 가장 먼저 할 일을 추천받습니다.", value: "next-action" }
        )
    ),
  ];
}

function expenseFollowupComponents(plan, expenseId = null) {
  const buttons = [
      new ButtonBuilder()
        .setCustomId(`plan-spending:${plan.id}`)
        .setLabel("소진")
        .setStyle(ButtonStyle.Secondary),
      new ButtonBuilder()
        .setCustomId(`plan-daily-budget:${plan.id}`)
        .setLabel("오늘 예산")
        .setStyle(ButtonStyle.Secondary),
      new ButtonBuilder()
        .setCustomId(`plan-recap:${plan.id}`)
        .setLabel("회고")
        .setStyle(ButtonStyle.Secondary),
      new ButtonBuilder()
        .setCustomId(`plan-settlemessage:${plan.id}`)
        .setLabel("정산 요청")
        .setStyle(ButtonStyle.Secondary)
  ];
  if (expenseId) {
    buttons.push(
      new ButtonBuilder()
        .setCustomId(`plan-expense-undo:${plan.id}:${expenseId}`)
        .setLabel("되돌리기")
        .setStyle(ButtonStyle.Danger)
    );
  }
  return [
    new ActionRowBuilder().addComponents(...buttons),
  ];
}

function moneyFollowupComponents(plan) {
  return [
    new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId(`plan-expense-input:${plan.id}`)
        .setLabel("지출 입력")
        .setStyle(ButtonStyle.Primary),
      new ButtonBuilder()
        .setCustomId(`plan-expenses:${plan.id}`)
        .setLabel("지출 내역")
        .setStyle(ButtonStyle.Secondary),
      new ButtonBuilder()
        .setCustomId(`plan-daily-budget:${plan.id}`)
        .setLabel("오늘 예산")
        .setStyle(ButtonStyle.Secondary),
      new ButtonBuilder()
        .setCustomId(`plan-recap:${plan.id}`)
        .setLabel("회고")
        .setStyle(ButtonStyle.Secondary),
      new ButtonBuilder()
        .setCustomId(`plan-settlemessage:${plan.id}`)
        .setLabel("정산 요청")
        .setStyle(ButtonStyle.Secondary)
    ),
    new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId(`plan-settlematrix:${plan.id}`)
        .setLabel("정산표")
        .setStyle(ButtonStyle.Secondary),
      new ButtonBuilder()
        .setCustomId(`plan-settletransfers:${plan.id}`)
        .setLabel("송금 방향")
        .setStyle(ButtonStyle.Secondary),
      new ButtonBuilder()
        .setCustomId(`plan-expenses-export:${plan.id}`)
        .setLabel("CSV")
        .setStyle(ButtonStyle.Secondary)
    ),
  ];
}

function revisionReply(plan, revision) {
  return {
    content: revisionSummary(plan, revision),
    files: [revisionAttachment(plan, revision)],
  };
}

function refineQualityNotice(plan) {
  const revisions = [...(plan?.revisions || [])].sort((a, b) => Number(b.version || 0) - Number(a.version || 0));
  const latest = revisions[0];
  const previous = revisions[1];
  const audit = revisionQualityAuditText(latest, previous).replace(/^ \/ /, "");
  return audit ? `고도화 완료 · ${audit}` : "고도화 완료";
}

function planReply(plan, options = {}) {
  return {
    content: [options.notice, planSummary(plan)].filter(Boolean).join("\n\n"),
    files: [planAttachment(plan)],
    components: planComponents(plan),
  };
}

function planListLine(plan) {
  const pinned = plan.pinned ? "[고정] " : "";
  const quality = planQualityAuditText(plan);
  const qualityText = quality ? ` / ${quality}` : "";
  return `${pinned}#${plan.id} v${plan.latestVersion} / ${plan.departure || "서울"} -> ${plan.destination} / ${plan.nights}박 / ${plan.startDate}${qualityText}`;
}

function qualityActionReasonText(plan) {
  const storedReason = String(plan?.qualityActionReason || "").trim();
  if (storedReason) return storedReason.startsWith("후보:") ? storedReason : `후보: ${storedReason}`;
  const warningCount = Number(plan?.qualityWarningCount || 0);
  const checkCount = Number(plan?.qualityCheckCount || 0);
  const delta = Number.isFinite(plan?.qualityWarningDelta) ? Number(plan.qualityWarningDelta) : 0;
  if (delta > 0) return `후보: 악화 +${delta} 먼저 보강`;
  if (warningCount > 0) return `후보: 확인 ${warningCount} 보강`;
  if (checkCount <= 0) return "후보: 품질 점검 생성";
  return "";
}

function planNeedsQualityAudit(plan) {
  const nextAction = String(plan?.qualityNextAction || "").trim();
  if (nextAction) return nextAction === "quality-audit";
  return Number(plan?.qualityCheckCount || 0) <= 0;
}

function qualityActionPriorityText(plan) {
  const storedLabel = String(plan?.qualityActionPriorityLabel || "").trim();
  if (storedLabel) return storedLabel;
  const priority = Number(plan?.qualityActionPriority || 0);
  if (!priority) return "";
  if (priority >= 100) return `긴급 ${priority}`;
  if (priority >= 80) return `높음 ${priority}`;
  if (priority >= 70) return `점검 ${priority}`;
  return `낮음 ${priority}`;
}

function qualityPlanListLine(plan, filter) {
  const reason = filter === "quality-action" || filter === "quality-urgent" ? qualityActionReasonText(plan) : "";
  const priority = filter === "quality-action" || filter === "quality-urgent" ? qualityActionPriorityText(plan) : "";
  return [planListLine(plan), priority ? `우선도: ${priority}` : "", reason].filter(Boolean).join(" / ");
}

function dashboardSection(title, plans, emptyText) {
  if (!plans.length) return `${title}\n- ${emptyText}`;
  return `${title}\n${plans.map((plan) => `- ${planListLine(plan)}`).join("\n")}`;
}

function formatUptime(seconds) {
  const totalSeconds = Math.max(0, Math.floor(Number(seconds) || 0));
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const rest = totalSeconds % 60;
  if (hours > 0) return `${hours}시간 ${minutes}분`;
  if (minutes > 0) return `${minutes}분 ${rest}초`;
  return `${rest}초`;
}

function llmStatusText() {
  const provider = (process.env.LLM_PROVIDER || "auto").toLowerCase();
  const hasOpenAiKey = Boolean(process.env.LLM_API_KEY || process.env.OPENAI_API_KEY);
  const hasClaudeKey = Boolean(process.env.LLM_API_KEY || process.env.CLAUDE_API_KEY || process.env.ANTHROPIC_API_KEY);
  if (provider === "mock") return "mock 템플릿 모드";
  if (hasOpenAiKey || hasClaudeKey) return `${provider} / API 키 설정됨`;
  return `${provider} / API 키 없음, 템플릿 폴백 예상`;
}

function webLlmPolicyRequiresUserKey() {
  return ["1", "true", "yes", "on"].includes(String(process.env.TRAVEL_REQUIRE_USER_LLM_KEY || "").trim().toLowerCase());
}

function webLlmPolicyText() {
  return webLlmPolicyRequiresUserKey()
    ? "사용자 provider API key 필수. 웹 생성/고도화에서 서버 key fallback 차단"
    : "서버 기본 LLM key 허용. 공유 전 TRAVEL_REQUIRE_USER_LLM_KEY=true 권장";
}

function readNonNegativeInt(value, fallback) {
  if (value === undefined || value === "") return fallback;
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed >= 0 ? Math.floor(parsed) : fallback;
}

function webApiRateLimitText() {
  const max = readNonNegativeInt(process.env.TRAVEL_API_RATE_LIMIT_MAX, 120);
  if (!max) return "꺼짐";
  const windowMs = Math.max(1000, readNonNegativeInt(process.env.TRAVEL_API_RATE_LIMIT_WINDOW_MS, 60000));
  return `${max}회/${Math.round(windowMs / 1000)}초`;
}

function uniquePlans(...groups) {
  const seen = new Set();
  return groups
    .flat()
    .filter(Boolean)
    .filter((plan) => {
      if (seen.has(plan.id)) return false;
      seen.add(plan.id);
      return true;
    });
}

function expenseFiltersFromInteraction(interaction) {
  return {
    category: interaction.options.getString("category") || "",
    date: interaction.options.getString("date") || "",
    paidBy: interaction.options.getString("paid_by") || "",
  };
}

function mineComponents(plans, userId) {
  const menu = new StringSelectMenuBuilder()
    .setCustomId(`plan-select:${userId}`)
    .setPlaceholder("열어볼 플랜을 선택하세요")
    .addOptions(
      plans.slice(0, 25).map((plan) => ({
        label: `#${plan.id} ${plan.destination || "미정"} ${plan.nights || 2}박`,
        description: planSelectDescription(plan),
        value: String(plan.id),
      }))
    );
  return [new ActionRowBuilder().addComponents(menu)];
}

function revisionLine(revision, previousRevision = null) {
  const feedback = revision.feedback ? ` / ${truncateText(revision.feedback, 80).replace(/\n/g, " ")}` : "";
  return `v${revision.version} / ${new Date(revision.createdAt).toLocaleString()} / ${revisionLlmAuditText(revision)}${revisionQualityAuditText(revision, previousRevision)}${feedback}`;
}

function revisionLlmAuditText(revision) {
  const modeLabels = {
    "server-default": "서버 key",
    "user-api-key": "사용자 key",
  };
  const providerLabels = {
    anthropic: "Anthropic",
    auto: "자동",
    claude: "Anthropic",
    codex: "OpenAI",
    openai: "OpenAI",
  };
  const mode = modeLabels[revision.llmAuthMode] || revision.llmAuthMode || "";
  const provider = providerLabels[revision.llmProvider] || revision.llmProvider || "";
  const parts = [];
  if (mode || provider) parts.push(provider ? `${mode || "LLM"}/${provider}` : mode);
  if (revision.model) parts.push(revision.model);
  if (revision.llmModelOverride) parts.push("직접 모델");
  return parts.join(" · ") || "model unknown";
}

function revisionQualityAuditText(revision, previousRevision = null) {
  const checks = qualityChecksFromPlanText(revision?.planText);
  if (checks.length === 0) return "";
  const warnings = checks.filter((item) => !item.ok);
  const trend = revisionQualityTrendText(warnings.length, previousRevision);
  if (warnings.length === 0) return ` / 품질 OK${trend}`;
  const labels = warnings.map((item) => item.label).slice(0, 2).join(", ");
  const extra = warnings.length > 2 ? ` 외 ${warnings.length - 2}` : "";
  return ` / 품질 확인 ${warnings.length}${labels ? `: ${labels}${extra}` : ""}${trend}`;
}

function revisionQualityTrendText(warningCount, previousRevision) {
  const previousChecks = qualityChecksFromPlanText(previousRevision?.planText);
  if (previousChecks.length === 0) return "";
  const previousWarningCount = previousChecks.filter((item) => !item.ok).length;
  return qualityTrendText(warningCount - previousWarningCount);
}

function historyComponents(plan, userId) {
  const revisions = [...(plan.revisions || [])].sort((a, b) => b.version - a.version);
  const menu = new StringSelectMenuBuilder()
    .setCustomId(`plan-version-select:${userId}:${plan.id}`)
    .setPlaceholder("열어볼 버전을 선택하세요")
    .addOptions(
      revisions.slice(0, 25).map((revision, index) => ({
        label: `v${revision.version} ${revisionLlmAuditText(revision)}`.slice(0, 100),
        description: `${revisionQualityAuditText(revision, revisions[index + 1]).replace(/^ \/ /, "") || "품질 점검 없음"} / ${revision.feedback || revision.createdAt || "초기 생성"}`.slice(0, 100),
        value: String(revision.version),
      }))
    );
  return [new ActionRowBuilder().addComponents(menu)];
}

function historyReply(plan, userId) {
  const revisions = [...(plan.revisions || [])].sort((a, b) => b.version - a.version);
  if (revisions.length === 0) {
    return {
      content: `플랜 #${plan.id}의 버전 히스토리가 없습니다.`,
    };
  }
  return {
    content: truncateText(`플랜 #${plan.id} ${plan.destination} 버전 히스토리\n${revisions.map((revision, index) => revisionLine(revision, revisions[index + 1])).join("\n")}`),
    components: historyComponents(plan, userId),
  };
}

export function buildPlanInput(interaction) {
  return {
    destination: interaction.options.getString("destination", true),
    nights: interaction.options.getInteger("nights", true),
    companions: interaction.options.getString("companions", true),
    scope: interaction.options.getString("scope", true),
    departure: interaction.options.getString("departure") || "서울",
    baseLocation: interaction.options.getString("base_location") || "",
    arrivalTime: interaction.options.getString("arrival_time") || "",
    departureTime: interaction.options.getString("departure_time") || "",
    travelers: interaction.options.getInteger("travelers") || 2,
    startDate: interaction.options.getString("start_date") || "",
    country: interaction.options.getString("country") || "",
    tripType: interaction.options.getString("style") || "",
    budgetPerPerson: interaction.options.getInteger("budget_per_person") || null,
    accommodation:
      interaction.options.getString("accommodation") === "unspecified"
        ? ""
        : interaction.options.getString("accommodation") || "",
    transportPref: interaction.options.getString("transport_pref") || "auto",
    highlights: interaction.options.getString("highlights") || "",
    notes: interaction.options.getString("notes") || "",
  };
}

function generateInitialPlan(input) {
  return createGoogleGroundedPlanGenerator().generate(input);
}

function withDiscordContext(input, interaction) {
  return {
    ...input,
    source: "discord",
    discordUserId: interaction.user.id,
    discordUserName: interaction.user.username,
    discordChannelId: interaction.channelId || "",
    discordGuildId: interaction.guildId || "",
  };
}

function findFirstMatch(text, patterns) {
  for (const pattern of patterns) {
    const match = text.match(pattern);
    if (match) return match;
  }
  return null;
}

function inferCompanions(text) {
  if (/혼자|solo|솔로/i.test(text)) return "혼자";
  if (/커플|연인|남친|여친|부부/i.test(text)) return "커플";
  if (/가족|부모|아이|애들|자녀/i.test(text)) return "가족";
  if (/친구|친구들|동기|모임/i.test(text)) return "친구";
  return "커플";
}

function inferTripType(text) {
  const tags = [];
  const rules = [
    ["맛집", /맛집|먹방|식도락|카페/],
    ["자연", /자연|등산|바다|해변|숲|공원/],
    ["휴식", /휴식|힐링|느긋|쉬/],
    ["쇼핑", /쇼핑|시장|아울렛|백화점/],
    ["문화", /문화|역사|박물관|전시|미술관/],
    ["야경", /야경|노을|뷰/],
  ];
  rules.forEach(([tag, pattern]) => {
    if (pattern.test(text)) tags.push(tag);
  });
  return [...new Set(tags)].join(",");
}

function inferTransportPref(text) {
  if (/ktx/i.test(text)) return "KTX";
  if (/srt/i.test(text)) return "SRT";
  if (/버스|고속버스/.test(text)) return "bus";
  if (/자차|차로|운전|렌트/.test(text)) return "car";
  if (/항공|비행기|공항|flight/i.test(text)) return "flight";
  return "auto";
}

function inferAccommodation(text) {
  if (/호텔/.test(text)) return "호텔";
  if (/게스트하우스|게하/.test(text)) return "게스트하우스";
  if (/펜션/.test(text)) return "펜션";
  if (/리조트/.test(text)) return "리조트";
  return "";
}

function toYmd(year, month, day) {
  return `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

function todayYmd() {
  const now = new Date();
  return toYmd(now.getFullYear(), now.getMonth() + 1, now.getDate());
}

function inferStartDate(text) {
  const isoMatch = text.match(/\d{4}-\d{2}-\d{2}/);
  if (isoMatch) return isoMatch[0];

  const fullKoreanMatch = text.match(/(\d{4})\s*년\s*(\d{1,2})\s*월\s*(\d{1,2})\s*일/);
  if (fullKoreanMatch) {
    return toYmd(Number(fullKoreanMatch[1]), Number(fullKoreanMatch[2]), Number(fullKoreanMatch[3]));
  }

  const monthDayMatch = text.match(/(\d{1,2})\s*월\s*(\d{1,2})\s*일/);
  if (monthDayMatch) {
    return toYmd(CURRENT_YEAR, Number(monthDayMatch[1]), Number(monthDayMatch[2]));
  }

  return "";
}

function inferBudgetPerPerson(text) {
  const perPersonMatch = findFirstMatch(text, [
    /1\s*인(?:당|예산)?\s*(\d+(?:\.\d+)?)\s*만\s*원/,
    /1\s*인(?:당|예산)?\s*(\d[\d,]*)\s*원/,
    /인당\s*(\d+(?:\.\d+)?)\s*만\s*원/,
    /인당\s*(\d[\d,]*)\s*원/,
  ]);
  const fallbackMatch =
    perPersonMatch || findFirstMatch(text, [/예산\s*(\d+(?:\.\d+)?)\s*만\s*원/, /예산\s*(\d[\d,]*)\s*원/]);
  if (!fallbackMatch) return null;

  const amount = Number(String(fallbackMatch[1]).replace(/,/g, ""));
  if (!Number.isFinite(amount)) return null;
  return /만\s*원/.test(fallbackMatch[0]) ? Math.round(amount * 10000) : Math.round(amount);
}

export function parseQuickRequest(text) {
  const normalized = String(text || "").trim();
  const durationText = normalized
    .replace(/\d{4}-\d{2}-\d{2}/g, "")
    .replace(/(?:\d{4}\s*년\s*)?\d{1,2}\s*월\s*\d{1,2}\s*일/g, "");
  const nightsMatch = durationText.match(/(\d+)\s*박/);
  const daysMatch = durationText.match(/(\d+)\s*일/);
  const nights = /당일(?:치기)?/.test(durationText)
    ? 0
    : nightsMatch
      ? Number(nightsMatch[1])
      : daysMatch
        ? Math.max(0, Number(daysMatch[1]) - 1)
        : 2;
  const travelersMatch = findFirstMatch(normalized, [
    /(\d+)\s*명/,
    /(\d+)\s*인(?:원|이서|으로)?/,
    /(\d+)\s*명이서/,
  ]);
  const departureMatch = findFirstMatch(normalized, [
    /([가-힣A-Za-z]+)\s*출발/,
    /출발(?:지|은|는|에서)?\s*([가-힣A-Za-z]+)/,
  ]);
  const destinationMatch = findFirstMatch(normalized, [
    /\d{4}-\d{2}-\d{2}\s*([가-힣A-Za-z]+)/,
    /(?:\d{4}\s*년\s*)?\d{1,2}\s*월\s*\d{1,2}\s*일\s*([가-힣A-Za-z]+)/,
    /(?:목적지|여행지)(?:는|은|:)?\s*([가-힣A-Za-z]+)/,
    /([가-힣A-Za-z]+)\s*(?:여행|가고|갈래|가자)/,
    /^([가-힣A-Za-z]+)/,
  ]);

  return {
    destination: destinationMatch?.[1] || "미정",
    departure: departureMatch?.[1] || "서울",
    scope: /해외|일본|중국|대만|태국|베트남|미국|유럽|international/i.test(normalized)
      ? "international"
      : "domestic",
    companions: inferCompanions(normalized),
    travelers: travelersMatch ? Number(travelersMatch[1]) : 2,
    nights,
    startDate: inferStartDate(normalized) || todayYmd(),
    country: "",
    tripType: inferTripType(normalized),
    budgetPerPerson: inferBudgetPerPerson(normalized),
    accommodation: inferAccommodation(normalized),
    transportPref: inferTransportPref(normalized),
    highlights: "",
    notes: normalized,
  };
}

function buildDiscordGuide() {
  return [
    "여행 플래너 Discord 가이드",
    "",
    "## 처음 만들기",
    "- `/quick request:2026-08-01 부산 2박3일 친구랑 맛집 위주 서울 출발 KTX 1인 20만원`",
    "- `/plan`으로 항목별 입력",
    "- 밖에서 쓸 플랜은 `/offline`으로 iPhone 파일/노트에 저장",
    "- `/home` 또는 `/dashboard`로 최근/여행 중/예정/고정 플랜 모아보기",
    "- `/status`로 봇/저장소/웹 링크 설정 확인",
    "- `/policy`로 서버/사용자/운영자 접근 정책 확인",
    "- `/mobile`로 아이폰 원격 사용 흐름과 웹 링크 상태 확인",
    "- `/iphone`으로 같은 Wi-Fi 밖에서 쓸 때의 조건 확인",
    "- `/iphoneenv`로 iPhone/Discord 접근 설정 파일 받기",
    "- `/recover`로 접근이 막혔을 때 설정/ID/정책 복구 버튼 보기",
    "- `/ops`로 Mac 상시 실행/로그/재시작 힌트 확인",
    "- `/readiness`로 출발 전 보강할 빈칸 확인",
    "- `/prepplan`으로 우선순위 보강 플랜 받기",
    "- `/readyshare`로 동행에게 보낼 준비 공유문 만들기",
    "- `/now`로 지금 현황판 보기",
    "- `/nextaction`으로 지금 할 일 추천받기",
    "",
    "## 여행 전",
    "- `/checklist` 여행 준비 체크",
    "- `/packing` 짐싸기",
    "- `/departure` 출발 전 브리핑",
    "- `/calendar` 캘린더 파일 받기",
    "- `/web` 웹/PWA 상세 링크 확인",
    "",
    "## 여행 중 아침",
    "- `/brief` 오늘 일정과 하루 예산",
    "- `/todaycheck` 나가기 전 점검표",
    "- `/today` 오늘 일정만 보기",
    "- `/dayshare` 동행에게 보낼 짧은 공유 요약",
    "",
    "## 여행 중 돈 관리",
    "- `/expense amount:18000 label:택시 paid_by:민수` 지출 기록",
    "- `/spend amount:4500 label:커피 paid_by:나` 빠른 지출 기록",
    "- `/spendquick text:커피 4500 나` 한 줄 지출 기록",
    "- `/expenseundo` 방금 입력한 지출 삭제",
    "- `/money` 돈 관리 현황 빠르게 보기",
    "- `/dailybudget` 오늘 하루 예산",
    "- `/categorybudget` 카테고리별 예산 위험도",
    "- `/expenses` 누적 지출과 결제자별 정산 감각",
    "- `/settlematrix` 결제자별 받을/낼 금액",
    "- `/settletransfers` 실제 송금 방향과 금액",
    "- `/settlemessage` 동행에게 보낼 정산 요청문",
    "",
    "## 여행 중 밤",
    "- `/tomorrow` 내일 일정/예산 브리핑",
    "- `/ask question:내일 비 오면 어떻게 바꿔?`",
    "- `/memo text:숙소 예약번호 ABC123`",
    "- `/memos` 메모 남긴 플랜 모아보기",
    "- `/memosearch query:숙소` 메모 키워드 검색",
    "- `/memoshare` 동행에게 보낼 메모 공유문 만들기",
    "- `/note plan_id:1 text:숙소 예약번호 ABC123`",
    "",
    "## 여행 후",
    "- `/recap` 회고/정산 요약",
    "- `/recap_export` 회고 Markdown 파일",
    "- `/expenses_export` 지출 CSV 파일",
    "- `/backup` 내 Discord 플랜 JSON 백업",
  ].join("\n");
}

function buildDiscordStart() {
  return [
    "여행 플래너 시작하기",
    "",
    "1. 먼저 `/status`로 봇과 저장소, LLM 설정을 확인하세요.",
    "2. 아이폰에서 밖에서도 쓸 계획이면 외부 LTE/5G 조건은 `/iphone`, 접근 설정 파일은 `/iphoneenv`로 확인하세요.",
    "3. 첫 여행은 `/quick request:부산 2박3일 친구랑 맛집 위주 서울 출발 KTX`처럼 한 줄로 만드세요.",
    "4. 밖에서 쓸 플랜은 `/offline`으로 iPhone 파일/노트에 저장할 Markdown을 받아두세요.",
    "5. 만든 뒤에는 `/home` 또는 `/dashboard`에서 최근/진행 중/고정 플랜을 다시 열 수 있습니다.",
    "6. 여행 중에는 `/now` 또는 `/nextaction`을 먼저 누르면 지금 필요한 명령을 고를 수 있습니다.",
    "",
    "자주 쓰는 명령",
    "- 새 플랜: `/quick`, `/plan`",
    "- 모바일 홈: `/home`, `/dashboard`",
    "- 오프라인 저장: `/offline`",
    "- 운영 점검: `/status`, `/policy`, `/doctor`, `/ops`, `/mobile`, `/iphone`, `/iphoneenv`, `/recover`, `/whoami`",
    "- 빠른 메모: `/memo`, `/memos`, `/memosearch`, `/memoshare`, `/note`",
    "- 돈 관리: `/money`, `/spendquick`, `/expenseundo`",
    "- 지금 상태: `/now`, `/nextaction`",
    "- 준비 점검: `/readiness`, `/prepplan`",
    "- 전체 가이드: `/help`, `/guide`",
  ].join("\n");
}

function buildIphoneAccessGuide(userId = "", guildId = "") {
  const detailUrl = publicPlanUrl("latest");
  const detailLine = detailUrl
    ? `- 웹 상세 버튼: ${detailUrl}`
    : "- 웹 상세 버튼: `TRAVEL_PUBLIC_BASE_URL` 미설정. Discord 명령과 오프라인팩은 계속 사용 가능합니다.";
  const diagnosisLine = `- 현재 웹 상세 접근 진단: ${webAccessDiagnosis()}`;
  const adminLine = userId
    ? `- 내 사용자만 허용: \`DISCORD_ALLOWED_USER_IDS=${userId}\` / 진단 권한: \`DISCORD_ADMIN_USER_IDS=${userId}\``
    : "- 내 사용자만 허용: `/whoami`로 확인한 ID를 `DISCORD_ALLOWED_USER_IDS`와 `DISCORD_ADMIN_USER_IDS`에 추가";
  const guildLine = guildId
    ? `- 현재 서버 ID: \`${guildId}\` - \`DISCORD_GUILD_ID\` 또는 \`DISCORD_ALLOWED_GUILD_IDS\` 예시에 사용 가능`
    : "- 현재 서버 ID: DM에서는 표시되지 않습니다. 서버 제한이나 빠른 guild 등록이 필요하면 서버에서 `/whoami` 또는 `/iphone`을 여세요.";
  return [
    "iPhone 외부 사용 체크리스트",
    "",
    "핵심 판단",
    "- Discord 명령: 같은 Wi-Fi가 아니어도 됩니다. Mac/서버에서 봇이 켜져 있고 인터넷에 연결되어 있으면 LTE/5G에서도 호출됩니다.",
    "- localhost:3000: iPhone에서 직접 열 수 없습니다. 웹 상세 화면은 Mac IP 같은 Wi-Fi, 터널/VPN, 또는 배포 URL이 필요합니다.",
    detailLine,
    diagnosisLine,
    "",
    "웹 상세가 안 열릴 때",
    "- 일정/체크리스트/예산/정산은 Discord 버튼과 명령으로 계속 확인하세요.",
    "- 이동 중이면 `/offline` 오프라인팩을 먼저 열어 핵심 일정과 비상 정보를 보세요.",
    "- 웹 화면이 꼭 필요하면 `TRAVEL_PUBLIC_BASE_URL`을 터널/VPN/배포 URL로 바꾼 뒤 봇을 다시 시작하세요.",
    "",
    "설정 힌트",
    adminLine,
    guildLine,
    "- 새 명령 빠른 등록: `DISCORD_GUILD_ID=내_DISCORD_SERVER_ID` 설정 후 봇 재시작",
    "- 같은 Wi-Fi 웹 상세: `TRAVEL_PUBLIC_BASE_URL=http://맥IP:3000`",
    "- 외부 웹 상세: `TRAVEL_PUBLIC_BASE_URL`에 터널/VPN/배포 URL 설정",
    "",
    "외부에서 쓰기 전 확인",
    "1. 설정 전이거나 차단되면 `/recover`, `/start`, 또는 `/iphoneenv`로 접근 설정 파일 받기",
    "2. `/whoami`로 `DISCORD_ALLOWED_USER_IDS`와 `DISCORD_ADMIN_USER_IDS`에 넣을 내 ID 확인",
    "3. `/policy`로 서버/사용자/관리자 접근 정책 확인",
    "4. 설정 반영 후 `/status`로 봇/저장소/웹 링크 상태 확인",
    "5. 관리자라면 `/doctor`로 env, 저장소, launchd 상태 점검",
    "6. `/ops`로 Mac 상시 실행과 로그 위치 확인",
    "7. `/offline`으로 최신 오프라인팩 저장",
    "8. `/mobile` 또는 `/home`에서 여행 화면 열기",
    "- 버튼 첫 줄은 설정 전 복구용, 둘째 줄은 설정 반영 후 점검/운영용입니다.",
    "",
    "장애 대비",
    "- Mac이 잠자기/종료되면 로컬 봇도 멈춥니다.",
    "- 웹 상세 링크가 안 열려도 Discord 명령, 버튼, 오프라인팩은 계속 쓸 수 있습니다.",
    "- 여행 전에는 `/offline` 파일명을 확인하고 iPhone 파일 앱이나 메모에 저장해두세요.",
  ].join("\n");
}

function buildIphoneEnvContent(userId = "", guildId = "") {
  const adminValue = userId || "내_DISCORD_USER_ID";
  const serverValue = guildId || "내_DISCORD_SERVER_ID";
  return [
    `DISCORD_ALLOWED_USER_IDS=${adminValue}`,
    `DISCORD_ADMIN_USER_IDS=${adminValue}`,
    "",
    "# 개인 DM에서도 쓰려면:",
    "# DISCORD_ALLOW_DM=true",
    "",
    "# 특정 서버에 명령을 빠르게 등록하려면:",
    `# DISCORD_GUILD_ID=${serverValue}`,
    "",
    "# 특정 서버에서만 쓰려면:",
    `# DISCORD_ALLOWED_GUILD_IDS=${serverValue}`,
    "",
    "# 같은 Wi-Fi에서만 웹 상세를 열 때:",
    "# TRAVEL_PUBLIC_BASE_URL=http://맥IP:3000",
    "",
    "# 외부에서도 웹 상세를 열 때:",
    "# TRAVEL_PUBLIC_BASE_URL=https://your-tunnel-or-domain.example",
    "",
    "# 저장 후 Mac에서 실행:",
    "# cd webapp && npm run bot:restart",
    "",
    "# Discord에서 확인:",
    "# /status",
    "# /iphone",
  ].join("\n");
}

function buildIphoneEnvSnippet(userId = "", guildId = "") {
  const envContent = buildIphoneEnvContent(userId, guildId);
  return [
    "iPhone 외부 사용 .env 스니펫",
    "",
    "```env",
    envContent,
    "```",
    "",
    "- 첨부 파일은 코드펜스 없이 바로 붙여넣기 좋은 `.env` 조각입니다.",
    "- 이미 `.env`가 있으면 Discord 토큰/LLM 키는 유지하고 접근 관련 줄만 갱신하세요.",
    "- 저장 후 Mac에서 `cd webapp && npm run bot:restart`로 봇을 다시 시작하세요.",
    "- Discord 운영 안내는 관리자 설정 반영 후 `/ops`에서 확인하세요.",
    "- 새 slash command가 늦게 보이면 `DISCORD_GUILD_ID` 예시를 설정하고 다시 시작하세요.",
    "- 다시 시작한 뒤 `/status`와 `/iphone`으로 설정 반영 여부를 확인하세요.",
    "- 웹 상세 없이 쓸 때는 Discord 명령과 `/offline` 오프라인팩을 사용하세요.",
  ].join("\n");
}

function startComponents() {
  return [
    new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId("start-quick")
        .setLabel("새 여행")
        .setStyle(ButtonStyle.Primary),
      new ButtonBuilder()
        .setCustomId("start-mobile")
        .setLabel("모바일")
        .setStyle(ButtonStyle.Secondary),
      new ButtonBuilder()
        .setCustomId("mobile-dashboard")
        .setLabel("홈")
        .setStyle(ButtonStyle.Secondary),
      new ButtonBuilder()
        .setCustomId("mobile-status")
        .setLabel("상태")
        .setStyle(ButtonStyle.Secondary),
      new ButtonBuilder()
        .setCustomId("mobile-guide")
        .setLabel("가이드")
        .setStyle(ButtonStyle.Secondary)
    ),
    new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId("start-offline")
        .setLabel("오프라인 저장")
        .setStyle(ButtonStyle.Secondary),
      new ButtonBuilder()
        .setCustomId("start-iphone")
        .setLabel("외부 사용")
        .setStyle(ButtonStyle.Secondary),
      new ButtonBuilder()
        .setCustomId("iphone-env")
        .setLabel("설정")
        .setStyle(ButtonStyle.Secondary),
      new ButtonBuilder()
        .setCustomId("iphone-whoami")
        .setLabel("내 ID")
        .setStyle(ButtonStyle.Secondary),
      new ButtonBuilder()
        .setCustomId("iphone-policy")
        .setLabel("정책")
        .setStyle(ButtonStyle.Secondary),
      new ButtonBuilder()
        .setCustomId("ops-denied")
        .setLabel("차단 로그")
        .setStyle(ButtonStyle.Secondary)
    ),
  ];
}

export const commands = [
  new SlashCommandBuilder()
    .setName("start")
    .setDescription("처음 사용할 때 필요한 Discord 여행 플래너 시작 가이드를 봅니다."),
  new SlashCommandBuilder()
    .setName("quick")
    .setDescription("한 줄 요청으로 여행 플랜을 빠르게 생성합니다.")
    .addStringOption((option) =>
      option
        .setName("request")
        .setDescription("예: 2026-08-01 부산 2박3일 친구랑 맛집 위주 서울 출발")
        .setRequired(true)
    ),
  new SlashCommandBuilder()
    .setName("plan")
    .setDescription("travel-orchestrator 기반 여행 플랜을 생성합니다.")
    .addStringOption((option) =>
      option.setName("destination").setDescription("목적지").setRequired(true)
    )
    .addIntegerOption((option) =>
      option.setName("nights").setDescription("몇 박").setRequired(true).setMinValue(0).setMaxValue(30)
    )
    .addStringOption((option) =>
      option.setName("companions").setDescription("누구와 가는지").setRequired(true)
    )
    .addStringOption((option) =>
      option
        .setName("scope")
        .setDescription("국내/해외")
        .setRequired(true)
        .addChoices(
          { name: "국내", value: "domestic" },
          { name: "해외", value: "international" }
        )
    )
    .addStringOption((option) =>
      option.setName("start_date").setDescription("출발일 YYYY-MM-DD").setRequired(true)
    )
    .addStringOption((o) => o.setName("departure").setDescription("출발지 (기본 서울)"))
    .addStringOption((o) => o.setName("base_location").setDescription("실제 숙소명 또는 주소 (현지 이동 기준점)"))
    .addStringOption((o) => o.setName("arrival_time").setDescription("첫날 현지 도착 시각 HH:MM"))
    .addStringOption((o) => o.setName("departure_time").setDescription("마지막 날 현지 출발 시각 HH:MM"))
    .addIntegerOption((o) => o.setName("travelers").setDescription("인원수 (기본 2)").setMinValue(1).setMaxValue(20))
    .addStringOption((option) => option.setName("country").setDescription("국가/지역"))
    .addStringOption((option) => option.setName("style").setDescription("여행 스타일"))
    .addIntegerOption((option) => option.setName("budget_per_person").setDescription("1인 예산"))
    .addStringOption((option) =>
      option
        .setName("accommodation")
        .setDescription("숙박 선호")
        .addChoices(
          { name: "미지정", value: "unspecified" },
          { name: "호텔", value: "호텔" },
          { name: "게스트하우스", value: "게스트하우스" },
          { name: "펜션", value: "펜션" },
          { name: "리조트", value: "리조트" }
        )
    )
    .addStringOption((option) =>
      option
        .setName("transport_pref")
        .setDescription("교통 선호")
        .addChoices(
          { name: "자동 선택", value: "auto" },
          { name: "KTX", value: "KTX" },
          { name: "SRT", value: "SRT" },
          { name: "버스", value: "bus" },
          { name: "자차", value: "car" },
          { name: "항공", value: "flight" }
        )
    )
    .addStringOption((option) => option.setName("highlights").setDescription("꼭 넣고 싶은 장소/활동"))
    .addStringOption((option) => option.setName("notes").setDescription("추가 요청")),
  new SlashCommandBuilder()
    .setName("check")
    .setDescription("저장된 근거로 플랜의 영업시간·이동시간 충돌을 다시 검사합니다.")
    .addIntegerOption((option) => option.setName("plan_id").setDescription("플랜 ID").setRequired(true)),
  new SlashCommandBuilder()
    .setName("replace")
    .setDescription("저장된 후보 근거 안에서 장소를 교체하고 재계획합니다.")
    .addIntegerOption((option) => option.setName("plan_id").setDescription("플랜 ID").setRequired(true))
    .addStringOption((option) => option.setName("old_place_id").setDescription("교체할 장소 ID").setRequired(true))
    .addStringOption((option) => option.setName("replacement_place_id").setDescription("대체 장소 ID").setRequired(true)),
  new SlashCommandBuilder()
    .setName("move")
    .setDescription("검증된 영업시간 안에서 장소를 지정 날짜로 이동해 재계획합니다.")
    .addIntegerOption((option) => option.setName("plan_id").setDescription("플랜 ID").setRequired(true))
    .addStringOption((option) => option.setName("place_id").setDescription("이동할 장소 ID").setRequired(true))
    .addStringOption((option) => option.setName("target_date").setDescription("대상 날짜 YYYY-MM-DD").setRequired(true)),
  new SlashCommandBuilder()
    .setName("replan")
    .setDescription("저장된 장소·날씨·이동 근거로 플랜을 다시 최적화합니다.")
    .addIntegerOption((option) => option.setName("plan_id").setDescription("플랜 ID").setRequired(true)),
  new SlashCommandBuilder()
    .setName("refresh")
    .setDescription("외부 데이터를 다시 수집하고 grounded 플랜을 재생성합니다.")
    .addIntegerOption((option) => option.setName("plan_id").setDescription("플랜 ID").setRequired(true)),
  new SlashCommandBuilder()
    .setName("refine")
    .setDescription("기존 여행 플랜을 피드백으로 고도화합니다.")
    .addIntegerOption((option) => option.setName("plan_id").setDescription("플랜 ID").setRequired(true))
    .addStringOption((option) => option.setName("feedback").setDescription("개선 요청").setRequired(true)),
  new SlashCommandBuilder()
    .setName("again")
    .setDescription("내 최근 여행 플랜을 바로 고도화합니다.")
    .addStringOption((option) => option.setName("feedback").setDescription("개선 요청").setRequired(true)),
  new SlashCommandBuilder()
    .setName("reschedule")
    .setDescription("기존 플랜의 출발일과 박수를 변경합니다.")
    .addIntegerOption((option) => option.setName("plan_id").setDescription("플랜 ID").setRequired(true))
    .addStringOption((option) => option.setName("start_date").setDescription("출발일 YYYY-MM-DD").setRequired(true))
    .addIntegerOption((option) => option.setName("nights").setDescription("몇 박").setMinValue(1).setMaxValue(30)),
  new SlashCommandBuilder()
    .setName("partybudget")
    .setDescription("기존 플랜의 인원과 1인 예산을 변경합니다.")
    .addIntegerOption((option) => option.setName("plan_id").setDescription("플랜 ID").setRequired(true))
    .addIntegerOption((option) => option.setName("travelers").setDescription("인원").setRequired(true).setMinValue(1))
    .addIntegerOption((option) => option.setName("budget_per_person").setDescription("1인 예산").setMinValue(0)),
  new SlashCommandBuilder()
    .setName("note")
    .setDescription("기존 플랜의 개인 메모를 저장합니다.")
    .addIntegerOption((option) => option.setName("plan_id").setDescription("플랜 ID").setRequired(true))
    .addStringOption((option) => option.setName("text").setDescription("메모 내용. '-' 입력 시 삭제").setRequired(true)),
  new SlashCommandBuilder()
    .setName("memo")
    .setDescription("외부에서 떠오른 메모를 내 최근 또는 선택한 플랜에 추가합니다.")
    .addStringOption((option) => option.setName("text").setDescription("추가할 메모. '-' 입력 시 삭제").setRequired(true))
    .addIntegerOption((option) => option.setName("plan_id").setDescription("플랜 ID, 비우면 내 최근 플랜")),
  new SlashCommandBuilder()
    .setName("memos")
    .setDescription("개인 메모가 있는 내 여행 플랜을 모아봅니다.")
    .addIntegerOption((option) => option.setName("limit").setDescription("확인할 최근 플랜 수").setMinValue(1).setMaxValue(50)),
  new SlashCommandBuilder()
    .setName("memosearch")
    .setDescription("내 여행 플랜 개인 메모에서 키워드를 검색합니다.")
    .addStringOption((option) => option.setName("query").setDescription("찾을 메모 키워드").setRequired(true))
    .addIntegerOption((option) => option.setName("limit").setDescription("검색할 최근 플랜 수").setMinValue(1).setMaxValue(50)),
  new SlashCommandBuilder()
    .setName("memoshare")
    .setDescription("내 플랜의 개인 메모를 동행에게 보낼 공유문으로 만듭니다.")
    .addIntegerOption((option) => option.setName("plan_id").setDescription("플랜 ID, 비우면 내 최근 플랜")),
  new SlashCommandBuilder()
    .setName("home")
    .setDescription("모바일 홈처럼 내 여행 플랜 대시보드를 봅니다."),
  new SlashCommandBuilder()
    .setName("dashboard")
    .setDescription("모바일에서 내 여행 플랜 대시보드를 봅니다."),
  new SlashCommandBuilder()
    .setName("mobile")
    .setDescription("아이폰에서 Discord로 쓰는 방법과 웹 링크 상태를 확인합니다."),
  new SlashCommandBuilder()
    .setName("iphone")
    .setDescription("iPhone에서 Discord 봇을 외부/LTE로 쓰는 조건을 봅니다."),
  new SlashCommandBuilder()
    .setName("iphoneenv")
    .setDescription("iPhone/Discord 접근 설정용 .env 파일을 받습니다."),
  new SlashCommandBuilder()
    .setName("recover")
    .setDescription("접근이 막혔을 때 설정 복구 버튼을 봅니다."),
  new SlashCommandBuilder()
    .setName("whoami")
    .setDescription("내 Discord user ID와 현재 서버 ID를 확인합니다."),
  new SlashCommandBuilder()
    .setName("policy")
    .setDescription("현재 Discord 서버/사용자/운영자 접근 정책을 확인합니다."),
  new SlashCommandBuilder()
    .setName("ops")
    .setDescription("Mac 상시 실행, 로그, 재시작 힌트를 봅니다."),
  new SlashCommandBuilder()
    .setName("denied")
    .setDescription("최근 Discord 접근 차단 로그를 봅니다.")
    .addIntegerOption((option) => option
      .setName("limit")
      .setDescription("보여줄 최근 로그 개수입니다. 기본 8개, 최대 20개")
      .setMinValue(1)
      .setMaxValue(20))
    .addStringOption((option) => option
      .setName("reason")
      .setDescription("특정 차단 사유만 봅니다.")
      .addChoices(
        { name: "서버 차단", value: "guild_not_allowed" },
        { name: "DM 차단", value: "dm_not_allowed" },
        { name: "사용자 차단", value: "user_not_allowed" },
        { name: "운영 차단", value: "ops_not_allowed" }
      ))
    .addStringOption((option) => option
      .setName("source")
      .setDescription("특정 로그 출처만 봅니다.")
      .addChoices(
        { name: "현재 세션", value: "session" },
        { name: "launchd 로그", value: "launchd" }
      )),
  new SlashCommandBuilder()
    .setName("doctor")
    .setDescription("현재 봇 런타임의 env, 저장소, 웹 링크, launchd 준비 상태를 점검합니다."),
  new SlashCommandBuilder()
    .setName("status")
    .setDescription("Discord 봇, 저장소, 웹 링크, LLM 설정 상태를 확인합니다."),
  new SlashCommandBuilder()
    .setName("nextaction")
    .setDescription("여행 상태와 시간대 기준으로 지금 할 일을 추천합니다.")
    .addIntegerOption((option) => option.setName("plan_id").setDescription("플랜 ID")),
  new SlashCommandBuilder()
    .setName("now")
    .setDescription("오늘 상태, 다음 액션, 예산, 지출/정산 현황판을 봅니다.")
    .addIntegerOption((option) => option.setName("plan_id").setDescription("플랜 ID")),
  new SlashCommandBuilder()
    .setName("readiness")
    .setDescription("여행 플랜 준비도와 출발 전 보강할 항목을 봅니다.")
    .addIntegerOption((option) => option.setName("plan_id").setDescription("플랜 ID")),
  new SlashCommandBuilder()
    .setName("prepplan")
    .setDescription("준비도 기준으로 우선순위 보강 플랜을 봅니다.")
    .addIntegerOption((option) => option.setName("plan_id").setDescription("플랜 ID")),
  new SlashCommandBuilder()
    .setName("readyshare")
    .setDescription("동행에게 보낼 여행 준비 공유문을 만듭니다.")
    .addIntegerOption((option) => option.setName("plan_id").setDescription("플랜 ID")),
  new SlashCommandBuilder()
    .setName("help")
    .setDescription("여행 플래너 Discord 명령 가이드를 봅니다."),
  new SlashCommandBuilder()
    .setName("guide")
    .setDescription("여행 중 상황별 Discord 명령 가이드를 봅니다."),
  new SlashCommandBuilder()
    .setName("plans")
    .setDescription("저장된 여행 플랜 목록을 봅니다.")
    .addIntegerOption((option) => option.setName("limit").setDescription("표시 개수").setMinValue(1).setMaxValue(20)),
  new SlashCommandBuilder()
    .setName("mine")
    .setDescription("내가 만든 여행 플랜 목록을 봅니다.")
    .addIntegerOption((option) => option.setName("limit").setDescription("표시 개수").setMinValue(1).setMaxValue(20)),
  new SlashCommandBuilder()
    .setName("pinned")
    .setDescription("내가 고정한 여행 플랜 목록을 봅니다.")
    .addIntegerOption((option) => option.setName("limit").setDescription("표시 개수").setMinValue(1).setMaxValue(20)),
  new SlashCommandBuilder()
    .setName("upcoming")
    .setDescription("내 예정 여행 플랜 목록을 봅니다.")
    .addIntegerOption((option) => option.setName("limit").setDescription("표시 개수").setMinValue(1).setMaxValue(20)),
  new SlashCommandBuilder()
    .setName("quality")
    .setDescription("자동 품질 점검에서 보강이 필요한 내 플랜을 봅니다.")
    .addIntegerOption((option) => option.setName("limit").setDescription("표시 개수").setMinValue(1).setMaxValue(20)),
  new SlashCommandBuilder()
    .setName("qualitytodo")
    .setDescription("지금 고도화할 품질 후보 플랜을 봅니다.")
    .addIntegerOption((option) => option.setName("limit").setDescription("표시 개수").setMinValue(1).setMaxValue(20))
    .addBooleanOption((option) => option.setName("urgent").setDescription("우선도 80 이상 긴급 후보만 표시"))
    .addBooleanOption((option) => option.setName("next").setDescription("현재 추천 품질 필터 후보만 표시"))
    .addIntegerOption((option) => option.setName("min_priority").setDescription("이 우선도 이상만 표시").setMinValue(0).setMaxValue(100)),
  new SlashCommandBuilder()
    .setName("qualityurgent")
    .setDescription("우선도 80 이상 긴급 품질 후보 플랜을 봅니다.")
    .addIntegerOption((option) => option.setName("limit").setDescription("표시 개수").setMinValue(1).setMaxValue(20)),
  new SlashCommandBuilder()
    .setName("qualitybrief")
    .setDescription("공유할 품질 고도화 TODO를 만듭니다.")
    .addIntegerOption((option) => option.setName("limit").setDescription("상위 후보 개수").setMinValue(1).setMaxValue(10))
    .addBooleanOption((option) => option.setName("urgent").setDescription("우선도 80 이상 긴급 후보만 보기"))
    .addBooleanOption((option) => option.setName("next").setDescription("현재 추천 품질 필터 후보로 TODO 만들기"))
    .addIntegerOption((option) => option.setName("min_priority").setDescription("이 우선도 이상만 TODO로 묶기").setMinValue(0).setMaxValue(100)),
  new SlashCommandBuilder()
    .setName("qualityok")
    .setDescription("자동 품질 점검이 모두 OK인 내 플랜을 봅니다.")
    .addIntegerOption((option) => option.setName("limit").setDescription("표시 개수").setMinValue(1).setMaxValue(20)),
  new SlashCommandBuilder()
    .setName("qualityunaudited")
    .setDescription("자동 품질 점검이 아직 없는 내 플랜을 봅니다.")
    .addIntegerOption((option) => option.setName("limit").setDescription("표시 개수").setMinValue(1).setMaxValue(20)),
  new SlashCommandBuilder()
    .setName("qualitystatus")
    .setDescription("내 플랜의 품질 확인/악화/개선 개수를 봅니다."),
  new SlashCommandBuilder()
    .setName("qualitygate")
    .setDescription("내 플랜 품질 게이트 통과 여부를 봅니다.")
    .addIntegerOption((option) => option.setName("max_actions").setDescription("허용할 품질 후보 개수").setMinValue(0).setMaxValue(100))
    .addBooleanOption((option) => option.setName("urgent").setDescription("우선도 80 이상 긴급 후보만 점검"))
    .addBooleanOption((option) => option.setName("next").setDescription("현재 추천 품질 필터 후보만 점검"))
    .addIntegerOption((option) => option.setName("min_priority").setDescription("이 우선도 이상만 점검").setMinValue(0).setMaxValue(100)),
  new SlashCommandBuilder()
    .setName("qualitygates")
    .setDescription("내 플랜 품질 게이트 매트릭스와 추천 액션, CI 명령을 봅니다."),
  new SlashCommandBuilder()
    .setName("qualitycommands")
    .setDescription("내 플랜 품질 게이트 CI 명령만 봅니다."),
  new SlashCommandBuilder()
    .setName("qualityworse")
    .setDescription("직전 버전보다 품질 확인 항목이 늘어난 내 플랜을 봅니다.")
    .addIntegerOption((option) => option.setName("limit").setDescription("표시 개수").setMinValue(1).setMaxValue(20)),
  new SlashCommandBuilder()
    .setName("qualitybetter")
    .setDescription("직전 버전보다 품질 확인 항목이 줄어든 내 플랜을 봅니다.")
    .addIntegerOption((option) => option.setName("limit").setDescription("표시 개수").setMinValue(1).setMaxValue(20)),
  new SlashCommandBuilder()
    .setName("backup")
    .setDescription("내 Discord 여행 플랜을 JSON 파일로 백업합니다."),
  new SlashCommandBuilder()
    .setName("search")
    .setDescription("내 여행 플랜을 검색합니다.")
    .addStringOption((option) => option.setName("query").setDescription("목적지, 동행, 메모 키워드").setRequired(true))
    .addIntegerOption((option) => option.setName("limit").setDescription("표시 개수").setMinValue(1).setMaxValue(20)),
  new SlashCommandBuilder()
    .setName("checklist")
    .setDescription("내 플랜의 여행 준비 체크리스트를 봅니다.")
    .addIntegerOption((option) => option.setName("plan_id").setDescription("플랜 ID")),
  new SlashCommandBuilder()
    .setName("emergency")
    .setDescription("내 플랜의 여행 비상 카드를 봅니다.")
    .addIntegerOption((option) => option.setName("plan_id").setDescription("플랜 ID")),
  new SlashCommandBuilder()
    .setName("packing")
    .setDescription("내 플랜의 짐싸기 목록을 봅니다.")
    .addIntegerOption((option) => option.setName("plan_id").setDescription("플랜 ID")),
  new SlashCommandBuilder()
    .setName("departure")
    .setDescription("내 플랜의 출발 전 브리핑을 봅니다.")
    .addIntegerOption((option) => option.setName("plan_id").setDescription("플랜 ID")),
  new SlashCommandBuilder()
    .setName("budget")
    .setDescription("내 플랜의 예산 브리핑을 봅니다.")
    .addIntegerOption((option) => option.setName("plan_id").setDescription("플랜 ID")),
  new SlashCommandBuilder()
    .setName("categorybudget")
    .setDescription("내 플랜의 카테고리별 예산 소진/초과를 봅니다.")
    .addIntegerOption((option) => option.setName("plan_id").setDescription("플랜 ID")),
  new SlashCommandBuilder()
    .setName("dailybudget")
    .setDescription("내 플랜의 오늘 또는 선택 날짜 하루 예산을 봅니다.")
    .addStringOption((option) => option.setName("date").setDescription("날짜 YYYY-MM-DD. 비우면 오늘"))
    .addIntegerOption((option) => option.setName("plan_id").setDescription("플랜 ID")),
  new SlashCommandBuilder()
    .setName("spending")
    .setDescription("내 플랜의 예산 소진 현황을 봅니다.")
    .addIntegerOption((option) => option.setName("plan_id").setDescription("플랜 ID")),
  new SlashCommandBuilder()
    .setName("money")
    .setDescription("내 플랜의 돈 관리 현황을 빠르게 봅니다.")
    .addIntegerOption((option) => option.setName("plan_id").setDescription("플랜 ID")),
  new SlashCommandBuilder()
    .setName("recap")
    .setDescription("내 플랜의 여행 회고/정산 요약을 봅니다.")
    .addIntegerOption((option) => option.setName("plan_id").setDescription("플랜 ID")),
  new SlashCommandBuilder()
    .setName("recap_export")
    .setDescription("내 플랜의 여행 회고를 Markdown 파일로 받습니다.")
    .addIntegerOption((option) => option.setName("plan_id").setDescription("플랜 ID")),
  new SlashCommandBuilder()
    .setName("settle")
    .setDescription("총 지출액을 인원 수로 나눠 간단 정산합니다.")
    .addIntegerOption((option) => option.setName("amount").setDescription("총 지출액").setRequired(true).setMinValue(1))
    .addStringOption((option) => option.setName("paid_by").setDescription("결제자 이름"))
    .addIntegerOption((option) => option.setName("plan_id").setDescription("플랜 ID")),
  new SlashCommandBuilder()
    .setName("settlematrix")
    .setDescription("저장된 지출 기준 결제자별 받을/낼 금액을 봅니다.")
    .addIntegerOption((option) => option.setName("plan_id").setDescription("플랜 ID")),
  new SlashCommandBuilder()
    .setName("settletransfers")
    .setDescription("저장된 지출 기준 누가 누구에게 얼마 보낼지 봅니다.")
    .addIntegerOption((option) => option.setName("plan_id").setDescription("플랜 ID")),
  new SlashCommandBuilder()
    .setName("settlemessage")
    .setDescription("저장된 지출 기준 동행에게 보낼 정산 요청문을 만듭니다.")
    .addIntegerOption((option) => option.setName("plan_id").setDescription("플랜 ID")),
  new SlashCommandBuilder()
    .setName("expense")
    .setDescription("내 플랜에 지출 항목을 저장합니다.")
    .addIntegerOption((option) => option.setName("amount").setDescription("지출 금액").setRequired(true).setMinValue(1))
    .addStringOption((option) => option.setName("label").setDescription("항목명").setRequired(true))
    .addStringOption((option) => option.setName("category").setDescription("카테고리. 예: 교통, 식비, 숙소"))
    .addStringOption((option) => option.setName("date").setDescription("지출 날짜 YYYY-MM-DD"))
    .addStringOption((option) => option.setName("paid_by").setDescription("결제자 이름"))
    .addIntegerOption((option) => option.setName("plan_id").setDescription("플랜 ID")),
  new SlashCommandBuilder()
    .setName("spend")
    .setDescription("여행 중 지출을 빠르게 저장합니다. /expense와 같습니다.")
    .addIntegerOption((option) => option.setName("amount").setDescription("지출 금액").setRequired(true).setMinValue(1))
    .addStringOption((option) => option.setName("label").setDescription("항목명").setRequired(true))
    .addStringOption((option) => option.setName("category").setDescription("카테고리. 예: 교통, 식비, 숙소"))
    .addStringOption((option) => option.setName("date").setDescription("지출 날짜 YYYY-MM-DD"))
    .addStringOption((option) => option.setName("paid_by").setDescription("결제자 이름"))
    .addIntegerOption((option) => option.setName("plan_id").setDescription("플랜 ID")),
  new SlashCommandBuilder()
    .setName("spendquick")
    .setDescription("한 줄 텍스트로 여행 중 지출을 빠르게 저장합니다.")
    .addStringOption((option) => option.setName("text").setDescription("예: 커피 4500 나, 2026-07-02 택시 18000 민수").setRequired(true))
    .addIntegerOption((option) => option.setName("plan_id").setDescription("플랜 ID")),
  new SlashCommandBuilder()
    .setName("expenses")
    .setDescription("내 플랜의 누적 지출 기록을 봅니다.")
    .addStringOption((option) => option.setName("category").setDescription("카테고리 필터. 예: 식비"))
    .addStringOption((option) => option.setName("date").setDescription("날짜 필터 YYYY-MM-DD"))
    .addStringOption((option) => option.setName("paid_by").setDescription("결제자 필터"))
    .addIntegerOption((option) => option.setName("plan_id").setDescription("플랜 ID")),
  new SlashCommandBuilder()
    .setName("expenses_export")
    .setDescription("내 플랜의 지출 기록을 CSV 파일로 받습니다.")
    .addStringOption((option) => option.setName("category").setDescription("카테고리 필터. 예: 식비"))
    .addStringOption((option) => option.setName("date").setDescription("날짜 필터 YYYY-MM-DD"))
    .addStringOption((option) => option.setName("paid_by").setDescription("결제자 필터"))
    .addIntegerOption((option) => option.setName("plan_id").setDescription("플랜 ID")),
  new SlashCommandBuilder()
    .setName("expense_delete")
    .setDescription("내 플랜의 지출 항목을 삭제합니다.")
    .addIntegerOption((option) => option.setName("expense_id").setDescription("지출 ID").setRequired(true).setMinValue(1))
    .addIntegerOption((option) => option.setName("plan_id").setDescription("플랜 ID")),
  new SlashCommandBuilder()
    .setName("expenseundo")
    .setDescription("내 플랜의 마지막 지출 항목을 삭제합니다.")
    .addIntegerOption((option) => option.setName("plan_id").setDescription("플랜 ID, 비우면 내 최근 플랜")),
  new SlashCommandBuilder()
    .setName("expense_edit")
    .setDescription("내 플랜의 지출 항목을 수정합니다.")
    .addIntegerOption((option) => option.setName("expense_id").setDescription("지출 ID").setRequired(true).setMinValue(1))
    .addIntegerOption((option) => option.setName("amount").setDescription("새 금액").setMinValue(1))
    .addStringOption((option) => option.setName("label").setDescription("새 항목명"))
    .addStringOption((option) => option.setName("category").setDescription("새 카테고리. '-' 입력 시 삭제"))
    .addStringOption((option) => option.setName("date").setDescription("새 날짜 YYYY-MM-DD. '-' 입력 시 삭제"))
    .addStringOption((option) => option.setName("paid_by").setDescription("새 결제자. '-' 입력 시 삭제"))
    .addIntegerOption((option) => option.setName("plan_id").setDescription("플랜 ID")),
  new SlashCommandBuilder()
    .setName("maps")
    .setDescription("내 플랜 목적지를 지도에서 엽니다.")
    .addIntegerOption((option) => option.setName("plan_id").setDescription("플랜 ID")),
  new SlashCommandBuilder()
    .setName("web")
    .setDescription("내 플랜의 웹/PWA 상세 링크를 봅니다.")
    .addIntegerOption((option) => option.setName("plan_id").setDescription("플랜 ID")),
  new SlashCommandBuilder()
    .setName("calendar")
    .setDescription("내 플랜을 iOS/Google Calendar용 .ics 파일로 받습니다.")
    .addIntegerOption((option) => option.setName("plan_id").setDescription("플랜 ID")),
  new SlashCommandBuilder()
    .setName("offline")
    .setDescription("내 플랜을 iPhone 오프라인 저장용 Markdown 파일로 받습니다.")
    .addIntegerOption((option) => option.setName("plan_id").setDescription("플랜 ID")),
  new SlashCommandBuilder()
    .setName("export")
    .setDescription("내 플랜을 Markdown 파일로 받습니다.")
    .addIntegerOption((option) => option.setName("plan_id").setDescription("플랜 ID")),
  new SlashCommandBuilder()
    .setName("share")
    .setDescription("내 플랜의 공유용 요약을 봅니다.")
    .addIntegerOption((option) => option.setName("plan_id").setDescription("플랜 ID")),
  new SlashCommandBuilder()
    .setName("duplicate")
    .setDescription("내 최근 플랜 또는 특정 플랜을 복제합니다.")
    .addIntegerOption((option) => option.setName("plan_id").setDescription("플랜 ID")),
  new SlashCommandBuilder()
    .setName("day")
    .setDescription("내 플랜의 특정 일차 일정만 봅니다.")
    .addIntegerOption((option) => option.setName("day").setDescription("몇 일차").setRequired(true).setMinValue(1))
    .addIntegerOption((option) => option.setName("plan_id").setDescription("플랜 ID")),
  new SlashCommandBuilder()
    .setName("date")
    .setDescription("내 플랜의 특정 날짜 일정을 봅니다.")
    .addStringOption((option) => option.setName("date").setDescription("날짜 YYYY-MM-DD").setRequired(true))
    .addIntegerOption((option) => option.setName("plan_id").setDescription("플랜 ID")),
  new SlashCommandBuilder()
    .setName("today")
    .setDescription("내 플랜의 오늘 일정을 봅니다.")
    .addIntegerOption((option) => option.setName("plan_id").setDescription("플랜 ID")),
  new SlashCommandBuilder()
    .setName("brief")
    .setDescription("내 플랜의 하루 일정/예산 브리핑을 봅니다.")
    .addStringOption((option) => option.setName("date").setDescription("날짜 YYYY-MM-DD. 비우면 오늘"))
    .addIntegerOption((option) => option.setName("plan_id").setDescription("플랜 ID")),
  new SlashCommandBuilder()
    .setName("todaycheck")
    .setDescription("내 플랜의 오늘 출발/일정/지출 점검표를 봅니다.")
    .addStringOption((option) => option.setName("date").setDescription("날짜 YYYY-MM-DD. 비우면 오늘"))
    .addIntegerOption((option) => option.setName("plan_id").setDescription("플랜 ID")),
  new SlashCommandBuilder()
    .setName("tomorrow")
    .setDescription("내 플랜의 내일 일정/예산 브리핑을 봅니다.")
    .addIntegerOption((option) => option.setName("plan_id").setDescription("플랜 ID")),
  new SlashCommandBuilder()
    .setName("dayshare")
    .setDescription("내 플랜의 오늘 또는 선택 날짜 공유 요약을 봅니다.")
    .addStringOption((option) => option.setName("date").setDescription("날짜 YYYY-MM-DD. 비우면 오늘"))
    .addIntegerOption((option) => option.setName("plan_id").setDescription("플랜 ID")),
  new SlashCommandBuilder()
    .setName("nightcheck")
    .setDescription("내 플랜의 밤 지출/내일 준비 점검표를 봅니다.")
    .addStringOption((option) => option.setName("date").setDescription("날짜 YYYY-MM-DD. 비우면 오늘"))
    .addIntegerOption((option) => option.setName("plan_id").setDescription("플랜 ID")),
  new SlashCommandBuilder()
    .setName("history")
    .setDescription("플랜 버전 히스토리를 봅니다.")
    .addIntegerOption((option) => option.setName("plan_id").setDescription("플랜 ID")),
  new SlashCommandBuilder()
    .setName("ask")
    .setDescription("내 플랜에 대해 질문합니다.")
    .addStringOption((option) => option.setName("question").setDescription("질문").setRequired(true))
    .addIntegerOption((option) => option.setName("plan_id").setDescription("플랜 ID")),
  new SlashCommandBuilder()
    .setName("show")
    .setDescription("저장된 여행 플랜을 다시 봅니다.")
    .addIntegerOption((option) => option.setName("plan_id").setDescription("플랜 ID").setRequired(true)),
].map((command) => command.toJSON());

async function registerCommands(client) {
  const applicationId = process.env.DISCORD_CLIENT_ID || client.user.id;
  const guildId = process.env.DISCORD_GUILD_ID;
  const rest = new REST({ version: "10" }).setToken(requiredEnv("DISCORD_BOT_TOKEN"));
  const route = guildId
    ? Routes.applicationGuildCommands(applicationId, guildId)
    : Routes.applicationCommands(applicationId);
  await rest.put(route, { body: commands });
  console.log(`Registered ${commands.length} Discord commands${guildId ? ` for guild ${guildId}` : " globally"}.`);
}

function logGuildHints(client) {
  const guilds = [...client.guilds.cache.values()];
  if (guilds.length === 0) {
    console.log("No guilds found yet. Invite the bot to a Discord server, then restart it.");
    return;
  }

  console.log("Available guild IDs:");
  guilds.forEach((guild) => {
    console.log(`- ${guild.name}: ${guild.id}`);
  });

  if (!process.env.DISCORD_GUILD_ID) {
    console.log("Set DISCORD_GUILD_ID to one of these IDs for fast slash command updates.");
  }
}

async function handlePlan(interaction) {
  await interaction.deferReply();
  const input = withDiscordContext(buildPlanInput(interaction), interaction);
  const generation = await generateInitialPlan(input);
  const plan = await createPlan(input, generation, DB_PATH);
  if (generation.error) {
    plan.latestError = generation.error;
  }
  await interaction.editReply({
    ...planReply(plan),
  });
}

async function handleQuick(interaction) {
  await interaction.deferReply();
  const request = interaction.options.getString("request", true);
  const input = withDiscordContext(parseQuickRequest(request), interaction);
  const generation = await generateInitialPlan(input);
  const plan = await createPlan(input, generation, DB_PATH);
  if (generation.error) {
    plan.latestError = generation.error;
  }
  await interaction.editReply({
    ...planReply(plan),
  });
}

async function loadOwnedGroundedPlan(interaction, planId) {
  const plan = await getPlan(planId, DB_PATH);
  if (!plan || !plan.discordUserId || plan.discordUserId !== interaction.user.id) {
    await interaction.editReply(`내 grounded 플랜 #${planId}을 찾지 못했습니다.`);
    return null;
  }
  if (!latestRevision(plan)?.groundedPlan) {
    await interaction.editReply(`플랜 #${planId}은 structured grounded 플랜이 아닙니다.`);
    return null;
  }
  return plan;
}

async function persistGroundedResult(plan, result, feedback) {
  return refinePlan(plan.id, {
    model: "grounded-planner-v1",
    prompt: null,
    plan: renderGroundedTripPlan(result, plan),
    status: result.status,
    groundedPlan: result.plan,
    evidence: result.evidence,
    planningConstraints: result.planningConstraints,
  }, feedback, DB_PATH, { expectedVersion: plan.latestVersion });
}

export const DISCORD_MESSAGE_LIMIT = 2000;

const DIAGNOSIS_LINES_PER_SECTION = 8;

// A section always reports its full count, so the cap trims what is shown and never what is known.
function diagnosisSection(title, entries, render) {
  if (entries.length === 0) return [];
  const shown = entries.slice(0, DIAGNOSIS_LINES_PER_SECTION).map(render);
  const dropped = entries.length - shown.length;
  return [title, ...shown, ...(dropped > 0 ? [`- 외 ${dropped}건`] : [])];
}

function evidenceIssueLine(issue) {
  const subject = [issue.subject, issue.direction, issue.placeId].filter(Boolean).join(" ");
  const detail = issue.message
    || [subject, issue.status, issue.expiresAt].filter(Boolean).join(" · ")
    || subject;
  return `- [${issue.code}] ${detail}${issue.refreshAfter ? ` · 재조회 가능: ${issue.refreshAfter}` : ""}`;
}

// The stored plan is settled only when the hard constraints, the evidence and the saved readiness
// all say so, so a clean conflict check is never reported on its own: "충돌 없음" beside stale or
// unverified evidence reads as a plan that is done when it is still waiting on a provider.
export function formatStoredPlanDiagnosis(planId, diagnosis) {
  const lines = [
    `플랜 #${planId} 점검`,
    diagnosis.hardConstraintsOk ? "하드 제약: 충돌 없음" : `하드 제약: ${diagnosis.hardIssues.length}건`,
    ...diagnosisSection("", diagnosis.hardConstraintsOk ? [] : diagnosis.hardIssues, (issue) =>
      `- [${issue.code}] ${issue.date || "날짜 미상"} ${issue.activityId || ""}`.trim()
    ).filter(Boolean),
    diagnosis.ready ? "근거·준비: 준비 완료" : `근거·준비: 확인 필요: ${diagnosis.evidenceIssues.length}건`,
    ...diagnosisSection("", diagnosis.evidenceIssues, evidenceIssueLine).filter(Boolean),
    ...diagnosisSection("만료된 근거", diagnosis.staleSources, (stale) =>
      `- ${stale.subject} · ${stale.source} · ${stale.expiresAt}`
    ),
  ];
  const text = lines.join("\n");
  return text.length <= DISCORD_MESSAGE_LIMIT ? text : `${text.slice(0, DISCORD_MESSAGE_LIMIT - 1)}…`;
}

async function handleGroundedCheck(interaction) {
  await interaction.deferReply({ ephemeral: true });
  const planId = interaction.options.getInteger("plan_id", true);
  const plan = await loadOwnedGroundedPlan(interaction, planId);
  if (!plan) return;
  const diagnosis = diagnoseStoredGroundedPlan(plan);
  await interaction.editReply(formatStoredPlanDiagnosis(planId, diagnosis));
}

async function handleGroundedReplace(interaction) {
  await interaction.deferReply();
  const planId = interaction.options.getInteger("plan_id", true);
  const plan = await loadOwnedGroundedPlan(interaction, planId);
  if (!plan) return;
  const oldPlaceId = interaction.options.getString("old_place_id", true);
  const replacementPlaceId = interaction.options.getString("replacement_place_id", true);
  const result = await replaceStoredGroundedPlace(plan, oldPlaceId, replacementPlaceId);
  const updated = await persistGroundedResult(plan, result, `replace ${oldPlaceId} with ${replacementPlaceId}`);
  await interaction.editReply(planReply(updated, { notice: "근거가 검증된 후보로 교체하고 재계획했습니다." }));
}

async function handleGroundedMove(interaction) {
  await interaction.deferReply();
  const planId = interaction.options.getInteger("plan_id", true);
  const plan = await loadOwnedGroundedPlan(interaction, planId);
  if (!plan) return;
  const placeId = interaction.options.getString("place_id", true);
  const targetDate = interaction.options.getString("target_date", true);
  const result = await moveStoredGroundedPlace(plan, placeId, targetDate);
  const updated = await persistGroundedResult(plan, result, `move ${placeId} to ${targetDate}`);
  await interaction.editReply(planReply(updated, { notice: `${placeId}을 ${targetDate}의 검증된 영업시간 안으로 이동했습니다.` }));
}

async function handleGroundedReplan(interaction) {
  await interaction.deferReply();
  const planId = interaction.options.getInteger("plan_id", true);
  const plan = await loadOwnedGroundedPlan(interaction, planId);
  if (!plan) return;
  const result = await replanStoredGroundedPlan(plan);
  const updated = await persistGroundedResult(plan, result, "replan from stored grounded evidence");
  await interaction.editReply(planReply(updated, { notice: "저장된 근거로 전체 일정을 다시 최적화했습니다." }));
}

async function handleGroundedRefresh(interaction) {
  await interaction.deferReply();
  const planId = interaction.options.getInteger("plan_id", true);
  const plan = await loadOwnedGroundedPlan(interaction, planId);
  if (!plan) return;
  const generation = await createGoogleGroundedPlanGenerator().generate(plan);
  // Rejects when a stored constraint cannot be reapplied to the refreshed evidence, so a revision
  // that dropped what the traveller asked for never reaches persistence.
  const result = await refreshStoredGroundedPlan(plan, generation);
  const updated = await persistGroundedResult(plan, result, "refresh grounded provider evidence");
  await interaction.editReply(planReply(updated, { notice: "장소·날씨·이동시간 근거를 다시 수집해 재계획했습니다." }));
}

async function rejectUngroundedRefinement(interaction, revision) {
  if (!revision?.groundedPlan) return false;
  await interaction.editReply(
    "근거 기반 플랜은 기존 근거를 잃는 자유형 고도화를 지원하지 않습니다. 변경 조건을 반영해 /plan 또는 /quick으로 다시 생성해주세요."
  );
  return true;
}

async function handleRefine(interaction) {
  await interaction.deferReply();
  const planId = interaction.options.getInteger("plan_id", true);
  const feedback = interaction.options.getString("feedback", true);
  const plan = await getPlan(planId, DB_PATH);
  if (!plan) {
    await interaction.editReply(`플랜 #${planId}을 찾지 못했습니다.`);
    return;
  }
  const latest = latestRevision(plan);
  if (await rejectUngroundedRefinement(interaction, latest)) return;
  const generation = await generatePlan(plan, latest?.planText, feedback);
  const updatedPlan = await refinePlan(plan.id, generation, feedback, DB_PATH);
  if (generation.error) {
    updatedPlan.latestError = generation.error;
  }
  await interaction.editReply({
    ...planReply(updatedPlan, { notice: refineQualityNotice(updatedPlan) }),
  });
}

async function handleAgain(interaction) {
  await interaction.deferReply();
  const feedback = interaction.options.getString("feedback", true);
  const plan = await findLatestPlanByDiscordUser(interaction.user.id, DB_PATH);
  if (!plan) {
    await interaction.editReply("최근 플랜을 찾지 못했습니다. 먼저 /quick 또는 /plan으로 플랜을 만들어주세요.");
    return;
  }
  const latest = latestRevision(plan);
  if (await rejectUngroundedRefinement(interaction, latest)) return;
  const generation = await generatePlan(plan, latest?.planText, feedback);
  const updatedPlan = await refinePlan(plan.id, generation, feedback, DB_PATH);
  if (generation.error) {
    updatedPlan.latestError = generation.error;
  }
  await interaction.editReply({
    ...planReply(updatedPlan, { notice: refineQualityNotice(updatedPlan) }),
  });
}

async function handleReschedule(interaction) {
  await interaction.deferReply({ ephemeral: true });
  const planId = interaction.options.getInteger("plan_id", true);
  const startDate = interaction.options.getString("start_date", true);
  const nights = interaction.options.getInteger("nights") || null;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(startDate)) {
    await interaction.editReply("출발일은 YYYY-MM-DD 형식으로 입력해주세요.");
    return;
  }
  const plan = await getPlan(planId, DB_PATH);
  if (!plan) {
    await interaction.editReply(`플랜 #${planId}을 찾지 못했습니다.`);
    return;
  }
  if (plan.discordUserId && plan.discordUserId !== interaction.user.id) {
    await interaction.editReply("이 플랜은 다른 사용자가 만든 플랜이라 일정을 변경할 수 없습니다.");
    return;
  }
  const updatedPlan = await updatePlanSchedule(plan.id, { startDate, nights: nights || plan.nights }, DB_PATH);
  await interaction.editReply(
    `플랜 #${updatedPlan.id} 일정을 변경했습니다.\n${updatedPlan.startDate} ~ ${updatedPlan.endDate} / ${updatedPlan.nights}박`
  );
}

async function handlePartyBudget(interaction) {
  await interaction.deferReply({ ephemeral: true });
  const planId = interaction.options.getInteger("plan_id", true);
  const travelers = interaction.options.getInteger("travelers", true);
  const budgetPerPerson = interaction.options.getInteger("budget_per_person");
  const plan = await getPlan(planId, DB_PATH);
  if (!plan) {
    await interaction.editReply(`플랜 #${planId}을 찾지 못했습니다.`);
    return;
  }
  if (plan.discordUserId && plan.discordUserId !== interaction.user.id) {
    await interaction.editReply("이 플랜은 다른 사용자가 만든 플랜이라 인원/예산을 변경할 수 없습니다.");
    return;
  }
  const updatedPlan = await updatePlanPartyBudget(
    plan.id,
    { travelers, budgetPerPerson: budgetPerPerson ?? plan.budgetPerPerson },
    DB_PATH
  );
  const budget = updatedPlan.budgetPerPerson ? `${Number(updatedPlan.budgetPerPerson).toLocaleString("ko-KR")}원` : "미정";
  await interaction.editReply(`플랜 #${updatedPlan.id} 인원/예산을 변경했습니다.\n인원 ${updatedPlan.travelers}명 / 1인 예산 ${budget}`);
}

async function handleNote(interaction) {
  await interaction.deferReply({ ephemeral: true });
  const planId = interaction.options.getInteger("plan_id", true);
  const text = interaction.options.getString("text", true);
  const plan = await getPlan(planId, DB_PATH);
  if (!plan) {
    await interaction.editReply(`플랜 #${planId}을 찾지 못했습니다.`);
    return;
  }
  if (plan.discordUserId && plan.discordUserId !== interaction.user.id) {
    await interaction.editReply("이 플랜은 다른 사용자가 만든 플랜이라 메모를 저장할 수 없습니다.");
    return;
  }
  const personalNote = text.trim() === "-" ? "" : text;
  const updatedPlan = await updatePlanPersonalNote(plan.id, personalNote, DB_PATH);
  const status = updatedPlan.personalNote ? "저장했습니다." : "삭제했습니다.";
  await interaction.editReply(`플랜 #${updatedPlan.id} 개인 메모를 ${status}`);
}

function memoTimestamp(date = new Date()) {
  const pad = (value) => String(value).padStart(2, "0");
  return `${pad(date.getMonth() + 1)}/${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

function memoEntry(text) {
  return `- [${memoTimestamp()}] ${text}`;
}

function memoPreview(note) {
  return String(note || "")
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean)
    .slice(-2)
    .join("\n");
}

function memoSearchPreview(note, query) {
  const needle = String(query || "").trim().toLowerCase();
  const lines = String(note || "")
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean);
  const matchedLines = lines.filter((line) => line.toLowerCase().includes(needle));
  return (matchedLines.length ? matchedLines : lines).slice(-3).join("\n");
}

function buildMemoShareText(plan) {
  const webUrl = planWebUrl(plan);
  const webLine = webUrl ? `\n상세: ${webUrl}` : "";
  return [
    `여행 메모 공유 - #${plan.id} ${plan.destination || "여행"}`,
    `${plan.departure || "서울"} -> ${plan.destination || "미정"} / ${plan.nights}박 / ${plan.startDate || "날짜 미정"}${webLine}`,
    "",
    plan.personalNote || "공유할 메모가 없습니다.",
  ].join("\n");
}

async function handleMemo(interaction) {
  await interaction.deferReply({ ephemeral: true });
  const planId = interaction.options.getInteger("plan_id");
  const text = interaction.options.getString("text", true);
  const plan = planId
    ? await getPlan(planId, DB_PATH)
    : await findLatestPlanByDiscordUser(interaction.user.id, DB_PATH);
  if (!plan) {
    await interaction.editReply(planId ? `플랜 #${planId}을 찾지 못했습니다.` : "내 최근 플랜이 없습니다. 먼저 `/quick` 또는 `/plan`으로 플랜을 만들어주세요.");
    return;
  }
  if (plan.discordUserId && plan.discordUserId !== interaction.user.id) {
    await interaction.editReply("이 플랜은 다른 사용자가 만든 플랜이라 메모를 추가할 수 없습니다.");
    return;
  }
  const trimmedText = text.trim();
  if (!trimmedText) {
    await interaction.editReply("저장할 메모 내용을 입력해주세요.");
    return;
  }
  const nextEntry = trimmedText === "-" ? "" : memoEntry(trimmedText);
  const personalNote = trimmedText === "-"
    ? ""
    : [plan.personalNote, nextEntry].filter(Boolean).join("\n");
  const updatedPlan = await updatePlanPersonalNote(plan.id, personalNote, DB_PATH);
  if (!updatedPlan.personalNote) {
    await interaction.editReply(`플랜 #${updatedPlan.id} 개인 메모를 삭제했습니다.`);
    return;
  }
  await interaction.editReply(truncateText(`플랜 #${updatedPlan.id} 개인 메모를 추가했습니다.\n${nextEntry}\n\n\`/memos\`로 메모가 있는 플랜을 모아볼 수 있습니다.`));
}

async function handleMemos(interaction) {
  await interaction.deferReply({ ephemeral: true });
  const limit = interaction.options.getInteger("limit") || 25;
  const plans = await listPlansByDiscordUser(interaction.user.id, limit, DB_PATH);
  const plansWithMemos = plans.filter((plan) => String(plan.personalNote || "").trim());
  if (plansWithMemos.length === 0) {
    await interaction.editReply(`최근 ${limit}개 플랜에 개인 메모가 없습니다. 밖에서 떠오른 내용은 \`/memo text:...\`로 남길 수 있습니다.`);
    return;
  }
  const lines = plansWithMemos.map((plan) => `${planListLine(plan)}\n${memoPreview(plan.personalNote)}`);
  await interaction.editReply({
    content: truncateText(`개인 메모가 있는 내 플랜\n\n${lines.join("\n\n")}`),
    components: mineComponents(plansWithMemos.slice(0, 25), interaction.user.id),
  });
}

async function handleMemoSearch(interaction) {
  await interaction.deferReply({ ephemeral: true });
  const query = interaction.options.getString("query", true).trim();
  const limit = interaction.options.getInteger("limit") || 50;
  if (!query) {
    await interaction.editReply("검색할 메모 키워드를 입력해주세요.");
    return;
  }
  const needle = query.toLowerCase();
  const plans = await listPlansByDiscordUser(interaction.user.id, limit, DB_PATH);
  const matchedPlans = plans.filter((plan) => {
    const note = String(plan.personalNote || "").trim();
    if (!note) return false;
    return note.toLowerCase().includes(needle) || String(plan.destination || "").toLowerCase().includes(needle);
  });
  if (matchedPlans.length === 0) {
    await interaction.editReply(`최근 ${limit}개 플랜의 개인 메모에서 "${query}"을 찾지 못했습니다.`);
    return;
  }
  const lines = matchedPlans.map((plan) => `${planListLine(plan)}\n${memoSearchPreview(plan.personalNote, query)}`);
  await interaction.editReply({
    content: truncateText(`개인 메모 검색 결과: "${query}"\n\n${lines.join("\n\n")}`),
    components: mineComponents(matchedPlans.slice(0, 25), interaction.user.id),
  });
}

async function handleMemoShare(interaction) {
  await interaction.deferReply({ ephemeral: true });
  const planId = interaction.options.getInteger("plan_id");
  const plan = planId
    ? await getPlan(planId, DB_PATH)
    : await findLatestPlanByDiscordUser(interaction.user.id, DB_PATH);
  if (!plan) {
    await interaction.editReply(planId ? `플랜 #${planId}을 찾지 못했습니다.` : "내 최근 플랜이 없습니다. 먼저 `/quick` 또는 `/plan`으로 플랜을 만들어주세요.");
    return;
  }
  if (plan.discordUserId && plan.discordUserId !== interaction.user.id) {
    await interaction.editReply("이 플랜은 다른 사용자가 만든 플랜이라 메모 공유문을 만들 수 없습니다.");
    return;
  }
  if (!String(plan.personalNote || "").trim()) {
    await interaction.editReply(`플랜 #${plan.id}에 공유할 개인 메모가 없습니다. 먼저 \`/memo plan_id:${plan.id} text:...\`로 남겨주세요.`);
    return;
  }
  await interaction.editReply(truncateText(`${buildMemoShareText(plan)}\n\n위 내용을 복사해서 동행에게 보내세요.`));
}

async function handlePlans(interaction) {
  await interaction.deferReply({ ephemeral: true });
  const limit = interaction.options.getInteger("limit") || 10;
  const plans = await listPlans(limit, DB_PATH);
  if (plans.length === 0) {
    await interaction.editReply("저장된 플랜이 없습니다.");
    return;
  }
  const lines = plans.map(
    (plan) => planListLine(plan)
  );
  await interaction.editReply(truncateText(lines.join("\n")));
}

async function handleDashboard(interaction) {
  await interaction.deferReply({ ephemeral: true });
  const [latestPlan, activePlans, upcomingPlans, pinnedPlans, recentPlans] = await Promise.all([
    findLatestPlanByDiscordUser(interaction.user.id, DB_PATH),
    listPlansByDiscordUser(interaction.user.id, 5, DB_PATH, "active"),
    listPlansByDiscordUser(interaction.user.id, 5, DB_PATH, "upcoming"),
    listPinnedPlansByDiscordUser(interaction.user.id, 5, DB_PATH),
    listPlansByDiscordUser(interaction.user.id, 10, DB_PATH),
  ]);
  const menuPlans = uniquePlans([latestPlan], pinnedPlans, activePlans, upcomingPlans, recentPlans).slice(0, 25);
  if (menuPlans.length === 0) {
    await interaction.editReply("아직 내 여행 플랜이 없습니다. `/quick`으로 첫 플랜을 만들면 여기에 모아볼 수 있습니다.");
    return;
  }

  const latestLine = latestPlan ? planListLine(latestPlan) : "없음";
  const content = truncateText(
    [
      `내 여행 대시보드\n최근 플랜: ${latestLine}`,
      dashboardSection("여행 중", activePlans, "현재 진행 중인 여행이 없습니다."),
      dashboardSection("예정 여행", upcomingPlans, "예정된 여행이 없습니다."),
      dashboardSection("고정 플랜", pinnedPlans, "고정한 플랜이 없습니다."),
      "아래 선택 메뉴에서 플랜을 탭하면 바로 열 수 있습니다.",
    ].join("\n\n")
  );

  await interaction.editReply({
    content,
    components: mineComponents(menuPlans, interaction.user.id),
  });
}

function webAccessDiagnosis() {
  if (!PUBLIC_BASE_URL) {
    return "미설정. Discord 명령은 외부 LTE/5G에서도 가능하지만 웹 상세 버튼은 표시하지 않습니다.";
  }

  let url;
  try {
    url = new URL(PUBLIC_BASE_URL);
  } catch {
    return `URL 형식 확인 필요 (${PUBLIC_BASE_URL})`;
  }

  const host = url.hostname;
  if (host === "localhost" || host === "127.0.0.1" || host === "::1") {
    return `${PUBLIC_BASE_URL} - Mac 자기 자신용이라 iPhone에서는 열기 어렵습니다. Mac LAN IP, 터널/VPN URL, 배포 URL을 사용하세요.`;
  }

  if (/^(10|192\.168|172\.(1[6-9]|2\d|3[0-1]))\./.test(host)) {
    return `${PUBLIC_BASE_URL} - 같은 Wi-Fi에서는 열 수 있고, 외부에서는 VPN/터널이 필요합니다.`;
  }

  return `${PUBLIC_BASE_URL} - iPhone에서 접근 가능한 외부 URL이면 집 밖에서도 웹 버튼을 열 수 있습니다.`;
}

function mobileComponents() {
  const mobileActionOptions = [
    { label: "시작: 새 여행", description: "한 줄 요청 모달로 새 플랜을 만듭니다.", value: "quick" },
    { label: "입력: 지출", description: "최근 플랜에 한 줄 지출을 바로 저장합니다.", value: "expense" },
    { label: "지출: 내역", description: "최근 플랜의 누적 지출 내역을 봅니다.", value: "expense-ledger" },
    { label: "질문: 플랜", description: "최근 플랜에 대해 궁금한 점을 묻습니다.", value: "ask" },
    { label: "예산: 전체", description: "총예산과 하루 예산 브리핑을 봅니다.", value: "budget" },
    { label: "예산: 오늘", description: "오늘 하루 예산과 지출 현황을 봅니다.", value: "daily-budget" },
    { label: "예산: 카테고리", description: "카테고리별 예산 소진 위험도를 봅니다.", value: "category-budget" },
    { label: "정산: 요약", description: "누적 지출 정산 요약을 봅니다.", value: "settlement" },
    { label: "정산: 상세표", description: "결제자/참여자별 정산표를 봅니다.", value: "settlement-matrix" },
    { label: "정산: 요청문", description: "동행에게 보낼 누적 지출 정산문을 봅니다.", value: "settlement-message" },
    { label: "정산: 송금 방향", description: "누가 누구에게 얼마 보낼지 봅니다.", value: "settlement-transfers" },
    { label: "준비: 보강 플랜", description: "출발 전 우선순위 보강 액션을 봅니다.", value: "prep-plan" },
    { label: "준비: 출발 브리핑", description: "출발 직전 확인할 이동/예약 정보를 봅니다.", value: "departure" },
    { label: "준비: 체크리스트", description: "최근 플랜의 출발 전 체크리스트를 봅니다.", value: "checklist" },
    { label: "준비: 짐싸기", description: "최근 플랜에 맞춘 짐싸기 목록을 봅니다.", value: "packing" },
    { label: "안전: 비상 카드", description: "분실/긴급 상황용 요약 카드를 봅니다.", value: "emergency" },
    { label: "공유: 오늘", description: "동행에게 보낼 오늘 요약을 봅니다.", value: "day-share" },
    { label: "공유: 준비", description: "동행에게 보낼 준비 상태 요약을 봅니다.", value: "readiness-share" },
    { label: "공유: 메모", description: "최근 플랜의 개인 메모 공유문을 봅니다.", value: "memo-share" },
    { label: "운영: 하루 브리핑", description: "오늘 일정과 예산을 함께 봅니다.", value: "brief" },
    { label: "운영: 내일 브리핑", description: "내일 일정과 오늘 밤 준비를 봅니다.", value: "tomorrow" },
    { label: "운영: 회고", description: "여행 회고와 정산 요약을 봅니다.", value: "recap" },
    { label: "지도: 목적지", description: "최근 플랜 목적지 지도 링크를 봅니다.", value: "maps" },
    { label: "공유: 전체 플랜", description: "동행에게 보낼 플랜 요약을 봅니다.", value: "share" },
  ];
  const mobileFileOptions = [
    { label: "관리: 고도화", description: "최근 플랜을 피드백으로 다시 고도화합니다.", value: "refine" },
    { label: "관리: 일정 변경", description: "최근 플랜의 출발일과 박수를 바꿉니다.", value: "schedule" },
    { label: "관리: 인원/예산", description: "최근 플랜의 인원과 1인 예산을 바꿉니다.", value: "party-budget" },
    { label: "관리: 고정/해제", description: "최근 플랜을 고정하거나 고정을 해제합니다.", value: "toggle-pin" },
    { label: "관리: 복제", description: "최근 플랜을 새 플랜으로 복제합니다.", value: "duplicate" },
    { label: "관리: 히스토리", description: "최근 플랜의 버전 히스토리를 봅니다.", value: "history" },
    { label: "파일: 지출 CSV", description: "최근 플랜 지출 기록 CSV 파일을 받습니다.", value: "expense-csv" },
    { label: "파일: 정산 Markdown", description: "최근 플랜 정산 Markdown 파일을 받습니다.", value: "settlement-markdown" },
    { label: "파일: 출발팩 Markdown", description: "최근 플랜의 출발 준비 묶음 파일을 받습니다.", value: "departure-pack-markdown" },
    { label: "파일: 오늘팩 Markdown", description: "최근 플랜의 오늘 실행 묶음 파일을 받습니다.", value: "today-pack-markdown" },
    { label: "파일: 메모 Markdown", description: "최근 플랜 개인 메모 Markdown 파일을 받습니다.", value: "memo-markdown" },
    { label: "파일: 공유팩 Markdown", description: "동행 공유용 문장 묶음 파일을 받습니다.", value: "share-pack-markdown" },
    { label: "파일: 돈팩 Markdown", description: "예산/지출/정산 묶음 파일을 받습니다.", value: "money-pack-markdown" },
    { label: "파일: 전체팩 Markdown", description: "여행 전체 자료 묶음 파일을 받습니다.", value: "full-pack-markdown" },
    { label: "파일: 오프라인팩 Markdown", description: "웹 없이 볼 핵심 여행 자료 파일을 받습니다.", value: "offline-pack-markdown" },
    { label: "파일: 안전팩 Markdown", description: "비상/지도/메모 묶음 파일을 받습니다.", value: "safety-pack-markdown" },
    { label: "파일: 사용 가이드", description: "상황별로 어떤 파일을 받을지 봅니다.", value: "file-guide" },
    { label: "파일: 회고 Markdown", description: "최근 플랜 회고 Markdown 파일을 받습니다.", value: "recap-markdown" },
    { label: "파일: Markdown", description: "최근 플랜 Markdown 파일을 받습니다.", value: "markdown" },
    { label: "파일: 캘린더", description: "최근 플랜 iOS/Google Calendar 파일을 받습니다.", value: "calendar" },
    { label: "백업: JSON", description: "내 Discord 플랜 전체 JSON 백업을 받습니다.", value: "backup" },
  ];
  if (PUBLIC_BASE_URL) {
    mobileActionOptions.splice(1, 0, {
      label: "웹: 상세",
      description: "최근 플랜의 웹/PWA 상세 링크를 봅니다.",
      value: "web",
    });
  }
  const rows = [
    new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId("mobile-dashboard")
        .setLabel("홈")
        .setStyle(ButtonStyle.Primary),
      new ButtonBuilder()
        .setCustomId("mobile-memo")
        .setLabel("메모")
        .setStyle(ButtonStyle.Secondary),
      new ButtonBuilder()
        .setCustomId("mobile-status")
        .setLabel("상태")
        .setStyle(ButtonStyle.Secondary),
      new ButtonBuilder()
        .setCustomId("mobile-guide")
        .setLabel("가이드")
        .setStyle(ButtonStyle.Secondary),
      new ButtonBuilder()
        .setCustomId("mobile-ops")
        .setLabel("운영")
        .setStyle(ButtonStyle.Secondary)
    ),
    new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId("mobile-now")
        .setLabel("지금")
        .setStyle(ButtonStyle.Primary),
      new ButtonBuilder()
        .setCustomId("mobile-money")
        .setLabel("돈")
        .setStyle(ButtonStyle.Secondary),
      new ButtonBuilder()
        .setCustomId("mobile-next")
        .setLabel("다음")
        .setStyle(ButtonStyle.Secondary),
      new ButtonBuilder()
        .setCustomId("mobile-readiness")
        .setLabel("준비")
        .setStyle(ButtonStyle.Secondary)
    ),
    new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId("mobile-today")
        .setLabel("오늘")
        .setStyle(ButtonStyle.Primary),
      new ButtonBuilder()
        .setCustomId("mobile-check")
        .setLabel("점검")
        .setStyle(ButtonStyle.Secondary),
      new ButtonBuilder()
        .setCustomId("mobile-night")
        .setLabel("밤")
        .setStyle(ButtonStyle.Secondary),
      new ButtonBuilder()
        .setCustomId("mobile-offline")
        .setLabel("오프라인")
        .setStyle(ButtonStyle.Secondary),
      new ButtonBuilder()
        .setCustomId("mobile-iphone")
        .setLabel("외부")
        .setStyle(ButtonStyle.Secondary)
    ),
    new ActionRowBuilder().addComponents(
      new StringSelectMenuBuilder()
        .setCustomId("mobile-action-select")
        .setPlaceholder("모바일 추가 액션을 선택하세요")
        .addOptions(mobileActionOptions)
    ),
    new ActionRowBuilder().addComponents(
      new StringSelectMenuBuilder()
        .setCustomId("mobile-file-select")
        .setPlaceholder("관리/파일/백업 액션을 선택하세요")
        .addOptions(mobileFileOptions)
    ),
  ];
  if (PUBLIC_BASE_URL) {
    rows[1].addComponents(
      new ButtonBuilder()
        .setLabel("웹 홈 열기")
        .setStyle(ButtonStyle.Link)
        .setURL(PUBLIC_BASE_URL)
    );
  }
  return rows;
}

function iphoneComponents() {
  return [
    new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId("iphone-env")
        .setLabel("설정")
        .setStyle(ButtonStyle.Primary),
      new ButtonBuilder()
        .setCustomId("iphone-whoami")
        .setLabel("내 ID")
        .setStyle(ButtonStyle.Secondary),
      new ButtonBuilder()
        .setCustomId("iphone-policy")
        .setLabel("정책")
        .setStyle(ButtonStyle.Secondary),
      new ButtonBuilder()
        .setCustomId("start-iphone")
        .setLabel("체크리스트")
        .setStyle(ButtonStyle.Secondary)
    ),
    new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId("mobile-status")
        .setLabel("상태")
        .setStyle(ButtonStyle.Primary),
      new ButtonBuilder()
        .setCustomId("iphone-doctor")
        .setLabel("진단")
        .setStyle(ButtonStyle.Secondary),
      new ButtonBuilder()
        .setCustomId("mobile-ops")
        .setLabel("운영")
        .setStyle(ButtonStyle.Secondary),
      new ButtonBuilder()
        .setCustomId("mobile-offline")
        .setLabel("오프라인")
        .setStyle(ButtonStyle.Secondary),
      new ButtonBuilder()
        .setCustomId("start-mobile")
        .setLabel("모바일")
        .setStyle(ButtonStyle.Secondary),
      new ButtonBuilder()
        .setCustomId("mobile-dashboard")
        .setLabel("홈")
        .setStyle(ButtonStyle.Secondary)
    ),
  ];
}

function statusComponents() {
  return [
    new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId("mobile-iphone")
        .setLabel("외부")
        .setStyle(ButtonStyle.Primary),
      new ButtonBuilder()
        .setCustomId("iphone-env")
        .setLabel("설정")
        .setStyle(ButtonStyle.Secondary),
      new ButtonBuilder()
        .setCustomId("iphone-policy")
        .setLabel("정책")
        .setStyle(ButtonStyle.Secondary),
      new ButtonBuilder()
        .setCustomId("mobile-ops")
        .setLabel("운영")
        .setStyle(ButtonStyle.Secondary),
      new ButtonBuilder()
        .setCustomId("mobile-dashboard")
        .setLabel("홈")
        .setStyle(ButtonStyle.Secondary)
    ),
  ];
}

function policyComponents() {
  return accessRecoveryComponents();
}

function opsComponents() {
  return [
    new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId("iphone-doctor")
        .setLabel("진단")
        .setStyle(ButtonStyle.Primary),
      new ButtonBuilder()
        .setCustomId("mobile-status")
        .setLabel("상태")
        .setStyle(ButtonStyle.Secondary),
      new ButtonBuilder()
        .setCustomId("mobile-iphone")
        .setLabel("외부")
        .setStyle(ButtonStyle.Secondary),
      new ButtonBuilder()
        .setCustomId("iphone-env")
        .setLabel("설정")
        .setStyle(ButtonStyle.Secondary),
      new ButtonBuilder()
        .setCustomId("mobile-dashboard")
        .setLabel("홈")
        .setStyle(ButtonStyle.Secondary)
    ),
    new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId("iphone-policy")
        .setLabel("정책")
        .setStyle(ButtonStyle.Secondary),
      new ButtonBuilder()
        .setCustomId("ops-denied")
        .setLabel("차단 로그")
        .setStyle(ButtonStyle.Secondary)
    ),
  ];
}

function doctorComponents() {
  return [
    new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId("mobile-status")
        .setLabel("상태")
        .setStyle(ButtonStyle.Primary),
      new ButtonBuilder()
        .setCustomId("mobile-iphone")
        .setLabel("외부")
        .setStyle(ButtonStyle.Secondary),
      new ButtonBuilder()
        .setCustomId("iphone-env")
        .setLabel("설정")
        .setStyle(ButtonStyle.Secondary),
      new ButtonBuilder()
        .setCustomId("mobile-ops")
        .setLabel("운영")
        .setStyle(ButtonStyle.Secondary),
      new ButtonBuilder()
        .setCustomId("mobile-dashboard")
        .setLabel("홈")
        .setStyle(ButtonStyle.Secondary)
    ),
    new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId("ops-denied")
        .setLabel("차단 로그")
        .setStyle(ButtonStyle.Secondary)
    ),
  ];
}

function deniedComponents(reason = "", source = "") {
  const filterSuffix = `${reason || "all"}:${source || "all"}`;
  const moreCustomId = `ops-denied-more:${filterSuffix}`;
  return [
    new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId("mobile-status")
        .setLabel("상태")
        .setStyle(ButtonStyle.Primary),
      new ButtonBuilder()
        .setCustomId("iphone-policy")
        .setLabel("정책")
        .setStyle(ButtonStyle.Secondary),
      new ButtonBuilder()
        .setCustomId("iphone-env")
        .setLabel("설정")
        .setStyle(ButtonStyle.Secondary),
      new ButtonBuilder()
        .setCustomId("ops-denied")
        .setLabel("차단 로그")
        .setStyle(ButtonStyle.Secondary),
      new ButtonBuilder()
        .setCustomId("mobile-ops")
        .setLabel("운영")
        .setStyle(ButtonStyle.Secondary)
    ),
    new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId(source ? `ops-denied:all:${source}` : "ops-denied")
        .setLabel("전체")
        .setStyle(reason ? ButtonStyle.Secondary : ButtonStyle.Primary),
      new ButtonBuilder()
        .setCustomId(`ops-denied:guild_not_allowed:${source || "all"}`)
        .setLabel("서버")
        .setStyle(reason === "guild_not_allowed" ? ButtonStyle.Primary : ButtonStyle.Secondary),
      new ButtonBuilder()
        .setCustomId(`ops-denied:dm_not_allowed:${source || "all"}`)
        .setLabel("DM")
        .setStyle(reason === "dm_not_allowed" ? ButtonStyle.Primary : ButtonStyle.Secondary),
      new ButtonBuilder()
        .setCustomId(`ops-denied:user_not_allowed:${source || "all"}`)
        .setLabel("사용자")
        .setStyle(reason === "user_not_allowed" ? ButtonStyle.Primary : ButtonStyle.Secondary),
      new ButtonBuilder()
        .setCustomId(`ops-denied:ops_not_allowed:${source || "all"}`)
        .setLabel("운영")
        .setStyle(reason === "ops_not_allowed" ? ButtonStyle.Primary : ButtonStyle.Secondary)
    ),
    new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId(reason ? `ops-denied:${reason}:all` : "ops-denied")
        .setLabel("출처 전체")
        .setStyle(source ? ButtonStyle.Secondary : ButtonStyle.Primary),
      new ButtonBuilder()
        .setCustomId(`ops-denied-source:session:${reason || "all"}`)
        .setLabel("세션")
        .setStyle(source === "session" ? ButtonStyle.Primary : ButtonStyle.Secondary),
      new ButtonBuilder()
        .setCustomId(`ops-denied-source:launchd:${reason || "all"}`)
        .setLabel("launchd")
        .setStyle(source === "launchd" ? ButtonStyle.Primary : ButtonStyle.Secondary)
    ),
    new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId("iphone-recover")
        .setLabel("복구")
        .setStyle(ButtonStyle.Secondary),
      new ButtonBuilder()
        .setCustomId(moreCustomId)
        .setLabel("20개 보기")
        .setStyle(ButtonStyle.Secondary)
    ),
  ];
}

function iphoneEnvComponents() {
  return [
    new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId("mobile-iphone")
        .setLabel("외부 사용")
        .setStyle(ButtonStyle.Primary),
      new ButtonBuilder()
        .setCustomId("iphone-whoami")
        .setLabel("내 ID")
        .setStyle(ButtonStyle.Secondary),
      new ButtonBuilder()
        .setCustomId("iphone-policy")
        .setLabel("정책")
        .setStyle(ButtonStyle.Secondary),
      new ButtonBuilder()
        .setCustomId("start-iphone")
        .setLabel("체크리스트")
        .setStyle(ButtonStyle.Secondary)
    ),
  ];
}

function accessRecoveryComponents() {
  return [
    new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId("mobile-iphone")
        .setLabel("외부 사용")
        .setStyle(ButtonStyle.Primary),
      new ButtonBuilder()
        .setCustomId("iphone-env")
        .setLabel("설정")
        .setStyle(ButtonStyle.Secondary),
      new ButtonBuilder()
        .setCustomId("iphone-whoami")
        .setLabel("내 ID")
        .setStyle(ButtonStyle.Secondary),
      new ButtonBuilder()
        .setCustomId("iphone-policy")
        .setLabel("정책")
        .setStyle(ButtonStyle.Secondary)
    ),
  ];
}

function doctorLine(level, title, detail = "") {
  const suffix = detail ? ` - ${detail}` : "";
  return `[${level}] ${title}${suffix}`;
}

function envPresent(name) {
  return Boolean(process.env[name] && String(process.env[name]).trim());
}

function configuredAdminUserIds() {
  return String(process.env.DISCORD_ADMIN_USER_IDS || "")
    .split(",")
    .map((value) => value.trim())
    .filter(Boolean);
}

function configuredAllowedGuildIds() {
  return String(process.env.DISCORD_ALLOWED_GUILD_IDS || "")
    .split(",")
    .map((value) => value.trim())
    .filter(Boolean);
}

function configuredAllowedUserIds() {
  return String(process.env.DISCORD_ALLOWED_USER_IDS || "")
    .split(",")
    .map((value) => value.trim())
    .filter(Boolean);
}

function dmAllowed() {
  return String(process.env.DISCORD_ALLOW_DM || "").trim().toLowerCase() === "true";
}

function isAccessInfoInteraction(interaction) {
  if (typeof interaction.isChatInputCommand === "function" && interaction.isChatInputCommand()) {
    return ["start", "iphone", "whoami", "policy", "iphoneenv", "recover"].includes(interaction.commandName);
  }
  return typeof interaction.isButton === "function"
    && interaction.isButton()
    && ["start-iphone", "mobile-iphone", "iphone-whoami", "iphone-policy", "iphone-env"].includes(interaction.customId);
}

function interactionName(interaction) {
  if (typeof interaction.isChatInputCommand === "function" && interaction.isChatInputCommand()) {
    return `/${interaction.commandName}`;
  }
  return interaction.customId || interaction.type || "unknown";
}

const recentAccessDeniedEvents = [];

function compactAccessDeniedLine(line) {
  return line.replace(/^.*\[discord-access-denied\]\s*/, "").slice(0, 220);
}

function rememberAccessDeniedLine(line) {
  recentAccessDeniedEvents.push(compactAccessDeniedLine(line));
  while (recentAccessDeniedEvents.length > 50) {
    recentAccessDeniedEvents.shift();
  }
}

function logAccessDenied(interaction, reason) {
  const line = `time=${new Date().toISOString()} reason=${reason} user=${interaction.user?.id || "unknown"} guild=${interaction.guildId || "DM"} interaction=${interactionName(interaction)}`;
  rememberAccessDeniedLine(line);
  console.warn(`[discord-access-denied] ${line}`);
}

async function recentAccessDeniedLogLines(limit = 8, reason = "", source = "") {
  let fileLines = [];
  try {
    const fs = await import("node:fs/promises");
    const content = await fs.readFile("/tmp/travel-planner-discord-bot.err", "utf8");
    fileLines = content
      .split(/\r?\n/)
      .filter((line) => line.includes("[discord-access-denied]"))
      .slice(-(reason ? Math.max(limit * 4, 40) : limit * 2))
      .map(compactAccessDeniedLine);
  } catch (error) {
    fileLines = [];
  }

  const seen = new Set();
  return [
    ...fileLines.map((line) => ({ line, source: "launchd" })),
    ...recentAccessDeniedEvents.map((line) => ({ line, source: "session" })),
  ]
    .filter((entry) => !reason || entry.line.includes(`reason=${reason}`))
    .filter((entry) => !source || entry.source === source)
    .reverse()
    .filter((entry) => {
      if (seen.has(entry.line)) return false;
      seen.add(entry.line);
      return true;
    })
    .reverse()
    .slice(-limit)
    .map((entry) => `[${entry.source}] ${entry.line}`);
}

function accessDeniedHints(lines) {
  const hints = [];
  const add = (reason, hint) => {
    if (lines.some((line) => line.includes(`reason=${reason}`))) {
      hints.push(hint);
    }
  };
  add("guild_not_allowed", "서버 차단: `/whoami`의 server ID를 `DISCORD_ALLOWED_GUILD_IDS`에 추가하세요.");
  add("dm_not_allowed", "DM 차단: 개인 DM을 쓰려면 `DISCORD_ALLOW_DM=true`와 `DISCORD_ALLOWED_USER_IDS`를 함께 설정하세요.");
  add("user_not_allowed", "사용자 차단: `/whoami`의 user ID를 `DISCORD_ALLOWED_USER_IDS`에 추가하세요.");
  add("ops_not_allowed", "운영 차단: 관리자 user ID를 `DISCORD_ADMIN_USER_IDS`에 추가하세요.");
  return hints;
}

function accessDeniedReasonSummary(lines) {
  const counts = new Map();
  for (const line of lines) {
    const reason = line.match(/(?:^| )reason=([^ ]+)/)?.[1];
    if (reason) counts.set(reason, (counts.get(reason) || 0) + 1);
  }
  return [...counts.entries()]
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .map(([reason, count]) => `- ${reason}: ${count}건`);
}

function accessDeniedSourceSummary(lines) {
  const counts = new Map();
  for (const line of lines) {
    const source = line.match(/^\[([^\]]+)\]/)?.[1];
    if (source) counts.set(source, (counts.get(source) || 0) + 1);
  }
  return [...counts.entries()]
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .map(([source, count]) => `- ${source}: ${count}건`);
}

function accessDeniedValues(lines, reason, key) {
  const pattern = new RegExp(`(?:^| )${key}=([^ ]+)`);
  return [...new Set(lines
    .filter((line) => line.includes(`reason=${reason}`))
    .map((line) => line.match(pattern)?.[1])
    .filter(Boolean))];
}

function mergeEnvValues(existingValues, newValues, fallbackValue) {
  const merged = [...new Set([...existingValues, ...newValues].filter(Boolean))];
  return merged.length > 0 ? merged.join(",") : fallbackValue;
}

function accessDeniedEnvSuggestions(interaction, lines) {
  const suggestions = [];
  const add = (line) => {
    if (!suggestions.includes(line)) suggestions.push(line);
  };
  const has = (reason) => lines.some((line) => line.includes(`reason=${reason}`));

  if (has("guild_not_allowed")) {
    const guilds = accessDeniedValues(lines, "guild_not_allowed", "guild").filter((guild) => guild !== "DM");
    add(`DISCORD_ALLOWED_GUILD_IDS=${mergeEnvValues(configuredAllowedGuildIds(), guilds, interaction.guildId || "SERVER_ID")}`);
  }
  if (has("dm_not_allowed")) {
    const users = accessDeniedValues(lines, "dm_not_allowed", "user").filter((user) => user !== "unknown");
    add("DISCORD_ALLOW_DM=true");
    add(`DISCORD_ALLOWED_USER_IDS=${mergeEnvValues(configuredAllowedUserIds(), users, interaction.user.id)}`);
  }
  if (has("user_not_allowed")) {
    const users = accessDeniedValues(lines, "user_not_allowed", "user").filter((user) => user !== "unknown");
    add(`DISCORD_ALLOWED_USER_IDS=${mergeEnvValues(configuredAllowedUserIds(), users, interaction.user.id)}`);
  }
  if (has("ops_not_allowed")) {
    const users = accessDeniedValues(lines, "ops_not_allowed", "user").filter((user) => user !== "unknown");
    add(`DISCORD_ADMIN_USER_IDS=${mergeEnvValues(configuredAdminUserIds(), users, interaction.user.id)}`);
  }

  return suggestions;
}

function runtimeAccessPolicyLines() {
  const guilds = configuredAllowedGuildIds();
  const users = configuredAllowedUserIds();
  const admins = configuredAdminUserIds();
  return [
    `- 명령 등록: ${process.env.DISCORD_GUILD_ID ? `guild ${process.env.DISCORD_GUILD_ID}` : "global"}`,
    `- 서버 제한: ${guilds.length > 0 ? guilds.join(", ") : "미설정"}`,
    `- DM 허용: ${dmAllowed() ? "켜짐" : "꺼짐"}`,
    `- 사용자 제한: ${users.length > 0 ? users.join(", ") : "미설정"}`,
    `- 운영 관리자 제한: ${admins.length > 0 ? admins.join(", ") : "미설정"}`,
  ];
}

function guildAccessAllowed(interaction) {
  if (isAccessInfoInteraction(interaction)) {
    return true;
  }
  if (!interaction.guildId) {
    return dmAllowed();
  }
  const allowedGuildIds = configuredAllowedGuildIds();
  return configuredIdentityAllowed(allowedGuildIds, interaction.guildId);
}

async function requireAllowedGuild(interaction) {
  if (guildAccessAllowed(interaction)) {
    return true;
  }
  logAccessDenied(interaction, interaction.guildId ? "guild_not_allowed" : "dm_not_allowed");
  const message = interaction.guildId
    ? "이 서버에서는 여행 플래너 봇을 사용할 수 없습니다. `/recover`로 복구 버튼을 열거나 `/whoami`로 server ID를 확인하고, `/iphoneenv`로 설정 파일을 받은 뒤 `.env`의 `DISCORD_ALLOWED_GUILD_IDS`에 추가해주세요."
    : "DM에서는 여행 플래너 봇을 사용할 수 없습니다. 개인 DM을 쓰려면 `/recover`로 복구 버튼을 열거나 `/iphoneenv`로 설정 파일을 받은 뒤 `.env`에 `DISCORD_ALLOW_DM=true`와 `DISCORD_ALLOWED_USER_IDS`를 설정해주세요.";
  if (interaction.deferred || interaction.replied) {
    await interaction.editReply({ content: message, components: accessRecoveryComponents() });
  } else {
    await interaction.reply({ content: message, ephemeral: true, components: accessRecoveryComponents() });
  }
  return false;
}

function userAccessAllowed(interaction) {
  if (isAccessInfoInteraction(interaction)) {
    return true;
  }
  const allowedUserIds = configuredAllowedUserIds();
  return configuredIdentityAllowed(allowedUserIds, interaction.user.id);
}

async function requireAllowedUser(interaction) {
  if (userAccessAllowed(interaction)) {
    return true;
  }
  logAccessDenied(interaction, "user_not_allowed");
  const message = "이 사용자는 여행 플래너 봇을 사용할 수 없습니다. `/recover`로 복구 버튼을 열거나 `/whoami`로 user ID를 확인하고, `/iphoneenv`로 설정 파일을 받은 뒤 `.env`의 `DISCORD_ALLOWED_USER_IDS`에 추가해주세요.";
  if (interaction.deferred || interaction.replied) {
    await interaction.editReply({ content: message, components: accessRecoveryComponents() });
  } else {
    await interaction.reply({ content: message, ephemeral: true, components: accessRecoveryComponents() });
  }
  return false;
}

function opsAccessAllowed(interaction) {
  const adminUserIds = configuredAdminUserIds();
  return configuredIdentityAllowed(adminUserIds, interaction.user.id);
}

async function requireOpsAccess(interaction) {
  if (opsAccessAllowed(interaction)) {
    return true;
  }
  logAccessDenied(interaction, "ops_not_allowed");
  const message = "이 운영 명령은 관리자만 사용할 수 있습니다. `/recover`로 복구 버튼을 열거나 `/whoami`로 내 Discord user ID를 확인하고, `/iphoneenv`로 설정 파일을 받은 뒤 `.env`의 `DISCORD_ADMIN_USER_IDS`에 추가해주세요.";
  if (interaction.deferred || interaction.replied) {
    await interaction.editReply({ content: message, components: accessRecoveryComponents() });
  } else {
    await interaction.reply({ content: message, ephemeral: true, components: accessRecoveryComponents() });
  }
  return false;
}

function safeWebAccessSummary() {
  if (!PUBLIC_BASE_URL) {
    return "미설정. Discord 메시지/첨부만 사용";
  }

  let url;
  try {
    url = new URL(PUBLIC_BASE_URL);
  } catch {
    return "URL 형식 확인 필요";
  }

  const host = url.hostname;
  if (host === "localhost" || host === "127.0.0.1" || host === "::1") {
    return "로컬 전용 URL 설정됨. iPhone에서는 열기 어려울 수 있음";
  }

  if (/^(10|192\.168|172\.(1[6-9]|2\d|3[0-1]))\./.test(host)) {
    return "같은 Wi-Fi/VPN/터널이 필요한 URL 설정됨";
  }

  return "외부 접근 가능성이 있는 URL 설정됨";
}

async function handleStatus(interaction) {
  await interaction.deferReply({ ephemeral: true });
  const canSeeOpsDetails = opsAccessAllowed(interaction);
  let storageLine = "";
  try {
    const plans = await listPlans(1, DB_PATH);
    storageLine = canSeeOpsDetails
      ? `읽기 가능 (${DB_PATH}, 최근 플랜 ${plans.length}개 확인)`
      : `읽기 가능 (최근 플랜 ${plans.length}개 확인)`;
  } catch (err) {
    storageLine = canSeeOpsDetails ? `확인 실패 (${err.message})` : "확인 실패";
  }

  const lines = [
    "여행 플래너 Discord 봇 상태",
    "",
    `- 봇: 온라인 (${interaction.client.user?.tag || "unknown"})`,
    `- 업타임: ${formatUptime(process.uptime())}`,
    `- 저장소: ${storageLine}`,
    `- 모바일 Discord: 같은 Wi-Fi 불필요. 봇 프로세스가 켜져 있으면 외부 LTE/5G에서도 명령 사용 가능`,
    `- 웹 상세 접근: ${canSeeOpsDetails ? webAccessDiagnosis() : safeWebAccessSummary()}`,
    `- LLM: ${llmStatusText()}`,
    `- 웹 LLM 정책: ${webLlmPolicyText()}`,
    `- 웹 API 제한: ${webApiRateLimitText()}`,
    `- 명령 등록 범위: ${canSeeOpsDetails && process.env.DISCORD_GUILD_ID ? `guild ${process.env.DISCORD_GUILD_ID}` : process.env.DISCORD_GUILD_ID ? "guild" : "global"}`,
    `- 서버 제한: ${configuredAllowedGuildIds().length > 0 ? canSeeOpsDetails ? configuredAllowedGuildIds().join(", ") : "설정됨" : "미설정"}`,
    `- DM 허용: ${dmAllowed() ? "켜짐" : "꺼짐"}`,
    `- 사용자 제한: ${configuredAllowedUserIds().length > 0 ? canSeeOpsDetails ? configuredAllowedUserIds().join(", ") : "설정됨" : "미설정"}`,
    `- 운영 관리자 제한: ${configuredAdminUserIds().length > 0 ? canSeeOpsDetails ? configuredAdminUserIds().join(", ") : "설정됨" : "미설정"}`,
    `- Mac 상시 실행: 잠자기/프로세스 종료 시 응답 중단. launchd 예시는 webapp/launchd/ 참고`,
    `- 운영 상세: ${canSeeOpsDetails ? "`/doctor`, `/ops` 사용 가능" : "관리자만 `/doctor`, `/ops` 사용 가능"}`,
    "",
    "다음 액션:",
    "- 플랜이 안 보이면 `/dashboard`",
    "- iPhone 외부 사용 조건은 `/iphone`, 설정 파일은 `/iphoneenv`",
    "- 웹 버튼이 안 보이면 `TRAVEL_PUBLIC_BASE_URL` 확인",
    "- 새 명령이 안 보이면 봇 재시작 후 Discord 명령 동기화 대기",
  ];

  await interaction.editReply({
    content: truncateText(lines.join("\n")),
    components: statusComponents(),
  });
}

async function handleWhoami(interaction) {
  const lines = [
    "Discord 사용자 정보",
    "",
    `- user ID: ${interaction.user.id}`,
    `- username: ${interaction.user.tag || interaction.user.username}`,
    `- server ID: ${interaction.guildId || "DM 또는 서버 없음"}`,
    "",
    "운영 명령을 제한하려면 `.env`에 다음처럼 넣으세요.",
    `DISCORD_ADMIN_USER_IDS=${interaction.user.id}`,
    "",
    "응답 가능한 사용자를 제한하려면 `.env`에 다음처럼 넣으세요.",
    `DISCORD_ALLOWED_USER_IDS=${interaction.user.id}`,
    "",
    "개인 DM에서만 쓰려면 `.env`에 다음처럼 함께 넣으세요.",
    "DISCORD_ALLOW_DM=true",
    `DISCORD_ALLOWED_USER_IDS=${interaction.user.id}`,
    "",
    "응답 가능한 서버를 제한하려면 `.env`에 다음처럼 넣으세요.",
    `DISCORD_ALLOWED_GUILD_IDS=${interaction.guildId || "서버_ID"}`,
    "",
    "설정 파일이 필요하면 `/iphoneenv`, 처음 흐름으로 돌아가려면 `/start`를 사용하세요.",
  ];
  await interaction.reply({
    content: lines.join("\n"),
    ephemeral: true,
    components: accessRecoveryComponents(),
  });
}

async function handleRecover(interaction) {
  const guildLine = interaction.guildId
    ? `DISCORD_GUILD_ID=${interaction.guildId}`
    : "# DISCORD_ALLOW_DM=true";
  await interaction.reply({
    content: [
      "Discord 접근 복구",
      "",
      `- 내 user ID: ${interaction.user.id}`,
      `- 현재 server ID: ${interaction.guildId || "DM이라 없음"}`,
      "",
      "최소 `.env` 스니펫:",
      "```env",
      `DISCORD_ALLOWED_USER_IDS=${interaction.user.id}`,
      `DISCORD_ADMIN_USER_IDS=${interaction.user.id}`,
      guildLine,
      "```",
      "",
      "- 설정 파일: `/iphoneenv` 또는 `설정`",
      "- 내 ID 확인: `/whoami` 또는 `내 ID`",
      "- 정책 확인: `/policy` 또는 `정책`",
      "- iPhone 외부 조건: `/iphone` 또는 `외부 사용`",
      "",
      "더 긴 설정 파일은 `/iphoneenv`에서 받을 수 있습니다.",
      "여행 생성, 운영, 홈/상태/오프라인 기능은 allowlist 설정 후 사용할 수 있습니다.",
    ].join("\n"),
    ephemeral: true,
    components: accessRecoveryComponents(),
  });
}

async function handleDenied(interaction, reasonOverride = "", limitOverride = null, sourceOverride = "") {
  if (!(await requireOpsAccess(interaction))) return;
  const requestedLimit = limitOverride || (typeof interaction.options?.getInteger === "function"
    ? interaction.options.getInteger("limit") || 8
    : 8);
  const reason = reasonOverride || (typeof interaction.options?.getString === "function"
    ? interaction.options.getString("reason") || ""
    : "");
  const source = sourceOverride || (typeof interaction.options?.getString === "function"
    ? interaction.options.getString("source") || ""
    : "");
  const limit = Math.max(1, Math.min(requestedLimit, 20));
  const lines = await recentAccessDeniedLogLines(limit, reason, source);
  const hints = accessDeniedHints(lines);
  const reasonSummary = accessDeniedReasonSummary(lines);
  const sourceSummary = accessDeniedSourceSummary(lines);
  const envSuggestions = accessDeniedEnvSuggestions(interaction, lines);
  const envAttachmentContent = [
    "# Travel Planner Discord access-denied recovery",
    "# Merge these values into webapp/.env, then restart the bot.",
    ...envSuggestions,
    "",
  ].join("\n");
  await interaction.reply({
    content: [
      "최근 Discord 접근 차단 로그",
      "",
      `현재 실행 세션 메모리와 launchd 에러 로그를 합쳐 최근 ${limit}개를 보여줍니다.`,
      ...(reason ? [`필터: reason=${reason}`] : []),
      ...(source ? [`출처 필터: source=${source}`] : []),
      "launchd 에러 로그에는 과거 항목이 남을 수 있으니, 수정 후에는 새 차단 항목이 추가되는지 기준으로 보세요.",
      "",
      "현재 런타임 접근 설정",
      ...runtimeAccessPolicyLines(),
      "",
      "로그 출처 요약",
      ...(sourceSummary.length > 0 ? sourceSummary : ["- 최근 로그 출처 없음"]),
      "",
      "차단 사유 요약",
      ...(reasonSummary.length > 0 ? reasonSummary : ["- 최근 차단 사유 없음"]),
      "",
      ...(lines.length > 0
        ? lines.map((line) => `- ${line}`)
        : ["- 아직 `discord-access-denied` 로그가 없습니다."]),
      "",
      "수정 힌트",
      ...(hints.length > 0
        ? hints.map((hint) => `- ${hint}`)
        : ["- 최근 로그에서 알려진 차단 사유를 찾지 못했습니다. `/policy`와 `/recover`를 함께 확인하세요."]),
      "",
      "추천 `.env` 조각",
      "현재 봇 프로세스의 기존 allowlist와 최근 차단 값을 병합한 제안입니다.",
      "",
      ...(envSuggestions.length > 0
        ? ["```env", ...envSuggestions, "```"]
        : ["- 최근 로그에서 바로 제안할 설정값이 없습니다. `/recover`에서 현재 ID 기준 스니펫을 확인하세요."]),
      ...(envSuggestions.length > 0
        ? ["", "첨부 파일: `travel-planner-denied.env`"]
        : []),
      "",
      "반영 순서",
      "- Mac에서 `webapp/.env`에 위 값을 반영",
      "- `cd webapp && npm run bot:restart`로 봇 재시작",
      "- Discord에서 `/status`, `/policy`, `/denied` 순서로 재확인",
      "- 재시작 뒤 새 `time=` 항목이 늘지 않으면 접근 차단은 해결된 것으로 보면 됩니다.",
      "",
      "Mac에서 전체 로그를 보려면 `cd webapp && npm run bot:denied`를 사용하세요.",
    ].join("\n"),
    files: envSuggestions.length > 0
      ? [markdownAttachment(envAttachmentContent, "travel-planner-denied.env")]
      : [],
    ephemeral: true,
    components: deniedComponents(reason, source),
  });
}

async function handlePolicy(interaction) {
  const allowedGuildIds = configuredAllowedGuildIds();
  const allowedUserIds = configuredAllowedUserIds();
  const adminUserIds = configuredAdminUserIds();
  const currentGuildAllowed = allowedGuildIds.length === 0 || Boolean(interaction.guildId && allowedGuildIds.includes(interaction.guildId));
  const currentUserAllowed = allowedUserIds.length === 0 || allowedUserIds.includes(interaction.user.id);
  const currentLocationAllowed = interaction.guildId ? currentGuildAllowed : dmAllowed();
  const canSeeOpsDetails = opsAccessAllowed(interaction) && currentLocationAllowed && currentUserAllowed;
  const lines = [
    "Discord 접근 정책",
    "",
    `- 현재 서버: ${interaction.guildId || "DM 또는 서버 없음"}`,
    `- 현재 사용자: ${interaction.user.id}`,
    `- 현재 위치 허용: ${currentLocationAllowed ? "예" : "아니오"}`,
    `- 현재 사용자 허용: ${currentUserAllowed ? "예" : "아니오"}`,
    `- 서버 제한: ${allowedGuildIds.length > 0 ? canSeeOpsDetails ? allowedGuildIds.join(", ") : "설정됨" : "미설정"}`,
    `- DM 허용: ${dmAllowed() ? "켜짐" : "꺼짐"}`,
    `- 사용자 제한: ${allowedUserIds.length > 0 ? canSeeOpsDetails ? allowedUserIds.join(", ") : "설정됨" : "미설정"}`,
    `- 운영 관리자 제한: ${adminUserIds.length > 0 ? canSeeOpsDetails ? adminUserIds.join(", ") : "설정됨" : "미설정"}`,
    "- `/start`, `/iphone`, `/whoami`, `/policy`, `/iphoneenv`, `/recover`와 복구 버튼은 시작/ID/env 확인용으로 allowlist 밖에서도 응답합니다.",
    "",
    "추천 `.env` 스니펫",
    ...(interaction.guildId
      ? [
          "서버에서 나만 쓰기:",
          `DISCORD_ALLOWED_GUILD_IDS=${interaction.guildId}`,
          `DISCORD_ALLOWED_USER_IDS=${interaction.user.id}`,
          `DISCORD_ADMIN_USER_IDS=${interaction.user.id}`,
          "",
        ]
      : []),
    "개인 DM에서 나만 쓰기:",
    "DISCORD_ALLOW_DM=true",
    `DISCORD_ALLOWED_USER_IDS=${interaction.user.id}`,
    `DISCORD_ADMIN_USER_IDS=${interaction.user.id}`,
    "",
    "다음 액션:",
    "- ID를 확인하려면 `/whoami`",
    "- 설정 파일이 필요하면 `/iphoneenv`",
    "- 접근이 막혔을 때는 `/recover`",
    "- iPhone 외부 사용 조건은 `/iphone`",
    "- 처음 흐름으로 돌아가려면 `/start`",
    "- 런타임 상태는 `/status`",
    "- 상세 진단과 운영 명령은 관리자 계정에서 `/doctor`, `/ops`",
    "- 최근 접근 차단 로그는 관리자 계정에서 `/denied` 또는 `차단 로그`",
  ];
  await interaction.reply({ content: lines.join("\n"), ephemeral: true, components: policyComponents() });
}

async function handleDoctor(interaction) {
  await interaction.deferReply({ ephemeral: true });
  if (!(await requireOpsAccess(interaction))) return;
  const lines = ["여행 플래너 Discord 봇 진단", ""];
  const failures = [];
  const warnings = [];

  function add(level, title, detail = "") {
    if (level === "FAIL") failures.push(title);
    if (level === "WARN") warnings.push(title);
    lines.push(doctorLine(level, title, detail));
  }

  add("OK", "bot runtime", `${interaction.client.user?.tag || "unknown"} / uptime ${formatUptime(process.uptime())}`);
  add(envPresent("DISCORD_BOT_TOKEN") ? "OK" : "FAIL", "DISCORD_BOT_TOKEN", envPresent("DISCORD_BOT_TOKEN") ? "set" : "missing");
  add(envPresent("DISCORD_CLIENT_ID") ? "OK" : "FAIL", "DISCORD_CLIENT_ID", envPresent("DISCORD_CLIENT_ID") ? "set" : "missing");
  add(envPresent("DISCORD_GUILD_ID") ? "OK" : "WARN", "command registration", envPresent("DISCORD_GUILD_ID") ? `guild ${process.env.DISCORD_GUILD_ID}` : "global mode can update slowly");
  add(llmStatusText().includes("API 키 없음") ? "WARN" : "OK", "LLM", llmStatusText());
  add(webLlmPolicyRequiresUserKey() ? "OK" : "WARN", "web LLM billing", webLlmPolicyText());
  add("OK", "web API rate limit", webApiRateLimitText());
  add(configuredAllowedGuildIds().length > 0 ? "OK" : "WARN", "guild allowlist", configuredAllowedGuildIds().length > 0 ? `${configuredAllowedGuildIds().length} server(s) allowed` : "not set; any server with commands can use the bot");
  add(dmAllowed() ? configuredAllowedUserIds().length > 0 ? "OK" : "WARN" : "OK", "DM access", dmAllowed() ? configuredAllowedUserIds().length > 0 ? "enabled with user allowlist" : "enabled without user allowlist" : "disabled");
  add(configuredAllowedUserIds().length > 0 ? "OK" : "WARN", "user allowlist", configuredAllowedUserIds().length > 0 ? `${configuredAllowedUserIds().length} user(s) allowed` : "not set; any user with command access can use the bot");
  add(configuredAdminUserIds().length > 0 ? "OK" : "WARN", "admin allowlist", configuredAdminUserIds().length > 0 ? `${configuredAdminUserIds().length} admin user(s)` : "not set; /ops and /doctor are not restricted");

  try {
    const plans = await listPlans(1, DB_PATH);
    add("OK", "travel DB", `${DB_PATH} readable, sample ${plans.length} plan(s)`);
  } catch (err) {
    add("FAIL", "travel DB", `${DB_PATH} read failed (${err.message})`);
  }

  const webDiagnosis = webAccessDiagnosis();
  add(webDiagnosis.includes("URL 형식 확인 필요") ? "FAIL" : webDiagnosis.includes("localhost") || webDiagnosis.includes("같은 Wi-Fi") ? "WARN" : "OK", "web detail access", webDiagnosis);

  const plistPath = path.join(os.homedir(), "Library", "LaunchAgents", "com.travel-planner.discord-bot.plist");
  add(fs.existsSync(plistPath) ? "OK" : "WARN", "launchd plist", fs.existsSync(plistPath) ? plistPath : "not installed; run `npm run bot:launchd:commands` on the Mac");

  lines.push("");
  lines.push(`요약: ${failures.length}개 실패, ${warnings.length}개 경고`);
  if (failures.length > 0) {
    lines.push("먼저 `/ops`를 열어 Mac에서 실행할 점검/재시작 명령을 확인하세요.");
  } else if (warnings.length > 0) {
    lines.push("경고가 있어도 Discord-only 사용은 가능할 수 있습니다. 웹 버튼/launchd 필요 여부만 확인하세요.");
  } else {
    lines.push("현재 봇 런타임 기준으로 큰 문제는 보이지 않습니다.");
  }

  await interaction.editReply({
    content: truncateText(lines.join("\n")),
    components: doctorComponents(),
  });
}

async function handleOps(interaction) {
  if (!(await requireOpsAccess(interaction))) return;
  const cwd = process.cwd();
  const guildMode = process.env.DISCORD_GUILD_ID ? `guild ${process.env.DISCORD_GUILD_ID}` : "global";
  await interaction.reply({
    ephemeral: true,
    content: [
      "Discord 봇 운영 치트시트",
      "",
      `- 실행 위치: ${cwd}`,
      `- 저장소: ${DB_PATH}`,
      `- 명령 등록 범위: ${guildMode}`,
      `- 웹 상세 접근: ${webAccessDiagnosis()}`,
      "",
      "Mac에서 자주 쓰는 명령",
      `- 수동 실행: cd ${cwd} && npm run bot`,
      `- 설정 점검: cd ${cwd} && npm run bot:setup`,
      `- 로컬 진단: cd ${cwd} && npm run bot:doctor`,
      `- launchd 설치/갱신/시작: cd ${cwd} && npm run bot:install`,
      `- launchd 상시 실행 해제: cd ${cwd} && npm run bot:uninstall`,
      `- launchd 재시작: cd ${cwd} && npm run bot:restart`,
      `- launchd 상태: cd ${cwd} && npm run bot:status`,
      `- launchd 로그: cd ${cwd} && npm run bot:logs`,
      `- 접근 차단 로그: cd ${cwd} && npm run bot:denied`,
      `- launchd 명령 묶음 보기: cd ${cwd} && npm run bot:launchd:commands`,
      `- launchd plist 생성: cd ${cwd} && npm run bot:launchd:plist > ~/Library/LaunchAgents/com.travel-planner.discord-bot.plist`,
      "- launchd 시작: launchctl start com.travel-planner.discord-bot",
      "- launchd 중지: launchctl stop com.travel-planner.discord-bot",
      "- 로그 보기: tail -f /tmp/travel-planner-discord-bot.log",
      "- 에러 로그: tail -f /tmp/travel-planner-discord-bot.err",
      "- 차단 로그 찾기: grep discord-access-denied /tmp/travel-planner-discord-bot.err",
      "",
      "폰에서 먼저 확인",
      "- `/doctor`로 런타임 env/저장소/웹 링크/launchd 상태 점검",
      "- `/status`로 봇/저장소/LLM/웹 링크 상태 확인",
      "- `/iphone`으로 외부 LTE/5G 사용 조건과 웹 상세 링크 조건 확인",
      "- `/mobile`로 모바일 허브 열기",
      "- `/offline`으로 iPhone 파일/노트에 저장할 오프라인팩 받기",
      "- `/home`으로 내 플랜 대시보드 열기",
    ].join("\n"),
    components: opsComponents(),
  });
}

async function handleNextAction(interaction) {
  await interaction.deferReply({ ephemeral: true });
  const plan = await resolveTodayPlan(interaction);
  if (!plan) {
    await interaction.editReply("다음 액션을 추천할 플랜을 찾지 못했습니다. 먼저 /quick 또는 /plan으로 플랜을 만들어주세요.");
    return;
  }
  if (plan.discordUserId && plan.discordUserId !== interaction.user.id) {
    await interaction.editReply("이 플랜은 다른 사용자가 만든 플랜이라 다음 액션을 볼 수 없습니다.");
    return;
  }
  await interaction.editReply(truncateText(buildNextAction(plan)));
}

async function handleNow(interaction) {
  await interaction.deferReply({ ephemeral: true });
  const plan = await resolveTodayPlan(interaction);
  if (!plan) {
    await interaction.editReply("현황판을 만들 플랜을 찾지 못했습니다. 먼저 /quick 또는 /plan으로 플랜을 만들어주세요.");
    return;
  }
  if (plan.discordUserId && plan.discordUserId !== interaction.user.id) {
    await interaction.editReply("이 플랜은 다른 사용자가 만든 플랜이라 현황판을 볼 수 없습니다.");
    return;
  }
  await interaction.editReply(truncateText(buildTripNow(plan)));
}

async function handleReadiness(interaction) {
  await interaction.deferReply({ ephemeral: true });
  const plan = await resolveTodayPlan(interaction);
  if (!plan) {
    await interaction.editReply("준비도를 볼 플랜을 찾지 못했습니다. 먼저 /quick 또는 /plan으로 플랜을 만들어주세요.");
    return;
  }
  if (plan.discordUserId && plan.discordUserId !== interaction.user.id) {
    await interaction.editReply("이 플랜은 다른 사용자가 만든 플랜이라 준비도를 볼 수 없습니다.");
    return;
  }
  await interaction.editReply(truncateText(buildReadinessReport(plan)));
}

async function handlePrepPlan(interaction) {
  await interaction.deferReply({ ephemeral: true });
  const plan = await resolveTodayPlan(interaction);
  if (!plan) {
    await interaction.editReply("보강 플랜을 만들 플랜을 찾지 못했습니다. 먼저 /quick 또는 /plan으로 플랜을 만들어주세요.");
    return;
  }
  if (plan.discordUserId && plan.discordUserId !== interaction.user.id) {
    await interaction.editReply("이 플랜은 다른 사용자가 만든 플랜이라 보강 플랜을 볼 수 없습니다.");
    return;
  }
  await interaction.editReply(truncateText(buildReadinessActionPlan(plan)));
}

async function handleReadyShare(interaction) {
  await interaction.deferReply({ ephemeral: true });
  const plan = await resolveTodayPlan(interaction);
  if (!plan) {
    await interaction.editReply("준비 공유문을 만들 플랜을 찾지 못했습니다. 먼저 /quick 또는 /plan으로 플랜을 만들어주세요.");
    return;
  }
  if (plan.discordUserId && plan.discordUserId !== interaction.user.id) {
    await interaction.editReply("이 플랜은 다른 사용자가 만든 플랜이라 준비 공유문을 볼 수 없습니다.");
    return;
  }
  await interaction.editReply(truncateText(buildReadinessShareText(plan)));
}

async function handleMobile(interaction) {
  await interaction.reply({
    ephemeral: true,
    content: [
      "아이폰 Discord 사용 모드",
      "",
      "- Mac이나 배포 서버에서 봇 프로세스가 켜져 있으면, 폰이 외부 LTE/5G에 있어도 Discord 명령은 사용할 수 있습니다.",
      "- `localhost:3000`을 외부에 공개할 필요는 없습니다. 봇이 Discord에 접속해 메시지로 결과를 돌려주는 구조입니다.",
      "- 단, Mac이 잠자기 상태가 되거나 `npm run bot` 프로세스가 꺼지면 명령도 멈춥니다.",
      `- 웹 상세 접근: ${webAccessDiagnosis()}`,
      "",
      "모바일 추천 순서",
      "1. `/status`로 봇/저장소/웹 링크 상태 확인",
      "2. `/home` 또는 `/dashboard`로 최근/고정/진행 중 플랜 열기",
      "3. `/offline`으로 iPhone 파일/노트에 저장할 오프라인팩 받기",
      "4. `/now` 또는 `/nextaction`으로 지금 볼 카드 선택",
      "5. 관리/파일/백업 선택 메뉴의 `파일: 사용 가이드`로 받을 파일 고르기",
      "6. `/guide`로 상황별 명령 다시 확인",
    ].join("\n"),
    components: mobileComponents(),
  });
}

async function handleIphone(interaction) {
  await interaction.reply({
    content: buildIphoneAccessGuide(interaction.user.id, interaction.guildId),
    ephemeral: true,
    components: iphoneComponents(),
  });
}

async function handleIphoneEnvButton(interaction) {
  const envContent = buildIphoneEnvContent(interaction.user.id, interaction.guildId);
  const snippet = buildIphoneEnvSnippet(interaction.user.id, interaction.guildId);
  await interaction.reply({
    content: `${snippet}\n\n첨부 파일: travel-planner-iphone.env`,
    files: [markdownAttachment(envContent, "travel-planner-iphone.env")],
    ephemeral: true,
    components: iphoneEnvComponents(),
  });
}

function buildDiscordQualityGuide() {
  return [
    "품질 루프",
    "- `/qualitystatus`: 내 플랜의 품질 확인/악화/개선 개수와 다음 액션",
    "- `/qualitytodo`: 지금 고도화할 품질 후보 플랜. `next:true`로 현재 추천 품질 필터만 선택",
    "- `/qualityurgent`: 우선도 80 이상 긴급 품질 후보 플랜",
    "- `/qualitybrief`: 공유할 품질 고도화 TODO. `next:true`, `min_priority`, `urgent:true`로 후보 선택",
    "- `/qualitygate`: 내 플랜 품질 게이트 통과 여부. `max_actions:5`, `next:true`, `urgent:true`로 완화/추천/긴급 기준 조정",
    "- `/qualitygates`: strict/완화/긴급/추천 품질 게이트 매트릭스와 추천 액션, CI 명령",
    "- `/qualitycommands`: 품질 게이트 CI 명령 JSON/text 경로, SARIF/JUnit/Step Summary/Annotations/Outputs 산출물, SARIF 업로드 Actions 예시, 명령 묶음",
    "- `/quality`: 자동 품질 점검에서 보강이 필요한 플랜",
    "- `/qualityok`: 자동 품질 점검이 모두 OK인 플랜",
    "- `/qualityunaudited`: 자동 품질 점검이 아직 없는 플랜",
    "- `/qualityworse`: 직전 버전보다 확인 항목이 늘어난 플랜",
    "- `/qualitybetter`: 직전 버전보다 확인 항목이 줄어든 플랜",
  ].join("\n");
}

function qualityWarningFocusLine(summary = {}) {
  const topWarnings = Array.isArray(summary.topQualityWarnings)
    ? summary.topQualityWarnings.filter((item) => item?.label && Number(item.count) > 0).slice(0, 3)
    : [];
  if (!topWarnings.length) return "- 많이 남은 항목: 없음";
  return `- 많이 남은 항목: ${topWarnings.map((item) => `${item.label} ${Number(item.count)}`).join(", ")}`;
}

function qualityOkLine(summary = {}) {
  const audited = Number(summary.qualityAudited);
  const ok = Number(summary.qualityOk);
  const okRate = Number(summary.qualityOkRate);
  if (![audited, ok, okRate].every(Number.isFinite)) return "- 품질 OK: 집계 없음";
  return `- 품질 OK: ${ok}/${audited} (${okRate}%)`;
}

function qualityUnauditedLine(summary = {}) {
  const unaudited = Number(summary.qualityUnaudited);
  return Number.isFinite(unaudited) ? `- 품질 미점검: ${unaudited}` : "- 품질 미점검: 집계 없음";
}

function qualityActionBreakdownLine(summary = {}) {
  const action = Number(summary.qualityAction);
  const urgent = Number(summary.qualityUrgent);
  const quality = Number(summary.quality);
  const unaudited = Number(summary.qualityUnaudited);
  const regression = Number(summary.qualityRegression);
  if (![action, urgent, quality, unaudited, regression].every(Number.isFinite)) return "- 고도화 후보 구성: 집계 없음";
  const regularWarnings = Math.max(0, quality - regression);
  const parts = [
    urgent > 0 ? `긴급 ${urgent}` : "",
    regression > 0 ? `악화 ${regression}` : "",
    regularWarnings > 0 ? `확인 ${regularWarnings}` : "",
    unaudited > 0 ? `미점검 ${unaudited}` : "",
  ].filter(Boolean);
  return `- 고도화 후보 구성: ${action}${parts.length ? ` (${parts.join(", ")})` : ""}`;
}

function qualityTargetLine(topPlan, summary = {}) {
  if (!topPlan?.id) return "- 최우선 대상: 없음";
  const reason = qualityActionReasonText(topPlan);
  const priority = qualityActionPriorityText(topPlan);
  const urgentReason = Number(summary.qualityUrgent) > 0 ? " / 긴급 후보 우선" : "";
  return `- 최우선 대상: ${topPlan.destination || "목적지 미정"} #${topPlan.id}${topPlan.startDate ? ` (${topPlan.startDate})` : ""}${urgentReason}${priority ? ` / 우선도: ${priority}` : ""}${reason ? ` / ${reason}` : ""}`;
}

function qualityTodoCandidateLine(plan, index) {
  const reason = qualityActionReasonText(plan).replace(/^후보:\s*/, "") || "품질 보강 필요";
  const needsAudit = planNeedsQualityAudit(plan);
  const priority = qualityActionPriorityText(plan);
  const hint = needsAudit
    ? `/refine plan_id:${plan.id} feedback:자동 품질 점검 섹션을 추가해줘`
    : `품질 보강 버튼 또는 /refine plan_id:${plan.id}`;
  return [
    `${index + 1}. ${plan.destination || "목적지 미정"} #${plan.id}${plan.startDate ? ` (${plan.startDate})` : ""}`,
    priority ? `   - 우선도: ${priority}` : "",
    `   - 이유: ${reason}`,
    `   - 다음 액션: ${needsAudit ? "품질 점검 생성" : "품질 보강"}`,
    `   - 실행 힌트: ${hint}`,
  ].join("\n");
}

function qualityTodoBundlePrompt(candidatePlans = []) {
  const count = candidatePlans.filter((plan) => plan?.id).length;
  if (!count) return "";
  return `묶음 실행 프롬프트: 상위 후보 ${count}개를 우선도 높은 순서대로 처리해줘. 미점검은 자동 품질 점검 섹션 생성, 품질 경고/악화는 이유에 맞춰 품질 보강.`;
}

function qualityTodoBriefText(summary = {}, topPlan = null, candidatePlans = [], options = {}) {
  const minPriority = Number.isFinite(Number(options.minPriority)) ? Math.max(0, Math.floor(Number(options.minPriority))) : 0;
  const action = Number(summary.qualityAction);
  const filterLabel = String(options.filterLabel || "").trim();
  const headingSuffix = [filterLabel, minPriority > 0 ? `우선도 ${minPriority} 이상` : ""].filter(Boolean).join(", ");
  const candidates = Array.isArray(candidatePlans)
    ? candidatePlans
      .filter((plan) => plan?.id)
      .filter((plan) => minPriority <= 0 || Number(plan.qualityActionPriority || 0) >= minPriority)
      .slice(0, 10)
    : [];
  const targetPlan = minPriority > 0 ? candidates[0] : topPlan;
  const reason = targetPlan?.id ? qualityActionReasonText(targetPlan).replace(/^후보:\s*/, "") : "";
  const needsAudit = planNeedsQualityAudit(targetPlan);
  return [
    headingSuffix ? `품질 고도화 TODO (${headingSuffix})` : "품질 고도화 TODO",
    filterLabel || minPriority > 0 ? `${filterLabel || "후보"}: ${candidates.length}개` : Number.isFinite(action) ? qualityActionBreakdownLine(summary).replace(/^- /, "") : "",
    minPriority > 0 && !candidates.length && Number.isFinite(action) && action > 0 ? "상태: 지정 우선도 이상의 후보가 없습니다. 일반 TODO 5/10으로 낮춰 확인하세요." : "",
    targetPlan?.id ? qualityTargetLine(targetPlan).replace(/^- /, "") : "최우선 대상: 없음",
    reason ? `이유: ${reason}` : "",
    targetPlan?.id ? `다음 액션: ${needsAudit ? "품질 점검 생성" : "품질 보강"}` : "",
    targetPlan?.id ? `실행 힌트: ${needsAudit ? `/refine plan_id:${targetPlan.id} feedback:자동 품질 점검 섹션을 추가해줘` : `품질 보강 버튼 또는 /refine plan_id:${targetPlan.id}`}` : "",
    qualityTodoBundlePrompt(candidates),
    candidates.length ? `상위 후보\n${candidates.map((plan, index) => qualityTodoCandidateLine(plan, index)).join("\n")}` : "",
  ].filter(Boolean).join("\n");
}

async function handleGuide(interaction) {
  const summary = await getPlanQualitySummary(DB_PATH, { discordUserId: interaction.user.id });
  const topPlan = await findTopQualityPlan(interaction.user.id, summary);
  await interaction.reply({
    content: truncateText(`${buildDiscordGuide()}\n\n${buildDiscordQualityGuide()}\n${qualityOkLine(summary)}\n${qualityUnauditedLine(summary)}\n${qualityActionBreakdownLine(summary)}\n${qualityWarningFocusLine(summary)}\n${qualityTargetLine(topPlan, summary)}`),
    ephemeral: true,
    components: qualityStatusComponents(summary, topPlan),
  });
}

async function handleStart(interaction) {
  await interaction.reply({
    content: buildDiscordStart(),
    ephemeral: true,
    components: startComponents(),
  });
}

async function handleStartQuickButton(interaction) {
  const modal = new ModalBuilder()
    .setCustomId("start-quick-modal")
    .setTitle("새 여행 빠른 생성");
  const request = new TextInputBuilder()
    .setCustomId("request")
    .setLabel("여행 요청을 한 줄로 입력하세요")
    .setStyle(TextInputStyle.Paragraph)
    .setRequired(true)
    .setPlaceholder("예: 2026-08-01 부산 2박3일 친구랑 맛집 위주 서울 출발 KTX 1인 20만원");
  modal.addComponents(new ActionRowBuilder().addComponents(request));
  await interaction.showModal(modal);
}

async function handleStartQuickModal(interaction) {
  await interaction.deferReply({ ephemeral: true });
  const request = interaction.fields.getTextInputValue("request").trim();
  if (!request) {
    await interaction.editReply("여행 요청을 한 줄로 입력해주세요. 예: `부산 2박3일 친구랑 맛집 위주 서울 출발 KTX`");
    return;
  }
  const input = withDiscordContext(parseQuickRequest(request), interaction);
  const generation = await generateInitialPlan(input);
  const plan = await createPlan(input, generation, DB_PATH);
  if (generation.error) {
    plan.latestError = generation.error;
  }
  await interaction.editReply({
    ...planReply(plan),
  });
}

async function handleMobileMemoButton(interaction) {
  const modal = new ModalBuilder()
    .setCustomId("mobile-memo-modal")
    .setTitle("최근 플랜에 메모 남기기");
  const memo = new TextInputBuilder()
    .setCustomId("memo")
    .setLabel("메모를 입력하세요")
    .setStyle(TextInputStyle.Paragraph)
    .setRequired(true)
    .setPlaceholder("예: 숙소 예약번호 ABC123 / 광안리 브런치 후보 찾기");
  modal.addComponents(new ActionRowBuilder().addComponents(memo));
  await interaction.showModal(modal);
}

async function handleMobileMemoModal(interaction) {
  await interaction.deferReply({ ephemeral: true });
  const text = interaction.fields.getTextInputValue("memo").trim();
  if (!text) {
    await interaction.editReply("메모 내용을 입력해주세요.");
    return;
  }
  const plan = await findLatestPlanByDiscordUser(interaction.user.id, DB_PATH);
  if (!plan) {
    await interaction.editReply("메모를 남길 플랜을 찾지 못했습니다. 먼저 /quick 또는 /start의 `새 여행`으로 플랜을 만들어주세요.");
    return;
  }
  const updatedPlan = await updatePlanPersonalNote(
    plan.id,
    [plan.personalNote, memoEntry(text)].filter(Boolean).join("\n"),
    DB_PATH
  );
  await interaction.editReply({
    content: truncateText(`플랜 #${updatedPlan.id}에 메모를 남겼습니다.\n\n최근 메모:\n${memoPreview(updatedPlan.personalNote)}`),
    components: mobileComponents(),
  });
}

async function handleMobileNowButton(interaction) {
  await interaction.deferReply({ ephemeral: true });
  const plan = await findLatestPlanByDiscordUser(interaction.user.id, DB_PATH);
  if (!plan) {
    await interaction.editReply("현황판을 만들 플랜을 찾지 못했습니다. 먼저 /start의 `새 여행`으로 플랜을 만들어주세요.");
    return;
  }
  await interaction.editReply({
    content: truncateText(buildTripNow(plan)),
    components: mobileComponents(),
  });
}

async function handleMobileMoneyButton(interaction) {
  await interaction.deferReply({ ephemeral: true });
  const plan = await findLatestPlanByDiscordUser(interaction.user.id, DB_PATH);
  if (!plan) {
    await interaction.editReply("돈 관리 현황을 볼 플랜을 찾지 못했습니다. 먼저 /start의 `새 여행`으로 플랜을 만들어주세요.");
    return;
  }
  await interaction.editReply({
    content: truncateText(buildSpendingStatus(plan)),
    components: moneyFollowupComponents(plan),
  });
}

async function handleMobileNextButton(interaction) {
  await interaction.deferReply({ ephemeral: true });
  const plan = await findLatestPlanByDiscordUser(interaction.user.id, DB_PATH);
  if (!plan) {
    await interaction.editReply("다음 액션을 추천할 플랜을 찾지 못했습니다. 먼저 /start의 `새 여행`으로 플랜을 만들어주세요.");
    return;
  }
  await interaction.editReply({
    content: truncateText(buildNextAction(plan)),
    components: mobileComponents(),
  });
}

async function handleMobileReadinessButton(interaction) {
  await interaction.deferReply({ ephemeral: true });
  const plan = await findLatestPlanByDiscordUser(interaction.user.id, DB_PATH);
  if (!plan) {
    await interaction.editReply("준비도를 볼 플랜을 찾지 못했습니다. 먼저 /start의 `새 여행`으로 플랜을 만들어주세요.");
    return;
  }
  await interaction.editReply({
    content: truncateText(buildReadinessReport(plan)),
    components: mobileComponents(),
  });
}

async function handleMobileTodayButton(interaction) {
  await interaction.deferReply({ ephemeral: true });
  const plan = await findLatestPlanByDiscordUser(interaction.user.id, DB_PATH);
  if (!plan) {
    await interaction.editReply("오늘 일정을 볼 플랜을 찾지 못했습니다. 먼저 /start의 `새 여행`으로 플랜을 만들어주세요.");
    return;
  }
  const current = getCurrentTripDay(plan);
  await interaction.editReply({
    content: truncateText(`오늘 일정 (${current.label})\n\n${buildTodayViewText(plan)}`),
    components: mobileComponents(),
  });
}

async function handleMobileCheckButton(interaction) {
  await interaction.deferReply({ ephemeral: true });
  const plan = await findLatestPlanByDiscordUser(interaction.user.id, DB_PATH);
  if (!plan) {
    await interaction.editReply("오늘 점검표를 볼 플랜을 찾지 못했습니다. 먼저 /start의 `새 여행`으로 플랜을 만들어주세요.");
    return;
  }
  await interaction.editReply({
    content: truncateText(buildTodayChecklist(plan)),
    components: mobileComponents(),
  });
}

async function handleMobileNightButton(interaction) {
  await interaction.deferReply({ ephemeral: true });
  const plan = await findLatestPlanByDiscordUser(interaction.user.id, DB_PATH);
  if (!plan) {
    await interaction.editReply("밤 점검표를 볼 플랜을 찾지 못했습니다. 먼저 /start의 `새 여행`으로 플랜을 만들어주세요.");
    return;
  }
  await interaction.editReply({
    content: truncateText(buildNightChecklist(plan)),
    components: mobileComponents(),
  });
}

async function handleMobileMapsButton(interaction) {
  await interaction.deferReply({ ephemeral: true });
  const plan = await findLatestPlanByDiscordUser(interaction.user.id, DB_PATH);
  if (!plan) {
    await interaction.editReply("지도 링크를 볼 플랜을 찾지 못했습니다. 먼저 /start의 `새 여행`으로 플랜을 만들어주세요.");
    return;
  }
  await interaction.editReply({
    content: mapLinksMessage(plan),
    components: mobileComponents(),
  });
}

async function handleMobileShareButton(interaction) {
  await interaction.deferReply({ ephemeral: true });
  const plan = await findLatestPlanByDiscordUser(interaction.user.id, DB_PATH);
  if (!plan) {
    await interaction.editReply("공유할 플랜을 찾지 못했습니다. 먼저 /start의 `새 여행`으로 플랜을 만들어주세요.");
    return;
  }
  await interaction.editReply({
    content: truncateText(buildShareText(plan)),
    components: mobileComponents(),
  });
}

async function handleMobileActionSelect(interaction) {
  const action = interaction.values[0];
  if (action === "quick") {
    await handleStartQuickButton(interaction);
    return;
  }
  if (action === "expense") {
    const plan = await findLatestPlanByDiscordUser(interaction.user.id, DB_PATH);
    if (!plan) {
      await interaction.reply({
        content: "지출을 입력할 플랜을 찾지 못했습니다. 먼저 /start의 `새 여행`으로 플랜을 만들어주세요.",
        ephemeral: true,
      });
      return;
    }
    const modal = new ModalBuilder()
      .setCustomId(`plan-expense-input-modal:${plan.id}`)
      .setTitle(`플랜 #${plan.id} 지출 입력`);
    const expense = new TextInputBuilder()
      .setCustomId("expense")
      .setLabel("지출을 한 줄로 입력하세요")
      .setStyle(TextInputStyle.Short)
      .setRequired(true)
      .setPlaceholder("예: 커피 4500 나");
    modal.addComponents(new ActionRowBuilder().addComponents(expense));
    await interaction.showModal(modal);
    return;
  }
  if (action === "ask") {
    const plan = await findLatestPlanByDiscordUser(interaction.user.id, DB_PATH);
    if (!plan) {
      await interaction.reply({
        content: "질문할 플랜을 찾지 못했습니다. 먼저 /start의 `새 여행`으로 플랜을 만들어주세요.",
        ephemeral: true,
      });
      return;
    }
    const modal = new ModalBuilder()
      .setCustomId(`plan-ask-modal:${plan.id}`)
      .setTitle(`플랜 #${plan.id} 질문`);
    const question = new TextInputBuilder()
      .setCustomId("question")
      .setLabel("무엇이 궁금한가요?")
      .setStyle(TextInputStyle.Paragraph)
      .setRequired(true)
      .setPlaceholder("예: 비 오면 2일차를 어떻게 바꾸면 좋아?");
    modal.addComponents(new ActionRowBuilder().addComponents(question));
    await interaction.showModal(modal);
    return;
  }
  if (action === "refine") {
    const plan = await findLatestPlanByDiscordUser(interaction.user.id, DB_PATH);
    if (!plan) {
      await interaction.reply({
        content: "고도화할 플랜을 찾지 못했습니다. 먼저 /start의 `새 여행`으로 플랜을 만들어주세요.",
        ephemeral: true,
      });
      return;
    }
    const modal = new ModalBuilder()
      .setCustomId(`plan-refine-modal:${plan.id}`)
      .setTitle(`플랜 #${plan.id} 고도화`);
    const feedback = new TextInputBuilder()
      .setCustomId("feedback")
      .setLabel("어떻게 바꿀까요?")
      .setStyle(TextInputStyle.Paragraph)
      .setRequired(true)
      .setPlaceholder("예: 2일차를 바다 위주로 바꾸고 이동 시간을 줄여줘");
    modal.addComponents(new ActionRowBuilder().addComponents(feedback));
    await interaction.showModal(modal);
    return;
  }
  if (action === "schedule") {
    const plan = await findLatestPlanByDiscordUser(interaction.user.id, DB_PATH);
    if (!plan) {
      await interaction.reply({
        content: "일정을 변경할 플랜을 찾지 못했습니다. 먼저 /start의 `새 여행`으로 플랜을 만들어주세요.",
        ephemeral: true,
      });
      return;
    }
    const modal = new ModalBuilder()
      .setCustomId(`plan-schedule-modal:${plan.id}`)
      .setTitle(`플랜 #${plan.id} 일정 변경`);
    const startDate = new TextInputBuilder()
      .setCustomId("start_date")
      .setLabel("출발일")
      .setStyle(TextInputStyle.Short)
      .setRequired(true)
      .setValue(plan.startDate || "")
      .setPlaceholder("예: 2026-07-01");
    const nights = new TextInputBuilder()
      .setCustomId("nights")
      .setLabel("몇 박")
      .setStyle(TextInputStyle.Short)
      .setRequired(false)
      .setValue(String(plan.nights || ""))
      .setPlaceholder("예: 2");
    modal.addComponents(new ActionRowBuilder().addComponents(startDate), new ActionRowBuilder().addComponents(nights));
    await interaction.showModal(modal);
    return;
  }
  if (action === "party-budget") {
    const plan = await findLatestPlanByDiscordUser(interaction.user.id, DB_PATH);
    if (!plan) {
      await interaction.reply({
        content: "인원/예산을 변경할 플랜을 찾지 못했습니다. 먼저 /start의 `새 여행`으로 플랜을 만들어주세요.",
        ephemeral: true,
      });
      return;
    }
    const modal = new ModalBuilder()
      .setCustomId(`plan-party-budget-modal:${plan.id}`)
      .setTitle(`플랜 #${plan.id} 인원/예산 변경`);
    const travelers = new TextInputBuilder()
      .setCustomId("travelers")
      .setLabel("인원")
      .setStyle(TextInputStyle.Short)
      .setRequired(true)
      .setValue(String(plan.travelers || ""))
      .setPlaceholder("예: 3");
    const budget = new TextInputBuilder()
      .setCustomId("budget_per_person")
      .setLabel("1인 예산")
      .setStyle(TextInputStyle.Short)
      .setRequired(false)
      .setValue(plan.budgetPerPerson ? String(plan.budgetPerPerson) : "")
      .setPlaceholder("예: 250000");
    modal.addComponents(new ActionRowBuilder().addComponents(travelers), new ActionRowBuilder().addComponents(budget));
    await interaction.showModal(modal);
    return;
  }
  await interaction.deferReply({ ephemeral: true });
  if (action === "file-guide") {
    const guidePlan = await findLatestPlanByDiscordUser(interaction.user.id, DB_PATH);
    const guideMarkdown = buildFileGuideMarkdown(guidePlan || { id: "guide", destination: "여행", latestVersion: 1 }, {
      webUrl: guidePlan ? planWebUrl(guidePlan) : PUBLIC_BASE_URL,
    });
    const guideFileName = guidePlan ? planMarkdownFileName(guidePlan, "-file-guide") : "travel-planner-file-guide.md";
    await replyWithMarkdownAttachment(interaction, guideMarkdown, guideFileName, guidePlan ? planMarkdownMessage(guidePlan, "사용 가이드") : "파일 사용 가이드입니다.");
    return;
  }
  if (action === "backup") {
    const backup = await exportPlansBackup(DB_PATH, { discordUserId: interaction.user.id });
    const stamp = backup.exportedAt.slice(0, 10);
    const attachment = new AttachmentBuilder(Buffer.from(JSON.stringify(backup, null, 2), "utf-8"), {
      name: `travel-planner-discord-backup-${stamp}.json`,
    });
    await interaction.editReply({
      content: `내 Discord 플랜 ${backup.plans.length}개를 백업했습니다.`,
      files: [attachment],
      components: mobileComponents(),
    });
    return;
  }
  const plan = await findLatestPlanByDiscordUser(interaction.user.id, DB_PATH);
  if (!plan) {
    await interaction.editReply("실행할 플랜을 찾지 못했습니다. 먼저 /start의 `새 여행`으로 플랜을 만들어주세요.");
    return;
  }
  if (action === "web") {
    const url = planWebUrl(plan);
    if (!url) {
      await interaction.editReply("웹 상세 링크를 만들려면 `.env`에 `TRAVEL_PUBLIC_BASE_URL`을 먼저 설정해주세요.");
      return;
    }
    await interaction.editReply({
      content: `플랜 #${plan.id} ${plan.destination || "여행"} 웹 상세\n${url}`,
      components: mobileComponents(),
    });
    return;
  }
  if (action === "toggle-pin") {
    const updatedPlan = await setPlanPinned(plan.id, !plan.pinned, DB_PATH);
    await interaction.editReply({
      content: `플랜 #${updatedPlan.id} ${updatedPlan.destination || "여행"}을 ${updatedPlan.pinned ? "고정했습니다." : "고정 해제했습니다."}`,
      components: mobileComponents(),
    });
    return;
  }
  if (action === "duplicate") {
    const duplicated = await duplicatePlan(
      plan.id,
      {
        source: "discord",
        discordUserId: interaction.user.id,
        discordUserName: interaction.user.username,
        discordChannelId: interaction.channelId || "",
        discordGuildId: interaction.guildId || "",
      },
      DB_PATH
    );
    await interaction.editReply({
      content: `플랜 #${plan.id} ${plan.destination || "여행"}을 플랜 #${duplicated.id}로 복제했습니다.`,
      components: mobileComponents(),
    });
    return;
  }
  if (action === "history") {
    await interaction.editReply(historyReply(plan, interaction.user.id));
    return;
  }
  if (action === "budget") {
    await interaction.editReply({
      content: truncateText(buildBudgetBriefing(plan)),
      components: mobileComponents(),
    });
    return;
  }
  if (action === "category-budget") {
    await interaction.editReply({
      content: truncateText(buildCategoryBudgetStatus(plan)),
      components: mobileComponents(),
    });
    return;
  }
  if (action === "daily-budget") {
    await interaction.editReply({
      content: truncateText(buildDailyBudgetStatus(plan)),
      components: mobileComponents(),
    });
    return;
  }
  if (action === "expense-ledger") {
    await interaction.editReply({
      content: truncateText(buildExpenseLedger(plan)),
      components: mobileComponents(),
    });
    return;
  }
  if (action === "settlement") {
    await interaction.editReply({
      content: truncateText(buildSettlementBriefing(plan)),
      components: mobileComponents(),
    });
    return;
  }
  if (action === "settlement-matrix") {
    await interaction.editReply({
      content: truncateText(buildSettlementMatrix(plan)),
      components: mobileComponents(),
    });
    return;
  }
  if (action === "prep-plan") {
    await interaction.editReply({
      content: truncateText(buildReadinessActionPlan(plan)),
      components: mobileComponents(),
    });
    return;
  }
  if (action === "departure") {
    await interaction.editReply({
      content: truncateText(buildDepartureBriefing(plan)),
      components: mobileComponents(),
    });
    return;
  }
  if (action === "checklist") {
    await interaction.editReply({
      content: buildChecklistText(plan, DISCORD_LIMIT),
      components: mobileComponents(),
    });
    return;
  }
  if (action === "packing") {
    await interaction.editReply({
      content: buildPackingList(plan, DISCORD_LIMIT),
      components: mobileComponents(),
    });
    return;
  }
  if (action === "emergency") {
    await interaction.editReply({
      content: buildEmergencyCard(plan, DISCORD_LIMIT),
      components: mobileComponents(),
    });
    return;
  }
  if (action === "day-share") {
    await interaction.editReply({
      content: truncateText(buildDayShareText(plan)),
      components: mobileComponents(),
    });
    return;
  }
  if (action === "readiness-share") {
    await interaction.editReply({
      content: truncateText(buildReadinessShareText(plan)),
      components: mobileComponents(),
    });
    return;
  }
  if (action === "memo-share") {
    await interaction.editReply({
      content: truncateText(`${buildMemoShareText(plan)}\n\n위 내용을 복사해서 동행에게 보내세요.`),
      components: mobileComponents(),
    });
    return;
  }
  if (action === "brief") {
    await interaction.editReply({
      content: truncateText(buildDailyBriefing(plan)),
      components: mobileComponents(),
    });
    return;
  }
  if (action === "settlement-message") {
    await interaction.editReply({
      content: truncateText(buildSettlementMessage(plan)),
      components: mobileComponents(),
    });
    return;
  }
  if (action === "settlement-transfers") {
    await interaction.editReply({
      content: truncateText(buildSettlementTransfers(plan)),
      components: mobileComponents(),
    });
    return;
  }
  if (action === "tomorrow") {
    await interaction.editReply({
      content: truncateText(buildTomorrowBriefing(plan)),
      components: mobileComponents(),
    });
    return;
  }
  if (action === "recap") {
    await interaction.editReply({
      content: truncateText(buildTripRecap(plan)),
      components: mobileComponents(),
    });
    return;
  }
  if (action === "maps") {
    await interaction.editReply({
      content: mapLinksMessage(plan),
      components: mobileComponents(),
    });
    return;
  }
  if (action === "expense-csv") {
    const attachment = new AttachmentBuilder(Buffer.from(buildExpenseCsv(plan), "utf-8"), {
      name: `travel-plan-${plan.id}-expenses.csv`,
    });
    await interaction.editReply({
      content: `플랜 #${plan.id} ${plan.destination || "여행"} 지출 CSV 파일입니다.`,
      files: [attachment],
      components: mobileComponents(),
    });
    return;
  }
  if (action === "settlement-markdown") {
    await replyWithMarkdownAttachment(interaction, buildSettlementPackMarkdown(plan), planMarkdownFileName(plan, "-settlement"), planMarkdownMessage(plan, "정산"));
    return;
  }
  if (action === "departure-pack-markdown") {
    await replyWithMarkdownAttachment(interaction, buildDeparturePackMarkdown(plan), planMarkdownFileName(plan, "-departure-pack"), planMarkdownMessage(plan, "출발팩"));
    return;
  }
  if (action === "today-pack-markdown") {
    await replyWithMarkdownAttachment(interaction, buildTodayPackMarkdown(plan), planMarkdownFileName(plan, "-today-pack"), planMarkdownMessage(plan, "오늘팩"));
    return;
  }
  if (action === "memo-markdown") {
    await replyWithMarkdownAttachment(interaction, buildMemoPackMarkdown(plan), planMarkdownFileName(plan, "-memo"), planMarkdownMessage(plan, "메모"));
    return;
  }
  if (action === "share-pack-markdown") {
    await replyWithMarkdownAttachment(interaction, buildSharePackMarkdown(plan), planMarkdownFileName(plan, "-share-pack"), planMarkdownMessage(plan, "공유팩"));
    return;
  }
  if (action === "money-pack-markdown") {
    await replyWithMarkdownAttachment(interaction, buildMoneyPackMarkdown(plan), planMarkdownFileName(plan, "-money-pack"), planMarkdownMessage(plan, "돈팩"));
    return;
  }
  if (action === "full-pack-markdown") {
    await replyWithMarkdownAttachment(interaction, buildFullPackMarkdown(plan), planMarkdownFileName(plan, "-full-pack"), planMarkdownMessage(plan, "전체팩"));
    return;
  }
  if (action === "offline-pack-markdown") {
    const offlinePack = offlinePackAttachment(plan);
    await interaction.editReply({
      content: offlinePackMessage(plan, offlinePack.fileName),
      files: [offlinePack.attachment],
      components: mobileComponents(),
    });
    return;
  }
  if (action === "safety-pack-markdown") {
    const safetyPackMarkdown = [
      `# 여행 안전팩 - ${plan.destination || `플랜 #${plan.id}`}`,
      "",
      "## 비상 카드",
      buildEmergencyCard(plan),
      "",
      "## 지도 링크",
      mapLinksMessage(plan),
      "",
      "## 출발 브리핑",
      buildDepartureBriefing(plan),
      "",
      "## 체크리스트",
      buildChecklistText(plan),
      "",
      "## 개인 메모",
      String(plan.personalNote || "").trim() || "저장된 개인 메모가 없습니다.",
      "",
      "## 메모 공유문",
      buildMemoShareText(plan),
    ].join("\n");
    await replyWithMarkdownAttachment(interaction, safetyPackMarkdown, planMarkdownFileName(plan, "-safety-pack"), planMarkdownMessage(plan, "안전팩"));
    return;
  }
  if (action === "recap-markdown") {
    await replyWithMarkdownAttachment(interaction, buildTripRecap(plan), planMarkdownFileName(plan, "-recap"), planMarkdownMessage(plan, "회고"));
    return;
  }
  if (action === "share") {
    await interaction.editReply({
      content: truncateText(buildShareText(plan)),
      components: mobileComponents(),
    });
    return;
  }
  if (action === "markdown") {
    await replyWithMarkdownAttachment(interaction, buildPlanMarkdown(plan), planMarkdownFileName(plan), planMarkdownMessage(plan));
    return;
  }
  if (action === "calendar") {
    const attachment = new AttachmentBuilder(Buffer.from(buildPlanCalendar(plan), "utf-8"), {
      name: `travel-plan-${plan.id}.ics`,
    });
    await interaction.editReply({
      content: `플랜 #${plan.id} ${plan.destination || "여행"} 캘린더 파일입니다.`,
      files: [attachment],
      components: mobileComponents(),
    });
    return;
  }
  await interaction.editReply("지원하지 않는 모바일 액션입니다.");
}

async function handleMine(interaction) {
  await interaction.deferReply({ ephemeral: true });
  const limit = interaction.options.getInteger("limit") || 10;
  const plans = await listPlansByDiscordUser(interaction.user.id, limit, DB_PATH);
  if (plans.length === 0) {
    await interaction.editReply("내가 만든 플랜이 없습니다. 먼저 /quick 또는 /plan으로 플랜을 만들어주세요.");
    return;
  }
  const lines = plans.map((plan) => planListLine(plan));
  await interaction.editReply({
    content: truncateText(lines.join("\n")),
    components: mineComponents(plans, interaction.user.id),
  });
}

async function handlePinned(interaction) {
  await interaction.deferReply({ ephemeral: true });
  const limit = interaction.options.getInteger("limit") || 10;
  const plans = await listPinnedPlansByDiscordUser(interaction.user.id, limit, DB_PATH);
  if (plans.length === 0) {
    await interaction.editReply("고정한 플랜이 없습니다. 플랜 응답 아래의 `고정` 버튼을 눌러 저장해둘 수 있습니다.");
    return;
  }
  const lines = plans.map((plan) => planListLine(plan));
  await interaction.editReply({
    content: truncateText(lines.join("\n")),
    components: mineComponents(plans, interaction.user.id),
  });
}

async function handleUpcoming(interaction) {
  await interaction.deferReply({ ephemeral: true });
  const limit = interaction.options.getInteger("limit") || 10;
  const plans = await listPlansByDiscordUser(interaction.user.id, limit, DB_PATH, "upcoming");
  if (plans.length === 0) {
    await interaction.editReply("예정된 플랜이 없습니다.");
    return;
  }
  const lines = plans.map((plan) => planListLine(plan));
  await interaction.editReply({
    content: truncateText(lines.join("\n")),
    components: mineComponents(plans, interaction.user.id),
  });
}

async function handleQuality(interaction) {
  await interaction.deferReply({ ephemeral: true });
  await replyWithQualityList(interaction, "quality", interaction.options.getInteger("limit") || 10);
}

async function handleQualityTodo(interaction) {
  await interaction.deferReply({ ephemeral: true });
  const urgent = interaction.options.getBoolean("urgent") || false;
  const next = interaction.options.getBoolean("next") || false;
  const limit = interaction.options.getInteger("limit") || 10;
  const minPriorityOption = interaction.options.getInteger("min_priority") || 0;
  const summary = next ? await getPlanQualitySummary(DB_PATH, { discordUserId: interaction.user.id }) : {};
  const filter = urgent ? "quality-action" : next ? String(summary.qualityNextFilter || "quality-action").trim() || "quality-action" : "quality-action";
  await replyWithQualityList(interaction, filter, limit, {
    minPriority: minPriorityOption || (urgent || filter === "quality-urgent" ? 80 : 0),
  });
}

async function handleQualityUrgent(interaction) {
  await interaction.deferReply({ ephemeral: true });
  await replyWithQualityList(interaction, "quality-urgent", interaction.options.getInteger("limit") || 10);
}

async function handleQualityBrief(interaction) {
  await interaction.deferReply({ ephemeral: true });
  const limit = interaction.options.getInteger("limit") || 5;
  const urgent = interaction.options.getBoolean("urgent") || false;
  const next = interaction.options.getBoolean("next") || false;
  const minPriorityOption = interaction.options.getInteger("min_priority") || 0;
  const summary = await getPlanQualitySummary(DB_PATH, { discordUserId: interaction.user.id });
  const filter = urgent ? "quality-action" : next ? String(summary.qualityNextFilter || "quality-action").trim() || "quality-action" : "quality-action";
  const minPriority = minPriorityOption || (urgent || filter === "quality-urgent" ? 80 : 0);
  const topPlan = await findTopQualityPlan(interaction.user.id, summary);
  const candidatePlans = await listPlansByDiscordUser(interaction.user.id, limit, DB_PATH, filter);
  const todoTopPlan = next ? candidatePlans[0] || topPlan : topPlan;
  await interaction.editReply({
    content: truncateText(qualityTodoBriefText(summary, todoTopPlan, candidatePlans, qualityTodoFilterOptions(filter, minPriority > 0 ? { minPriority, urgent } : { urgent }))),
    components: qualityStatusComponents(summary, todoTopPlan),
  });
}

async function handleQualityOk(interaction) {
  await interaction.deferReply({ ephemeral: true });
  await replyWithQualityList(interaction, "quality-ok", interaction.options.getInteger("limit") || 10);
}

async function handleQualityUnaudited(interaction) {
  await interaction.deferReply({ ephemeral: true });
  await replyWithQualityList(interaction, "quality-unaudited", interaction.options.getInteger("limit") || 10);
}

async function handleQualityStatus(interaction) {
  await interaction.deferReply({ ephemeral: true });
  const summary = await getPlanQualitySummary(DB_PATH, { discordUserId: interaction.user.id });
  const topPlan = await findTopQualityPlan(interaction.user.id, summary);
  const nextAction = summary.qualityNextReason || (summary.qualityRegression > 0
    ? "최우선 악화 보강 버튼이나 /qualityworse로 악화된 플랜부터 확인하세요."
    : summary.quality > 0
    ? "최우선 품질 보강 버튼이나 /qualitytodo로 고도화 후보를 확인하세요."
    : summary.qualityUnaudited > 0
    ? "품질 점검 생성 버튼이나 /qualitytodo로 오래된 플랜을 먼저 확인하세요."
    : "현재 품질 보강이 필요한 내 플랜은 없습니다.");
  await interaction.editReply({ content: [
    "내 플랜 품질 요약",
    `- 고도화 후보: ${summary.qualityAction}`,
    `- 긴급 후보: ${summary.qualityUrgent}`,
    `- 품질 확인: ${summary.quality}`,
    `- 품질 악화: ${summary.qualityRegression}`,
    `- 품질 개선: ${summary.qualityImproved}`,
    qualityOkLine(summary),
    qualityUnauditedLine(summary),
    qualityActionBreakdownLine(summary),
    qualityWarningFocusLine(summary),
    qualityTargetLine(topPlan, summary),
    `다음 액션: ${nextAction}`,
    summary.qualityNextApiPath ? `- 다음 목록 API: ${summary.qualityNextApiPath}` : "",
    summary.qualityNextTodoTextPath ? `- 다음 TODO text: ${summary.qualityNextTodoTextPath}` : "",
    summary.qualityGatesPath ? `- 게이트 매트릭스 API: ${summary.qualityGatesPath}` : "",
    summary.qualityGatesTextPath ? `- 게이트 매트릭스 text: ${summary.qualityGatesTextPath}` : "",
    summary.qualityGatesCsvPath ? `- 게이트 매트릭스 CSV: ${summary.qualityGatesCsvPath}` : "",
    summary.qualityGatesCsvGatePath ? `- 게이트 매트릭스 CSV 게이트: ${summary.qualityGatesCsvGatePath}` : "",
    summary.qualityGatesReportPath ? `- 게이트 Markdown 리포트: ${summary.qualityGatesReportPath}` : "",
    summary.qualityGatesReportGatePath ? `- 게이트 Markdown 리포트 게이트: ${summary.qualityGatesReportGatePath}` : "",
    summary.qualityGatesMetricsPath ? `- 게이트 Metrics: ${summary.qualityGatesMetricsPath}` : "",
    summary.qualityGatesMetricsGatePath ? `- 게이트 Metrics 게이트: ${summary.qualityGatesMetricsGatePath}` : "",
    summary.qualityGatesEventsPath ? `- 게이트 Events: ${summary.qualityGatesEventsPath}` : "",
    summary.qualityGatesEventsGatePath ? `- 게이트 Events 게이트: ${summary.qualityGatesEventsGatePath}` : "",
    summary.qualityGatesAlertPath ? `- 게이트 Alert JSON: ${summary.qualityGatesAlertPath}` : "",
    summary.qualityGatesAlertGatePath ? `- 게이트 Alert JSON 게이트: ${summary.qualityGatesAlertGatePath}` : "",
    summary.qualityGatesHealthPath ? `- 게이트 Health: ${summary.qualityGatesHealthPath}` : "",
    summary.qualityGatesRemediationPath ? `- 게이트 Runbook: ${summary.qualityGatesRemediationPath}` : "",
    summary.qualityGatesRemediationGatePath ? `- 게이트 Runbook 게이트: ${summary.qualityGatesRemediationGatePath}` : "",
    summary.qualityGatesBadgePath ? `- 게이트 배지 JSON: ${summary.qualityGatesBadgePath}` : "",
    summary.qualityGatesBadgeSvgPath ? `- 게이트 배지 SVG: ${summary.qualityGatesBadgeSvgPath}` : "",
    summary.qualityGatesBadgeMarkdownPath ? `- 게이트 배지 Markdown: ${summary.qualityGatesBadgeMarkdownPath}` : "",
    summary.qualityGatesJunitPath ? `- 게이트 JUnit XML: ${summary.qualityGatesJunitPath}` : "",
    summary.qualityGatesJunitGatePath ? `- 게이트 JUnit XML 게이트: ${summary.qualityGatesJunitGatePath}` : "",
    summary.qualityGatesSarifPath ? `- 게이트 SARIF JSON: ${summary.qualityGatesSarifPath}` : "",
    summary.qualityGatesSarifGatePath ? `- 게이트 SARIF JSON 게이트: ${summary.qualityGatesSarifGatePath}` : "",
    summary.qualityGatesStepSummaryPath ? `- 게이트 Step Summary: ${summary.qualityGatesStepSummaryPath}` : "",
    summary.qualityGatesStepSummaryGatePath ? `- 게이트 Step Summary 게이트: ${summary.qualityGatesStepSummaryGatePath}` : "",
    summary.qualityGatesAnnotationsPath ? `- 게이트 Annotations: ${summary.qualityGatesAnnotationsPath}` : "",
    summary.qualityGatesAnnotationsGatePath ? `- 게이트 Annotations 게이트: ${summary.qualityGatesAnnotationsGatePath}` : "",
    summary.qualityGatesOutputsPath ? `- 게이트 Outputs: ${summary.qualityGatesOutputsPath}` : "",
    summary.qualityGatesOutputsGatePath ? `- 게이트 Outputs 게이트: ${summary.qualityGatesOutputsGatePath}` : "",
    summary.qualityGatesPrCommentPath ? `- 게이트 PR Comment: ${summary.qualityGatesPrCommentPath}` : "",
    summary.qualityGatesPrCommentGatePath ? `- 게이트 PR Comment 게이트: ${summary.qualityGatesPrCommentGatePath}` : "",
    summary.qualityGatesArtifactsPath ? `- 게이트 Artifacts JSON: ${summary.qualityGatesArtifactsPath}` : "",
    summary.qualityGatesArtifactsGatePath ? `- 게이트 Artifacts JSON 게이트: ${summary.qualityGatesArtifactsGatePath}` : "",
    summary.qualityGatesCiGuidePath ? `- CI 가이드 Markdown: ${summary.qualityGatesCiGuidePath}` : "",
    summary.qualityGatesCiGuideGatePath ? `- CI 가이드 게이트 Markdown: ${summary.qualityGatesCiGuideGatePath}` : "",
    summary.qualityGatesCommandsPath ? `- CI 명령 묶음 JSON: ${summary.qualityGatesCommandsPath}` : "",
    summary.qualityGatesCommandsTextPath ? `- CI 명령 묶음 text: ${summary.qualityGatesCommandsTextPath}` : "",
    summary.qualityGatesGatePath ? `- CI 게이트 매트릭스 API: ${summary.qualityGatesGatePath}` : "",
    summary.qualityGatesGateTextPath ? `- CI 게이트 매트릭스 text: ${summary.qualityGatesGateTextPath}` : "",
    summary.qualityGatesCommandsGatePath ? `- CI 명령 게이트 JSON: ${summary.qualityGatesCommandsGatePath}` : "",
    summary.qualityGatesCommandsGateTextPath ? `- CI 명령 게이트 text: ${summary.qualityGatesCommandsGateTextPath}` : "",
    summary.qualityGatesGateCurlCommand ? `- CI 게이트 명령: ${summary.qualityGatesGateCurlCommand}` : "",
    summary.qualityGatesGateJsonCurlCommand ? `- CI 게이트 JSON 명령: ${summary.qualityGatesGateJsonCurlCommand}` : "",
    summary.qualityGatesCsvGateCurlCommand ? `- CI 게이트 CSV 명령: ${summary.qualityGatesCsvGateCurlCommand}` : "",
    summary.qualityGatesReportGateCurlCommand ? `- CI 게이트 리포트 명령: ${summary.qualityGatesReportGateCurlCommand}` : "",
    summary.qualityGatesMetricsGateCurlCommand ? `- CI 게이트 Metrics 명령: ${summary.qualityGatesMetricsGateCurlCommand}` : "",
    summary.qualityGatesEventsGateCurlCommand ? `- CI 게이트 Events 명령: ${summary.qualityGatesEventsGateCurlCommand}` : "",
    summary.qualityGatesAlertGateCurlCommand ? `- CI 게이트 Alert 명령: ${summary.qualityGatesAlertGateCurlCommand}` : "",
    summary.qualityGatesHealthCurlCommand ? `- Health 명령: ${summary.qualityGatesHealthCurlCommand}` : "",
    summary.qualityGatesRemediationGateCurlCommand ? `- CI 게이트 Runbook 명령: ${summary.qualityGatesRemediationGateCurlCommand}` : "",
    summary.qualityGatesGateNpmCommand ? `- npm CI 명령: ${summary.qualityGatesGateNpmCommand}` : "",
    summary.qualityGatesGateJsonNpmCommand ? `- npm CI JSON 명령: ${summary.qualityGatesGateJsonNpmCommand}` : "",
    summary.qualityGatesCsvGateNpmCommand ? `- npm CSV 명령: ${summary.qualityGatesCsvGateNpmCommand}` : "",
    summary.qualityGatesReportGateNpmCommand ? `- npm Report 명령: ${summary.qualityGatesReportGateNpmCommand}` : "",
    summary.qualityGatesMetricsGateNpmCommand ? `- npm Metrics 명령: ${summary.qualityGatesMetricsGateNpmCommand}` : "",
    summary.qualityGatesEventsGateNpmCommand ? `- npm Events 명령: ${summary.qualityGatesEventsGateNpmCommand}` : "",
    summary.qualityGatesAlertGateNpmCommand ? `- npm Alert 명령: ${summary.qualityGatesAlertGateNpmCommand}` : "",
    summary.qualityGatesHealthNpmCommand ? `- npm Health 명령: ${summary.qualityGatesHealthNpmCommand}` : "",
    summary.qualityGatesRemediationGateNpmCommand ? `- npm Runbook 명령: ${summary.qualityGatesRemediationGateNpmCommand}` : "",
    summary.qualityGatesCiGuideGateNpmCommand ? `- npm CI 가이드 명령: ${summary.qualityGatesCiGuideGateNpmCommand}` : "",
    summary.qualityGatesJunitGateNpmCommand ? `- npm JUnit XML 명령: ${summary.qualityGatesJunitGateNpmCommand}` : "",
    summary.qualityGatesSarifGateNpmCommand ? `- npm SARIF 명령: ${summary.qualityGatesSarifGateNpmCommand}` : "",
    summary.qualityGatesStepSummaryGateNpmCommand ? `- npm Step Summary 명령: ${summary.qualityGatesStepSummaryGateNpmCommand}` : "",
    summary.qualityGatesAnnotationsGateNpmCommand ? `- npm Annotations 명령: ${summary.qualityGatesAnnotationsGateNpmCommand}` : "",
    summary.qualityGatesOutputsGateNpmCommand ? `- npm Outputs 명령: ${summary.qualityGatesOutputsGateNpmCommand}` : "",
    summary.qualityGatesPrCommentGateNpmCommand ? `- npm PR Comment 명령: ${summary.qualityGatesPrCommentGateNpmCommand}` : "",
    summary.qualityGatesArtifactsGateNpmCommand ? `- npm Artifacts 명령: ${summary.qualityGatesArtifactsGateNpmCommand}` : "",
    summary.qualityGatesGateCommandBundle ? `- CI 게이트 명령 묶음:\n${summary.qualityGatesGateCommandBundle}` : "",
    summary.qualityGatesGateLocalShellPath ? `- 로컬 shell 예시 경로: ${summary.qualityGatesGateLocalShellPath}` : "",
    summary.qualityGatesGateGithubActionsPath ? `- GitHub Actions 예시 경로: ${summary.qualityGatesGateGithubActionsPath}` : "",
    summary.qualityGatesGateLocalShellExample ? `- 로컬 shell 예시:\n${summary.qualityGatesGateLocalShellExample}` : "",
    summary.qualityGatesGateGithubActionsExample ? `- GitHub Actions 예시:\n${summary.qualityGatesGateGithubActionsExample}` : "",
    summary.qualityGatePath ? `- 품질 게이트 API: ${summary.qualityGatePath}` : "",
    summary.qualityGateTextPath ? `- 품질 게이트 text: ${summary.qualityGateTextPath}` : "",
    summary.qualitySoftGatePath ? `- 완화 게이트 API: ${summary.qualitySoftGatePath}` : "",
    summary.qualitySoftGateTextPath ? `- 완화 게이트 text: ${summary.qualitySoftGateTextPath}` : "",
    summary.qualityUrgentGatePath ? `- 긴급 게이트 API: ${summary.qualityUrgentGatePath}` : "",
    summary.qualityUrgentGateTextPath ? `- 긴급 게이트 text: ${summary.qualityUrgentGateTextPath}` : "",
    summary.qualityUrgentSoftGatePath ? `- 긴급 완화 API: ${summary.qualityUrgentSoftGatePath}` : "",
    summary.qualityUrgentSoftGateTextPath ? `- 긴급 완화 text: ${summary.qualityUrgentSoftGateTextPath}` : "",
    summary.qualityNextGatePath ? `- 다음 게이트 API: ${summary.qualityNextGatePath}` : "",
    summary.qualityNextGateTextPath ? `- 다음 게이트 text: ${summary.qualityNextGateTextPath}` : "",
    summary.qualityNextSoftGatePath ? `- 다음 완화 API: ${summary.qualityNextSoftGatePath}` : "",
    summary.qualityNextSoftGateTextPath ? `- 다음 완화 text: ${summary.qualityNextSoftGateTextPath}` : "",
  ].filter(Boolean).join("\n"), components: qualityStatusComponents(summary, topPlan) });
}

async function buildQualityGateReply(discordUserId, options = {}) {
  const urgent = Boolean(options.urgent);
  const next = Boolean(options.next);
  const maxActions = Number.isFinite(Number(options.maxActions)) ? Math.max(0, Math.min(100, Math.floor(Number(options.maxActions)))) : 0;
  const minPriorityOption = Number.isFinite(Number(options.minPriority)) ? Math.max(0, Math.min(100, Math.floor(Number(options.minPriority)))) : 0;
  const summary = await getPlanQualitySummary(DB_PATH, { discordUserId });
  const filter = urgent ? "quality-action" : next ? String(summary.qualityNextFilter || "quality-action").trim() || "quality-action" : "quality-action";
  const minPriority = minPriorityOption || (urgent || filter === "quality-urgent" ? 80 : 0);
  const listFilter = filter === "quality-urgent" ? "quality-action" : filter;
  const candidatePlans = (await listPlansByDiscordUser(discordUserId, 5000, DB_PATH, listFilter))
    .filter((plan) => minPriority <= 0 || Number(plan.qualityActionPriority || 0) >= minPriority);
  const count = candidatePlans.length;
  const passed = count <= maxActions;
  const topPlan = candidatePlans[0] || await findTopQualityPlan(discordUserId, summary);
  const filterOptions = qualityTodoFilterOptions(filter, { minPriority, urgent });
  const filterLabel = filterOptions.filterLabel || "고도화 후보";
  return {
    content: truncateText([
      passed ? "품질 게이트 통과" : "품질 게이트 실패",
      `- 기준: ${filterLabel}${minPriority > 0 ? ` · 우선도 ${minPriority} 이상` : ""}`,
      `- 후보: ${count}개 / 허용 ${maxActions}개`,
      `- 상태: ${passed ? "통과" : "실패"}`,
      passed ? "" : `- 다음 액션: ${next ? "/qualitybrief next:true" : urgent || minPriority >= 80 ? "/qualitybrief urgent:true" : "/qualitybrief"}로 상위 후보를 묶어 보강하세요.`,
      topPlan?.id ? qualityTargetLine(topPlan, summary) : "",
    ].filter(Boolean).join("\n")),
    summary,
    topPlan,
  };
}

function qualityGateMatrixLine(label, gate) {
  const lines = String(gate?.content || "").split("\n");
  const status = String(lines[0] || "품질 게이트 확인").replace(/^품질 게이트\s*/, "").trim();
  const basis = String(lines.find((line) => line.startsWith("- 기준:")) || "").replace("- 기준:", "").trim();
  const candidate = String(lines.find((line) => line.startsWith("- 후보:")) || "").replace("- 후보:", "").trim();
  return `- ${label}: ${status}${candidate ? ` · ${candidate}` : ""}${basis ? ` · ${basis}` : ""}`;
}

function qualityGateNextAction(gate) {
  return String(String(gate?.content || "").split("\n").find((line) => line.startsWith("- 다음 액션:")) || "")
    .replace("- 다음 액션:", "")
    .trim();
}

function appendQualityGateActions(lines, gates) {
  const actions = [];
  gates.forEach((gate) => {
    const action = qualityGateNextAction(gate);
    if (action && !actions.includes(action)) actions.push(action);
  });
  lines.push("", "추천 액션");
  if (actions.length) {
    lines.push(...actions.map((action) => `- ${action}`));
    return;
  }
  lines.push("- 모든 기준을 통과했습니다. 신규 플랜 생성이나 다음 고도화로 넘어가도 됩니다.");
}

function appendQualityGateCommands(lines, summary = {}) {
  const commands = Array.isArray(summary.qualityGatesGateCommands)
    ? summary.qualityGatesGateCommands
      .map((command) => command?.command ? `- ${command.label || command.key}: ${command.command}` : "")
      .filter(Boolean)
    : [
      summary.qualityGatesGateCurlCommand ? `- text: ${summary.qualityGatesGateCurlCommand}` : "",
      summary.qualityGatesGateJsonCurlCommand ? `- JSON: ${summary.qualityGatesGateJsonCurlCommand}` : "",
      summary.qualityGatesGateNpmCommand ? `- npm: ${summary.qualityGatesGateNpmCommand}` : "",
      summary.qualityGatesGateJsonNpmCommand ? `- npm JSON: ${summary.qualityGatesGateJsonNpmCommand}` : "",
    ].filter(Boolean);
  if (!commands.length) return;
  lines.push("", "CI 명령", ...commands);
  if (summary.qualityGatesGateCommandBundle) {
    lines.push("", "CI 명령 묶음", summary.qualityGatesGateCommandBundle);
  }
  if (summary.qualityGatesGateGithubActionsExample) {
    lines.push("", "GitHub Actions 예시", summary.qualityGatesGateGithubActionsExample);
  }
}

async function buildQualityGatesReply(discordUserId) {
  const [strictGate, softGate, urgentGate, urgentSoftGate] = await Promise.all([
    buildQualityGateReply(discordUserId, { maxActions: 0 }),
    buildQualityGateReply(discordUserId, { maxActions: 5 }),
    buildQualityGateReply(discordUserId, { maxActions: 0, urgent: true }),
    buildQualityGateReply(discordUserId, { maxActions: 5, urgent: true }),
  ]);
  const gates = [strictGate, softGate, urgentGate, urgentSoftGate];
  const lines = [
    "품질 게이트 매트릭스",
    qualityGateMatrixLine("전체 strict", strictGate),
    qualityGateMatrixLine("전체 완화 5", softGate),
    qualityGateMatrixLine("긴급 strict", urgentGate),
    qualityGateMatrixLine("긴급 완화 5", urgentSoftGate),
  ];
  if (strictGate.summary?.qualityNextFilter) {
    const [nextGate, nextSoftGate] = await Promise.all([
      buildQualityGateReply(discordUserId, { maxActions: 0, next: true }),
      buildQualityGateReply(discordUserId, { maxActions: 5, next: true }),
    ]);
    lines.push(
      qualityGateMatrixLine("다음 strict", nextGate),
      qualityGateMatrixLine("다음 완화 5", nextSoftGate)
    );
    gates.push(nextGate, nextSoftGate);
  }
  appendQualityGateActions(lines, gates);
  appendQualityGateCommands(lines, strictGate.summary);
  return {
    content: truncateText(lines.filter(Boolean).join("\n")),
    summary: strictGate.summary,
    topPlan: strictGate.topPlan,
  };
}

async function handleQualityGate(interaction) {
  await interaction.deferReply({ ephemeral: true });
  const gate = await buildQualityGateReply(interaction.user.id, {
    urgent: interaction.options.getBoolean("urgent") || false,
    next: interaction.options.getBoolean("next") || false,
    maxActions: interaction.options.getInteger("max_actions") ?? 0,
    minPriority: interaction.options.getInteger("min_priority") || 0,
  });
  await interaction.editReply({
    content: gate.content,
    components: qualityStatusComponents(gate.summary, gate.topPlan),
  });
}

async function handleQualityGates(interaction) {
  await interaction.deferReply({ ephemeral: true });
  const gates = await buildQualityGatesReply(interaction.user.id);
  await interaction.editReply({
    content: gates.content,
    components: qualityStatusComponents(gates.summary, gates.topPlan),
  });
}

async function handleQualityCommands(interaction) {
  await interaction.deferReply({ ephemeral: true });
  const summary = await getPlanQualitySummary(DB_PATH, { discordUserId: interaction.user.id });
  const matrix = buildQualityGateMatrix(summary);
  const gateLines = Array.isArray(matrix.gates)
    ? matrix.gates
      .map((gate) => `- ${gate.label || gate.key}: ${gate.failed ? "실패" : "통과"} · 후보 ${gate.count}개 / 허용 ${gate.limit}개`)
      .filter(Boolean)
    : [];
  const commandLines = Array.isArray(matrix.commands)
    ? matrix.commands
      .map((command) => command?.command ? `- ${command.label || command.key}: ${command.command}` : "")
      .filter(Boolean)
    : [];
  const commandBundle = String(matrix.commandBundle || summary.qualityGatesGateCommandBundle || "").trim();
  const ciExampleLines = Array.isArray(matrix.ciExamples)
    ? matrix.ciExamples
      .map((example) => example?.body ? `${example.label || example.key}${example.path ? ` (${example.path})` : example.filename ? ` (${example.filename})` : ""}\n${example.body}` : "")
      .filter(Boolean)
    : [];
  await interaction.editReply({
    content: truncateText([
      "품질 게이트 CI 명령",
      ...gateLines,
      summary.qualityGatesBadgePath ? `- badge JSON: ${summary.qualityGatesBadgePath}` : "",
      summary.qualityGatesCsvPath ? `- CSV: ${summary.qualityGatesCsvPath}` : "",
      summary.qualityGatesCsvGatePath ? `- CSV gate: ${summary.qualityGatesCsvGatePath}` : "",
      summary.qualityGatesReportPath ? `- Report: ${summary.qualityGatesReportPath}` : "",
      summary.qualityGatesReportGatePath ? `- Report gate: ${summary.qualityGatesReportGatePath}` : "",
      summary.qualityGatesMetricsPath ? `- Metrics: ${summary.qualityGatesMetricsPath}` : "",
      summary.qualityGatesMetricsGatePath ? `- Metrics gate: ${summary.qualityGatesMetricsGatePath}` : "",
      summary.qualityGatesEventsPath ? `- Events: ${summary.qualityGatesEventsPath}` : "",
      summary.qualityGatesEventsGatePath ? `- Events gate: ${summary.qualityGatesEventsGatePath}` : "",
      summary.qualityGatesAlertPath ? `- Alert JSON: ${summary.qualityGatesAlertPath}` : "",
      summary.qualityGatesAlertGatePath ? `- Alert JSON gate: ${summary.qualityGatesAlertGatePath}` : "",
      summary.qualityGatesHealthPath ? `- Health: ${summary.qualityGatesHealthPath}` : "",
      summary.qualityGatesRemediationPath ? `- Runbook: ${summary.qualityGatesRemediationPath}` : "",
      summary.qualityGatesRemediationGatePath ? `- Runbook gate: ${summary.qualityGatesRemediationGatePath}` : "",
      summary.qualityGatesBadgeSvgPath ? `- badge SVG: ${summary.qualityGatesBadgeSvgPath}` : "",
      summary.qualityGatesBadgeMarkdownPath ? `- badge Markdown: ${summary.qualityGatesBadgeMarkdownPath}` : "",
      summary.qualityGatesJunitPath ? `- JUnit XML: ${summary.qualityGatesJunitPath}` : "",
      summary.qualityGatesJunitGatePath ? `- JUnit XML gate: ${summary.qualityGatesJunitGatePath}` : "",
      summary.qualityGatesSarifPath ? `- SARIF JSON: ${summary.qualityGatesSarifPath}` : "",
      summary.qualityGatesSarifGatePath ? `- SARIF JSON gate: ${summary.qualityGatesSarifGatePath}` : "",
      summary.qualityGatesStepSummaryPath ? `- Step Summary: ${summary.qualityGatesStepSummaryPath}` : "",
      summary.qualityGatesStepSummaryGatePath ? `- Step Summary gate: ${summary.qualityGatesStepSummaryGatePath}` : "",
      summary.qualityGatesAnnotationsPath ? `- Annotations: ${summary.qualityGatesAnnotationsPath}` : "",
      summary.qualityGatesAnnotationsGatePath ? `- Annotations gate: ${summary.qualityGatesAnnotationsGatePath}` : "",
      summary.qualityGatesOutputsPath ? `- Outputs: ${summary.qualityGatesOutputsPath}` : "",
      summary.qualityGatesOutputsGatePath ? `- Outputs gate: ${summary.qualityGatesOutputsGatePath}` : "",
      summary.qualityGatesPrCommentPath ? `- PR Comment: ${summary.qualityGatesPrCommentPath}` : "",
      summary.qualityGatesPrCommentGatePath ? `- PR Comment gate: ${summary.qualityGatesPrCommentGatePath}` : "",
      summary.qualityGatesArtifactsPath ? `- Artifacts JSON: ${summary.qualityGatesArtifactsPath}` : "",
      summary.qualityGatesArtifactsGatePath ? `- Artifacts JSON gate: ${summary.qualityGatesArtifactsGatePath}` : "",
      summary.qualityGatesCiGuidePath ? `- CI guide: ${summary.qualityGatesCiGuidePath}` : "",
      summary.qualityGatesCiGuideGatePath ? `- CI guide gate: ${summary.qualityGatesCiGuideGatePath}` : "",
      summary.qualityGatesCommandsPath ? `- JSON: ${summary.qualityGatesCommandsPath}` : "",
      summary.qualityGatesCommandsTextPath ? `- text: ${summary.qualityGatesCommandsTextPath}` : "",
      summary.qualityGatesCommandsGatePath ? `- gate JSON: ${summary.qualityGatesCommandsGatePath}` : "",
      summary.qualityGatesCommandsGateTextPath ? `- gate text: ${summary.qualityGatesCommandsGateTextPath}` : "",
      commandLines.length ? ["", "명령 목록", ...commandLines].join("\n") : "",
      commandBundle ? ["", "명령 묶음", commandBundle].join("\n") : "",
      ciExampleLines.length ? ["", "CI 예시", ...ciExampleLines].join("\n\n") : "",
    ].filter(Boolean).join("\n")),
  });
}

async function handleQualityGateButton(interaction) {
  const [, maxActions = "0", mode = ""] = interaction.customId.split(":");
  await interaction.deferUpdate();
  const gate = await buildQualityGateReply(interaction.user.id, {
    maxActions: Number(maxActions),
    next: mode === "next",
    urgent: mode === "urgent",
  });
  await interaction.editReply({
    content: gate.content,
    components: qualityStatusComponents(gate.summary, gate.topPlan),
  });
}

async function handleQualityWorse(interaction) {
  await interaction.deferReply({ ephemeral: true });
  await replyWithQualityList(interaction, "quality-regression", interaction.options.getInteger("limit") || 10);
}

async function handleQualityBetter(interaction) {
  await interaction.deferReply({ ephemeral: true });
  await replyWithQualityList(interaction, "quality-improved", interaction.options.getInteger("limit") || 10);
}

function qualityListConfig(filter) {
  return {
    "quality-action": {
      title: "고도화 후보 플랜",
      empty: "지금 고도화할 품질 후보 플랜이 없습니다.",
    },
    "quality-urgent": {
      title: "긴급 품질 후보 플랜",
      empty: "우선도 80 이상 긴급 품질 후보 플랜이 없습니다.",
    },
    quality: {
      title: "품질 확인 플랜",
      empty: "자동 품질 점검에서 보강이 필요한 플랜이 없습니다.",
    },
    "quality-regression": {
      title: "품질 악화 플랜",
      empty: "직전 버전보다 품질 확인 항목이 늘어난 플랜이 없습니다.",
    },
    "quality-improved": {
      title: "품질 개선 플랜",
      empty: "직전 버전보다 품질 확인 항목이 줄어든 플랜이 없습니다.",
    },
    "quality-ok": {
      title: "품질 OK 플랜",
      empty: "자동 품질 점검이 모두 OK인 플랜이 없습니다.",
    },
    "quality-unaudited": {
      title: "품질 미점검 플랜",
      empty: "자동 품질 점검이 아직 없는 플랜이 없습니다.",
    },
  }[filter] || null;
}

function qualityTodoFilterOptions(filter, options = {}) {
  const config = qualityListConfig(filter);
  const minPriority = Number.isFinite(Number(options.minPriority)) ? Math.max(0, Math.floor(Number(options.minPriority))) : 0;
  const urgent = Boolean(options.urgent) || filter === "quality-urgent";
  return {
    ...options,
    minPriority: urgent ? Math.max(80, minPriority) : minPriority,
    filterLabel: String(options.filterLabel || (urgent ? "긴급 후보" : config?.title || "")).replace(/\s*플랜$/, ""),
  };
}

function hasQualityTodoBundle(filter) {
  return ["quality-action", "quality-urgent", "quality", "quality-regression", "quality-unaudited"].includes(filter);
}

function qualityButtonLabel(label, count) {
  const value = Number(count);
  return Number.isFinite(value) ? `${label} ${value}` : label;
}

function disableWhenEmpty(button, count) {
  const value = Number(count);
  return button.setDisabled(Number.isFinite(value) && value <= 0);
}

async function findTopQualityPlan(discordUserId, summary = {}) {
  const filter = String(summary.qualityNextFilter || "").trim() || (Number(summary.qualityUrgent) > 0
    ? "quality-urgent"
    : Number(summary.qualityRegression) > 0
    ? "quality-regression"
    : Number(summary.quality) > 0
    ? "quality"
    : Number(summary.qualityUnaudited) > 0
    ? "quality-unaudited"
    : "");
  if (!filter) return null;
  const plans = await listPlansByDiscordUser(discordUserId, 1, DB_PATH, filter);
  return plans[0] || null;
}

function qualityStatusComponents(summary = {}, topPlan = null, options = {}) {
  const listButtons = [
    disableWhenEmpty(
      new ButtonBuilder()
        .setCustomId("quality-list:quality-action")
        .setLabel(qualityButtonLabel("고도화 후보", summary.qualityAction))
        .setStyle(ButtonStyle.Primary),
      summary.qualityAction
    ),
    disableWhenEmpty(
      new ButtonBuilder()
        .setCustomId("quality-list:quality-urgent")
        .setLabel(qualityButtonLabel("긴급 후보", summary.qualityUrgent))
        .setStyle(ButtonStyle.Danger),
      summary.qualityUrgent
    ),
    disableWhenEmpty(
      new ButtonBuilder()
        .setCustomId("quality-list:quality")
        .setLabel(qualityButtonLabel("품질 확인", summary.quality))
        .setStyle(ButtonStyle.Secondary),
      summary.quality
    ),
    disableWhenEmpty(
      new ButtonBuilder()
        .setCustomId("quality-list:quality-ok")
        .setLabel(qualityButtonLabel("품질 OK", summary.qualityOk))
        .setStyle(ButtonStyle.Secondary),
      summary.qualityOk
    ),
    disableWhenEmpty(
      new ButtonBuilder()
        .setCustomId("quality-list:quality-unaudited")
        .setLabel(qualityButtonLabel("품질 미점검", summary.qualityUnaudited))
        .setStyle(ButtonStyle.Secondary),
      summary.qualityUnaudited
    ),
  ];
  const trendButtons = [
    disableWhenEmpty(
      new ButtonBuilder()
        .setCustomId("quality-list:quality-regression")
        .setLabel(qualityButtonLabel("품질 악화", summary.qualityRegression))
        .setStyle(ButtonStyle.Secondary),
      summary.qualityRegression
    ),
    disableWhenEmpty(
      new ButtonBuilder()
        .setCustomId("quality-list:quality-improved")
        .setLabel(qualityButtonLabel("품질 개선", summary.qualityImproved))
        .setStyle(ButtonStyle.Secondary),
      summary.qualityImproved
    ),
  ];
  const rows = [
    new ActionRowBuilder().addComponents(...listButtons),
    new ActionRowBuilder().addComponents(...trendButtons),
  ];
  const qualityFeedback = topPlan?.id ? buildQualityRefineFeedback(topPlan) : "";
  const actionMode = options.actionMode || (!qualityFeedback && topPlan?.id ? "quality-audit" : "quality");
  if (topPlan?.id && (qualityFeedback || actionMode === "quality-audit")) {
    const planButtons = [
      new ButtonBuilder()
        .setCustomId(`plan-refine:${topPlan.id}:${actionMode}`)
        .setLabel(actionMode === "quality-audit" ? "품질 점검 생성" : Number(summary.qualityUrgent) > 0 ? "최우선 긴급 보강" : Number(summary.qualityRegression) > 0 ? "최우선 악화 보강" : "최우선 품질 보강")
        .setStyle(ButtonStyle.Primary),
    ];
    if (qualityFeedback) {
      planButtons.push(
        new ButtonBuilder()
          .setCustomId(`quality-feedback:${topPlan.id}`)
          .setLabel("보강 요청 보기")
          .setStyle(ButtonStyle.Secondary)
      );
    }
    const todoButtons = [
      new ButtonBuilder()
        .setCustomId("quality-brief:3")
        .setLabel("TODO 3")
        .setStyle(ButtonStyle.Secondary),
      new ButtonBuilder()
        .setCustomId("quality-brief:5")
        .setLabel("TODO 5")
        .setStyle(ButtonStyle.Secondary),
      new ButtonBuilder()
        .setCustomId("quality-brief:10")
        .setLabel("TODO 10")
        .setStyle(ButtonStyle.Secondary),
      new ButtonBuilder()
        .setCustomId("quality-brief:10:urgent")
        .setLabel("긴급 TODO")
        .setStyle(ButtonStyle.Secondary),
      new ButtonBuilder()
        .setCustomId("quality-brief:10:next")
        .setLabel("다음 TODO")
        .setStyle(ButtonStyle.Secondary)
    ];
    rows.push(new ActionRowBuilder().addComponents(...planButtons));
    rows.push(new ActionRowBuilder().addComponents(...todoButtons));
  }
  if (options.showGateButtons !== false) {
    const gateButtons = [
      new ButtonBuilder()
        .setCustomId("quality-gate:0")
        .setLabel("게이트")
        .setStyle(ButtonStyle.Secondary),
      new ButtonBuilder()
        .setCustomId("quality-gate:5")
        .setLabel("완화 5")
        .setStyle(ButtonStyle.Secondary),
      new ButtonBuilder()
        .setCustomId("quality-gate:0:urgent")
        .setLabel("긴급 게이트")
        .setStyle(ButtonStyle.Secondary),
      new ButtonBuilder()
        .setCustomId("quality-gate:5:urgent")
        .setLabel("긴급 완화")
        .setStyle(ButtonStyle.Secondary)
    ];
    if (summary.qualityNextFilter) {
      gateButtons.push(
        new ButtonBuilder()
          .setCustomId("quality-gate:5:next")
          .setLabel("다음 완화")
          .setStyle(ButtonStyle.Secondary)
      );
    }
    rows.push(new ActionRowBuilder().addComponents(...gateButtons));
  }
  return rows;
}

async function replyWithQualityList(interaction, filter, limit = 10, options = {}) {
  const config = qualityListConfig(filter);
  if (!config) {
    await interaction.editReply("지원하지 않는 품질 목록입니다.");
    return;
  }
  const minPriority = Number.isFinite(Number(options.minPriority)) ? Math.max(0, Math.min(100, Math.floor(Number(options.minPriority)))) : 0;
  const plans = (await listPlansByDiscordUser(interaction.user.id, limit, DB_PATH, filter))
    .filter((plan) => minPriority <= 0 || Number(plan.qualityActionPriority || 0) >= minPriority);
  const summary = await getPlanQualitySummary(DB_PATH, { discordUserId: interaction.user.id });
  if (plans.length === 0) {
    await interaction.editReply({ content: minPriority > 0 ? `우선도 ${minPriority} 이상 품질 고도화 후보가 없습니다.` : config.empty, components: qualityStatusComponents(summary) });
    return;
  }
  const lines = plans.map((plan) => qualityPlanListLine(plan, filter));
  const topPlan = filter === "quality-action" || filter === "quality-urgent" || filter === "quality" || filter === "quality-regression" || filter === "quality-unaudited"
    ? plans[0]
    : await findTopQualityPlan(interaction.user.id, summary);
  const candidateLimit = Math.min(10, Math.max(1, Number(limit) || 5));
  const qualityTodo = hasQualityTodoBundle(filter) ? qualityTodoBriefText(summary, topPlan, plans.slice(0, candidateLimit), qualityTodoFilterOptions(filter, { minPriority })) : "";
  const body = [`${config.title}`, qualityTodo, lines.join("\n")].filter(Boolean).join("\n\n");
  await interaction.editReply({
    content: truncateText(body),
    components: [
      ...mineComponents(plans, interaction.user.id),
      ...qualityStatusComponents(summary, topPlan, { actionMode: filter === "quality-unaudited" || planNeedsQualityAudit(topPlan) ? "quality-audit" : "quality", showGateButtons: false }),
    ],
  });
}

async function handleQualityListButton(interaction) {
  const [, filter = "quality"] = interaction.customId.split(":");
  await interaction.deferUpdate();
  await replyWithQualityList(interaction, filter);
}

async function handleQualityBriefButton(interaction) {
  await interaction.deferUpdate();
  const [, limitValue, mode = ""] = interaction.customId.split(":");
  const limit = Number(limitValue || 5);
  const safeLimit = Number.isFinite(limit) ? Math.max(1, Math.min(10, Math.floor(limit))) : 5;
  const urgent = mode === "urgent";
  const next = mode === "next";
  const summary = await getPlanQualitySummary(DB_PATH, { discordUserId: interaction.user.id });
  const topPlan = await findTopQualityPlan(interaction.user.id, summary);
  const filter = next ? String(summary.qualityNextFilter || "quality-action").trim() || "quality-action" : "quality-action";
  const candidatePlans = await listPlansByDiscordUser(interaction.user.id, urgent || next ? 10 : safeLimit, DB_PATH, urgent ? "quality-action" : filter);
  const todoTopPlan = next ? candidatePlans[0] || topPlan : topPlan;
  await interaction.editReply({
    content: truncateText(qualityTodoBriefText(summary, todoTopPlan, candidatePlans, qualityTodoFilterOptions(filter, urgent || filter === "quality-urgent" ? { minPriority: 80, urgent } : { urgent }))),
    components: qualityStatusComponents(summary, todoTopPlan),
  });
}

async function handleQualityFeedbackButton(interaction) {
  const planId = Number(interaction.customId.split(":")[1]);
  const plan = await getPlan(planId, DB_PATH);
  if (!plan) {
    await interaction.reply({ content: `플랜 #${planId}을 찾지 못했습니다.`, ephemeral: true });
    return;
  }
  if (
    !(await ensurePlanOwner(
      interaction,
      plan,
      "이 플랜은 다른 사용자가 만든 플랜이라 품질 보강 요청을 볼 수 없습니다."
    ))
  ) {
    return;
  }
  const feedback = buildQualityRefineFeedback(plan);
  if (!feedback) {
    await interaction.reply({ content: "자동 품질 점검에서 보강이 필요한 항목이 없습니다.", ephemeral: true });
    return;
  }
  await interaction.reply({
    content: truncateText(`플랜 #${plan.id} ${plan.destination || "여행"} 품질 보강 요청\n${feedback}`),
    ephemeral: true,
    components: [
      new ActionRowBuilder().addComponents(
        new ButtonBuilder()
          .setCustomId(`plan-refine:${plan.id}:quality`)
          .setLabel("이 요청으로 보강")
          .setStyle(ButtonStyle.Primary)
      ),
    ],
  });
}

async function handleSearch(interaction) {
  await interaction.deferReply({ ephemeral: true });
  const query = interaction.options.getString("query", true);
  const limit = interaction.options.getInteger("limit") || 10;
  const plans = await searchPlans(query, limit, DB_PATH, interaction.user.id);
  if (plans.length === 0) {
    await interaction.editReply(`'${query}' 검색 결과가 없습니다.`);
    return;
  }
  const lines = plans.map((plan) => planListLine(plan));
  await interaction.editReply({
    content: truncateText(lines.join("\n")),
    components: mineComponents(plans, interaction.user.id),
  });
}

async function handleBackup(interaction) {
  await interaction.deferReply({ ephemeral: true });
  const backup = await exportPlansBackup(DB_PATH, { discordUserId: interaction.user.id });
  const stamp = backup.exportedAt.slice(0, 10);
  const attachment = new AttachmentBuilder(Buffer.from(JSON.stringify(backup, null, 2), "utf-8"), {
    name: `travel-planner-discord-backup-${stamp}.json`,
  });
  await interaction.editReply({
    content: `내 Discord 플랜 ${backup.plans.length}개를 백업했습니다.`,
    files: [attachment],
  });
}

async function resolveHistoryPlan(interaction) {
  const planId = interaction.options.getInteger("plan_id");
  if (planId) return getPlan(planId, DB_PATH);
  return findLatestPlanByDiscordUser(interaction.user.id, DB_PATH);
}

async function handleHistory(interaction) {
  await interaction.deferReply({ ephemeral: true });
  const plan = await resolveHistoryPlan(interaction);
  if (!plan) {
    await interaction.editReply("히스토리를 볼 플랜을 찾지 못했습니다. 먼저 /quick 또는 /plan으로 플랜을 만들어주세요.");
    return;
  }
  if (plan.discordUserId && plan.discordUserId !== interaction.user.id) {
    await interaction.editReply("이 플랜은 다른 사용자가 만든 플랜이라 히스토리를 볼 수 없습니다.");
    return;
  }

  await interaction.editReply(historyReply(plan, interaction.user.id));
}

async function resolveQuestionPlan(interaction) {
  const planId = interaction.options.getInteger("plan_id");
  if (planId) return getPlan(planId, DB_PATH);
  return findLatestPlanByDiscordUser(interaction.user.id, DB_PATH);
}

async function resolveTodayPlan(interaction) {
  const planId = interaction.options?.getInteger?.("plan_id");
  if (planId) return getPlan(planId, DB_PATH);
  return findLatestPlanByDiscordUser(interaction.user.id, DB_PATH);
}

async function resolveChecklistPlan(interaction) {
  const planId = interaction.options.getInteger("plan_id");
  if (planId) return getPlan(planId, DB_PATH);
  return findLatestPlanByDiscordUser(interaction.user.id, DB_PATH);
}

async function resolveEmergencyPlan(interaction) {
  const planId = interaction.options.getInteger("plan_id");
  if (planId) return getPlan(planId, DB_PATH);
  return findLatestPlanByDiscordUser(interaction.user.id, DB_PATH);
}

async function resolvePackingPlan(interaction) {
  const planId = interaction.options.getInteger("plan_id");
  if (planId) return getPlan(planId, DB_PATH);
  return findLatestPlanByDiscordUser(interaction.user.id, DB_PATH);
}

async function resolveDeparturePlan(interaction) {
  const planId = interaction.options.getInteger("plan_id");
  if (planId) return getPlan(planId, DB_PATH);
  return findLatestPlanByDiscordUser(interaction.user.id, DB_PATH);
}

async function resolveBudgetPlan(interaction) {
  const planId = interaction.options.getInteger("plan_id");
  if (planId) return getPlan(planId, DB_PATH);
  return findLatestPlanByDiscordUser(interaction.user.id, DB_PATH);
}

async function resolveSettlementPlan(interaction) {
  const planId = interaction.options.getInteger("plan_id");
  if (planId) return getPlan(planId, DB_PATH);
  return findLatestPlanByDiscordUser(interaction.user.id, DB_PATH);
}

async function resolveExpensePlan(interaction) {
  const planId = interaction.options.getInteger("plan_id");
  if (planId) return getPlan(planId, DB_PATH);
  return findLatestPlanByDiscordUser(interaction.user.id, DB_PATH);
}

async function resolveMapPlan(interaction) {
  const planId = interaction.options.getInteger("plan_id");
  if (planId) return getPlan(planId, DB_PATH);
  return findLatestPlanByDiscordUser(interaction.user.id, DB_PATH);
}

async function resolveWebPlan(interaction) {
  const planId = interaction.options.getInteger("plan_id");
  if (planId) return getPlan(planId, DB_PATH);
  return findLatestPlanByDiscordUser(interaction.user.id, DB_PATH);
}

async function resolveCalendarPlan(interaction) {
  const planId = interaction.options.getInteger("plan_id");
  if (planId) return getPlan(planId, DB_PATH);
  return findLatestPlanByDiscordUser(interaction.user.id, DB_PATH);
}

async function resolveExportPlan(interaction) {
  const planId = interaction.options?.getInteger?.("plan_id");
  if (planId) return getPlan(planId, DB_PATH);
  return findLatestPlanByDiscordUser(interaction.user.id, DB_PATH);
}

async function resolveSharePlan(interaction) {
  const planId = interaction.options.getInteger("plan_id");
  if (planId) return getPlan(planId, DB_PATH);
  return findLatestPlanByDiscordUser(interaction.user.id, DB_PATH);
}

async function resolveDuplicatePlan(interaction) {
  const planId = interaction.options.getInteger("plan_id");
  if (planId) return getPlan(planId, DB_PATH);
  return findLatestPlanByDiscordUser(interaction.user.id, DB_PATH);
}

async function resolveDayPlan(interaction) {
  const planId = interaction.options.getInteger("plan_id");
  if (planId) return getPlan(planId, DB_PATH);
  return findLatestPlanByDiscordUser(interaction.user.id, DB_PATH);
}

async function resolveDatePlan(interaction) {
  const planId = interaction.options.getInteger("plan_id");
  if (planId) return getPlan(planId, DB_PATH);
  return findLatestPlanByDiscordUser(interaction.user.id, DB_PATH);
}

function mapLinksMessage(plan) {
  const links = buildMapLinks(plan).map((link) => `- [${link.label}](${link.url})`);
  return `플랜 #${plan.id} ${plan.destination || "여행지"} 지도 링크\n${links.join("\n")}`;
}

function webLinkReply(plan) {
  const url = planWebUrl(plan);
  return {
    content: `플랜 #${plan.id} ${plan.destination || "여행"} 웹 상세\n${url}`,
    components: [
      new ActionRowBuilder().addComponents(
        new ButtonBuilder()
          .setLabel("웹 상세 열기")
          .setStyle(ButtonStyle.Link)
          .setURL(url)
      ),
    ],
  };
}

async function handleAsk(interaction) {
  await interaction.deferReply({ ephemeral: true });
  const question = interaction.options.getString("question", true);
  const plan = await resolveQuestionPlan(interaction);
  if (!plan) {
    await interaction.editReply("질문할 플랜을 찾지 못했습니다. 먼저 /quick 또는 /plan으로 플랜을 만들어주세요.");
    return;
  }
  if (plan.discordUserId && plan.discordUserId !== interaction.user.id) {
    await interaction.editReply("이 플랜은 다른 사용자가 만든 플랜이라 질문할 수 없습니다.");
    return;
  }
  const latest = latestRevision(plan);
  const result = await answerPlanQuestion(plan, latest?.planText, question);
  const error = result.error ? `\n\nLLM 오류: ${result.error}` : "";
  await interaction.editReply(truncateText(`${result.answer}${error}`));
}

async function handleChecklist(interaction) {
  await interaction.deferReply({ ephemeral: true });
  const plan = await resolveChecklistPlan(interaction);
  if (!plan) {
    await interaction.editReply("체크리스트를 만들 플랜을 찾지 못했습니다. 먼저 /quick 또는 /plan으로 플랜을 만들어주세요.");
    return;
  }
  if (plan.discordUserId && plan.discordUserId !== interaction.user.id) {
    await interaction.editReply("이 플랜은 다른 사용자가 만든 플랜이라 체크리스트를 볼 수 없습니다.");
    return;
  }
  await interaction.editReply(buildChecklistText(plan));
}

async function handleEmergency(interaction) {
  await interaction.deferReply({ ephemeral: true });
  const plan = await resolveEmergencyPlan(interaction);
  if (!plan) {
    await interaction.editReply("비상 카드를 만들 플랜을 찾지 못했습니다. 먼저 /quick 또는 /plan으로 플랜을 만들어주세요.");
    return;
  }
  if (plan.discordUserId && plan.discordUserId !== interaction.user.id) {
    await interaction.editReply("이 플랜은 다른 사용자가 만든 플랜이라 비상 카드를 볼 수 없습니다.");
    return;
  }
  await interaction.editReply(buildEmergencyCard(plan));
}

async function handlePacking(interaction) {
  await interaction.deferReply({ ephemeral: true });
  const plan = await resolvePackingPlan(interaction);
  if (!plan) {
    await interaction.editReply("짐싸기 목록을 만들 플랜을 찾지 못했습니다. 먼저 /quick 또는 /plan으로 플랜을 만들어주세요.");
    return;
  }
  if (plan.discordUserId && plan.discordUserId !== interaction.user.id) {
    await interaction.editReply("이 플랜은 다른 사용자가 만든 플랜이라 짐싸기 목록을 볼 수 없습니다.");
    return;
  }
  await interaction.editReply(buildPackingList(plan));
}

async function handleDeparture(interaction) {
  await interaction.deferReply({ ephemeral: true });
  const plan = await resolveDeparturePlan(interaction);
  if (!plan) {
    await interaction.editReply("출발 브리핑을 만들 플랜을 찾지 못했습니다. 먼저 /quick 또는 /plan으로 플랜을 만들어주세요.");
    return;
  }
  if (plan.discordUserId && plan.discordUserId !== interaction.user.id) {
    await interaction.editReply("이 플랜은 다른 사용자가 만든 플랜이라 출발 브리핑을 볼 수 없습니다.");
    return;
  }
  await interaction.editReply(buildDepartureBriefing(plan));
}

async function handleBudget(interaction) {
  await interaction.deferReply({ ephemeral: true });
  const plan = await resolveBudgetPlan(interaction);
  if (!plan) {
    await interaction.editReply("예산 브리핑을 만들 플랜을 찾지 못했습니다. 먼저 /quick 또는 /plan으로 플랜을 만들어주세요.");
    return;
  }
  if (plan.discordUserId && plan.discordUserId !== interaction.user.id) {
    await interaction.editReply("이 플랜은 다른 사용자가 만든 플랜이라 예산 브리핑을 볼 수 없습니다.");
    return;
  }
  await interaction.editReply(truncateText(buildBudgetBriefing(plan)));
}

async function handleCategoryBudgetButton(interaction) {
  await interaction.deferReply({ ephemeral: true });
  const planId = Number(interaction.customId.split(":")[1]);
  const plan = await getPlan(planId, DB_PATH);
  if (!plan) {
    await interaction.editReply("플랜을 찾지 못했습니다.");
    return;
  }
  if (plan.discordUserId && plan.discordUserId !== interaction.user.id) {
    await interaction.editReply("이 플랜은 다른 사용자가 만든 플랜이라 카테고리 예산을 볼 수 없습니다.");
    return;
  }
  await interaction.editReply(truncateText(buildCategoryBudgetStatus(plan)));
}

async function handleCategoryBudget(interaction) {
  await interaction.deferReply({ ephemeral: true });
  const plan = await resolveBudgetPlan(interaction);
  if (!plan) {
    await interaction.editReply("카테고리 예산을 볼 플랜을 찾지 못했습니다. 먼저 /quick 또는 /plan으로 플랜을 만들어주세요.");
    return;
  }
  if (plan.discordUserId && plan.discordUserId !== interaction.user.id) {
    await interaction.editReply("이 플랜은 다른 사용자가 만든 플랜이라 카테고리 예산을 볼 수 없습니다.");
    return;
  }
  await interaction.editReply(truncateText(buildCategoryBudgetStatus(plan)));
}

async function handleDailyBudgetButton(interaction) {
  await interaction.deferReply({ ephemeral: true });
  const planId = Number(interaction.customId.split(":")[1]);
  const plan = await getPlan(planId, DB_PATH);
  if (!plan) {
    await interaction.editReply("플랜을 찾지 못했습니다.");
    return;
  }
  if (plan.discordUserId && plan.discordUserId !== interaction.user.id) {
    await interaction.editReply("이 플랜은 다른 사용자가 만든 플랜이라 오늘 예산을 볼 수 없습니다.");
    return;
  }
  await interaction.editReply(truncateText(buildDailyBudgetStatus(plan)));
}

async function handleDailyBudget(interaction) {
  await interaction.deferReply({ ephemeral: true });
  const date = interaction.options.getString("date") || "";
  const plan = await resolveBudgetPlan(interaction);
  if (!plan) {
    await interaction.editReply("하루 예산을 볼 플랜을 찾지 못했습니다. 먼저 /quick 또는 /plan으로 플랜을 만들어주세요.");
    return;
  }
  if (plan.discordUserId && plan.discordUserId !== interaction.user.id) {
    await interaction.editReply("이 플랜은 다른 사용자가 만든 플랜이라 하루 예산을 볼 수 없습니다.");
    return;
  }
  await interaction.editReply(truncateText(buildDailyBudgetStatus(plan, date)));
}

async function handleBriefButton(interaction) {
  await interaction.deferReply({ ephemeral: true });
  const planId = Number(interaction.customId.split(":")[1]);
  const plan = await getPlan(planId, DB_PATH);
  if (!plan) {
    await interaction.editReply("플랜을 찾지 못했습니다.");
    return;
  }
  if (plan.discordUserId && plan.discordUserId !== interaction.user.id) {
    await interaction.editReply("이 플랜은 다른 사용자가 만든 플랜이라 브리핑을 볼 수 없습니다.");
    return;
  }
  await interaction.editReply(truncateText(buildDailyBriefing(plan)));
}

async function handleBrief(interaction) {
  await interaction.deferReply({ ephemeral: true });
  const date = interaction.options.getString("date") || "";
  const plan = await resolveTodayPlan(interaction);
  if (!plan) {
    await interaction.editReply("브리핑을 만들 플랜을 찾지 못했습니다. 먼저 /quick 또는 /plan으로 플랜을 만들어주세요.");
    return;
  }
  if (plan.discordUserId && plan.discordUserId !== interaction.user.id) {
    await interaction.editReply("이 플랜은 다른 사용자가 만든 플랜이라 브리핑을 볼 수 없습니다.");
    return;
  }
  await interaction.editReply(truncateText(buildDailyBriefing(plan, date)));
}

async function handleTodayCheckButton(interaction) {
  await interaction.deferReply({ ephemeral: true });
  const planId = Number(interaction.customId.split(":")[1]);
  const plan = await getPlan(planId, DB_PATH);
  if (!plan) {
    await interaction.editReply("플랜을 찾지 못했습니다.");
    return;
  }
  if (plan.discordUserId && plan.discordUserId !== interaction.user.id) {
    await interaction.editReply("이 플랜은 다른 사용자가 만든 플랜이라 오늘 점검표를 볼 수 없습니다.");
    return;
  }
  await interaction.editReply(truncateText(buildTodayChecklist(plan)));
}

async function handleTodayCheck(interaction) {
  await interaction.deferReply({ ephemeral: true });
  const date = interaction.options.getString("date") || "";
  const plan = await resolveTodayPlan(interaction);
  if (!plan) {
    await interaction.editReply("점검표를 만들 플랜을 찾지 못했습니다. 먼저 /quick 또는 /plan으로 플랜을 만들어주세요.");
    return;
  }
  if (plan.discordUserId && plan.discordUserId !== interaction.user.id) {
    await interaction.editReply("이 플랜은 다른 사용자가 만든 플랜이라 오늘 점검표를 볼 수 없습니다.");
    return;
  }
  await interaction.editReply(truncateText(buildTodayChecklist(plan, date)));
}

async function handleTomorrowButton(interaction) {
  await interaction.deferReply({ ephemeral: true });
  const planId = Number(interaction.customId.split(":")[1]);
  const plan = await getPlan(planId, DB_PATH);
  if (!plan) {
    await interaction.editReply("플랜을 찾지 못했습니다.");
    return;
  }
  if (plan.discordUserId && plan.discordUserId !== interaction.user.id) {
    await interaction.editReply("이 플랜은 다른 사용자가 만든 플랜이라 내일 브리핑을 볼 수 없습니다.");
    return;
  }
  await interaction.editReply(truncateText(buildTomorrowBriefing(plan)));
}

async function handleTomorrow(interaction) {
  await interaction.deferReply({ ephemeral: true });
  const plan = await resolveTodayPlan(interaction);
  if (!plan) {
    await interaction.editReply("내일 브리핑을 만들 플랜을 찾지 못했습니다. 먼저 /quick 또는 /plan으로 플랜을 만들어주세요.");
    return;
  }
  if (plan.discordUserId && plan.discordUserId !== interaction.user.id) {
    await interaction.editReply("이 플랜은 다른 사용자가 만든 플랜이라 내일 브리핑을 볼 수 없습니다.");
    return;
  }
  await interaction.editReply(truncateText(buildTomorrowBriefing(plan)));
}

async function handleDayShareButton(interaction) {
  await interaction.deferReply({ ephemeral: true });
  const planId = Number(interaction.customId.split(":")[1]);
  const plan = await getPlan(planId, DB_PATH);
  if (!plan) {
    await interaction.editReply("플랜을 찾지 못했습니다.");
    return;
  }
  if (plan.discordUserId && plan.discordUserId !== interaction.user.id) {
    await interaction.editReply("이 플랜은 다른 사용자가 만든 플랜이라 오늘 공유 요약을 볼 수 없습니다.");
    return;
  }
  await interaction.editReply(truncateText(buildDayShareText(plan)));
}

async function handleDayShare(interaction) {
  await interaction.deferReply({ ephemeral: true });
  const date = interaction.options.getString("date") || "";
  const plan = await resolveTodayPlan(interaction);
  if (!plan) {
    await interaction.editReply("공유 요약을 만들 플랜을 찾지 못했습니다. 먼저 /quick 또는 /plan으로 플랜을 만들어주세요.");
    return;
  }
  if (plan.discordUserId && plan.discordUserId !== interaction.user.id) {
    await interaction.editReply("이 플랜은 다른 사용자가 만든 플랜이라 오늘 공유 요약을 볼 수 없습니다.");
    return;
  }
  await interaction.editReply(truncateText(buildDayShareText(plan, date)));
}

async function handleRoutineSelect(interaction) {
  await interaction.deferReply({ ephemeral: true });
  const planId = Number(interaction.customId.split(":")[1]);
  const plan = await getPlan(planId, DB_PATH);
  if (!plan) {
    await interaction.editReply("플랜을 찾지 못했습니다.");
    return;
  }
  if (plan.discordUserId && plan.discordUserId !== interaction.user.id) {
    await interaction.editReply("이 플랜은 다른 사용자가 만든 플랜이라 루틴을 볼 수 없습니다.");
    return;
  }

  const value = interaction.values[0];
  const routines = {
    now: buildTripNow(plan),
    readiness: buildReadinessReport(plan),
    "prep-plan": buildReadinessActionPlan(plan),
    "readiness-share": buildReadinessShareText(plan),
    brief: buildDailyBriefing(plan),
    "today-check": buildTodayChecklist(plan),
    tomorrow: buildTomorrowBriefing(plan),
    "day-share": buildDayShareText(plan),
    "night-check": buildNightChecklist(plan),
    "daily-budget": buildDailyBudgetStatus(plan),
    memo: plan.personalNote
      ? `플랜 #${plan.id} 개인 메모\n\n${plan.personalNote}\n\n새 메모는 \`/memo plan_id:${plan.id} text:...\`로 추가할 수 있습니다.`
      : `플랜 #${plan.id}에 저장된 개인 메모가 없습니다.\n\n새 메모는 \`/memo plan_id:${plan.id} text:...\`로 추가할 수 있습니다.`,
    "next-action": buildNextAction(plan),
  };
  await interaction.editReply(truncateText(routines[value] || "지원하지 않는 루틴입니다."));
}

async function handleNightCheckButton(interaction) {
  await interaction.deferReply({ ephemeral: true });
  const planId = Number(interaction.customId.split(":")[1]);
  const plan = await getPlan(planId, DB_PATH);
  if (!plan) {
    await interaction.editReply("플랜을 찾지 못했습니다.");
    return;
  }
  if (plan.discordUserId && plan.discordUserId !== interaction.user.id) {
    await interaction.editReply("이 플랜은 다른 사용자가 만든 플랜이라 밤 점검표를 볼 수 없습니다.");
    return;
  }
  await interaction.editReply(truncateText(buildNightChecklist(plan)));
}

async function handleNightCheck(interaction) {
  await interaction.deferReply({ ephemeral: true });
  const date = interaction.options.getString("date") || "";
  const plan = await resolveTodayPlan(interaction);
  if (!plan) {
    await interaction.editReply("밤 점검표를 만들 플랜을 찾지 못했습니다. 먼저 /quick 또는 /plan으로 플랜을 만들어주세요.");
    return;
  }
  if (plan.discordUserId && plan.discordUserId !== interaction.user.id) {
    await interaction.editReply("이 플랜은 다른 사용자가 만든 플랜이라 밤 점검표를 볼 수 없습니다.");
    return;
  }
  await interaction.editReply(truncateText(buildNightChecklist(plan, date)));
}

async function handleSpending(interaction) {
  await interaction.deferReply({ ephemeral: true });
  const plan = await resolveBudgetPlan(interaction);
  if (!plan) {
    await interaction.editReply("예산 소진 현황을 볼 플랜을 찾지 못했습니다. 먼저 /quick 또는 /plan으로 플랜을 만들어주세요.");
    return;
  }
  if (plan.discordUserId && plan.discordUserId !== interaction.user.id) {
    await interaction.editReply("이 플랜은 다른 사용자가 만든 플랜이라 예산 소진 현황을 볼 수 없습니다.");
    return;
  }
  await interaction.editReply({
    content: truncateText(buildSpendingStatus(plan)),
    components: moneyFollowupComponents(plan),
  });
}

async function handleRecapButton(interaction) {
  await interaction.deferReply({ ephemeral: true });
  const planId = Number(interaction.customId.split(":")[1]);
  const plan = await getPlan(planId, DB_PATH);
  if (!plan) {
    await interaction.editReply("플랜을 찾지 못했습니다.");
    return;
  }
  if (plan.discordUserId && plan.discordUserId !== interaction.user.id) {
    await interaction.editReply("이 플랜은 다른 사용자가 만든 플랜이라 회고를 볼 수 없습니다.");
    return;
  }
  await interaction.editReply(truncateText(buildTripRecap(plan)));
}

async function handleRecapExportButton(interaction) {
  await interaction.deferReply({ ephemeral: true });
  const planId = Number(interaction.customId.split(":")[1]);
  const plan = await getPlan(planId, DB_PATH);
  if (!plan) {
    await interaction.editReply("플랜을 찾지 못했습니다.");
    return;
  }
  if (plan.discordUserId && plan.discordUserId !== interaction.user.id) {
    await interaction.editReply("이 플랜은 다른 사용자가 만든 플랜이라 회고 파일을 받을 수 없습니다.");
    return;
  }
  const attachment = new AttachmentBuilder(Buffer.from(buildTripRecap(plan), "utf-8"), {
    name: `travel-plan-${plan.id}-recap.md`,
  });
  await interaction.editReply({
    content: `플랜 #${plan.id} ${plan.destination || "여행"} 회고 Markdown 파일입니다.`,
    files: [attachment],
  });
}

async function handleRecap(interaction) {
  await interaction.deferReply({ ephemeral: true });
  const plan = await resolveBudgetPlan(interaction);
  if (!plan) {
    await interaction.editReply("회고를 만들 플랜을 찾지 못했습니다. 먼저 /quick 또는 /plan으로 플랜을 만들어주세요.");
    return;
  }
  if (plan.discordUserId && plan.discordUserId !== interaction.user.id) {
    await interaction.editReply("이 플랜은 다른 사용자가 만든 플랜이라 회고를 볼 수 없습니다.");
    return;
  }
  await interaction.editReply(truncateText(buildTripRecap(plan)));
}

async function handleRecapExport(interaction) {
  await interaction.deferReply({ ephemeral: true });
  const plan = await resolveBudgetPlan(interaction);
  if (!plan) {
    await interaction.editReply("회고 파일을 만들 플랜을 찾지 못했습니다. 먼저 /quick 또는 /plan으로 플랜을 만들어주세요.");
    return;
  }
  if (plan.discordUserId && plan.discordUserId !== interaction.user.id) {
    await interaction.editReply("이 플랜은 다른 사용자가 만든 플랜이라 회고 파일을 받을 수 없습니다.");
    return;
  }
  const attachment = new AttachmentBuilder(Buffer.from(buildTripRecap(plan), "utf-8"), {
    name: `travel-plan-${plan.id}-recap.md`,
  });
  await interaction.editReply({
    content: `플랜 #${plan.id} ${plan.destination || "여행"} 회고 Markdown 파일입니다.`,
    files: [attachment],
  });
}

async function handleSettle(interaction) {
  await interaction.deferReply({ ephemeral: true });
  const amount = interaction.options.getInteger("amount", true);
  const paidBy = interaction.options.getString("paid_by") || "";
  const plan = await resolveSettlementPlan(interaction);
  if (!plan) {
    await interaction.editReply("정산할 플랜을 찾지 못했습니다. 먼저 /quick 또는 /plan으로 플랜을 만들어주세요.");
    return;
  }
  if (plan.discordUserId && plan.discordUserId !== interaction.user.id) {
    await interaction.editReply("이 플랜은 다른 사용자가 만든 플랜이라 정산할 수 없습니다.");
    return;
  }
  await interaction.editReply(buildSettlementBriefing(plan, amount, paidBy));
}

async function handleSettleMatrix(interaction) {
  await interaction.deferReply({ ephemeral: true });
  const plan = await resolveSettlementPlan(interaction);
  if (!plan) {
    await interaction.editReply("정산 매트릭스를 만들 플랜을 찾지 못했습니다. 먼저 /quick 또는 /plan으로 플랜을 만들어주세요.");
    return;
  }
  if (plan.discordUserId && plan.discordUserId !== interaction.user.id) {
    await interaction.editReply("이 플랜은 다른 사용자가 만든 플랜이라 정산 매트릭스를 볼 수 없습니다.");
    return;
  }
  await interaction.editReply(truncateText(buildSettlementMatrix(plan)));
}

async function handleSettleTransfers(interaction) {
  await interaction.deferReply({ ephemeral: true });
  const plan = await resolveSettlementPlan(interaction);
  if (!plan) {
    await interaction.editReply("정산 송금표를 만들 플랜을 찾지 못했습니다. 먼저 /quick 또는 /plan으로 플랜을 만들어주세요.");
    return;
  }
  if (plan.discordUserId && plan.discordUserId !== interaction.user.id) {
    await interaction.editReply("이 플랜은 다른 사용자가 만든 플랜이라 정산 송금표를 볼 수 없습니다.");
    return;
  }
  await interaction.editReply(truncateText(buildSettlementTransfers(plan)));
}

async function handleSettleMessage(interaction) {
  await interaction.deferReply({ ephemeral: true });
  const plan = await resolveSettlementPlan(interaction);
  if (!plan) {
    await interaction.editReply("정산 요청문을 만들 플랜을 찾지 못했습니다. 먼저 /quick 또는 /plan으로 플랜을 만들어주세요.");
    return;
  }
  if (plan.discordUserId && plan.discordUserId !== interaction.user.id) {
    await interaction.editReply("이 플랜은 다른 사용자가 만든 플랜이라 정산 요청문을 볼 수 없습니다.");
    return;
  }
  await interaction.editReply(truncateText(buildSettlementMessage(plan)));
}

async function handleSettleMessageButton(interaction) {
  await interaction.deferReply({ ephemeral: true });
  const planId = Number(interaction.customId.split(":")[1]);
  const plan = await getPlan(planId, DB_PATH);
  if (!plan) {
    await interaction.editReply(`플랜 #${planId}을 찾지 못했습니다.`);
    return;
  }
  if (
    !(await ensurePlanOwner(
      interaction,
      plan,
      "이 플랜은 다른 사용자가 만든 플랜이라 정산 요청문을 볼 수 없습니다."
    ))
  ) {
    return;
  }
  await interaction.editReply(truncateText(buildSettlementMessage(plan)));
}

async function handleExpensesExportButton(interaction) {
  await interaction.deferReply({ ephemeral: true });
  const planId = Number(interaction.customId.split(":")[1]);
  const plan = await getPlan(planId, DB_PATH);
  if (!plan) {
    await interaction.editReply(`플랜 #${planId}을 찾지 못했습니다.`);
    return;
  }
  if (
    !(await ensurePlanOwner(
      interaction,
      plan,
      "이 플랜은 다른 사용자가 만든 플랜이라 지출 CSV를 받을 수 없습니다."
    ))
  ) {
    return;
  }
  const file = new AttachmentBuilder(Buffer.from(buildExpenseCsv(plan), "utf8"), {
    name: `plan-${plan.id}-expenses.csv`,
  });
  await interaction.editReply({
    content: `플랜 #${plan.id} 지출 CSV 파일입니다.`,
    files: [file],
    components: moneyFollowupComponents(plan),
  });
}

async function handleSettleMatrixButton(interaction) {
  await interaction.deferReply({ ephemeral: true });
  const planId = Number(interaction.customId.split(":")[1]);
  const plan = await getPlan(planId, DB_PATH);
  if (!plan) {
    await interaction.editReply(`플랜 #${planId}을 찾지 못했습니다.`);
    return;
  }
  if (
    !(await ensurePlanOwner(
      interaction,
      plan,
      "이 플랜은 다른 사용자가 만든 플랜이라 정산표를 볼 수 없습니다."
    ))
  ) {
    return;
  }
  await interaction.editReply(truncateText(buildSettlementMatrix(plan)));
}

async function handleSettleTransfersButton(interaction) {
  await interaction.deferReply({ ephemeral: true });
  const planId = Number(interaction.customId.split(":")[1]);
  const plan = await getPlan(planId, DB_PATH);
  if (!plan) {
    await interaction.editReply(`플랜 #${planId}을 찾지 못했습니다.`);
    return;
  }
  if (
    !(await ensurePlanOwner(
      interaction,
      plan,
      "이 플랜은 다른 사용자가 만든 플랜이라 정산 송금표를 볼 수 없습니다."
    ))
  ) {
    return;
  }
  await interaction.editReply(truncateText(buildSettlementTransfers(plan)));
}

async function handleExpense(interaction) {
  await interaction.deferReply({ ephemeral: true });
  const amount = interaction.options.getInteger("amount", true);
  const label = interaction.options.getString("label", true);
  const category = interaction.options.getString("category") || "";
  const date = interaction.options.getString("date") || "";
  const paidBy = interaction.options.getString("paid_by") || "";
  const plan = await resolveExpensePlan(interaction);
  if (!plan) {
    await interaction.editReply("지출을 저장할 플랜을 찾지 못했습니다. 먼저 /quick 또는 /plan으로 플랜을 만들어주세요.");
    return;
  }
  if (plan.discordUserId && plan.discordUserId !== interaction.user.id) {
    await interaction.editReply("이 플랜은 다른 사용자가 만든 플랜이라 지출을 저장할 수 없습니다.");
    return;
  }
  const result = await addPlanExpense(plan.id, { amount, label, category, date, paidBy }, DB_PATH);
  await interaction.editReply({
    content: truncateText(
      `${buildExpenseLedger(result.plan)}\n\n다음 확인: \`/expenses plan_id:${result.plan.id}\`, \`/dailybudget plan_id:${result.plan.id}\`, \`/settlemessage plan_id:${result.plan.id}\``
    ),
    components: expenseFollowupComponents(result.plan, result.expense?.id),
  });
}

function parseQuickExpenseText(text) {
  const rawText = String(text || "").trim();
  const dateMatch = rawText.match(/\b\d{4}-\d{2}-\d{2}\b/);
  const paidByMatch = rawText.match(/(?:paid_by|by|결제자|결제)\s*[:=]\s*([^\s]+)/i);
  const categoryMatch = rawText.match(/(?:category|cat|카테고리)\s*[:=]\s*([^\s]+)/i);
  let rest = rawText
    .replace(dateMatch?.[0] || "", " ")
    .replace(paidByMatch?.[0] || "", " ")
    .replace(categoryMatch?.[0] || "", " ");
  const amountMatch = rest.match(/(?:₩\s*)?(\d[\d,]*)\s*(?:원|krw)?/i);
  if (!amountMatch) return null;
  const amount = Number(amountMatch[1].replace(/,/g, ""));
  rest = rest.replace(amountMatch[0], " ").replace(/\s+/g, " ").trim();
  const words = rest.split(/\s+/).filter(Boolean);
  let paidBy = paidByMatch?.[1] || "";
  const category = categoryMatch?.[1] || "";
  let label = rest;
  if (!paidBy && words.length >= 2) {
    paidBy = words.at(-1);
    label = words.slice(0, -1).join(" ");
  }
  return {
    amount,
    label: label || "지출",
    category,
    date: dateMatch?.[0] || "",
    paidBy,
  };
}

async function handleSpendQuick(interaction) {
  await interaction.deferReply({ ephemeral: true });
  const parsed = parseQuickExpenseText(interaction.options.getString("text", true));
  if (!parsed || !parsed.amount) {
    await interaction.editReply("금액을 찾지 못했습니다. 예: `/spendquick text:커피 4500 나`");
    return;
  }
  const plan = await resolveExpensePlan(interaction);
  if (!plan) {
    await interaction.editReply("지출을 저장할 플랜을 찾지 못했습니다. 먼저 /quick 또는 /plan으로 플랜을 만들어주세요.");
    return;
  }
  if (plan.discordUserId && plan.discordUserId !== interaction.user.id) {
    await interaction.editReply("이 플랜은 다른 사용자가 만든 플랜이라 지출을 저장할 수 없습니다.");
    return;
  }
  const result = await addPlanExpense(plan.id, parsed, DB_PATH);
  await interaction.editReply({
    content: truncateText(
      `한 줄 지출을 저장했습니다: ${parsed.label} / ${parsed.amount.toLocaleString("ko-KR")}원${parsed.paidBy ? ` / ${parsed.paidBy}` : ""}\n\n${buildExpenseLedger(result.plan)}`
    ),
    components: expenseFollowupComponents(result.plan, result.expense?.id),
  });
}

async function handleExpenseInputButton(interaction) {
  const planId = Number(interaction.customId.split(":")[1]);
  const plan = await getPlan(planId, DB_PATH);
  if (!plan) {
    await interaction.reply({ content: `플랜 #${planId}을 찾지 못했습니다.`, ephemeral: true });
    return;
  }
  if (
    !(await ensurePlanOwner(
      interaction,
      plan,
      "이 플랜은 다른 사용자가 만든 플랜이라 지출을 저장할 수 없습니다."
    ))
  ) {
    return;
  }

  const modal = new ModalBuilder()
    .setCustomId(`plan-expense-input-modal:${plan.id}`)
    .setTitle(`플랜 #${plan.id} 지출 입력`);
  const expense = new TextInputBuilder()
    .setCustomId("expense")
    .setLabel("지출을 한 줄로 입력하세요")
    .setStyle(TextInputStyle.Short)
    .setRequired(true)
    .setPlaceholder("예: 커피 4500 나");
  modal.addComponents(new ActionRowBuilder().addComponents(expense));
  await interaction.showModal(modal);
}

async function handleExpenseInputModal(interaction) {
  await interaction.deferReply({ ephemeral: true });
  const planId = Number(interaction.customId.split(":")[1]);
  const parsed = parseQuickExpenseText(interaction.fields.getTextInputValue("expense"));
  if (!parsed || !parsed.amount) {
    await interaction.editReply("금액을 찾지 못했습니다. 예: `커피 4500 나`");
    return;
  }
  const plan = await getPlan(planId, DB_PATH);
  if (!plan) {
    await interaction.editReply(`플랜 #${planId}을 찾지 못했습니다.`);
    return;
  }
  if (plan.discordUserId && plan.discordUserId !== interaction.user.id) {
    await interaction.editReply("이 플랜은 다른 사용자가 만든 플랜이라 지출을 저장할 수 없습니다.");
    return;
  }
  const result = await addPlanExpense(plan.id, parsed, DB_PATH);
  await interaction.editReply({
    content: truncateText(
      `지출을 저장했습니다: ${parsed.label} / ${parsed.amount.toLocaleString("ko-KR")}원${parsed.paidBy ? ` / ${parsed.paidBy}` : ""}\n\n${buildExpenseLedger(result.plan)}`
    ),
    components: expenseFollowupComponents(result.plan, result.expense?.id),
  });
}

async function handleExpenses(interaction) {
  await interaction.deferReply({ ephemeral: true });
  const filters = expenseFiltersFromInteraction(interaction);
  const plan = await resolveExpensePlan(interaction);
  if (!plan) {
    await interaction.editReply("지출 내역을 볼 플랜을 찾지 못했습니다. 먼저 /quick 또는 /plan으로 플랜을 만들어주세요.");
    return;
  }
  if (plan.discordUserId && plan.discordUserId !== interaction.user.id) {
    await interaction.editReply("이 플랜은 다른 사용자가 만든 플랜이라 지출 내역을 볼 수 없습니다.");
    return;
  }
  await interaction.editReply(buildExpenseLedger(plan, filters));
}

async function handleExpensesButton(interaction) {
  const planId = Number(interaction.customId.split(":")[1]);
  const plan = await getPlan(planId, DB_PATH);
  if (!plan) {
    await interaction.reply({ content: `플랜 #${planId}을 찾지 못했습니다.`, ephemeral: true });
    return;
  }
  if (
    !(await ensurePlanOwner(
      interaction,
      plan,
      "이 플랜은 다른 사용자가 만든 플랜이라 지출 내역을 볼 수 없습니다."
    ))
  ) {
    return;
  }
  await interaction.reply({
    content: truncateText(buildExpenseLedger(plan)),
    ephemeral: true,
    components: moneyFollowupComponents(plan),
  });
}

async function handleExpensesExport(interaction) {
  await interaction.deferReply({ ephemeral: true });
  const filters = expenseFiltersFromInteraction(interaction);
  const plan = await resolveExpensePlan(interaction);
  if (!plan) {
    await interaction.editReply("내보낼 지출 내역이 있는 플랜을 찾지 못했습니다. 먼저 /quick 또는 /plan으로 플랜을 만들어주세요.");
    return;
  }
  if (plan.discordUserId && plan.discordUserId !== interaction.user.id) {
    await interaction.editReply("이 플랜은 다른 사용자가 만든 플랜이라 지출 CSV를 받을 수 없습니다.");
    return;
  }
  const attachment = new AttachmentBuilder(Buffer.from(buildExpenseCsv(plan, filters), "utf-8"), {
    name: `travel-plan-${plan.id}-expenses.csv`,
  });
  await interaction.editReply({
    content: `플랜 #${plan.id} ${plan.destination || "여행"} 지출 CSV 파일입니다.`,
    files: [attachment],
  });
}

async function handleExpenseDelete(interaction) {
  await interaction.deferReply({ ephemeral: true });
  const expenseId = interaction.options.getInteger("expense_id", true);
  const plan = await resolveExpensePlan(interaction);
  if (!plan) {
    await interaction.editReply("삭제할 지출이 있는 플랜을 찾지 못했습니다. 먼저 /quick 또는 /plan으로 플랜을 만들어주세요.");
    return;
  }
  if (plan.discordUserId && plan.discordUserId !== interaction.user.id) {
    await interaction.editReply("이 플랜은 다른 사용자가 만든 플랜이라 지출을 삭제할 수 없습니다.");
    return;
  }
  try {
    const result = await deletePlanExpense(plan.id, expenseId, DB_PATH);
    await interaction.editReply({
      content: truncateText(`지출 #${result.deletedExpense.id}을 삭제했습니다.\n\n${buildExpenseLedger(result.plan)}`),
      components: expenseFollowupComponents(result.plan),
    });
  } catch (err) {
    await interaction.editReply(err.message);
  }
}

async function handleExpenseUndo(interaction) {
  await interaction.deferReply({ ephemeral: true });
  const plan = await resolveExpensePlan(interaction);
  if (!plan) {
    await interaction.editReply("되돌릴 지출이 있는 플랜을 찾지 못했습니다. 먼저 /quick 또는 /plan으로 플랜을 만들어주세요.");
    return;
  }
  if (plan.discordUserId && plan.discordUserId !== interaction.user.id) {
    await interaction.editReply("이 플랜은 다른 사용자가 만든 플랜이라 지출을 되돌릴 수 없습니다.");
    return;
  }
  const expenses = Array.isArray(plan.expenses) ? plan.expenses : [];
  const latestExpense = expenses.at(-1);
  if (!latestExpense) {
    await interaction.editReply(`플랜 #${plan.id}에 삭제할 지출이 없습니다.`);
    return;
  }
  try {
    const result = await deletePlanExpense(plan.id, latestExpense.id, DB_PATH);
    await interaction.editReply({
      content: truncateText(`마지막 지출을 삭제했습니다: #${result.deletedExpense.id} ${result.deletedExpense.label || "지출"} / ${Number(result.deletedExpense.amount || 0).toLocaleString("ko-KR")}원\n\n${buildExpenseLedger(result.plan)}`),
      components: expenseFollowupComponents(result.plan),
    });
  } catch (err) {
    await interaction.editReply(err.message);
  }
}

async function handleExpenseUndoButton(interaction) {
  await interaction.deferReply({ ephemeral: true });
  const [, planIdRaw, expenseIdRaw] = interaction.customId.split(":");
  const planId = Number(planIdRaw);
  const expenseId = Number(expenseIdRaw);
  const plan = await getPlan(planId, DB_PATH);
  if (!plan) {
    await interaction.editReply(`플랜 #${planId}을 찾지 못했습니다.`);
    return;
  }
  if (
    !(await ensurePlanOwner(
      interaction,
      plan,
      "이 플랜은 다른 사용자가 만든 플랜이라 지출을 되돌릴 수 없습니다."
    ))
  ) {
    return;
  }
  try {
    const result = await deletePlanExpense(plan.id, expenseId, DB_PATH);
    await interaction.editReply({
      content: truncateText(`지출 입력을 되돌렸습니다: #${result.deletedExpense.id} ${result.deletedExpense.label || "지출"} / ${Number(result.deletedExpense.amount || 0).toLocaleString("ko-KR")}원\n\n${buildExpenseLedger(result.plan)}`),
      components: expenseFollowupComponents(result.plan),
    });
  } catch (err) {
    await interaction.editReply(err.message);
  }
}

async function handleExpenseEdit(interaction) {
  await interaction.deferReply({ ephemeral: true });
  const expenseId = interaction.options.getInteger("expense_id", true);
  const amount = interaction.options.getInteger("amount");
  const label = interaction.options.getString("label") || "";
  const category = interaction.options.getString("category") || "";
  const date = interaction.options.getString("date") || "";
  const paidBy = interaction.options.getString("paid_by") || "";
  const plan = await resolveExpensePlan(interaction);
  if (!plan) {
    await interaction.editReply("수정할 지출이 있는 플랜을 찾지 못했습니다. 먼저 /quick 또는 /plan으로 플랜을 만들어주세요.");
    return;
  }
  if (plan.discordUserId && plan.discordUserId !== interaction.user.id) {
    await interaction.editReply("이 플랜은 다른 사용자가 만든 플랜이라 지출을 수정할 수 없습니다.");
    return;
  }
  if (amount == null && !label && !category && !date && !paidBy) {
    await interaction.editReply("새 금액, 새 항목명, 새 카테고리, 새 날짜, 새 결제자 중 하나는 입력해주세요.");
    return;
  }
  try {
    const result = await updatePlanExpense(plan.id, expenseId, { amount, label, category, date, paidBy }, DB_PATH);
    await interaction.editReply({
      content: truncateText(`지출 #${result.expense.id}을 수정했습니다.\n\n${buildExpenseLedger(result.plan)}`),
      components: expenseFollowupComponents(result.plan),
    });
  } catch (err) {
    await interaction.editReply(err.message);
  }
}

async function handleMaps(interaction) {
  await interaction.deferReply({ ephemeral: true });
  const plan = await resolveMapPlan(interaction);
  if (!plan) {
    await interaction.editReply("지도 링크를 만들 플랜을 찾지 못했습니다. 먼저 /quick 또는 /plan으로 플랜을 만들어주세요.");
    return;
  }
  if (plan.discordUserId && plan.discordUserId !== interaction.user.id) {
    await interaction.editReply("이 플랜은 다른 사용자가 만든 플랜이라 지도 링크를 볼 수 없습니다.");
    return;
  }
  await interaction.editReply(mapLinksMessage(plan));
}

async function handleWeb(interaction) {
  await interaction.deferReply({ ephemeral: true });
  if (!PUBLIC_BASE_URL) {
    await interaction.editReply("웹 상세 링크를 만들려면 `.env`에 `TRAVEL_PUBLIC_BASE_URL`을 먼저 설정해주세요.");
    return;
  }
  const plan = await resolveWebPlan(interaction);
  if (!plan) {
    await interaction.editReply("웹에서 열 플랜을 찾지 못했습니다. 먼저 /quick 또는 /plan으로 플랜을 만들어주세요.");
    return;
  }
  if (plan.discordUserId && plan.discordUserId !== interaction.user.id) {
    await interaction.editReply("이 플랜은 다른 사용자가 만든 플랜이라 웹 링크를 볼 수 없습니다.");
    return;
  }
  await interaction.editReply(webLinkReply(plan));
}

async function handleCalendar(interaction) {
  await interaction.deferReply({ ephemeral: true });
  const plan = await resolveCalendarPlan(interaction);
  if (!plan) {
    await interaction.editReply("캘린더 파일을 만들 플랜을 찾지 못했습니다. 먼저 /quick 또는 /plan으로 플랜을 만들어주세요.");
    return;
  }
  if (plan.discordUserId && plan.discordUserId !== interaction.user.id) {
    await interaction.editReply("이 플랜은 다른 사용자가 만든 플랜이라 캘린더 파일을 받을 수 없습니다.");
    return;
  }
  const attachment = new AttachmentBuilder(Buffer.from(buildPlanCalendar(plan), "utf-8"), {
    name: `travel-plan-${plan.id}.ics`,
  });
  await interaction.editReply({
    content: `플랜 #${plan.id} ${plan.destination || "여행"} 캘린더 파일입니다.`,
    files: [attachment],
  });
}

async function handleOffline(interaction) {
  await interaction.deferReply({ ephemeral: true });
  const plan = await resolveExportPlan(interaction);
  if (!plan) {
    await interaction.editReply({
      content: "오프라인팩을 만들 플랜을 찾지 못했습니다. 먼저 `새 여행` 버튼이나 /quick 또는 /plan으로 플랜을 만들어주세요.",
      components: startComponents(),
    });
    return;
  }
  if (plan.discordUserId && plan.discordUserId !== interaction.user.id) {
    await interaction.editReply("이 플랜은 다른 사용자가 만든 플랜이라 오프라인팩을 받을 수 없습니다.");
    return;
  }
  const offlinePack = offlinePackAttachment(plan);
  await interaction.editReply({
    content: offlinePackMessage(plan, offlinePack.fileName),
    files: [offlinePack.attachment],
    components: mobileComponents(),
  });
}

async function handleExport(interaction) {
  await interaction.deferReply({ ephemeral: true });
  const plan = await resolveExportPlan(interaction);
  if (!plan) {
    await interaction.editReply("내보낼 플랜을 찾지 못했습니다. 먼저 /quick 또는 /plan으로 플랜을 만들어주세요.");
    return;
  }
  if (plan.discordUserId && plan.discordUserId !== interaction.user.id) {
    await interaction.editReply("이 플랜은 다른 사용자가 만든 플랜이라 Markdown 파일을 받을 수 없습니다.");
    return;
  }
  const attachment = new AttachmentBuilder(Buffer.from(buildPlanMarkdown(plan), "utf-8"), {
    name: `travel-plan-${plan.id}.md`,
  });
  await interaction.editReply({
    content: `플랜 #${plan.id} ${plan.destination || "여행"} Markdown 파일입니다.`,
    files: [attachment],
  });
}

async function handleShare(interaction) {
  await interaction.deferReply({ ephemeral: true });
  const plan = await resolveSharePlan(interaction);
  if (!plan) {
    await interaction.editReply("공유할 플랜을 찾지 못했습니다. 먼저 /quick 또는 /plan으로 플랜을 만들어주세요.");
    return;
  }
  if (plan.discordUserId && plan.discordUserId !== interaction.user.id) {
    await interaction.editReply("이 플랜은 다른 사용자가 만든 플랜이라 공유 요약을 볼 수 없습니다.");
    return;
  }
  await interaction.editReply(truncateText(buildShareText(plan)));
}

async function handleDuplicate(interaction) {
  await interaction.deferReply();
  const plan = await resolveDuplicatePlan(interaction);
  if (!plan) {
    await interaction.editReply("복제할 플랜을 찾지 못했습니다. 먼저 /quick 또는 /plan으로 플랜을 만들어주세요.");
    return;
  }
  if (plan.discordUserId && plan.discordUserId !== interaction.user.id) {
    await interaction.editReply("이 플랜은 다른 사용자가 만든 플랜이라 복제할 수 없습니다.");
    return;
  }
  const duplicated = await duplicatePlan(
    plan.id,
    {
      source: "discord",
      discordUserId: interaction.user.id,
      discordUserName: interaction.user.username,
      discordChannelId: interaction.channelId || "",
      discordGuildId: interaction.guildId || "",
    },
    DB_PATH
  );
  await interaction.editReply({
    content: `플랜 #${plan.id}을 #${duplicated.id}로 복제했습니다.\n\n${planSummary(duplicated)}`,
    files: [planAttachment(duplicated)],
    components: planComponents(duplicated),
  });
}

async function handleDay(interaction) {
  await interaction.deferReply({ ephemeral: true });
  const day = interaction.options.getInteger("day", true);
  const plan = await resolveDayPlan(interaction);
  if (!plan) {
    await interaction.editReply("일차 일정을 볼 플랜을 찾지 못했습니다. 먼저 /quick 또는 /plan으로 플랜을 만들어주세요.");
    return;
  }
  if (plan.discordUserId && plan.discordUserId !== interaction.user.id) {
    await interaction.editReply("이 플랜은 다른 사용자가 만든 플랜이라 일차 일정을 볼 수 없습니다.");
    return;
  }
  await interaction.editReply(truncateText(buildDayViewText(plan, day)));
}

async function handleDate(interaction) {
  await interaction.deferReply({ ephemeral: true });
  const date = interaction.options.getString("date", true).trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    await interaction.editReply("날짜는 YYYY-MM-DD 형식으로 입력해주세요.");
    return;
  }
  const plan = await resolveDatePlan(interaction);
  if (!plan) {
    await interaction.editReply("날짜 일정을 볼 플랜을 찾지 못했습니다. 먼저 /quick 또는 /plan으로 플랜을 만들어주세요.");
    return;
  }
  if (plan.discordUserId && plan.discordUserId !== interaction.user.id) {
    await interaction.editReply("이 플랜은 다른 사용자가 만든 플랜이라 날짜 일정을 볼 수 없습니다.");
    return;
  }
  await interaction.editReply(truncateText(buildDateViewText(plan, date)));
}

async function handleToday(interaction) {
  await interaction.deferReply({ ephemeral: true });
  const plan = await resolveDayPlan(interaction);
  if (!plan) {
    await interaction.editReply("오늘 일정을 볼 플랜을 찾지 못했습니다. 먼저 /quick 또는 /plan으로 플랜을 만들어주세요.");
    return;
  }
  if (plan.discordUserId && plan.discordUserId !== interaction.user.id) {
    await interaction.editReply("이 플랜은 다른 사용자가 만든 플랜이라 오늘 일정을 볼 수 없습니다.");
    return;
  }
  const current = getCurrentTripDay(plan);
  await interaction.editReply(truncateText(`오늘 일정 (${current.label})\n\n${buildTodayViewText(plan)}`));
}

async function handleShow(interaction) {
  await interaction.deferReply();
  const planId = interaction.options.getInteger("plan_id", true);
  const plan = await getPlan(planId, DB_PATH);
  if (!plan) {
    await interaction.editReply(`플랜 #${planId}을 찾지 못했습니다.`);
    return;
  }
  await interaction.editReply({
    ...planReply(plan),
  });
}

async function ensurePlanOwner(interaction, plan, message = "이 플랜은 다른 사용자가 만든 플랜이라 고도화할 수 없습니다.") {
  if (plan.discordUserId && plan.discordUserId !== interaction.user.id) {
    await interaction.reply({
      content: message,
      ephemeral: true,
    });
    return false;
  }
  return true;
}

async function handleRefineButton(interaction) {
  const [, planIdPart, refineMode] = interaction.customId.split(":");
  const planId = Number(planIdPart);
  const plan = await getPlan(planId, DB_PATH);
  if (!plan) {
    await interaction.reply({ content: `플랜 #${planId}을 찾지 못했습니다.`, ephemeral: true });
    return;
  }
  if (!(await ensurePlanOwner(interaction, plan))) return;

  const modal = new ModalBuilder()
    .setCustomId(`plan-refine-modal:${plan.id}`)
    .setTitle(`플랜 #${plan.id} 고도화`);
  const feedback = new TextInputBuilder()
    .setCustomId("feedback")
    .setLabel("어떻게 바꿀까요?")
    .setStyle(TextInputStyle.Paragraph)
    .setRequired(true)
    .setPlaceholder("예: 2일차를 바다 위주로 바꾸고 이동 시간을 줄여줘");
  if (refineMode === "quality") {
    feedback.setValue(buildQualityRefineFeedback(plan) || buildQualityAuditFeedback(plan));
  }
  if (refineMode === "quality-audit") {
    feedback.setValue(buildQualityAuditFeedback(plan));
  }
  modal.addComponents(new ActionRowBuilder().addComponents(feedback));
  await interaction.showModal(modal);
}

async function handleHistoryButton(interaction) {
  const planId = Number(interaction.customId.split(":")[1]);
  const plan = await getPlan(planId, DB_PATH);
  if (!plan) {
    await interaction.reply({ content: `플랜 #${planId}을 찾지 못했습니다.`, ephemeral: true });
    return;
  }
  if (
    !(await ensurePlanOwner(
      interaction,
      plan,
      "이 플랜은 다른 사용자가 만든 플랜이라 히스토리를 볼 수 없습니다."
    ))
  ) {
    return;
  }
  await interaction.reply({
    ...historyReply(plan, interaction.user.id),
    ephemeral: true,
  });
}

async function handleAskButton(interaction) {
  const planId = Number(interaction.customId.split(":")[1]);
  const plan = await getPlan(planId, DB_PATH);
  if (!plan) {
    await interaction.reply({ content: `플랜 #${planId}을 찾지 못했습니다.`, ephemeral: true });
    return;
  }
  if (
    !(await ensurePlanOwner(
      interaction,
      plan,
      "이 플랜은 다른 사용자가 만든 플랜이라 질문할 수 없습니다."
    ))
  ) {
    return;
  }

  const modal = new ModalBuilder()
    .setCustomId(`plan-ask-modal:${plan.id}`)
    .setTitle(`플랜 #${plan.id} 질문`);
  const question = new TextInputBuilder()
    .setCustomId("question")
    .setLabel("무엇이 궁금한가요?")
    .setStyle(TextInputStyle.Paragraph)
    .setRequired(true)
    .setPlaceholder("예: 비 오면 2일차를 어떻게 바꾸면 좋아?");
  modal.addComponents(new ActionRowBuilder().addComponents(question));
  await interaction.showModal(modal);
}

async function handlePinButton(interaction) {
  const planId = Number(interaction.customId.split(":")[1]);
  const plan = await getPlan(planId, DB_PATH);
  if (!plan) {
    await interaction.reply({ content: `플랜 #${planId}을 찾지 못했습니다.`, ephemeral: true });
    return;
  }
  if (
    !(await ensurePlanOwner(
      interaction,
      plan,
      "이 플랜은 다른 사용자가 만든 플랜이라 고정할 수 없습니다."
    ))
  ) {
    return;
  }

  const updatedPlan = await setPlanPinned(plan.id, !plan.pinned, DB_PATH);
  const status = updatedPlan.pinned ? "고정했습니다." : "고정을 해제했습니다.";
  await interaction.reply({
    content: `플랜 #${updatedPlan.id}을 ${status}`,
    ephemeral: true,
  });
}

async function handleChecklistButton(interaction) {
  const planId = Number(interaction.customId.split(":")[1]);
  const plan = await getPlan(planId, DB_PATH);
  if (!plan) {
    await interaction.reply({ content: `플랜 #${planId}을 찾지 못했습니다.`, ephemeral: true });
    return;
  }
  if (
    !(await ensurePlanOwner(
      interaction,
      plan,
      "이 플랜은 다른 사용자가 만든 플랜이라 체크리스트를 볼 수 없습니다."
    ))
  ) {
    return;
  }
  await interaction.reply({
    content: buildChecklistText(plan),
    ephemeral: true,
  });
}

async function handleEmergencyButton(interaction) {
  const planId = Number(interaction.customId.split(":")[1]);
  const plan = await getPlan(planId, DB_PATH);
  if (!plan) {
    await interaction.reply({ content: `플랜 #${planId}을 찾지 못했습니다.`, ephemeral: true });
    return;
  }
  if (
    !(await ensurePlanOwner(
      interaction,
      plan,
      "이 플랜은 다른 사용자가 만든 플랜이라 비상 카드를 볼 수 없습니다."
    ))
  ) {
    return;
  }
  await interaction.reply({
    content: buildEmergencyCard(plan),
    ephemeral: true,
  });
}

async function handlePackingButton(interaction) {
  const planId = Number(interaction.customId.split(":")[1]);
  const plan = await getPlan(planId, DB_PATH);
  if (!plan) {
    await interaction.reply({ content: `플랜 #${planId}을 찾지 못했습니다.`, ephemeral: true });
    return;
  }
  if (
    !(await ensurePlanOwner(
      interaction,
      plan,
      "이 플랜은 다른 사용자가 만든 플랜이라 짐싸기 목록을 볼 수 없습니다."
    ))
  ) {
    return;
  }
  await interaction.reply({
    content: buildPackingList(plan),
    ephemeral: true,
  });
}

async function handleDepartureButton(interaction) {
  const planId = Number(interaction.customId.split(":")[1]);
  const plan = await getPlan(planId, DB_PATH);
  if (!plan) {
    await interaction.reply({ content: `플랜 #${planId}을 찾지 못했습니다.`, ephemeral: true });
    return;
  }
  if (
    !(await ensurePlanOwner(
      interaction,
      plan,
      "이 플랜은 다른 사용자가 만든 플랜이라 출발 브리핑을 볼 수 없습니다."
    ))
  ) {
    return;
  }
  await interaction.reply({
    content: buildDepartureBriefing(plan),
    ephemeral: true,
  });
}

async function handleBudgetButton(interaction) {
  const planId = Number(interaction.customId.split(":")[1]);
  const plan = await getPlan(planId, DB_PATH);
  if (!plan) {
    await interaction.reply({ content: `플랜 #${planId}을 찾지 못했습니다.`, ephemeral: true });
    return;
  }
  if (
    !(await ensurePlanOwner(
      interaction,
      plan,
      "이 플랜은 다른 사용자가 만든 플랜이라 예산 브리핑을 볼 수 없습니다."
    ))
  ) {
    return;
  }
  await interaction.reply({
    content: truncateText(buildBudgetBriefing(plan)),
    ephemeral: true,
  });
}

async function handleSpendingButton(interaction) {
  const planId = Number(interaction.customId.split(":")[1]);
  const plan = await getPlan(planId, DB_PATH);
  if (!plan) {
    await interaction.reply({ content: `플랜 #${planId}을 찾지 못했습니다.`, ephemeral: true });
    return;
  }
  if (
    !(await ensurePlanOwner(
      interaction,
      plan,
      "이 플랜은 다른 사용자가 만든 플랜이라 예산 소진 현황을 볼 수 없습니다."
    ))
  ) {
    return;
  }
  await interaction.reply({
    content: truncateText(buildSpendingStatus(plan)),
    ephemeral: true,
    components: moneyFollowupComponents(plan),
  });
}

async function handleMapButton(interaction) {
  const planId = Number(interaction.customId.split(":")[1]);
  const plan = await getPlan(planId, DB_PATH);
  if (!plan) {
    await interaction.reply({ content: `플랜 #${planId}을 찾지 못했습니다.`, ephemeral: true });
    return;
  }
  if (
    !(await ensurePlanOwner(
      interaction,
      plan,
      "이 플랜은 다른 사용자가 만든 플랜이라 지도 링크를 볼 수 없습니다."
    ))
  ) {
    return;
  }
  await interaction.reply({
    content: mapLinksMessage(plan),
    ephemeral: true,
  });
}

async function handleTodayButton(interaction) {
  const planId = Number(interaction.customId.split(":")[1]);
  const plan = await getPlan(planId, DB_PATH);
  if (!plan) {
    await interaction.reply({ content: `플랜 #${planId}을 찾지 못했습니다.`, ephemeral: true });
    return;
  }
  if (
    !(await ensurePlanOwner(
      interaction,
      plan,
      "이 플랜은 다른 사용자가 만든 플랜이라 오늘 일정을 볼 수 없습니다."
    ))
  ) {
    return;
  }
  const current = getCurrentTripDay(plan);
  await interaction.reply({
    content: truncateText(`오늘 일정 (${current.label})\n\n${buildTodayViewText(plan)}`),
    ephemeral: true,
  });
}

async function handleShareButton(interaction) {
  const planId = Number(interaction.customId.split(":")[1]);
  const plan = await getPlan(planId, DB_PATH);
  if (!plan) {
    await interaction.reply({ content: `플랜 #${planId}을 찾지 못했습니다.`, ephemeral: true });
    return;
  }
  if (
    !(await ensurePlanOwner(
      interaction,
      plan,
      "이 플랜은 다른 사용자가 만든 플랜이라 공유 요약을 볼 수 없습니다."
    ))
  ) {
    return;
  }
  await interaction.reply({
    content: truncateText(buildShareText(plan)),
    ephemeral: true,
  });
}

async function handleExportButton(interaction) {
  const planId = Number(interaction.customId.split(":")[1]);
  const plan = await getPlan(planId, DB_PATH);
  if (!plan) {
    await interaction.reply({ content: `플랜 #${planId}을 찾지 못했습니다.`, ephemeral: true });
    return;
  }
  if (
    !(await ensurePlanOwner(
      interaction,
      plan,
      "이 플랜은 다른 사용자가 만든 플랜이라 Markdown 파일을 받을 수 없습니다."
    ))
  ) {
    return;
  }
  const attachment = new AttachmentBuilder(Buffer.from(buildPlanMarkdown(plan), "utf-8"), {
    name: `travel-plan-${plan.id}.md`,
  });
  await interaction.reply({
    content: `플랜 #${plan.id} ${plan.destination || "여행"} Markdown 파일입니다.`,
    files: [attachment],
    ephemeral: true,
  });
}

async function handleOfflineButton(interaction) {
  const planId = Number(interaction.customId.split(":")[1]);
  const plan = await getPlan(planId, DB_PATH);
  if (!plan) {
    await interaction.reply({ content: `플랜 #${planId}을 찾지 못했습니다.`, ephemeral: true });
    return;
  }
  if (
    !(await ensurePlanOwner(
      interaction,
      plan,
      "이 플랜은 다른 사용자가 만든 플랜이라 오프라인팩을 받을 수 없습니다."
    ))
  ) {
    return;
  }
  const offlinePack = offlinePackAttachment(plan);
  await interaction.reply({
    content: offlinePackMessage(plan, offlinePack.fileName),
    files: [offlinePack.attachment],
    components: mobileComponents(),
    ephemeral: true,
  });
}

async function handleCalendarButton(interaction) {
  const planId = Number(interaction.customId.split(":")[1]);
  const plan = await getPlan(planId, DB_PATH);
  if (!plan) {
    await interaction.reply({ content: `플랜 #${planId}을 찾지 못했습니다.`, ephemeral: true });
    return;
  }
  if (
    !(await ensurePlanOwner(
      interaction,
      plan,
      "이 플랜은 다른 사용자가 만든 플랜이라 캘린더 파일을 받을 수 없습니다."
    ))
  ) {
    return;
  }
  const attachment = new AttachmentBuilder(Buffer.from(buildPlanCalendar(plan), "utf-8"), {
    name: `travel-plan-${plan.id}.ics`,
  });
  await interaction.reply({
    content: `플랜 #${plan.id} ${plan.destination || "여행"} 캘린더 파일입니다.`,
    files: [attachment],
    ephemeral: true,
  });
}

async function handleDuplicateButton(interaction) {
  const planId = Number(interaction.customId.split(":")[1]);
  const plan = await getPlan(planId, DB_PATH);
  if (!plan) {
    await interaction.reply({ content: `플랜 #${planId}을 찾지 못했습니다.`, ephemeral: true });
    return;
  }
  if (
    !(await ensurePlanOwner(
      interaction,
      plan,
      "이 플랜은 다른 사용자가 만든 플랜이라 복제할 수 없습니다."
    ))
  ) {
    return;
  }
  const duplicated = await duplicatePlan(
    plan.id,
    {
      source: "discord",
      discordUserId: interaction.user.id,
      discordUserName: interaction.user.username,
      discordChannelId: interaction.channelId || "",
      discordGuildId: interaction.guildId || "",
    },
    DB_PATH
  );
  await interaction.reply({
    content: `플랜 #${plan.id}을 #${duplicated.id}로 복제했습니다.\n\n${planSummary(duplicated)}`,
    files: [planAttachment(duplicated)],
    components: planComponents(duplicated),
  });
}

async function handleRefineModal(interaction) {
  await interaction.deferReply();
  const planId = Number(interaction.customId.split(":")[1]);
  const feedback = interaction.fields.getTextInputValue("feedback");
  const plan = await getPlan(planId, DB_PATH);
  if (!plan) {
    await interaction.editReply(`플랜 #${planId}을 찾지 못했습니다.`);
    return;
  }
  if (plan.discordUserId && plan.discordUserId !== interaction.user.id) {
    await interaction.editReply("이 플랜은 다른 사용자가 만든 플랜이라 고도화할 수 없습니다.");
    return;
  }
  const latest = latestRevision(plan);
  if (await rejectUngroundedRefinement(interaction, latest)) return;
  const generation = await generatePlan(plan, latest?.planText, feedback);
  const updatedPlan = await refinePlan(plan.id, generation, feedback, DB_PATH);
  if (generation.error) {
    updatedPlan.latestError = generation.error;
  }
  await interaction.editReply({
    ...planReply(updatedPlan, { notice: refineQualityNotice(updatedPlan) }),
  });
}

async function handleAskModal(interaction) {
  await interaction.deferReply({ ephemeral: true });
  const planId = Number(interaction.customId.split(":")[1]);
  const question = interaction.fields.getTextInputValue("question");
  const plan = await getPlan(planId, DB_PATH);
  if (!plan) {
    await interaction.editReply(`플랜 #${planId}을 찾지 못했습니다.`);
    return;
  }
  if (plan.discordUserId && plan.discordUserId !== interaction.user.id) {
    await interaction.editReply("이 플랜은 다른 사용자가 만든 플랜이라 질문할 수 없습니다.");
    return;
  }
  const latest = latestRevision(plan);
  const result = await answerPlanQuestion(plan, latest?.planText, question);
  const error = result.error ? `\n\nLLM 오류: ${result.error}` : "";
  await interaction.editReply(truncateText(`${result.answer}${error}`));
}

async function handleScheduleModal(interaction) {
  await interaction.deferReply({ ephemeral: true });
  const planId = Number(interaction.customId.split(":")[1]);
  const startDate = interaction.fields.getTextInputValue("start_date").trim();
  const nightsText = interaction.fields.getTextInputValue("nights").trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(startDate)) {
    await interaction.editReply("출발일은 YYYY-MM-DD 형식으로 입력해주세요.");
    return;
  }
  const nights = nightsText ? Number(nightsText) : null;
  if (nightsText && (!Number.isInteger(nights) || nights < 1 || nights > 30)) {
    await interaction.editReply("박수는 1부터 30 사이의 숫자로 입력해주세요.");
    return;
  }
  const plan = await getPlan(planId, DB_PATH);
  if (!plan) {
    await interaction.editReply(`플랜 #${planId}을 찾지 못했습니다.`);
    return;
  }
  if (plan.discordUserId && plan.discordUserId !== interaction.user.id) {
    await interaction.editReply("이 플랜은 다른 사용자가 만든 플랜이라 일정을 변경할 수 없습니다.");
    return;
  }
  const updatedPlan = await updatePlanSchedule(plan.id, { startDate, nights: nights || plan.nights }, DB_PATH);
  await interaction.editReply({
    content: `플랜 #${updatedPlan.id} 일정을 변경했습니다.\n${updatedPlan.startDate} ~ ${updatedPlan.endDate} / ${updatedPlan.nights}박`,
    components: mobileComponents(),
  });
}

async function handlePartyBudgetModal(interaction) {
  await interaction.deferReply({ ephemeral: true });
  const planId = Number(interaction.customId.split(":")[1]);
  const travelersText = interaction.fields.getTextInputValue("travelers").trim();
  const budgetText = interaction.fields.getTextInputValue("budget_per_person").trim();
  const travelers = Number(travelersText);
  if (!Number.isInteger(travelers) || travelers < 1) {
    await interaction.editReply("인원은 1 이상의 숫자로 입력해주세요.");
    return;
  }
  const budgetPerPerson = budgetText ? Number(budgetText.replace(/,/g, "")) : null;
  if (budgetText && (!Number.isInteger(budgetPerPerson) || budgetPerPerson < 0)) {
    await interaction.editReply("1인 예산은 0 이상의 숫자로 입력해주세요.");
    return;
  }
  const plan = await getPlan(planId, DB_PATH);
  if (!plan) {
    await interaction.editReply(`플랜 #${planId}을 찾지 못했습니다.`);
    return;
  }
  if (plan.discordUserId && plan.discordUserId !== interaction.user.id) {
    await interaction.editReply("이 플랜은 다른 사용자가 만든 플랜이라 인원/예산을 변경할 수 없습니다.");
    return;
  }
  const updatedPlan = await updatePlanPartyBudget(
    plan.id,
    { travelers, budgetPerPerson: budgetPerPerson ?? plan.budgetPerPerson },
    DB_PATH
  );
  const budget = updatedPlan.budgetPerPerson ? `${Number(updatedPlan.budgetPerPerson).toLocaleString("ko-KR")}원` : "미정";
  await interaction.editReply({
    content: `플랜 #${updatedPlan.id} 인원/예산을 변경했습니다.\n인원 ${updatedPlan.travelers}명 / 1인 예산 ${budget}`,
    components: mobileComponents(),
  });
}

async function handlePlanSelect(interaction) {
  const ownerId = interaction.customId.split(":")[1];
  if (ownerId !== interaction.user.id) {
    await interaction.reply({ content: "내 플랜 목록에서만 선택할 수 있습니다.", ephemeral: true });
    return;
  }

  await interaction.deferReply({ ephemeral: true });
  const planId = Number(interaction.values[0]);
  const plan = await getPlan(planId, DB_PATH);
  if (!plan) {
    await interaction.editReply(`플랜 #${planId}을 찾지 못했습니다.`);
    return;
  }
  if (plan.discordUserId && plan.discordUserId !== interaction.user.id) {
    await interaction.editReply("이 플랜은 다른 사용자가 만든 플랜이라 열 수 없습니다.");
    return;
  }
  await interaction.editReply({
    ...planReply(plan),
  });
}

async function handleVersionSelect(interaction) {
  const [, ownerId, planIdRaw] = interaction.customId.split(":");
  if (ownerId !== interaction.user.id) {
    await interaction.reply({ content: "내 히스토리 목록에서만 선택할 수 있습니다.", ephemeral: true });
    return;
  }

  await interaction.deferReply({ ephemeral: true });
  const planId = Number(planIdRaw);
  const version = Number(interaction.values[0]);
  const plan = await getPlan(planId, DB_PATH);
  if (!plan) {
    await interaction.editReply(`플랜 #${planId}을 찾지 못했습니다.`);
    return;
  }
  if (plan.discordUserId && plan.discordUserId !== interaction.user.id) {
    await interaction.editReply("이 플랜은 다른 사용자가 만든 플랜이라 열 수 없습니다.");
    return;
  }
  const revision = revisionByVersion(plan, version);
  if (!revision) {
    await interaction.editReply(`플랜 #${plan.id}의 v${version}을 찾지 못했습니다.`);
    return;
  }
  await interaction.editReply({
    ...revisionReply(plan, revision),
  });
}

async function handleInteraction(interaction) {
  try {
    if (!(await requireAllowedGuild(interaction))) return;
    if (!(await requireAllowedUser(interaction))) return;
    if (interaction.isButton() && interaction.customId === "start-quick") {
      await handleStartQuickButton(interaction);
      return;
    }
    if (interaction.isButton() && interaction.customId === "start-mobile") {
      await handleMobile(interaction);
      return;
    }
    if (interaction.isButton() && interaction.customId === "start-offline") {
      await handleOffline(interaction);
      return;
    }
    if (interaction.isButton() && interaction.customId === "start-iphone") {
      await handleIphone(interaction);
      return;
    }
    if (interaction.isButton() && interaction.customId === "mobile-dashboard") {
      await handleDashboard(interaction);
      return;
    }
    if (interaction.isButton() && interaction.customId === "mobile-memo") {
      await handleMobileMemoButton(interaction);
      return;
    }
    if (interaction.isButton() && interaction.customId === "mobile-now") {
      await handleMobileNowButton(interaction);
      return;
    }
    if (interaction.isButton() && interaction.customId === "mobile-money") {
      await handleMobileMoneyButton(interaction);
      return;
    }
    if (interaction.isButton() && interaction.customId === "mobile-next") {
      await handleMobileNextButton(interaction);
      return;
    }
    if (interaction.isButton() && interaction.customId === "mobile-readiness") {
      await handleMobileReadinessButton(interaction);
      return;
    }
    if (interaction.isButton() && interaction.customId === "mobile-today") {
      await handleMobileTodayButton(interaction);
      return;
    }
    if (interaction.isButton() && interaction.customId === "mobile-check") {
      await handleMobileCheckButton(interaction);
      return;
    }
    if (interaction.isButton() && interaction.customId === "mobile-night") {
      await handleMobileNightButton(interaction);
      return;
    }
    if (interaction.isButton() && interaction.customId === "mobile-offline") {
      await handleOffline(interaction);
      return;
    }
    if (interaction.isButton() && interaction.customId === "mobile-iphone") {
      await handleIphone(interaction);
      return;
    }
    if (interaction.isButton() && interaction.customId === "iphone-doctor") {
      await handleDoctor(interaction);
      return;
    }
    if (interaction.isButton() && interaction.customId === "iphone-whoami") {
      await handleWhoami(interaction);
      return;
    }
    if (interaction.isButton() && interaction.customId === "iphone-policy") {
      await handlePolicy(interaction);
      return;
    }
    if (interaction.isButton() && interaction.customId === "iphone-recover") {
      await handleRecover(interaction);
      return;
    }
    if (interaction.isButton() && interaction.customId === "iphone-env") {
      await handleIphoneEnvButton(interaction);
      return;
    }
    if (interaction.isButton() && interaction.customId === "mobile-maps") {
      await handleMobileMapsButton(interaction);
      return;
    }
    if (interaction.isButton() && interaction.customId === "mobile-share") {
      await handleMobileShareButton(interaction);
      return;
    }
    if (interaction.isButton() && interaction.customId === "mobile-status") {
      await handleStatus(interaction);
      return;
    }
    if (interaction.isButton() && interaction.customId === "mobile-guide") {
      await handleGuide(interaction);
      return;
    }
    if (interaction.isButton() && interaction.customId === "mobile-ops") {
      await handleOps(interaction);
      return;
    }
    if (interaction.isButton() && interaction.customId.startsWith("ops-denied-more")) {
      const [, reasonPart = "all", sourcePart = "all"] = interaction.customId.split(":");
      await handleDenied(interaction, reasonPart === "all" ? "" : reasonPart, 20, sourcePart === "all" ? "" : sourcePart);
      return;
    }
    if (interaction.isButton() && interaction.customId.startsWith("ops-denied-source")) {
      const [, sourcePart = "", reasonPart = "all"] = interaction.customId.split(":");
      await handleDenied(interaction, reasonPart === "all" ? "" : reasonPart, null, sourcePart);
      return;
    }
    if (interaction.isButton() && interaction.customId.startsWith("ops-denied")) {
      const [, reasonPart = "all", sourcePart = "all"] = interaction.customId.split(":");
      await handleDenied(interaction, reasonPart === "all" ? "" : reasonPart, null, sourcePart === "all" ? "" : sourcePart);
      return;
    }
    if (interaction.isButton() && interaction.customId.startsWith("plan-refine:")) {
      await handleRefineButton(interaction);
      return;
    }
    if (interaction.isButton() && interaction.customId.startsWith("plan-history:")) {
      await handleHistoryButton(interaction);
      return;
    }
    if (interaction.isButton() && interaction.customId.startsWith("plan-ask:")) {
      await handleAskButton(interaction);
      return;
    }
    if (interaction.isButton() && interaction.customId.startsWith("plan-pin:")) {
      await handlePinButton(interaction);
      return;
    }
    if (interaction.isButton() && interaction.customId.startsWith("plan-checklist:")) {
      await handleChecklistButton(interaction);
      return;
    }
    if (interaction.isButton() && interaction.customId.startsWith("plan-emergency:")) {
      await handleEmergencyButton(interaction);
      return;
    }
    if (interaction.isButton() && interaction.customId.startsWith("plan-packing:")) {
      await handlePackingButton(interaction);
      return;
    }
    if (interaction.isButton() && interaction.customId.startsWith("plan-departure:")) {
      await handleDepartureButton(interaction);
      return;
    }
    if (interaction.isButton() && interaction.customId.startsWith("plan-budget:")) {
      await handleBudgetButton(interaction);
      return;
    }
    if (interaction.isButton() && interaction.customId.startsWith("plan-category-budget:")) {
      await handleCategoryBudgetButton(interaction);
      return;
    }
    if (interaction.isButton() && interaction.customId.startsWith("plan-brief:")) {
      await handleBriefButton(interaction);
      return;
    }
    if (interaction.isButton() && interaction.customId.startsWith("plan-today-check:")) {
      await handleTodayCheckButton(interaction);
      return;
    }
    if (interaction.isButton() && interaction.customId.startsWith("plan-tomorrow:")) {
      await handleTomorrowButton(interaction);
      return;
    }
    if (interaction.isButton() && interaction.customId.startsWith("plan-day-share:")) {
      await handleDayShareButton(interaction);
      return;
    }
    if (interaction.isButton() && interaction.customId.startsWith("plan-night-check:")) {
      await handleNightCheckButton(interaction);
      return;
    }
    if (interaction.isButton() && interaction.customId.startsWith("plan-daily-budget:")) {
      await handleDailyBudgetButton(interaction);
      return;
    }
    if (interaction.isButton() && interaction.customId.startsWith("plan-spending:")) {
      await handleSpendingButton(interaction);
      return;
    }
    if (interaction.isButton() && interaction.customId.startsWith("plan-settlemessage:")) {
      await handleSettleMessageButton(interaction);
      return;
    }
    if (interaction.isButton() && interaction.customId.startsWith("plan-settlematrix:")) {
      await handleSettleMatrixButton(interaction);
      return;
    }
    if (interaction.isButton() && interaction.customId.startsWith("plan-settletransfers:")) {
      await handleSettleTransfersButton(interaction);
      return;
    }
    if (interaction.isButton() && interaction.customId.startsWith("plan-expense-input:")) {
      await handleExpenseInputButton(interaction);
      return;
    }
    if (interaction.isButton() && interaction.customId.startsWith("plan-expenses-export:")) {
      await handleExpensesExportButton(interaction);
      return;
    }
    if (interaction.isButton() && interaction.customId.startsWith("plan-expenses:")) {
      await handleExpensesButton(interaction);
      return;
    }
    if (interaction.isButton() && interaction.customId.startsWith("plan-expense-undo:")) {
      await handleExpenseUndoButton(interaction);
      return;
    }
    if (interaction.isButton() && interaction.customId.startsWith("plan-recap:")) {
      await handleRecapButton(interaction);
      return;
    }
    if (interaction.isButton() && interaction.customId.startsWith("plan-recap-export:")) {
      await handleRecapExportButton(interaction);
      return;
    }
    if (interaction.isButton() && interaction.customId.startsWith("plan-maps:")) {
      await handleMapButton(interaction);
      return;
    }
    if (interaction.isButton() && interaction.customId.startsWith("plan-today:")) {
      await handleTodayButton(interaction);
      return;
    }
    if (interaction.isButton() && interaction.customId.startsWith("plan-share:")) {
      await handleShareButton(interaction);
      return;
    }
    if (interaction.isButton() && interaction.customId.startsWith("plan-export:")) {
      await handleExportButton(interaction);
      return;
    }
    if (interaction.isButton() && interaction.customId.startsWith("plan-offline:")) {
      await handleOfflineButton(interaction);
      return;
    }
    if (interaction.isButton() && interaction.customId.startsWith("plan-calendar:")) {
      await handleCalendarButton(interaction);
      return;
    }
    if (interaction.isButton() && interaction.customId.startsWith("plan-duplicate:")) {
      await handleDuplicateButton(interaction);
      return;
    }
    if (interaction.isModalSubmit() && interaction.customId.startsWith("plan-refine-modal:")) {
      await handleRefineModal(interaction);
      return;
    }
    if (interaction.isModalSubmit() && interaction.customId.startsWith("plan-ask-modal:")) {
      await handleAskModal(interaction);
      return;
    }
    if (interaction.isModalSubmit() && interaction.customId.startsWith("plan-schedule-modal:")) {
      await handleScheduleModal(interaction);
      return;
    }
    if (interaction.isModalSubmit() && interaction.customId.startsWith("plan-party-budget-modal:")) {
      await handlePartyBudgetModal(interaction);
      return;
    }
    if (interaction.isModalSubmit() && interaction.customId.startsWith("plan-expense-input-modal:")) {
      await handleExpenseInputModal(interaction);
      return;
    }
    if (interaction.isModalSubmit() && interaction.customId === "start-quick-modal") {
      await handleStartQuickModal(interaction);
      return;
    }
    if (interaction.isModalSubmit() && interaction.customId === "mobile-memo-modal") {
      await handleMobileMemoModal(interaction);
      return;
    }
    if (interaction.isStringSelectMenu() && ["mobile-action-select", "mobile-file-select"].includes(interaction.customId)) {
      await handleMobileActionSelect(interaction);
      return;
    }
    if (interaction.isStringSelectMenu() && interaction.customId.startsWith("plan-select:")) {
      await handlePlanSelect(interaction);
      return;
    }
    if (interaction.isStringSelectMenu() && interaction.customId.startsWith("plan-routine-select:")) {
      await handleRoutineSelect(interaction);
      return;
    }
    if (interaction.isStringSelectMenu() && interaction.customId.startsWith("plan-version-select:")) {
      await handleVersionSelect(interaction);
      return;
    }
    if (interaction.isButton() && interaction.customId.startsWith("quality-list:")) {
      await handleQualityListButton(interaction);
      return;
    }
    if (interaction.isButton() && interaction.customId.startsWith("quality-gate:")) {
      await handleQualityGateButton(interaction);
      return;
    }
    if (interaction.isButton() && interaction.customId.startsWith("quality-brief")) {
      await handleQualityBriefButton(interaction);
      return;
    }
    if (interaction.isButton() && interaction.customId.startsWith("quality-feedback:")) {
      await handleQualityFeedbackButton(interaction);
      return;
    }
    if (!interaction.isChatInputCommand()) return;

    if (interaction.commandName === "start") await handleStart(interaction);
    if (interaction.commandName === "quick") await handleQuick(interaction);
    if (interaction.commandName === "plan") await handlePlan(interaction);
    if (interaction.commandName === "check") await handleGroundedCheck(interaction);
    if (interaction.commandName === "replace") await handleGroundedReplace(interaction);
    if (interaction.commandName === "move") await handleGroundedMove(interaction);
    if (interaction.commandName === "replan") await handleGroundedReplan(interaction);
    if (interaction.commandName === "refresh") await handleGroundedRefresh(interaction);
    if (interaction.commandName === "refine") await handleRefine(interaction);
    if (interaction.commandName === "again") await handleAgain(interaction);
    if (interaction.commandName === "reschedule") await handleReschedule(interaction);
    if (interaction.commandName === "partybudget") await handlePartyBudget(interaction);
    if (interaction.commandName === "note") await handleNote(interaction);
    if (interaction.commandName === "memo") await handleMemo(interaction);
    if (interaction.commandName === "memos") await handleMemos(interaction);
    if (interaction.commandName === "memosearch") await handleMemoSearch(interaction);
    if (interaction.commandName === "memoshare") await handleMemoShare(interaction);
    if (interaction.commandName === "home") await handleDashboard(interaction);
    if (interaction.commandName === "dashboard") await handleDashboard(interaction);
    if (interaction.commandName === "mobile") await handleMobile(interaction);
    if (interaction.commandName === "iphone") await handleIphone(interaction);
    if (interaction.commandName === "iphoneenv") await handleIphoneEnvButton(interaction);
    if (interaction.commandName === "recover") await handleRecover(interaction);
    if (interaction.commandName === "whoami") await handleWhoami(interaction);
    if (interaction.commandName === "policy") await handlePolicy(interaction);
    if (interaction.commandName === "ops") await handleOps(interaction);
    if (interaction.commandName === "denied") await handleDenied(interaction);
    if (interaction.commandName === "doctor") await handleDoctor(interaction);
    if (interaction.commandName === "status") await handleStatus(interaction);
    if (interaction.commandName === "nextaction") await handleNextAction(interaction);
    if (interaction.commandName === "now") await handleNow(interaction);
    if (interaction.commandName === "readiness") await handleReadiness(interaction);
    if (interaction.commandName === "prepplan") await handlePrepPlan(interaction);
    if (interaction.commandName === "readyshare") await handleReadyShare(interaction);
    if (interaction.commandName === "help") await handleGuide(interaction);
    if (interaction.commandName === "guide") await handleGuide(interaction);
    if (interaction.commandName === "plans") await handlePlans(interaction);
    if (interaction.commandName === "mine") await handleMine(interaction);
    if (interaction.commandName === "pinned") await handlePinned(interaction);
    if (interaction.commandName === "upcoming") await handleUpcoming(interaction);
    if (interaction.commandName === "quality") await handleQuality(interaction);
    if (interaction.commandName === "qualitytodo") await handleQualityTodo(interaction);
    if (interaction.commandName === "qualityurgent") await handleQualityUrgent(interaction);
    if (interaction.commandName === "qualitybrief") await handleQualityBrief(interaction);
    if (interaction.commandName === "qualityok") await handleQualityOk(interaction);
    if (interaction.commandName === "qualityunaudited") await handleQualityUnaudited(interaction);
    if (interaction.commandName === "qualitystatus") await handleQualityStatus(interaction);
    if (interaction.commandName === "qualitygate") await handleQualityGate(interaction);
    if (interaction.commandName === "qualitygates") await handleQualityGates(interaction);
    if (interaction.commandName === "qualitycommands") await handleQualityCommands(interaction);
    if (interaction.commandName === "qualityworse") await handleQualityWorse(interaction);
    if (interaction.commandName === "qualitybetter") await handleQualityBetter(interaction);
    if (interaction.commandName === "backup") await handleBackup(interaction);
    if (interaction.commandName === "search") await handleSearch(interaction);
    if (interaction.commandName === "checklist") await handleChecklist(interaction);
    if (interaction.commandName === "emergency") await handleEmergency(interaction);
    if (interaction.commandName === "packing") await handlePacking(interaction);
    if (interaction.commandName === "departure") await handleDeparture(interaction);
    if (interaction.commandName === "budget") await handleBudget(interaction);
    if (interaction.commandName === "categorybudget") await handleCategoryBudget(interaction);
    if (interaction.commandName === "dailybudget") await handleDailyBudget(interaction);
    if (interaction.commandName === "spending") await handleSpending(interaction);
    if (interaction.commandName === "money") await handleSpending(interaction);
    if (interaction.commandName === "recap") await handleRecap(interaction);
    if (interaction.commandName === "recap_export") await handleRecapExport(interaction);
    if (interaction.commandName === "settle") await handleSettle(interaction);
    if (interaction.commandName === "settlematrix") await handleSettleMatrix(interaction);
    if (interaction.commandName === "settletransfers") await handleSettleTransfers(interaction);
    if (interaction.commandName === "settlemessage") await handleSettleMessage(interaction);
    if (interaction.commandName === "expense") await handleExpense(interaction);
    if (interaction.commandName === "spend") await handleExpense(interaction);
    if (interaction.commandName === "spendquick") await handleSpendQuick(interaction);
    if (interaction.commandName === "expenses") await handleExpenses(interaction);
    if (interaction.commandName === "expenses_export") await handleExpensesExport(interaction);
    if (interaction.commandName === "expense_delete") await handleExpenseDelete(interaction);
    if (interaction.commandName === "expenseundo") await handleExpenseUndo(interaction);
    if (interaction.commandName === "expense_edit") await handleExpenseEdit(interaction);
    if (interaction.commandName === "maps") await handleMaps(interaction);
    if (interaction.commandName === "web") await handleWeb(interaction);
    if (interaction.commandName === "calendar") await handleCalendar(interaction);
    if (interaction.commandName === "offline") await handleOffline(interaction);
    if (interaction.commandName === "export") await handleExport(interaction);
    if (interaction.commandName === "share") await handleShare(interaction);
    if (interaction.commandName === "duplicate") await handleDuplicate(interaction);
    if (interaction.commandName === "day") await handleDay(interaction);
    if (interaction.commandName === "date") await handleDate(interaction);
    if (interaction.commandName === "today") await handleToday(interaction);
    if (interaction.commandName === "brief") await handleBrief(interaction);
    if (interaction.commandName === "todaycheck") await handleTodayCheck(interaction);
    if (interaction.commandName === "tomorrow") await handleTomorrow(interaction);
    if (interaction.commandName === "dayshare") await handleDayShare(interaction);
    if (interaction.commandName === "nightcheck") await handleNightCheck(interaction);
    if (interaction.commandName === "history") await handleHistory(interaction);
    if (interaction.commandName === "ask") await handleAsk(interaction);
    if (interaction.commandName === "show") await handleShow(interaction);
  } catch (err) {
    console.error(err);
    const message = `처리 중 오류가 발생했습니다: ${err.message}`;
    if (interaction.deferred || interaction.replied) {
      await interaction.editReply(message);
    } else {
      await interaction.reply({ content: message, ephemeral: true });
    }
  }
}

export async function main() {
  const token = requiredEnv("DISCORD_BOT_TOKEN");
  assertGoogleGroundedPlanReady();
  const client = new Client({ intents: [GatewayIntentBits.Guilds] });

  client.once("ready", async () => {
    logGuildHints(client);
    await registerCommands(client);
    console.log(`Travel planner bot is ready as ${client.user.tag}.`);
  });

  client.on("interactionCreate", handleInteraction);
  await client.login(token);
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch((err) => {
    console.error(err);
    process.exitCode = 1;
  });
}
